/**
 * The house profile: entered once, stored on the device, used by the advice.
 *
 * This is the shared core of the app: the humidity advice reads it today, and the renovation/materials side
 * will extend it later (wall composition, floors). Extending it means adding optional fields and, if a field
 * changes meaning, bumping `version` and migrating in `sanitizeProfile`. Unknown fields are dropped.
 */

export const ORIENTATIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export const VENTILATIONS = ["none", "singleFlow", "doubleFlow"] as const;
/** Mechanical ventilation (VMC): none, single-flow (extract only), double-flow (balanced, heat recovery). */
export type Ventilation = (typeof VENTILATIONS)[number];

export interface Facade {
  id: string;
  name: string;
  orientation: Orientation;
  /** Faces a stream, a wet meadow or any area that stays wet after rain. */
  facesWetArea: boolean;
  /** Has windows that open upstairs. */
  hasUpstairsOpenings: boolean;
}

/** A surface known to run cold, where condensation may form (e.g. floor above an unheated cellar). */
export interface ColdSurface {
  id: string;
  name: string;
  location: string;
}

export interface HouseProfile {
  version: 1;
  ventilation: Ventilation;
  facades: Facade[];
  coldSurfaces: ColdSurface[];
}

export const PROFILE_VERSION = 1;

export function emptyProfile(): HouseProfile {
  return { version: PROFILE_VERSION, ventilation: "none", facades: [], coldSurfaces: [] };
}

/** Angle of an orientation, in degrees clockwise from north. */
export function bearing(o: Orientation): number {
  return ORIENTATIONS.indexOf(o) * 45;
}

/** Smallest angle between two orientations, 0 to 180°. */
export function angleBetween(a: Orientation, b: Orientation): number {
  const d = Math.abs(bearing(a) - bearing(b)) % 360;
  return d > 180 ? 360 - d : d;
}

const MAX_TEXT = 200;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().slice(0, MAX_TEXT);
  return s || null;
}

function oneOf<T extends string>(values: readonly T[], v: unknown): T | null {
  return values.includes(v as T) ? (v as T) : null;
}

function sanitizeFacade(v: unknown): Facade | null {
  if (!isObject(v)) return null;
  const id = text(v.id);
  const name = text(v.name);
  const orientation = oneOf(ORIENTATIONS, v.orientation);
  if (!id || !name || !orientation) return null;
  return {
    id,
    name,
    orientation,
    facesWetArea: v.facesWetArea === true,
    hasUpstairsOpenings: v.hasUpstairsOpenings === true,
  };
}

function sanitizeSurface(v: unknown): ColdSurface | null {
  if (!isObject(v)) return null;
  const id = text(v.id);
  const name = text(v.name);
  if (!id || !name) return null;
  return { id, name, location: text(v.location) ?? "" };
}

/** Keeps the first entry of each id. */
function uniqueById<T extends { id: string }>(items: (T | null)[]): T[] {
  const seen = new Set<string>();
  return items.filter((x): x is T => x !== null && !seen.has(x.id) && !!seen.add(x.id));
}

/**
 * A profile read from storage or an import file. Invalid entries are dropped, not repaired; the number dropped
 * is returned so the UI can say so. Returns null when the value is not a profile at all.
 */
export function sanitizeProfile(v: unknown): { profile: HouseProfile; dropped: number } | null {
  if (!isObject(v) || v.version !== PROFILE_VERSION) return null;
  const facades = Array.isArray(v.facades) ? v.facades : [];
  const surfaces = Array.isArray(v.coldSurfaces) ? v.coldSurfaces : [];
  const profile: HouseProfile = {
    version: PROFILE_VERSION,
    ventilation: oneOf(VENTILATIONS, v.ventilation) ?? "none",
    facades: uniqueById(facades.map(sanitizeFacade)),
    coldSurfaces: uniqueById(surfaces.map(sanitizeSurface)),
  };
  const badVentilation = v.ventilation !== undefined && !oneOf(VENTILATIONS, v.ventilation);
  const dropped =
    facades.length -
    profile.facades.length +
    (surfaces.length - profile.coldSurfaces.length) +
    (badVentilation ? 1 : 0);
  return { profile, dropped };
}
