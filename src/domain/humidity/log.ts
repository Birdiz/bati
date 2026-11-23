/**
 * Measurement log: each quick check can be saved with a timestamp and an optional note.
 *
 * An entry keeps both what was measured and what was computed at the time, with the formula id: a later
 * change of formula or rules must not rewrite the past. Ids and dates are injected, so this stays pure.
 */
import type { Advice, AdviceCode, Conditions, CheckInput } from "./advice";
import { type AirReading, FORMULA, readingError } from "./psychrometrics";
import type { SurfaceCheck } from "./surface";

const ADVICE_CODES: readonly AdviceCode[] = ["storm", "drierOutside", "wetterOutside", "balanced"];
const MAX_NOTE = 1000;

export interface SurfaceRecord {
  surfaceId: string;
  /** Name at the time, kept if the surface is later renamed or removed from the profile. */
  name: string;
  tempC: number;
  marginC: number;
  atRisk: boolean;
  /** Relative humidity at the surface, %. Missing on entries saved before it was computed. */
  surfaceRH?: number;
  /** Declared absorbent in the profile at the time: changing the material later does not rewrite the past. */
  absorbent: boolean;
}

export interface LogEntry {
  id: string;
  /** ISO 8601. */
  at: string;
  indoor: AirReading;
  outdoor: AirReading;
  conditions: Conditions;
  computed: {
    indoorAH: number;
    outdoorAH: number;
    indoorDewPoint: number;
    code: AdviceCode;
    formula: string;
  };
  surface?: SurfaceRecord;
  note?: string;
}

export interface EntryMeta {
  id: string;
  at: Date;
  note?: string;
  surface?: { surfaceId: string; name: string; tempC: number; check: SurfaceCheck };
}

export function createEntry(input: CheckInput, advice: Advice, meta: EntryMeta): LogEntry {
  const entry: LogEntry = {
    id: meta.id,
    at: meta.at.toISOString(),
    indoor: { ...input.indoor },
    outdoor: { ...input.outdoor },
    conditions: { ...input.conditions },
    computed: {
      indoorAH: advice.indoorAH,
      outdoorAH: advice.outdoorAH,
      indoorDewPoint: advice.indoorDewPoint,
      code: advice.code,
      formula: FORMULA.id,
    },
  };
  const note = meta.note?.trim().slice(0, MAX_NOTE);
  if (note) entry.note = note;
  if (meta.surface) {
    const s = meta.surface;
    entry.surface = {
      surfaceId: s.surfaceId,
      name: s.name,
      tempC: s.tempC,
      marginC: s.check.marginC,
      atRisk: s.check.status === "atRisk",
      surfaceRH: s.check.surfaceRH,
      absorbent: s.check.absorbent,
    };
  }
  return entry;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const str = (v: unknown, max = 200): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

function reading(v: unknown): AirReading | null {
  if (!isObject(v) || !num(v.t) || !num(v.rh)) return null;
  const r = { t: v.t, rh: v.rh };
  return readingError(r) ? null : r;
}

function surfaceRecord(v: unknown): SurfaceRecord | null {
  if (!isObject(v) || !num(v.tempC) || !num(v.marginC) || typeof v.atRisk !== "boolean") return null;
  const surfaceId = str(v.surfaceId);
  const name = str(v.name);
  if (!surfaceId || !name) return null;
  const record: SurfaceRecord = {
    surfaceId,
    name,
    tempC: v.tempC,
    marginC: v.marginC,
    atRisk: v.atRisk,
    absorbent: v.absorbent === true,
  };
  if (v.surfaceRH !== undefined) {
    if (!num(v.surfaceRH) || v.surfaceRH < 0 || v.surfaceRH > 100) return null;
    record.surfaceRH = v.surfaceRH;
  }
  return record;
}

/** An entry read from storage or an import file, or null if it is not a valid entry. */
export function sanitizeEntry(v: unknown): LogEntry | null {
  if (!isObject(v) || !isObject(v.computed) || !isObject(v.conditions)) return null;
  const id = str(v.id);
  const at = typeof v.at === "string" && !Number.isNaN(Date.parse(v.at)) ? new Date(v.at).toISOString() : null;
  const indoor = reading(v.indoor);
  const outdoor = reading(v.outdoor);
  const c = v.computed;
  if (!id || !at || !indoor || !outdoor) return null;
  if (!num(c.indoorAH) || !num(c.outdoorAH) || !num(c.indoorDewPoint)) return null;
  if (!ADVICE_CODES.includes(c.code as AdviceCode)) return null;
  const entry: LogEntry = {
    id,
    at,
    indoor,
    outdoor,
    conditions: { storm: v.conditions.storm === true, recentRain: v.conditions.recentRain === true },
    computed: {
      indoorAH: c.indoorAH,
      outdoorAH: c.outdoorAH,
      indoorDewPoint: c.indoorDewPoint,
      code: c.code as AdviceCode,
      formula: str(c.formula) ?? "unknown",
    },
  };
  const note = str(v.note, MAX_NOTE);
  if (note) entry.note = note;
  if (v.surface !== undefined) {
    const s = surfaceRecord(v.surface);
    if (!s) return null;
    entry.surface = s;
  }
  return entry;
}

/** Newest first. */
export function sortLog(log: LogEntry[]): LogEntry[] {
  return [...log].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

/** Union by id; on a duplicate id the existing entry wins (entries are never edited, only added or removed). */
export function mergeLogs(existing: LogEntry[], incoming: LogEntry[]): { log: LogEntry[]; added: number } {
  const ids = new Set(existing.map((e) => e.id));
  const fresh = incoming.filter((e) => !ids.has(e.id) && !!ids.add(e.id));
  return { log: sortLog([...existing, ...fresh]), added: fresh.length };
}
