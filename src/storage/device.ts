/**
 * Storage on the device: localStorage behind a small key-value interface (another implementation in tests).
 * Data is tiny (years of daily entries stay under 1 MB). Keys use the stable internal code `bati-`.
 */
import type { DeviceData } from "../domain/backup";
import { type HouseProfile, emptyProfile, sanitizeProfile } from "../domain/house/profile";
import { type LogEntry, sanitizeEntry, sortLog } from "../domain/humidity/log";

export const KEYS = {
  profile: "bati-profile",
  log: "bati-log",
  draft: "bati-draft",
  lastBackup: "bati-last-backup",
} as const;

export type KeyValue = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function browserStorage(): KeyValue | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** In-memory storage, for tests and when the browser refuses localStorage. */
export function memoryStorage(initial: Record<string, string> = {}): KeyValue & { dump(): Record<string, string> } {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

export function readJSON(store: KeyValue | null, key: string): unknown {
  try {
    return JSON.parse(store?.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

/** True if the write happened (storage can be full or forbidden). */
export function writeJSON(store: KeyValue | null, key: string, value: unknown): boolean {
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export interface LoadResult extends DeviceData {
  /** Stored entries that could not be read and were left out. */
  dropped: number;
}

export function loadData(store: KeyValue | null): LoadResult {
  const p = sanitizeProfile(readJSON(store, KEYS.profile));
  const raw = readJSON(store, KEYS.log);
  const rawLog = Array.isArray(raw) ? raw : [];
  const log = rawLog.map(sanitizeEntry).filter((e): e is LogEntry => e !== null);
  return { profile: p?.profile ?? emptyProfile(), log: sortLog(log), dropped: rawLog.length - log.length };
}

export const saveProfile = (store: KeyValue | null, p: HouseProfile): boolean => writeJSON(store, KEYS.profile, p);
export const saveLog = (store: KeyValue | null, log: LogEntry[]): boolean => writeJSON(store, KEYS.log, log);
