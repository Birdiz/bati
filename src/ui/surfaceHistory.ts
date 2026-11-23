/**
 * Cold surfaces in the Carnet: one block per surface with saved checks, a summary over the period shown and the
 * worst margin of each day, on the same axis as the trend. Zones: condensation below 0 °C of margin, near the
 * limit up to NEAR_LIMIT_C.
 */
import { NEAR_LIMIT_C } from "../domain/humidity/surface";
import {
  type SurfaceDay,
  type SurfaceHistory,
  summarizeSurface,
  surfaceHistories,
} from "../domain/humidity/surfaceHistory";
import { inWindow } from "../domain/humidity/trend";
import { surfaceChartLabel, surfaceHistoryText } from "../text/fr";
import { dayChart, localDay, shortDate } from "./chart";
import { byId, h, showAdvice } from "./dom";
import type { AppState } from "./state";

const SERIES = [{ key: "margin", value: (d: SurfaceDay) => d.marginC, r: 3, status: (d: SurfaceDay) => d.status }];

function block(
  history: SurfaceHistory,
  state: AppState,
  axis: { start: string; end: string; today: string },
  width: number,
): HTMLElement {
  const days = inWindow(history.days, state.trendWindow, axis.today);
  const title = h(
    "h4",
    {},
    history.name,
    !history.inProfile && h("span", { class: "hint-inline" }, " (retirée de Ma maison)"),
  );
  const summary = summarizeSurface(days);
  if (!summary)
    return h(
      "article",
      { class: "surface-history", "data-surface": history.surfaceId },
      title,
      h("p", { class: "hint" }, "Aucune vérification sur cette période."),
    );

  const lines = h("ul", { class: "advice-lines" });
  const titleP = h("p", { class: "advice-title" });
  const box = h("div", { class: "advice compact", "data-tone": "empty" }, titleP, lines);
  showAdvice(box, titleP, lines, surfaceHistoryText(summary, state.trendWindow, shortDate(summary.worst.day)));

  const figure =
    days.length > 1 &&
    h(
      "figure",
      { class: "trend-chart" },
      dayChart({
        points: days,
        start: axis.start,
        end: axis.end,
        width,
        height: 160,
        series: SERIES,
        include: [-1, NEAR_LIMIT_C + 2],
        bands: [
          { from: Number.NEGATIVE_INFINITY, to: 0, tone: "stop" },
          { from: 0, to: NEAR_LIMIT_C, tone: "alert" },
        ],
        label: surfaceChartLabel(history.name, days, shortDate(days[0]!.day), shortDate(days.at(-1)!.day)),
      }),
    );
  return h("article", { class: "surface-history", "data-surface": history.surfaceId }, title, box, figure);
}

export function mountSurfaceHistory(state: AppState): {
  render(axis: { start: string; end: string; today: string } | null, width: number): void;
} {
  const section = byId("surfaces");
  const list = byId("surfaceHistories");
  return {
    render(axis, width) {
      const histories = axis ? surfaceHistories(state.log, state.profile, localDay) : [];
      section.hidden = histories.length === 0;
      list.replaceChildren(...(axis ? histories.map((hst) => block(hst, state, axis, width)) : []));
    },
  };
}
