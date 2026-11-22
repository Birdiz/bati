import { describe, expect, it } from "vitest";
import { dewPoint } from "../src/domain/humidity/psychrometrics";
import { referenceTable, TABLE_HUMIDITIES, TABLE_TEMPERATURES } from "../src/domain/humidity/reference";
import { NEAR_LIMIT_C, checkSurface } from "../src/domain/humidity/surface";

/** 21 °C / 73 %: dew point ≈ 16.0 °C. */
const indoor = { t: 21, rh: 73 };

describe("checkSurface", () => {
  it("flags a floor above the cellar colder than the indoor dew point", () => {
    const c = checkSurface(14, indoor);
    expect(c.atRisk).toBe(true);
    expect(c.marginC).toBeCloseTo(14 - dewPoint(indoor), 10);
    expect(c.marginC).toBeLessThan(0);
  });

  it("is safe with a comfortable margin", () => {
    expect(checkSurface(19, indoor)).toMatchObject({ atRisk: false, nearLimit: false });
  });

  it("counts a surface exactly at the dew point as at risk", () => {
    expect(checkSurface(dewPoint(indoor), indoor).atRisk).toBe(true);
  });

  it("warns within instrument accuracy of the dew point", () => {
    const td = dewPoint(indoor);
    expect(checkSurface(td + NEAR_LIMIT_C / 2, indoor)).toMatchObject({ atRisk: false, nearLimit: true });
    expect(checkSurface(td + NEAR_LIMIT_C + 0.01, indoor).nearLimit).toBe(false);
  });

  it("rejects a missing surface temperature", () => {
    expect(() => checkSurface(Number.NaN, indoor)).toThrow(RangeError);
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
