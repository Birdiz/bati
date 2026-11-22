/**
 * Moist-air formulas: saturation vapour pressure, absolute humidity, dew point.
 *
 * Saturation vapour pressure over liquid water uses the Magnus form
 *   es(T) = C · exp(A · T / (T + B))
 * with the Alduchov & Eskridge (1996) coefficients A = 17.625, B = 243.04 °C, C = 6.1094 hPa.
 * They stay within 0.4 % of the reference (Wexler/Goff-Gratch) from -40 °C to +50 °C, which covers every
 * indoor and outdoor reading in the Vosges and the 5–40 °C reference table. Readings outside that range are
 * rejected instead of being extrapolated.
 *
 * Over ice (below 0 °C), real saturation is slightly lower; we keep the water curve, as hygrometers do.
 *
 * Absolute humidity treats water vapour as an ideal gas:
 *   AH [g/m³] = e [Pa] / (Rv · T [K]) · 1000 = 216.7 · e [hPa] / T [K],  Rv = 461.5 J/(kg·K).
 *
 * Dew point is the exact inverse of the same Magnus curve, so AH, dew point and the surface check stay
 * consistent with each other.
 */

export const FORMULA = {
  id: "magnus-alduchov-eskridge-1996",
  a: 17.625,
  bC: 243.04,
  cHPa: 6.1094,
  minC: -40,
  maxC: 50,
} as const;

/** 1000 / Rv, Rv = 461.5 J/(kg·K): converts e [hPa] / T [K] into g/m³. */
const VAPOUR_FACTOR = 216.7;
const KELVIN = 273.15;

/** One air reading: temperature in °C and relative humidity in %. */
export interface AirReading {
  t: number;
  rh: number;
}

export type ReadingError = "temperatureOutOfRange" | "humidityOutOfRange" | "notANumber";

/** Why a reading cannot be used, or null if it can. RH must be strictly above 0: the dew point of dry air is undefined. */
export function readingError(r: AirReading): ReadingError | null {
  if (!Number.isFinite(r.t) || !Number.isFinite(r.rh)) return "notANumber";
  if (r.t < FORMULA.minC || r.t > FORMULA.maxC) return "temperatureOutOfRange";
  if (r.rh <= 0 || r.rh > 100) return "humidityOutOfRange";
  return null;
}

function assertValid(r: AirReading): void {
  const err = readingError(r);
  if (err) throw new RangeError(`Invalid reading (${err}): ${r.t} °C, ${r.rh} %`);
}

/** Saturation vapour pressure over water, hPa. */
export function saturationVapourPressure(tC: number): number {
  return FORMULA.cHPa * Math.exp((FORMULA.a * tC) / (tC + FORMULA.bC));
}

/** Actual vapour pressure, hPa. */
export function vapourPressure(r: AirReading): number {
  assertValid(r);
  return (r.rh / 100) * saturationVapourPressure(r.t);
}

/** Absolute humidity, g/m³, unrounded. */
export function absoluteHumidity(r: AirReading): number {
  return (VAPOUR_FACTOR * vapourPressure(r)) / (r.t + KELVIN);
}

/** Dew point, °C, unrounded. */
export function dewPoint(r: AirReading): number {
  const ln = Math.log(vapourPressure(r) / FORMULA.cHPa);
  return (FORMULA.bC * ln) / (FORMULA.a - ln);
}

/** Absolute humidity of saturated air at this temperature, g/m³ (the 100 % row of the reference table). */
export function saturationAbsoluteHumidity(tC: number): number {
  return absoluteHumidity({ t: tC, rh: 100 });
}

/** Rounds to one decimal, the precision shown everywhere in the app. */
export const round1 = (x: number): number => Math.round(x * 10) / 10;
