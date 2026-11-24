import { type AirReading, dewPoint, saturationVapourPressure, vapourPressure } from "./psychrometrics";

/**
 * Below this margin the surface is close to condensing given instrument accuracy: an infrared thermometer is
 * typically ±1 °C, a hygrometer ±3 % RH (≈ ±0.5 °C on the dew point).
 */
export const NEAR_LIMIT_C = 1;

/**
 * Relative humidity at the surface above which mould can settle if it lasts (EN ISO 13788 design criterion,
 * 80 %). Applied only to absorbent surfaces (wood, plaster, lime render, stone, unglazed terracotta): they take
 * the water in without visible droplets, so the dew point alone misses the risk. Glazed tile, glass or gloss
 * paint keep the dew point check. Reached about 3 °C before the dew point in a living room.
 */
export const MOULD_RH = 80;

/** Surface id of a check on a surface that is not in the profile ("Autre surface"): several surfaces share it. */
export const OTHER_SURFACE_ID = "autre";

/** From worst to best. `mould` only exists for absorbent surfaces. */
export type SurfaceStatus = "atRisk" | "nearLimit" | "mould" | "ok";

/** Status from a margin to the dew point and, for an absorbent surface, the relative humidity at the surface. */
export function surfaceStatus(marginC: number, mould: { absorbent: boolean; surfaceRH?: number }): SurfaceStatus {
  if (marginC <= 0) return "atRisk";
  if (marginC < NEAR_LIMIT_C) return "nearLimit";
  if (mould.absorbent && mould.surfaceRH !== undefined && mould.surfaceRH >= MOULD_RH) return "mould";
  return "ok";
}

export interface SurfaceCheck {
  dewPoint: number;
  /** Surface temperature − indoor dew point, °C. Zero or negative: condensation. */
  marginC: number;
  /** Relative humidity of the indoor air once cooled to the surface temperature, %, capped at 100. */
  surfaceRH: number;
  absorbent: boolean;
  status: SurfaceStatus;
}

/** Does moisture condense, or mould settle, on a surface at `surfaceC` in this indoor air? */
export function checkSurface(surfaceC: number, indoor: AirReading, absorbent: boolean): SurfaceCheck {
  if (!Number.isFinite(surfaceC)) throw new RangeError(`Invalid surface temperature: ${surfaceC}`);
  const td = dewPoint(indoor);
  const marginC = surfaceC - td;
  const surfaceRH = Math.min(100, (100 * vapourPressure(indoor)) / saturationVapourPressure(surfaceC));
  return { dewPoint: td, marginC, surfaceRH, absorbent, status: surfaceStatus(marginC, { absorbent, surfaceRH }) };
}
