import { absoluteHumidity, round1 } from "./psychrometrics";

export const TABLE_TEMPERATURES = Array.from({ length: 36 }, (_, i) => 5 + i); // 5 to 40 °C
export const TABLE_HUMIDITIES = [30, 40, 50, 60, 70, 80, 90, 100];

export interface TableRow {
  t: number;
  /** AH in g/m³, one decimal, one per TABLE_HUMIDITIES column. */
  ah: number[];
}

/** Absolute humidity table for the printable reference sheet. */
export function referenceTable(temperatures = TABLE_TEMPERATURES, humidities = TABLE_HUMIDITIES): TableRow[] {
  return temperatures.map((t) => ({ t, ah: humidities.map((rh) => round1(absoluteHumidity({ t, rh }))) }));
}
