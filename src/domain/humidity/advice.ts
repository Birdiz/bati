/**
 * Ventilation advice, from measured absolute humidity inside and outside plus two conditions the user declares.
 *
 * Field-validated rules, in order of precedence:
 *   1. Storm declared → keep closed, reduce the VMC, run dehumidifiers where needed. Overrides the measurements
 *      (decided 2026-11-22): `conflict` flags the case where the measurements alone would say "ventilate".
 *   2. Outdoor AH lower than indoor by at least NEUTRAL_BAND → open + VMC at full speed.
 *   3. Outdoor AH higher than indoor by at least NEUTRAL_BAND → keep closed + reduce the VMC. A single-flow VMC
 *      draws outdoor air in 24/7, a double-flow one too (without an enthalpy exchanger it does not dry the air).
 *   4. Otherwise neutral: ventilating has no significant effect on humidity.
 *   Recent rain only changes *where* to open: never on a facade facing a wet area; preferably upstairs on the
 *   opposite side.
 *
 * Atmospheric pressure is deliberately not modelled: humidity rises during storms, but the mechanism through
 * pressure is not established. The output is structured and language-free; French wording is in src/text.
 */
import type { Facade, HouseProfile, Ventilation } from "../house/profile";
import { angleBetween } from "../house/profile";
import { type AirReading, absoluteHumidity, dewPoint } from "./psychrometrics";

/**
 * Gaps smaller than this are within measurement noise: a ±3 % RH hygrometer at 20 °C is uncertain by about
 * ±0.5 g/m³.
 */
export const NEUTRAL_BAND = 0.5;

/** Facades at least this far from every wet facade count as "the opposite side". */
const OPPOSITE_MIN_ANGLE = 135;

export interface Conditions {
  storm: boolean;
  recentRain: boolean;
}

export interface CheckInput {
  indoor: AirReading;
  outdoor: AirReading;
  conditions: Conditions;
}

export type AdviceCode = "storm" | "drierOutside" | "wetterOutside" | "balanced";
export type Verdict = "ventilate" | "keepClosed" | "neutral";
/** What to do with the VMC; null when the house has none. */
export type VmcAction = "full" | "reduce" | "normal" | null;

/** Where to open when ventilating. Ids refer to the profile's facades; empty lists mean "no constraint". */
export interface OpeningPlan {
  /** Facades not to open: they face a wet area and it rained recently. */
  avoid: string[];
  /** Facades to open first. */
  prefer: string[];
  /** Open upstairs only (on the preferred facades). */
  upstairsOnly: boolean;
}

export interface Advice {
  code: AdviceCode;
  verdict: Verdict;
  vmc: VmcAction;
  dehumidify: boolean;
  /** Only when verdict is "ventilate". */
  openings: OpeningPlan | null;
  /** Storm overrides measurements that say "ventilate". */
  conflict: boolean;
  indoorAH: number;
  outdoorAH: number;
  /** outdoorAH − indoorAH: negative means drier outside. */
  gap: number;
  indoorDewPoint: number;
}

/**
 * Which air holds less water, from the measurements alone (conditions do not change it): null within
 * NEUTRAL_BAND, where the difference is measurement noise.
 */
export function drierSide(gap: number): "indoor" | "outdoor" | null {
  if (gap <= -NEUTRAL_BAND) return "outdoor";
  if (gap >= NEUTRAL_BAND) return "indoor";
  return null;
}

function vmcAction(ventilation: Ventilation, wanted: Exclude<VmcAction, null>): VmcAction {
  return ventilation === "none" ? null : wanted;
}

/** Where to open after rain, given facades facing a wet area. */
export function openingPlan(facades: Facade[], recentRain: boolean): OpeningPlan {
  const wet = facades.filter((f) => f.facesWetArea);
  if (!recentRain || wet.length === 0) return { avoid: [], prefer: [], upstairsOnly: false };
  const dry = facades.filter((f) => !f.facesWetArea);
  const opposite = dry.filter((f) =>
    wet.every((w) => angleBetween(f.orientation, w.orientation) >= OPPOSITE_MIN_ANGLE),
  );
  const candidates = opposite.length > 0 ? opposite : dry;
  const upstairs = candidates.filter((f) => f.hasUpstairsOpenings);
  return {
    avoid: wet.map((f) => f.id),
    prefer: (upstairs.length > 0 ? upstairs : candidates).map((f) => f.id),
    upstairsOnly: upstairs.length > 0,
  };
}

export function decideAdvice(input: CheckInput, profile: HouseProfile): Advice {
  const indoorAH = absoluteHumidity(input.indoor);
  const outdoorAH = absoluteHumidity(input.outdoor);
  const gap = outdoorAH - indoorAH;
  const measures = { indoorAH, outdoorAH, gap, indoorDewPoint: dewPoint(input.indoor) };
  const drierOutside = drierSide(gap) === "outdoor";
  const v = profile.ventilation;

  if (input.conditions.storm)
    return {
      code: "storm",
      verdict: "keepClosed",
      vmc: vmcAction(v, "reduce"),
      dehumidify: true,
      openings: null,
      conflict: drierOutside,
      ...measures,
    };
  if (drierOutside)
    return {
      code: "drierOutside",
      verdict: "ventilate",
      vmc: vmcAction(v, "full"),
      dehumidify: false,
      openings: openingPlan(profile.facades, input.conditions.recentRain),
      conflict: false,
      ...measures,
    };
  if (gap >= NEUTRAL_BAND)
    return {
      code: "wetterOutside",
      verdict: "keepClosed",
      vmc: vmcAction(v, "reduce"),
      dehumidify: false,
      openings: null,
      conflict: false,
      ...measures,
    };
  return {
    code: "balanced",
    verdict: "neutral",
    vmc: vmcAction(v, "normal"),
    dehumidify: false,
    openings: null,
    conflict: false,
    ...measures,
  };
}
