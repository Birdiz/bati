/**
 * Trend of the log: is the house giving less water to the air over time?
 *
 * Indoor absolute humidity alone mostly follows the outdoor air (every airing brings it in), so it falls all
 * autumn and rises in spring whatever the walls do. The indicator is the moisture excess, indoor AH minus
 * outdoor AH: the water the house adds to the air (walls, floor, occupants, cooking), season removed. Building
 * physics uses the same quantity to class rooms (EN ISO 13788 internal humidity classes).
 *
 * Readings come at irregular times: one point per day (mean of that day's entries), lines broken over long
 * gaps, and a comparison only when both periods have enough days. Values are those computed when the entry was
 * saved, never recomputed. Days are "YYYY-MM-DD" strings in the user's time zone, given by the caller.
 */
import { NEUTRAL_BAND } from "./advice";
import type { LogEntry } from "./log";

export interface DayPoint {
  day: string;
  indoorAH: number;
  outdoorAH: number;
  /** Indoor minus outdoor AH, g/m³. Negative when the outdoor air is wetter (humid summer days). */
  excess: number;
  /** Entries averaged into this day. */
  readings: number;
}

export const TREND_WINDOWS = ["30", "90", "all"] as const;
export type TrendWindow = (typeof TREND_WINDOWS)[number];
export const DEFAULT_TREND_WINDOW: TrendWindow = "90";

/** Longer gaps between two days with readings break the line: nothing is drawn where nothing was measured. */
export const MAX_GAP_DAYS = 7;
/** Length of each compared period. */
export const COMPARE_DAYS = 14;
/** Days with readings needed in each period: a single reading carries ±0.7 g/m³ on the excess. */
export const MIN_DAYS = 3;

const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY_MS;

export function addDays(day: string, n: number): string {
  return new Date((dayNumber(day) + n) * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round(dayNumber(b) - dayNumber(a));
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** One point per day with readings, oldest first. */
export function dailyPoints(log: readonly LogEntry[], dayOf: (at: string) => string): DayPoint[] {
  const byDay = new Map<string, LogEntry[]>();
  for (const e of log) {
    const day = dayOf(e.at);
    const list = byDay.get(day);
    if (list) list.push(e);
    else byDay.set(day, [e]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, entries]) => {
      const indoorAH = mean(entries.map((e) => e.computed.indoorAH));
      const outdoorAH = mean(entries.map((e) => e.computed.outdoorAH));
      return { day, indoorAH, outdoorAH, excess: indoorAH - outdoorAH, readings: entries.length };
    });
}

/** First day shown for a window ending today; for "all", the first day with readings. */
export function windowStart(points: readonly DayPoint[], window: TrendWindow, today: string): string {
  if (window === "all") return points[0]?.day ?? today;
  return addDays(today, -(Number(window) - 1));
}

export function inWindow(points: readonly DayPoint[], window: TrendWindow, today: string): DayPoint[] {
  const start = windowStart(points, window, today);
  return points.filter((p) => p.day >= start);
}

/** Runs of points to join with a line, split where two days with readings are more than MAX_GAP_DAYS apart. */
export function segments(points: readonly DayPoint[]): DayPoint[][] {
  const runs: DayPoint[][] = [];
  let run: DayPoint[] = [];
  for (const p of points) {
    const last = run[run.length - 1];
    if (last && daysBetween(last.day, p.day) > MAX_GAP_DAYS) {
      runs.push(run);
      run = [];
    }
    run.push(p);
  }
  if (run.length) runs.push(run);
  return runs;
}

export type ExcessTrend =
  | { kind: "notEnough"; recentDays: number; previousDays: number }
  | {
      /** lower: the house gives less water to the air; within the neutral band: stable. */
      kind: "lower" | "higher" | "stable";
      /** Mean daily excess over the last COMPARE_DAYS days, and over the COMPARE_DAYS days before. */
      recent: number;
      previous: number;
      /** recent − previous. */
      delta: number;
      recentDays: number;
      previousDays: number;
    };

/**
 * Mean excess of the last COMPARE_DAYS days (today included) against the COMPARE_DAYS days before, from the
 * whole log whatever window is shown. Same threshold as the advice: under NEUTRAL_BAND the hygrometers cannot
 * tell the difference.
 */
export function compareExcess(points: readonly DayPoint[], today: string): ExcessTrend {
  const recentStart = addDays(today, -(COMPARE_DAYS - 1));
  const previousStart = addDays(recentStart, -COMPARE_DAYS);
  const recent = points.filter((p) => p.day >= recentStart && p.day <= today).map((p) => p.excess);
  const previous = points.filter((p) => p.day >= previousStart && p.day < recentStart).map((p) => p.excess);
  if (recent.length < MIN_DAYS || previous.length < MIN_DAYS)
    return { kind: "notEnough", recentDays: recent.length, previousDays: previous.length };
  const r = mean(recent);
  const p = mean(previous);
  const delta = r - p;
  const kind = Math.abs(delta) < NEUTRAL_BAND ? "stable" : delta < 0 ? "lower" : "higher";
  return { kind, recent: r, previous: p, delta, recentDays: recent.length, previousDays: previous.length };
}
