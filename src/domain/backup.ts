/**
 * JSON export and import of everything stored on the device. iOS may evict the storage of a web app that has
 * not been used for a while: this file is the user's real backup.
 *
 * Format: { format: "bati-export", version, exportedAt, profile, log }. `bati` is the stable internal code,
 * independent of the product name.
 */
import { type HouseProfile, emptyProfile, sanitizeProfile } from "./house/profile";
import { type LogEntry, mergeLogs, sanitizeEntry, sortLog } from "./humidity/log";

export const EXPORT_FORMAT = "bati-export";
export const EXPORT_VERSION = 1;

export interface DeviceData {
  profile: HouseProfile;
  log: LogEntry[];
}

export function toBackup(data: DeviceData, now: Date): string {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: now.toISOString(),
      profile: data.profile,
      log: sortLog(data.log),
    },
    null,
    2,
  );
}

/** File name for a backup made at `now`, local date. */
export function backupFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `bati-sauvegarde-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

export type BackupError = "notJson" | "notABackup" | "newerVersion";

export type ParsedBackup =
  { ok: true; profile: HouseProfile | null; log: LogEntry[]; dropped: number } | { ok: false; error: BackupError };

/** Reads an export file. Invalid entries are dropped and counted, never repaired. */
export function parseBackup(text: string): ParsedBackup {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { ok: false, error: "notJson" };
  }
  if (typeof v !== "object" || v === null || (v as { format?: unknown }).format !== EXPORT_FORMAT)
    return { ok: false, error: "notABackup" };
  const b = v as Record<string, unknown>;
  if (!Number.isInteger(b.version) || (b.version as number) < 1) return { ok: false, error: "notABackup" };
  if ((b.version as number) > EXPORT_VERSION) return { ok: false, error: "newerVersion" };

  const p = b.profile === undefined || b.profile === null ? null : sanitizeProfile(b.profile);
  const rawLog = Array.isArray(b.log) ? b.log : [];
  const entries = rawLog.map(sanitizeEntry).filter((e): e is LogEntry => e !== null);
  const { log } = mergeLogs([], entries); // drops duplicate ids
  const profileDropped = b.profile !== undefined && b.profile !== null && !p ? 1 : (p?.dropped ?? 0);
  return { ok: true, profile: p?.profile ?? null, log, dropped: rawLog.length - log.length + profileDropped };
}

export type ImportMode = "merge" | "replace";

/**
 * Applies an import. "replace" swaps everything for the file's content. "merge" adds the file's entries to the
 * log and takes the file's profile only if the device has none yet (an empty profile).
 */
export function applyImport(
  current: DeviceData,
  parsed: Extract<ParsedBackup, { ok: true }>,
  mode: ImportMode,
): { data: DeviceData; added: number } {
  if (mode === "replace")
    return { data: { profile: parsed.profile ?? emptyProfile(), log: parsed.log }, added: parsed.log.length };
  const { log, added } = mergeLogs(current.log, parsed.log);
  const profile = isEmptyProfile(current.profile) && parsed.profile ? parsed.profile : current.profile;
  return { data: { profile, log }, added };
}

export function isEmptyProfile(p: HouseProfile): boolean {
  return p.facades.length === 0 && p.coldSurfaces.length === 0 && p.ventilation === "none";
}
