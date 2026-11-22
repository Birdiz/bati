/**
 * Application state: what is stored on the device plus the form being filled in (the draft), with change
 * notifications. Every change is written to storage at once; `stored` says whether the last write succeeded.
 */
import type { DeviceData } from "../domain/backup";
import type { HouseProfile } from "../domain/house/profile";
import type { CheckInput } from "../domain/humidity/advice";
import type { LogEntry } from "../domain/humidity/log";
import { sortLog } from "../domain/humidity/log";
import { type AirReading, type ReadingError, readingError } from "../domain/humidity/psychrometrics";
import { KEYS, type KeyValue, loadData, readJSON, saveLog, saveProfile, writeJSON } from "../storage/device";
import { parseDecimal } from "../text/fr";

/** Raw form values, kept as typed so that "12," stays on screen while the user types. */
export interface Draft {
  indoorT: string;
  indoorRh: string;
  outdoorT: string;
  outdoorRh: string;
  storm: boolean;
  recentRain: boolean;
  surfaceId: string;
  surfaceT: string;
}

export const emptyDraft = (): Draft => ({
  indoorT: "",
  indoorRh: "",
  outdoorT: "",
  outdoorRh: "",
  storm: false,
  recentRain: false,
  surfaceId: "",
  surfaceT: "",
});

function sanitizeDraft(v: unknown): Draft {
  const d = emptyDraft();
  if (typeof v !== "object" || v === null) return d;
  const o = v as Record<string, unknown>;
  for (const k of ["indoorT", "indoorRh", "outdoorT", "outdoorRh", "surfaceId", "surfaceT"] as const)
    if (typeof o[k] === "string") d[k] = (o[k] as string).slice(0, 50);
  d.storm = o.storm === true;
  d.recentRain = o.recentRain === true;
  return d;
}

export interface FieldErrors {
  indoorT?: ReadingError;
  indoorRh?: ReadingError;
  outdoorT?: ReadingError;
  outdoorRh?: ReadingError;
}

/** A reading from two typed fields, or the error of each field (null when the field is empty: nothing to say yet). */
export function parseReading(
  tRaw: string,
  rhRaw: string,
): { reading: AirReading | null; t: ReadingError | null; rh: ReadingError | null; empty: boolean } {
  const empty = tRaw.trim() === "" || rhRaw.trim() === "";
  const t = parseDecimal(tRaw);
  const rh = parseDecimal(rhRaw);
  const tErr = tRaw.trim() === "" ? null : Number.isNaN(t) ? "notANumber" : readingError({ t, rh: 50 });
  const rhErr = rhRaw.trim() === "" ? null : Number.isNaN(rh) ? "notANumber" : readingError({ t: 20, rh });
  const reading = !empty && !tErr && !rhErr ? { t, rh } : null;
  return { reading, t: tErr, rh: rhErr, empty };
}

export function draftInput(d: Draft): { input: CheckInput | null; errors: FieldErrors; indoor: AirReading | null } {
  const i = parseReading(d.indoorT, d.indoorRh);
  const o = parseReading(d.outdoorT, d.outdoorRh);
  const errors: FieldErrors = {};
  if (i.t) errors.indoorT = i.t;
  if (i.rh) errors.indoorRh = i.rh;
  if (o.t) errors.outdoorT = o.t;
  if (o.rh) errors.outdoorRh = o.rh;
  const input =
    i.reading && o.reading
      ? { indoor: i.reading, outdoor: o.reading, conditions: { storm: d.storm, recentRain: d.recentRain } }
      : null;
  return { input, errors, indoor: i.reading };
}

export type Listener = () => void;

export class AppState {
  profile: HouseProfile;
  log: LogEntry[];
  draft: Draft;
  /** False when the last write to the device failed: data is only in memory. */
  stored = true;
  /** Entries found in storage that could not be read. */
  readonly droppedOnLoad: number;
  lastBackup: string | null;
  private listeners = new Set<Listener>();

  constructor(
    private store: KeyValue | null,
    readonly now: () => Date = () => new Date(),
    readonly newId: () => string = defaultId,
  ) {
    const data = loadData(store);
    this.profile = data.profile;
    this.log = data.log;
    this.droppedOnLoad = data.dropped;
    this.draft = sanitizeDraft(readJSON(store, KEYS.draft));
    const lb = readJSON(store, KEYS.lastBackup);
    this.lastBackup = typeof lb === "string" ? lb : null;
    if (!store) this.stored = false;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private track(ok: boolean): void {
    this.stored = ok && this.store !== null;
  }

  setProfile(p: HouseProfile): void {
    this.profile = p;
    this.track(saveProfile(this.store, p));
    this.emit();
  }

  addEntry(e: LogEntry): void {
    this.log = sortLog([e, ...this.log]);
    this.track(saveLog(this.store, this.log));
    this.emit();
  }

  removeEntry(id: string): void {
    this.log = this.log.filter((e) => e.id !== id);
    this.track(saveLog(this.store, this.log));
    this.emit();
  }

  replaceData(d: DeviceData): void {
    this.profile = d.profile;
    this.log = sortLog(d.log);
    this.track(saveProfile(this.store, d.profile) && saveLog(this.store, this.log));
    this.emit();
  }

  /** Draft changes do not notify: the screen that typed them updates itself, others read on show. */
  setDraft(patch: Partial<Draft>): void {
    this.draft = { ...this.draft, ...patch };
    writeJSON(this.store, KEYS.draft, this.draft);
  }

  markBackup(): void {
    this.lastBackup = this.now().toISOString();
    writeJSON(this.store, KEYS.lastBackup, this.lastBackup);
    this.emit();
  }

  data(): DeviceData {
    return { profile: this.profile, log: this.log };
  }
}

function defaultId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
}
