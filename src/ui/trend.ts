/**
 * Trend of the log (Carnet screen): the comparison of the moisture excess and a chart of the daily points.
 * Hand-made SVG, no library: offline, CSP-safe (colours come from classes and tokens, never inline styles).
 * The viewBox has the chart's real width in pixels, so labels keep their size from phone to desktop.
 */
import {
  type DayPoint,
  TREND_WINDOWS,
  addDays,
  compareExcess,
  dailyPoints,
  daysBetween,
  inWindow,
  segments,
  windowStart,
} from "../domain/humidity/trend";
import { TREND_WINDOW_LABEL, trendChartLabel, trendText } from "../text/fr";
import { byId, h, showAdvice } from "./dom";
import type { AppState } from "./state";

/** The user's calendar day of an ISO instant, "YYYY-MM-DD". */
export function localDay(at: string): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const dayLabel = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const shortDate = (day: string) => dayLabel.format(new Date(`${day}T12:00:00Z`));

/** Vertical range in g/m³: always shows 0 (the excess can be negative), on round steps. */
export function yRange(values: number[]): { lo: number; hi: number; step: number } {
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const span = max - min;
  const step = span <= 8 ? 2 : span <= 20 ? 5 : 10;
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}

const HEIGHT = 210;
const PAD = { left: 30, right: 10, top: 10, bottom: 26 };
const SVG = "http://www.w3.org/2000/svg";

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  ...children: (Node | string)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
}

const SERIES = [
  { key: "outdoor", value: (p: DayPoint) => p.outdoorAH, r: 2 },
  { key: "indoor", value: (p: DayPoint) => p.indoorAH, r: 2 },
  { key: "excess", value: (p: DayPoint) => p.excess, r: 3 },
] as const;

/** The chart of the points from `start` to `end` (days), `width` pixels wide. */
export function trendChart(points: DayPoint[], start: string, end: string, width: number): SVGSVGElement {
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const span = Math.max(daysBetween(start, end), 1);
  const { lo, hi, step } = yRange(points.flatMap((p) => [p.excess, p.indoorAH, p.outdoorAH]));
  const x = (day: string) => +(PAD.left + (daysBetween(start, day) / span) * plotW).toFixed(1);
  const y = (v: number) => +(PAD.top + ((hi - v) / (hi - lo)) * plotH).toFixed(1);

  const grid = svg("g", { class: "grid" });
  for (let v = lo; v <= hi; v += step) {
    grid.append(
      svg("line", { x1: PAD.left, x2: width - PAD.right, y1: y(v), y2: y(v), class: v === 0 ? "zero" : "" }),
      svg("text", { x: PAD.left - 6, y: y(v), class: "y-label" }, String(v)),
    );
  }
  const xLabels = svg("g", { class: "x-labels" });
  const ticks = span >= 4 && plotW >= 260 ? [start, addDays(start, Math.round(span / 2)), end] : [start, end];
  ticks.forEach((d, i) =>
    xLabels.append(
      svg(
        "text",
        { x: x(d), y: HEIGHT - 6, class: i === 0 ? "start" : i === ticks.length - 1 ? "end" : "" },
        shortDate(d),
      ),
    ),
  );

  const runs = segments(points);
  const series = SERIES.map((s) => {
    const g = svg("g", { class: "series", "data-series": s.key });
    for (const run of runs) {
      if (run.length > 1)
        g.append(svg("path", { d: run.map((p, i) => `${i ? "L" : "M"}${x(p.day)} ${y(s.value(p))}`).join(" ") }));
      for (const p of run) g.append(svg("circle", { cx: x(p.day), cy: y(s.value(p)), r: s.r }));
    }
    return g;
  });

  const label = trendChartLabel(points, shortDate(points[0]!.day), shortDate(points.at(-1)!.day));
  return svg(
    "svg",
    { viewBox: `0 0 ${width} ${HEIGHT}`, width, height: HEIGHT, role: "img", "aria-label": label },
    grid,
    xLabels,
    ...series,
  );
}

export function mountTrend(state: AppState): { render(): void } {
  const section = byId("trend");
  const chart = byId("trendChart");
  const buttons = TREND_WINDOWS.map((w) => {
    const b = h("button", { type: "button", class: "btn small", "data-window": w }, TREND_WINDOW_LABEL[w]);
    b.addEventListener("click", () => state.setTrendWindow(w));
    return b;
  });
  byId("trendWindows").replaceChildren(...buttons);
  let drawnWidth = 0;

  function render(): void {
    const all = dailyPoints(state.log, localDay);
    section.hidden = all.length === 0;
    if (section.hidden) return;
    const today = localDay(state.now().toISOString());
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.window === state.trendWindow));
    showAdvice(
      byId("trendResult"),
      byId("trendResultTitle"),
      byId("trendResultLines"),
      trendText(compareExcess(all, today)),
    );

    const points = inWindow(all, state.trendWindow, today);
    const few = points.length < 2;
    byId("trendFigure").hidden = few;
    byId("trendFew").hidden = !few;
    if (few) return chart.replaceChildren();
    // jsdom and a hidden screen measure 0: fall back to a phone width.
    drawnWidth = Math.round(chart.clientWidth) || 340;
    const last = points.at(-1)!.day;
    const end = last > today ? last : today;
    chart.replaceChildren(trendChart(points, windowStart(all, state.trendWindow, today), end, drawnWidth));
  }

  let frame = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!section.hidden && Math.round(chart.clientWidth) !== drawnWidth) render();
    });
  });
  return { render };
}
