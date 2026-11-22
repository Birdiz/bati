import { describe, expect, it } from "vitest";
import { type CheckInput, NEUTRAL_BAND, decideAdvice, drierSide, openingPlan } from "../src/domain/humidity/advice";
import type { Facade, HouseProfile } from "../src/domain/house/profile";

const facade = (id: string, orientation: Facade["orientation"], wet = false, upstairs = false): Facade => ({
  id,
  name: id,
  orientation,
  facesWetArea: wet,
  hasUpstairsOpenings: upstairs,
});

/** Stream on the north-east side, as in the Rabodeau valley house. */
const house: HouseProfile = {
  version: 1,
  ventilation: "singleFlow",
  facades: [facade("ne", "NE", true, true), facade("sw", "SW", false, true), facade("se", "SE", false, false)],
  coldSurfaces: [],
};

const noVmc: HouseProfile = { ...house, ventilation: "none" };

/** Indoor 21 °C / 73 % (13.35 g/m³). */
const indoor = { t: 21, rh: 73 };
/** Outdoor 10 °C / 80 % (7.51 g/m³): drier. */
const drier = { t: 10, rh: 80 };
/** Outdoor 22 °C / 90 % (17.5 g/m³): wetter. */
const wetter = { t: 22, rh: 90 };

const check = (outdoor: CheckInput["outdoor"], storm = false, recentRain = false): CheckInput => ({
  indoor,
  outdoor,
  conditions: { storm, recentRain },
});

describe("decideAdvice — rules table", () => {
  it("outdoor AH < indoor AH → open + VMC at full speed", () => {
    const a = decideAdvice(check(drier), house);
    expect(a).toMatchObject({ code: "drierOutside", verdict: "ventilate", vmc: "full", dehumidify: false });
    expect(a.openings).toEqual({ avoid: [], prefer: [], upstairsOnly: false });
    expect(a.gap).toBeCloseTo(7.51 - 13.35, 1);
  });

  it("outdoor AH > indoor AH → keep closed + reduce the VMC", () => {
    const a = decideAdvice(check(wetter), house);
    expect(a).toMatchObject({ code: "wetterOutside", verdict: "keepClosed", vmc: "reduce", openings: null });
  });

  it("double-flow VMC is reduced too when outdoor air is wetter", () => {
    expect(decideAdvice(check(wetter), { ...house, ventilation: "doubleFlow" }).vmc).toBe("reduce");
  });

  it("storm → keep closed + reduce the VMC + dehumidifiers", () => {
    const a = decideAdvice(check(wetter, true), house);
    expect(a).toMatchObject({ code: "storm", verdict: "keepClosed", vmc: "reduce", dehumidify: true, conflict: false });
  });

  it("storm overrides drier outdoor air and flags the conflict", () => {
    const a = decideAdvice(check(drier, true), house);
    expect(a).toMatchObject({ code: "storm", verdict: "keepClosed", conflict: true });
  });

  it("after rain with a stream: avoid the stream facade, open upstairs on the opposite side", () => {
    const a = decideAdvice(check(drier, false, true), house);
    expect(a.verdict).toBe("ventilate");
    expect(a.openings).toEqual({ avoid: ["ne"], prefer: ["sw"], upstairsOnly: true });
  });

  it("rain does not change a keep-closed verdict", () => {
    expect(decideAdvice(check(wetter, false, true), house).openings).toBeNull();
  });

  it("a gap within the neutral band is neutral, on both sides", () => {
    const justBelow = { t: 21, rh: 73 - 1 }; // about −0.18 g/m³
    expect(decideAdvice(check(justBelow), house)).toMatchObject({
      code: "balanced",
      verdict: "neutral",
      vmc: "normal",
    });
    const justAbove = { t: 21, rh: 73 + 1 };
    expect(decideAdvice(check(justAbove), house).code).toBe("balanced");
  });

  it("the neutral band boundary is NEUTRAL_BAND g/m³", () => {
    expect(NEUTRAL_BAND).toBe(0.5);
    // 21 °C, 1 % RH ≈ 0.183 g/m³: −3 % → −0.55 (drier), −2 % → −0.37 (balanced).
    expect(decideAdvice(check({ t: 21, rh: 70 }), house).code).toBe("drierOutside");
    expect(decideAdvice(check({ t: 21, rh: 71 }), house).code).toBe("balanced");
    expect(decideAdvice(check({ t: 21, rh: 76 }), house).code).toBe("wetterOutside");
  });

  it("without a VMC, gives no VMC instruction", () => {
    for (const out of [drier, wetter, indoor]) expect(decideAdvice(check(out), noVmc).vmc).toBeNull();
    expect(decideAdvice(check(wetter, true), noVmc).vmc).toBeNull();
  });

  it("reports the indoor dew point", () => {
    expect(decideAdvice(check(drier), house).indoorDewPoint).toBeCloseTo(16.0, 0);
  });
});

describe("openingPlan", () => {
  it("has no constraint without rain or without wet facades", () => {
    expect(openingPlan(house.facades, false)).toEqual({ avoid: [], prefer: [], upstairsOnly: false });
    expect(openingPlan([facade("s", "S", false, true)], true)).toEqual({ avoid: [], prefer: [], upstairsOnly: false });
  });

  it("falls back to any dry facade when none is opposite", () => {
    const p = openingPlan([facade("n", "N", true), facade("e", "E", false, true)], true);
    expect(p).toEqual({ avoid: ["n"], prefer: ["e"], upstairsOnly: true });
  });

  it("does not require upstairs when no candidate has upstairs openings", () => {
    const p = openingPlan([facade("n", "N", true), facade("s", "S")], true);
    expect(p).toEqual({ avoid: ["n"], prefer: ["s"], upstairsOnly: false });
  });

  it("prefers nothing when every facade faces a wet area", () => {
    const p = openingPlan([facade("n", "N", true), facade("s", "S", true)], true);
    expect(p).toEqual({ avoid: ["n", "s"], prefer: [], upstairsOnly: false });
  });

  it("requires the opposite side to be opposite to every wet facade", () => {
    // Wet N and E: SW is ≥ 135° from both, S is only 90° from E.
    const p = openingPlan([facade("n", "N", true), facade("e", "E", true), facade("s", "S"), facade("sw", "SW")], true);
    expect(p.prefer).toEqual(["sw"]);
  });
});

describe("drierSide", () => {
  it("names the drier air outside the neutral band, from the gap only", () => {
    expect(drierSide(-5.8)).toBe("outdoor");
    expect(drierSide(4.1)).toBe("indoor");
    expect(drierSide(-NEUTRAL_BAND)).toBe("outdoor");
    expect(drierSide(NEUTRAL_BAND)).toBe("indoor");
    expect(drierSide(-0.2)).toBeNull();
  });

  it("keeps the measured side under a storm", () => {
    expect(drierSide(decideAdvice(check(drier, true), house).gap)).toBe("outdoor");
  });
});
