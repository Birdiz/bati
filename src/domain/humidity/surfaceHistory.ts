/**
 * History of each cold surface: how often was it condensing, or close to it, and when?
 *
 * No "better or worse" verdict on purpose: the margin (surface − indoor dew point) follows the weather as much as
 * the house. A floor above an unheated cellar cools with the cellar all winter, so its margin falls from November
 * to February whatever happens. The EN ISO 13788 temperature factor would remove that, but it needs the cold-side
 * temperature (the cellar's), which is not measured: computed with the outdoor temperature it would be wrong for
 * the commonest case. So the history counts days at risk and shows the worst margin, nothing more.
 *
 * One value per day: the worst margin of the day, since one check in condensation is enough to mark it. Values
 * are those saved with the entry; the status is read from them with the thresholds of `checkSurface`. The worst
 * check is the lowest margin: the surface humidity depends on the margin and only weakly on the dew point, so
 * the lowest margin of a day is also, in practice, its highest surface humidity.
 */
import type { HouseProfile } from "../house/profile";
import type { LogEntry, SurfaceRecord } from "./log";
import { OTHER_SURFACE_ID, type SurfaceStatus, surfaceStatus } from "./surface";

/** Status of a saved check, with today's thresholds and the material declared at the time. */
export const recordStatus = (s: SurfaceRecord): SurfaceStatus => surfaceStatus(s.marginC, s);

export interface SurfaceDay {
  day: string;
  /** Worst (lowest) margin of the day, °C. */
  marginC: number;
  /** Surface temperature of that worst check. */
  tempC: number;
  status: SurfaceStatus;
  /** Checks of this surface saved that day. */
  checks: number;
}

export interface SurfaceHistory {
  surfaceId: string;
  /** Name in the profile, or the last saved name for a surface removed from it. */
  name: string;
  inProfile: boolean;
  /** Oldest first. */
  days: SurfaceDay[];
}

/**
 * One history per surface with saved checks: surfaces of the profile in its order, then removed ones by name.
 * "Autre surface" checks are left out: different surfaces share that id.
 */
export function surfaceHistories(
  log: readonly LogEntry[],
  profile: HouseProfile,
  dayOf: (at: string) => string,
): SurfaceHistory[] {
  const bySurface = new Map<string, LogEntry[]>();
  for (const e of log) {
    if (!e.surface || e.surface.surfaceId === OTHER_SURFACE_ID) continue;
    const list = bySurface.get(e.surface.surfaceId);
    if (list) list.push(e);
    else bySurface.set(e.surface.surfaceId, [e]);
  }
  const histories = [...bySurface.entries()].map(([surfaceId, entries]): SurfaceHistory => {
    const known = profile.coldSurfaces.find((s) => s.id === surfaceId);
    const latest = entries.reduce((a, b) => (b.at > a.at ? b : a));
    return {
      surfaceId,
      name: known?.name ?? latest.surface!.name,
      inProfile: !!known,
      days: surfaceDays(entries, dayOf),
    };
  });
  const rank = (h: SurfaceHistory) => {
    const i = profile.coldSurfaces.findIndex((s) => s.id === h.surfaceId);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  return histories.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "fr"));
}

function surfaceDays(entries: readonly LogEntry[], dayOf: (at: string) => string): SurfaceDay[] {
  const byDay = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const day = dayOf(e.at);
    const list = byDay.get(day);
    if (list) list.push(e);
    else byDay.set(day, [e]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => {
      const worst = list.reduce((a, b) => (b.surface!.marginC < a.surface!.marginC ? b : a)).surface!;
      return {
        day,
        marginC: worst.marginC,
        tempC: worst.tempC,
        status: recordStatus(worst),
        checks: list.length,
      };
    });
}

export interface SurfaceSummary {
  /** Days with at least one check. */
  days: number;
  atRisk: number;
  nearLimit: number;
  /** Days at risk of mould (absorbent surfaces only), not counting days already in condensation or near it. */
  mould: number;
  /** The day with the lowest margin (the earliest on a tie). */
  worst: SurfaceDay;
}

/** Counts over the days shown; null when there is none. */
export function summarizeSurface(days: readonly SurfaceDay[]): SurfaceSummary | null {
  const first = days[0];
  if (!first) return null;
  return {
    days: days.length,
    atRisk: days.filter((d) => d.status === "atRisk").length,
    nearLimit: days.filter((d) => d.status === "nearLimit").length,
    mould: days.filter((d) => d.status === "mould").length,
    worst: days.reduce((a, b) => (b.marginC < a.marginC ? b : a), first),
  };
}

/** The most recent saved check of a surface, for the reminder on the cold surface screen. */
export function lastSurfaceCheck(
  log: readonly LogEntry[],
  surfaceId: string,
): { at: string; marginC: number; status: SurfaceStatus } | null {
  if (surfaceId === OTHER_SURFACE_ID) return null;
  let last: LogEntry | null = null;
  for (const e of log) if (e.surface?.surfaceId === surfaceId && (!last || e.at > last.at)) last = e;
  return last?.surface ? { at: last.at, marginC: last.surface.marginC, status: recordStatus(last.surface) } : null;
}
