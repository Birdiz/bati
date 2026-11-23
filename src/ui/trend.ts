/**
 * Trend of the log (Carnet screen): the comparison of the moisture excess and a chart of the daily points.
 * Also owns the period buttons, shared with the cold surface histories.
 */
import {
  type DayPoint,
  TREND_WINDOWS,
  compareExcess,
  dailyPoints,
  inWindow,
  windowStart,
} from "../domain/humidity/trend";
import { TREND_WINDOW_LABEL, trendChartLabel, trendText } from "../text/fr";
import { chartWidth, dayChart, localDay, shortDate } from "./chart";
import { byId, h, showAdvice } from "./dom";
import type { AppState } from "./state";

const SERIES = [
  { key: "outdoor", value: (p: DayPoint) => p.outdoorAH, r: 2 },
  { key: "indoor", value: (p: DayPoint) => p.indoorAH, r: 2 },
  { key: "excess", value: (p: DayPoint) => p.excess, r: 3 },
];

/** Horizontal axis of every chart of the Carnet: same period, so the charts line up. */
export function carnetAxis(state: AppState): { start: string; end: string; today: string } | null {
  const all = dailyPoints(state.log, localDay);
  const last = all.at(-1);
  if (!last) return null;
  const today = localDay(state.now().toISOString());
  return { start: windowStart(all, state.trendWindow, today), end: last.day > today ? last.day : today, today };
}

export function mountTrend(state: AppState): { render(): void; width(): number } {
  const section = byId("trend");
  const chart = byId("trendChart");
  const buttons = TREND_WINDOWS.map((w) => {
    const b = h("button", { type: "button", class: "btn small", "data-window": w }, TREND_WINDOW_LABEL[w]);
    b.addEventListener("click", () => state.setTrendWindow(w));
    return b;
  });
  byId("trendWindows").replaceChildren(...buttons);

  function render(): void {
    const axis = carnetAxis(state);
    section.hidden = !axis;
    if (!axis) return;
    const all = dailyPoints(state.log, localDay);
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.window === state.trendWindow));
    showAdvice(
      byId("trendResult"),
      byId("trendResultTitle"),
      byId("trendResultLines"),
      trendText(compareExcess(all, axis.today)),
    );

    const points = inWindow(all, state.trendWindow, axis.today);
    const few = points.length < 2;
    byId("trendFigure").hidden = few;
    byId("trendFew").hidden = !few;
    if (few) return chart.replaceChildren();
    chart.replaceChildren(
      dayChart({
        points,
        start: axis.start,
        end: axis.end,
        width: chartWidth(byId("carnetCharts")),
        height: 210,
        series: SERIES,
        label: trendChartLabel(points, shortDate(points[0]!.day), shortDate(points.at(-1)!.day)),
      }),
    );
  }

  return { render, width: () => chartWidth(byId("carnetCharts")) };
}
