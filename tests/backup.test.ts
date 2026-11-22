import { describe, expect, it } from "vitest";
import { applyImport, backupFileName, EXPORT_FORMAT, parseBackup, toBackup } from "../src/domain/backup";
import { emptyProfile, type HouseProfile } from "../src/domain/house/profile";
import { type CheckInput, decideAdvice } from "../src/domain/humidity/advice";
import { createEntry, type LogEntry, mergeLogs, sanitizeEntry } from "../src/domain/humidity/log";
import { checkSurface } from "../src/domain/humidity/surface";

const profile: HouseProfile = {
  version: 1,
  ventilation: "singleFlow",
  facades: [{ id: "f1", name: "Sud", orientation: "S", facesWetArea: false, hasUpstairsOpenings: true }],
  coldSurfaces: [{ id: "s1", name: "Plancher salon", location: "Au-dessus de la cave" }],
};
const input: CheckInput = {
  indoor: { t: 21, rh: 73 },
  outdoor: { t: 10, rh: 80 },
  conditions: { storm: false, recentRain: true },
};

function entry(id: string, at: string, extra: Partial<Parameters<typeof createEntry>[2]> = {}): LogEntry {
  return createEntry(input, decideAdvice(input, profile), { id, at: new Date(at), ...extra });
}

describe("createEntry", () => {
  it("keeps the measurements, the computed values and the formula id", () => {
    const e = entry("a", "2026-11-22T08:00:00Z", { note: "  après la pluie  " });
    expect(e).toMatchObject({
      id: "a",
      at: "2026-11-22T08:00:00.000Z",
      indoor: { t: 21, rh: 73 },
      conditions: { storm: false, recentRain: true },
      computed: { code: "drierOutside", formula: "magnus-alduchov-eskridge-1996" },
      note: "après la pluie",
    });
    expect(e.computed.indoorAH).toBeCloseTo(13.35, 1);
    expect(e).not.toHaveProperty("surface");
  });

  it("records a surface check with the surface name at the time", () => {
    const check = checkSurface(14, input.indoor);
    const e = entry("b", "2026-11-22T09:00:00Z", {
      surface: { surfaceId: "s1", name: "Plancher salon", tempC: 14, check },
    });
    expect(e.surface).toEqual({
      surfaceId: "s1",
      name: "Plancher salon",
      tempC: 14,
      marginC: check.marginC,
      atRisk: true,
    });
  });

  it("omits an empty note", () => {
    expect(entry("c", "2026-11-22T09:00:00Z", { note: "   " })).not.toHaveProperty("note");
  });
});

describe("sanitizeEntry", () => {
  it("round-trips a valid entry", () => {
    const e = entry("a", "2026-11-22T08:00:00Z", { note: "ok" });
    expect(sanitizeEntry(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });

  it("rejects entries with invalid readings, dates or codes", () => {
    const e = JSON.parse(JSON.stringify(entry("a", "2026-11-22T08:00:00Z")));
    expect(sanitizeEntry({ ...e, indoor: { t: 21, rh: 0 } })).toBeNull();
    expect(sanitizeEntry({ ...e, at: "hier" })).toBeNull();
    expect(sanitizeEntry({ ...e, computed: { ...e.computed, code: "maybe" } })).toBeNull();
    expect(sanitizeEntry({ ...e, surface: { surfaceId: "s1" } })).toBeNull();
    expect(sanitizeEntry("entry")).toBeNull();
  });
});

describe("mergeLogs", () => {
  it("adds new ids, keeps existing entries on conflict, sorts newest first", () => {
    const a = entry("a", "2026-11-20T08:00:00Z");
    const b = entry("b", "2026-11-22T08:00:00Z");
    const aChanged = { ...a, note: "autre" };
    const r = mergeLogs([a], [aChanged, b]);
    expect(r.added).toBe(1);
    expect(r.log.map((e) => e.id)).toEqual(["b", "a"]);
    expect(r.log[1]).not.toHaveProperty("note");
  });
});

describe("toBackup / parseBackup", () => {
  const log = [entry("a", "2026-11-20T08:00:00Z"), entry("b", "2026-11-22T08:00:00Z")];

  it("round-trips the profile and the log", () => {
    const text = toBackup({ profile, log }, new Date("2026-11-22T10:00:00Z"));
    expect(JSON.parse(text)).toMatchObject({
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: "2026-11-22T10:00:00.000Z",
    });
    const parsed = parseBackup(text);
    expect(parsed).toEqual({ ok: true, profile, log: [log[1], log[0]], dropped: 0 });
  });

  it("names the file with the local date", () => {
    expect(backupFileName(new Date(2026, 10, 2, 23, 30))).toBe("bati-sauvegarde-2026-11-02.json");
  });

  it("refuses files that are not backups", () => {
    expect(parseBackup("{")).toEqual({ ok: false, error: "notJson" });
    expect(parseBackup('{"format":"limon-projet"}')).toEqual({ ok: false, error: "notABackup" });
    expect(parseBackup(`{"format":"${EXPORT_FORMAT}","version":0}`)).toEqual({ ok: false, error: "notABackup" });
    expect(parseBackup(`{"format":"${EXPORT_FORMAT}","version":2}`)).toEqual({ ok: false, error: "newerVersion" });
  });

  it("drops invalid and duplicate entries and counts them", () => {
    const text = JSON.stringify({ format: EXPORT_FORMAT, version: 1, profile, log: [log[0], log[0], { id: "x" }] });
    const parsed = parseBackup(text);
    expect(parsed.ok && parsed.log.length).toBe(1);
    expect(parsed.ok && parsed.dropped).toBe(2);
  });

  it("accepts a file without profile", () => {
    const parsed = parseBackup(JSON.stringify({ format: EXPORT_FORMAT, version: 1, log: [] }));
    expect(parsed).toEqual({ ok: true, profile: null, log: [], dropped: 0 });
  });
});

describe("applyImport", () => {
  const a = entry("a", "2026-11-20T08:00:00Z");
  const b = entry("b", "2026-11-22T08:00:00Z");
  const parsed = { ok: true as const, profile, log: [b], dropped: 0 };

  it("replace swaps everything", () => {
    expect(applyImport({ profile: emptyProfile(), log: [a] }, parsed, "replace")).toEqual({
      data: { profile, log: [b] },
      added: 1,
    });
  });

  it("merge adds entries and takes the profile only if the device has none", () => {
    expect(applyImport({ profile: emptyProfile(), log: [a] }, parsed, "merge").data).toEqual({ profile, log: [b, a] });
    const local: HouseProfile = { ...emptyProfile(), ventilation: "doubleFlow" };
    expect(applyImport({ profile: local, log: [] }, parsed, "merge").data.profile).toBe(local);
  });
});
