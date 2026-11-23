import { describe, expect, it } from "vitest";
import type { LogEntry } from "../src/domain/humidity/log";
import {
  COMPARE_DAYS,
  type DayPoint,
  MAX_GAP_DAYS,
  addDays,
  compareExcess,
  dailyPoints,
  daysBetween,
  inWindow,
  segments,
  windowStart,
} from "../src/domain/humidity/trend";

let n = 0;
/** A saved entry with the computed values that matter here; the readings are not read by the trend. */
function entry(at: string, indoorAH: number, outdoorAH: number): LogEntry {
  return {
    id: `e${++n}`,
    at,
    indoor: { t: 20, rh: 60 },
    outdoor: { t: 10, rh: 80 },
    conditions: { storm: false, recentRain: false },
    computed: { indoorAH, outdoorAH, indoorDewPoint: 12, code: "balanced", formula: "test" },
  };
}

const utcDay = (at: string) => at.slice(0, 10);
const point = (day: string, excess: number): DayPoint => ({
  day,
  indoorAH: 8 + excess,
  outdoorAH: 8,
  excess,
  readings: 1,
});
/** One point per day from `from` for `count` days, each with the given excess. */
const run = (from: string, count: number, excess: number) =>
  Array.from({ length: count }, (_, i) => point(addDays(from, i), excess));

describe("days", () => {
  it("adds days across months, years and DST changes", () => {
    expect(addDays("2026-11-22", 10)).toBe("2026-12-02");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-11-22", "2026-11-20")).toBe(-2);
  });
});

describe("dailyPoints", () => {
  it("averages each day, oldest first, with the excess of the means", () => {
    const pts = dailyPoints(
      [entry("2026-11-21T18:00:00Z", 10, 6), entry("2026-11-20T08:00:00Z", 9, 7), entry("2026-11-21T08:00:00Z", 12, 7)],
      utcDay,
    );
    expect(pts.map((p) => p.day)).toEqual(["2026-11-20", "2026-11-21"]);
    expect(pts[1]).toEqual({ day: "2026-11-21", indoorAH: 11, outdoorAH: 6.5, excess: 4.5, readings: 2 });
    expect(pts[0]!.excess).toBe(2);
  });

  it("uses the day given by the caller (the user's time zone)", () => {
    const paris = (at: string) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(at)).slice(0, 10);
    expect(dailyPoints([entry("2026-11-21T23:30:00Z", 10, 6)], paris)[0]!.day).toBe("2026-11-22");
  });

  it("is empty for an empty log", () => {
    expect(dailyPoints([], utcDay)).toEqual([]);
  });
});

describe("windows", () => {
  const pts = [point("2026-06-01", 3), point("2026-09-01", 2), point("2026-10-30", 1), point("2026-11-22", 1)];

  it("keeps the last 30 or 90 days, today included", () => {
    expect(windowStart(pts, "30", "2026-11-22")).toBe("2026-10-24");
    expect(inWindow(pts, "30", "2026-11-22").map((p) => p.day)).toEqual(["2026-10-30", "2026-11-22"]);
    expect(windowStart(pts, "90", "2026-11-22")).toBe("2026-08-25");
    expect(inWindow(pts, "90", "2026-11-22")).toHaveLength(3);
  });

  it("starts at the first reading for the whole log", () => {
    expect(windowStart(pts, "all", "2026-11-22")).toBe("2026-06-01");
    expect(inWindow(pts, "all", "2026-11-22")).toHaveLength(4);
    expect(windowStart([], "all", "2026-11-22")).toBe("2026-11-22");
  });
});

describe("segments", () => {
  it(`breaks the line over gaps of more than ${MAX_GAP_DAYS} days`, () => {
    const pts = [
      point("2026-11-01", 1),
      point("2026-11-08", 1), // 7 days: joined
      point("2026-11-16", 1), // 8 days: new line
      point("2026-11-17", 1),
    ];
    expect(segments(pts).map((s) => s.map((p) => p.day))).toEqual([
      ["2026-11-01", "2026-11-08"],
      ["2026-11-16", "2026-11-17"],
    ]);
    expect(segments([])).toEqual([]);
  });
});

describe("compareExcess", () => {
  const today = "2026-11-22";
  const recentStart = addDays(today, -(COMPARE_DAYS - 1)); // 2026-11-09
  const previousStart = addDays(recentStart, -COMPARE_DAYS); // 2026-10-26

  it("says lower when the recent mean excess is at least 0.5 g/m³ below", () => {
    const t = compareExcess([...run(previousStart, 4, 2), ...run(recentStart, 3, 1.2)], today);
    expect(t).toMatchObject({ kind: "lower", previous: 2, recentDays: 3, previousDays: 4 });
    if (t.kind === "notEnough") throw new Error("expected a comparison");
    expect(t.recent).toBeCloseTo(1.2);
    expect(t.delta).toBeCloseTo(-0.8);
  });

  it("says higher when it is at least 0.5 g/m³ above", () => {
    expect(compareExcess([...run(previousStart, 3, 1), ...run(recentStart, 3, 1.5)], today).kind).toBe("higher");
  });

  it("says stable within the hygrometers' accuracy", () => {
    expect(compareExcess([...run(previousStart, 3, 1), ...run(recentStart, 3, 1.4)], today).kind).toBe("stable");
    expect(compareExcess([...run(previousStart, 3, 1), ...run(recentStart, 3, 0.6)], today).kind).toBe("stable");
  });

  it("weighs days, not readings: a day measured five times counts once", () => {
    const log = [
      ...Array.from({ length: 5 }, (_, i) => entry(`${recentStart}T0${i}:00:00Z`, 13, 7)), // 6 g/m³, five times
      entry(`${addDays(recentStart, 1)}T08:00:00Z`, 8, 7),
      entry(`${addDays(recentStart, 2)}T08:00:00Z`, 8, 7),
      ...[0, 1, 2].map((i) => entry(`${addDays(previousStart, i)}T08:00:00Z`, 10.5, 7)),
    ];
    // By day: (6 + 1 + 1) / 3 = 2.67 against 3.5, lower. By reading it would be 4.57, higher.
    const t = compareExcess(dailyPoints(log, utcDay), today);
    expect(t).toMatchObject({ kind: "lower", recentDays: 3 });
    if (t.kind === "notEnough") throw new Error("expected a comparison");
    expect(t.recent).toBeCloseTo(8 / 3);
  });

  it("waits for 3 days with readings in each period", () => {
    expect(compareExcess([...run(previousStart, 3, 2), ...run(recentStart, 2, 1)], today)).toEqual({
      kind: "notEnough",
      recentDays: 2,
      previousDays: 3,
    });
    expect(compareExcess(run(recentStart, 14, 1), today)).toMatchObject({ kind: "notEnough", previousDays: 0 });
  });

  it("ignores days before both periods and after today", () => {
    const pts = [
      ...run(addDays(previousStart, -10), 5, 9),
      ...run(previousStart, 3, 2),
      ...run(recentStart, 3, 2),
      point(addDays(today, 1), 9),
    ];
    expect(compareExcess(pts, today)).toMatchObject({ kind: "stable", recent: 2, previous: 2 });
  });
});
