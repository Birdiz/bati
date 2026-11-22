import { type AirReading, dewPoint } from "./psychrometrics";

/**
 * Below this margin the surface is close to condensing given instrument accuracy: an infrared thermometer is
 * typically ±1 °C, a hygrometer ±3 % RH (≈ ±0.5 °C on the dew point).
 */
export const NEAR_LIMIT_C = 1;

export interface SurfaceCheck {
  dewPoint: number;
  /** Surface temperature − indoor dew point, °C. Zero or negative: condensation. */
  marginC: number;
  atRisk: boolean;
  /** Not at risk, but within instrument accuracy of it. */
  nearLimit: boolean;
}

/** Does moisture condense on a surface at `surfaceC` in this indoor air? */
export function checkSurface(surfaceC: number, indoor: AirReading): SurfaceCheck {
  if (!Number.isFinite(surfaceC)) throw new RangeError(`Invalid surface temperature: ${surfaceC}`);
  const td = dewPoint(indoor);
  const marginC = surfaceC - td;
  return { dewPoint: td, marginC, atRisk: marginC <= 0, nearLimit: marginC > 0 && marginC < NEAR_LIMIT_C };
}
