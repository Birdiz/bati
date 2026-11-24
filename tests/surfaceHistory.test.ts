import { describe, expect, it } from "vitest";
import type { HouseProfile } from "../src/domain/house/profile";
import type { LogEntry } from "../src/domain/humidity/log";
import { OTHER_SURFACE_ID, surfaceStatus } from "../src/domain/humidity/surface";
import { lastSurfaceCheck, summarizeSurface, surfaceHistories } from "../src/domain/humidity/surfaceHistory";

let n = 0;
/** A saved check of surface `surfaceId` with the given margin (surface temperature = 12 + margin). */
function check(
  at: string,
  surfaceId: string,
  marginC: number,
  name = surfaceId,
  mould: { absorbent: boolean; surfaceRH?: number } = { absorbent: false },
): LogEntry {
  return {
    id: `e${++n}`,
    at,
    indoor: { t: 20, rh: 60 },
    outdoor: { t: 5, rh: 85 },
    conditions: { storm: false, recentRain: false },
    computed: { indoorAH: 10, outdoorAH: 6, indoorDewPoint: 12, code: "drierOutside", formula: "test" },
    surface: { surfaceId, name, tempC: 12 + marginC, marginC, atRisk: marginC <= 0, ...mould },
  };
}
const plain = (at: string): LogEntry => {
  const e = check(at, "x", 1);
  delete e.surface;
  return e;
};

const utcDay = (at: string) => at.slice(0, 10);
const profile: HouseProfile = {
  version: 1,
  ventilation: "none",
  facades: [],
  coldSurfaces: [
    { id: "floor", name: "Plancher du salon", location: "au-dessus de la cave", absorbent: false },
    { id: "wall", name: "Mur nord", location: "chambre", absorbent: false },
  ],
};

describe("surfaceStatus", () => {
  it("uses the thresholds of the surface check", () => {
    const plain = { absorbent: false };
    expect(surfaceStatus(0, plain)).toBe("atRisk");
    expect(surfaceStatus(-0.4, plain)).toBe("atRisk");
    expect(surfaceStatus(0.99, plain)).toBe("nearLimit");
    expect(surfaceStatus(1, plain)).toBe("ok");
  });
});

describe("surfaceHistories", () => {
  it("groups by surface in the profile's order, removed surfaces last, without 'Autre surface'", () => {
    const h = surfaceHistories(
      [
        check("2026-11-20T08:00:00Z", "gone", 2, "Ancien seuil"),
        check("2026-11-20T09:00:00Z", "wall", 3),
        check("2026-11-21T08:00:00Z", OTHER_SURFACE_ID, -2, "Autre surface"),
        check("2026-11-21T09:00:00Z", "floor", 1.5),
        plain("2026-11-22T08:00:00Z"),
      ],
      profile,
      utcDay,
    );
    expect(h.map((x) => [x.surfaceId, x.name, x.inProfile])).toEqual([
      ["floor", "Plancher du salon", true],
      ["wall", "Mur nord", true],
      ["gone", "Ancien seuil", false],
    ]);
  });

  it("names a surface by the profile, or by its last saved name once removed", () => {
    const h = surfaceHistories(
      [
        check("2026-11-01T08:00:00Z", "floor", 2, "Plancher"),
        check("2026-11-02T08:00:00Z", "gone", 2, "Seuil"),
        check("2026-11-03T08:00:00Z", "gone", 2, "Seuil de la cave"),
      ],
      profile,
      utcDay,
    );
    expect(h.map((x) => x.name)).toEqual(["Plancher du salon", "Seuil de la cave"]);
  });

  it("keeps the worst margin of each day, oldest first", () => {
    const [floor] = surfaceHistories(
      [
        check("2026-11-21T18:00:00Z", "floor", 0.6),
        check("2026-11-20T08:00:00Z", "floor", 2.5),
        check("2026-11-21T07:00:00Z", "floor", -0.3),
        check("2026-11-21T12:00:00Z", "floor", 1.2),
      ],
      profile,
      utcDay,
    );
    expect(floor!.days).toEqual([
      { day: "2026-11-20", marginC: 2.5, tempC: 14.5, status: "ok", checks: 1 },
      { day: "2026-11-21", marginC: -0.3, tempC: 11.7, status: "atRisk", checks: 3 },
    ]);
  });

  it("is empty without surface checks", () => {
    expect(surfaceHistories([plain("2026-11-22T08:00:00Z")], profile, utcDay)).toEqual([]);
  });
});

describe("summarizeSurface", () => {
  it("counts days by status and finds the worst day (the earliest on a tie)", () => {
    const [floor] = surfaceHistories(
      ["10", "11", "12", "13", "14", "15"].map((d, i) =>
        check(`2026-11-${d}T08:00:00Z`, "floor", [2, -0.5, 0.5, 3, -0.5, 0.8][i]!),
      ),
      profile,
      utcDay,
    );
    expect(summarizeSurface(floor!.days)).toMatchObject({
      days: 6,
      atRisk: 2,
      nearLimit: 2,
      worst: { day: "2026-11-11", marginC: -0.5 },
    });
    expect(summarizeSurface([])).toBeNull();
  });
});

describe("mould status in the history", () => {
  const wood = { absorbent: true, surfaceRH: 85 };

  it("counts days at risk of mould apart, with the material declared at the time", () => {
    const [h] = surfaceHistories(
      [
        check("2026-11-20T08:00:00Z", "floor", 3, "Plancher", wood),
        check("2026-11-21T08:00:00Z", "floor", 3, "Plancher", { absorbent: false, surfaceRH: 85 }),
        check("2026-11-22T08:00:00Z", "floor", 0.5, "Plancher", { absorbent: true, surfaceRH: 97 }),
      ],
      profile,
      utcDay,
    );
    expect(h!.days.map((d) => d.status)).toEqual(["mould", "ok", "nearLimit"]);
    expect(summarizeSurface(h!.days)).toMatchObject({ days: 3, atRisk: 0, nearLimit: 1, mould: 1 });
  });

  it("reminds the last check with its mould status", () => {
    const log = [check("2026-11-22T08:00:00Z", "floor", 3, "Plancher", wood)];
    expect(lastSurfaceCheck(log, "floor")?.status).toBe("mould");
  });
});

describe("lastSurfaceCheck", () => {
  it("gives the most recent check of a surface, never for 'Autre surface'", () => {
    const log = [
      check("2026-11-21T08:00:00Z", "floor", 0.4),
      check("2026-11-19T08:00:00Z", "floor", 2),
      check("2026-11-22T08:00:00Z", "wall", 3),
      check("2026-11-22T09:00:00Z", OTHER_SURFACE_ID, 1),
    ];
    expect(lastSurfaceCheck(log, "floor")).toEqual({ at: "2026-11-21T08:00:00Z", marginC: 0.4, status: "nearLimit" });
    expect(lastSurfaceCheck(log, OTHER_SURFACE_ID)).toBeNull();
    expect(lastSurfaceCheck(log, "nothing")).toBeNull();
  });
});
