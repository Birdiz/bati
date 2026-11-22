import { describe, expect, it } from "vitest";
import {
  FORMULA,
  absoluteHumidity,
  dewPoint,
  readingError,
  round1,
  saturationAbsoluteHumidity,
  saturationVapourPressure,
} from "../src/domain/humidity/psychrometrics";

describe("absoluteHumidity", () => {
  // Field references. 10 °C / 80 % was first noted as 7.6 from a hygrometer display; every standard
  // formula (Bolton, Alduchov-Eskridge, Tetens, Buck) gives 7.51, so 7.5 is the reference.
  it("matches the field reference 10 °C / 80 % → 7.5 g/m³", () => {
    expect(absoluteHumidity({ t: 10, rh: 80 })).toBeCloseTo(7.51, 1);
    expect(Math.abs(absoluteHumidity({ t: 10, rh: 80 }) - 7.51)).toBeLessThan(0.05);
  });

  it("matches the field reference 21 °C / 73 % → 13.35 g/m³", () => {
    expect(Math.abs(absoluteHumidity({ t: 21, rh: 73 }) - 13.35)).toBeLessThan(0.05);
  });

  // Saturation absolute humidity from published psychrometric tables (g/m³), within 1 %.
  it.each([
    [0, 4.85],
    [5, 6.8],
    [10, 9.4],
    [15, 12.83],
    [20, 17.3],
    [25, 23.05],
    [30, 30.38],
    [35, 39.6],
    [40, 51.1],
  ])("gives %d °C saturated → %d g/m³", (t, ah) => {
    expect(Math.abs(saturationAbsoluteHumidity(t) / ah - 1)).toBeLessThan(0.01);
  });

  it("is proportional to relative humidity at fixed temperature", () => {
    expect(absoluteHumidity({ t: 18, rh: 40 }) * 2).toBeCloseTo(absoluteHumidity({ t: 18, rh: 80 }), 10);
  });

  it("refuses readings outside the formula's range", () => {
    expect(() => absoluteHumidity({ t: 55, rh: 50 })).toThrow(RangeError);
    expect(() => absoluteHumidity({ t: 20, rh: 0 })).toThrow(RangeError);
    expect(() => absoluteHumidity({ t: 20, rh: 101 })).toThrow(RangeError);
  });
});

describe("saturationVapourPressure", () => {
  it("is 6.1094 hPa at 0 °C and about 23.4 hPa at 20 °C", () => {
    expect(saturationVapourPressure(0)).toBeCloseTo(6.1094, 4);
    expect(saturationVapourPressure(20)).toBeCloseTo(23.37, 1);
  });
});

describe("dewPoint", () => {
  it("equals the air temperature at 100 % RH", () => {
    for (const t of [-10, 0, 12.5, 30]) expect(dewPoint({ t, rh: 100 })).toBeCloseTo(t, 8);
  });

  // Published dew points (°C) for common indoor conditions.
  it.each([
    [20, 50, 9.3],
    [21, 63, 13.7],
    [10, 80, 6.7],
    [25, 60, 16.7],
  ])("gives %d °C / %d %% → %d °C", (t, rh, td) => {
    expect(Math.abs(dewPoint({ t, rh }) - td)).toBeLessThan(0.1);
  });

  it("is consistent with absolute humidity: air cooled to its dew point is saturated", () => {
    const air = { t: 21, rh: 73 };
    const td = dewPoint(air);
    // Same vapour pressure, so AH scales only with the temperature in kelvin.
    const ahAtDew = saturationAbsoluteHumidity(td) * ((td + 273.15) / (air.t + 273.15));
    expect(ahAtDew).toBeCloseTo(absoluteHumidity(air), 8);
  });
});

describe("readingError", () => {
  it("accepts the documented range and rejects everything else", () => {
    expect(readingError({ t: FORMULA.minC, rh: 1 })).toBeNull();
    expect(readingError({ t: FORMULA.maxC, rh: 100 })).toBeNull();
    expect(readingError({ t: FORMULA.minC - 0.1, rh: 50 })).toBe("temperatureOutOfRange");
    expect(readingError({ t: 20, rh: 0 })).toBe("humidityOutOfRange");
    expect(readingError({ t: Number.NaN, rh: 50 })).toBe("notANumber");
  });
});

describe("round1", () => {
  it("rounds to one decimal", () => {
    expect(round1(7.5134)).toBe(7.5);
    expect(round1(13.35)).toBe(13.4);
  });
});
