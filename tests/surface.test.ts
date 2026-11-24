import { describe, expect, it } from "vitest";
import { dewPoint } from "../src/domain/humidity/psychrometrics";
import { referenceTable, TABLE_HUMIDITIES, TABLE_TEMPERATURES } from "../src/domain/humidity/reference";
import { MOULD_RH, NEAR_LIMIT_C, checkSurface, surfaceStatus } from "../src/domain/humidity/surface";

/** 21 °C / 73 %: dew point ≈ 16.0 °C. */
const indoor = { t: 21, rh: 73 };

describe("checkSurface", () => {
  it("flags a floor above the cellar colder than the indoor dew point", () => {
    const c = checkSurface(14, indoor, false);
    expect(c.status).toBe("atRisk");
    expect(c.marginC).toBeCloseTo(14 - dewPoint(indoor), 10);
    expect(c.marginC).toBeLessThan(0);
    expect(c.surfaceRH).toBe(100);
  });

  it("is safe with a comfortable margin", () => {
    expect(checkSurface(19, indoor, false).status).toBe("ok");
  });

  it("counts a surface exactly at the dew point as at risk", () => {
    expect(checkSurface(dewPoint(indoor), indoor, false).status).toBe("atRisk");
  });

  it("warns within instrument accuracy of the dew point", () => {
    const td = dewPoint(indoor);
    expect(checkSurface(td + NEAR_LIMIT_C / 2, indoor, false).status).toBe("nearLimit");
    expect(checkSurface(td + NEAR_LIMIT_C + 0.01, indoor, false).status).toBe("ok");
  });

  it("rejects a missing surface temperature", () => {
    expect(() => checkSurface(Number.NaN, indoor, false)).toThrow(RangeError);
  });
});

describe("mould threshold", () => {
  /** Living room at 19 °C / 60 %: dew point 11.1 °C, 80 % at the surface from 14.5 °C. */
  const room = { t: 19, rh: 60 };
  /** The surface temperature where the room air reaches 80 %: the dew point of the same vapour at 75 % (60 / 0.8). */
  const t80 = dewPoint({ t: 19, rh: 75 });

  it("computes the relative humidity of the air cooled to the surface", () => {
    expect(checkSurface(19, room, true).surfaceRH).toBeCloseTo(60, 10);
    expect(checkSurface(t80, room, true).surfaceRH).toBeCloseTo(MOULD_RH, 10);
    expect(dewPoint(room)).toBeCloseTo(11.06, 2);
    expect(t80).toBeCloseTo(14.47, 2);
  });

  it("flags a wooden floor at 13 °C, well above the dew point", () => {
    const c = checkSurface(13, room, true);
    expect(c.marginC).toBeGreaterThan(NEAR_LIMIT_C);
    expect(c.status).toBe("mould");
  });

  it("leaves a glazed tile at the same temperature to the dew point check", () => {
    expect(checkSurface(13, room, false).status).toBe("ok");
  });

  it("starts at 80 % exactly and gives way to condensation and the limit", () => {
    expect(checkSurface(t80, room, true).status).toBe("mould");
    expect(checkSurface(t80 + 0.01, room, true).status).toBe("ok");
    expect(checkSurface(dewPoint(room) + NEAR_LIMIT_C / 2, room, true).status).toBe("nearLimit");
    expect(checkSurface(dewPoint(room) - 1, room, true).status).toBe("atRisk");
  });
});

describe("surfaceStatus", () => {
  it("ignores the surface humidity of a non-absorbent surface or an old record without it", () => {
    expect(surfaceStatus(3, { absorbent: false, surfaceRH: 90 })).toBe("ok");
    expect(surfaceStatus(3, { absorbent: true })).toBe("ok");
    expect(surfaceStatus(3, { absorbent: true, surfaceRH: 90 })).toBe("mould");
  });
});

describe("referenceTable", () => {
  it("covers 5–40 °C and 30–100 % RH", () => {
    const rows = referenceTable();
    expect(rows.map((r) => r.t)).toEqual(TABLE_TEMPERATURES);
    expect(rows[0]!.t).toBe(5);
    expect(rows.at(-1)!.t).toBe(40);
    for (const r of rows) expect(r.ah).toHaveLength(TABLE_HUMIDITIES.length);
  });

  it("contains the field reference 10 °C / 80 % → 7.5", () => {
    const row = referenceTable().find((r) => r.t === 10)!;
    expect(row.ah[TABLE_HUMIDITIES.indexOf(80)]).toBe(7.5);
  });

  it("increases along both axes", () => {
    const rows = referenceTable();
    for (const r of rows) for (let i = 1; i < r.ah.length; i++) expect(r.ah[i]!).toBeGreaterThan(r.ah[i - 1]!);
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.ah[0]!).toBeGreaterThan(rows[i - 1]!.ah[0]!);
  });
});
