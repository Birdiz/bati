/**
 * Day charts of the Carnet (trend, cold surfaces). Hand-made SVG, no library: offline, CSP-safe (colours come
 * from classes and tokens, never inline styles). The viewBox has the chart's real width in pixels, so labels
 * keep their size from phone to desktop. Lines are broken over long gaps (`segments`), points always drawn.
 */
import { type Dated, addDays, daysBetween, segments } from "../domain/humidity/trend";

/** The user's calendar day of an ISO instant, "YYYY-MM-DD". */
export function localDay(at: string): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const dayLabel = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
/** "12 nov." */
export const shortDate = (day: string) => dayLabel.format(new Date(`${day}T12:00:00Z`));

export interface YRange {
  lo: number;
  hi: number;
  step: number;
}

/** Vertical range: always shows 0 and 1, on round steps. */
export function yRange(values: number[]): YRange {
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const span = max - min;
  const step = span <= 8 ? 2 : span <= 20 ? 5 : 10;
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}

export interface ChartSeries<T> {
  key: string;
  value: (p: T) => number;
  /** Dot radius. */
  r: number;
  /** Optional state of each point, set as data-status on its dot (coloured by the stylesheet). */
  status?: (p: T) => string;
}

/** A horizontal zone in the tone of the advice, e.g. condensation below 0 °C of margin. */
export interface ChartBand {
  from: number;
  to: number;
  tone: "stop" | "alert";
}

export interface DayChart<T extends Dated> {
  points: T[];
  /** First and last days of the horizontal axis. */
  start: string;
  end: string;
  width: number;
  height: number;
  series: ChartSeries<T>[];
  /** Values the vertical range must include besides the points (to keep a band in view). */
  include?: number[];
  bands?: ChartBand[];
  /** Accessible name: what a screen reader announces instead of the curves. */
  label: string;
}

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

export function dayChart<T extends Dated>(c: DayChart<T>): SVGSVGElement {
  const { width, height, start, end } = c;
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const span = Math.max(daysBetween(start, end), 1);
  const { lo, hi, step } = yRange([...c.points.flatMap((p) => c.series.map((s) => s.value(p))), ...(c.include ?? [])]);
  const x = (day: string) => +(PAD.left + (daysBetween(start, day) / span) * plotW).toFixed(1);
  const y = (v: number) => +(PAD.top + ((hi - Math.min(Math.max(v, lo), hi)) / (hi - lo)) * plotH).toFixed(1);

  const bands = svg("g", { class: "bands" });
  for (const b of c.bands ?? []) {
    const top = y(b.to);
    const bottom = y(b.from);
    if (bottom > top)
      bands.append(
        svg("rect", { x: PAD.left, y: top, width: plotW, height: +(bottom - top).toFixed(1), "data-tone": b.tone }),
      );
  }

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
        { x: x(d), y: height - 6, class: i === 0 ? "start" : i === ticks.length - 1 ? "end" : "" },
        shortDate(d),
      ),
    ),
  );

  const runs = segments(c.points);
  const series = c.series.map((s) => {
    const g = svg("g", { class: "series", "data-series": s.key });
    for (const run of runs) {
      if (run.length > 1)
        g.append(svg("path", { d: run.map((p, i) => `${i ? "L" : "M"}${x(p.day)} ${y(s.value(p))}`).join(" ") }));
      for (const p of run) {
        const dot = svg("circle", { cx: x(p.day), cy: y(s.value(p)), r: s.r });
        if (s.status) dot.setAttribute("data-status", s.status(p));
        g.append(dot);
      }
    }
    return g;
  });

  return svg(
    "svg",
    { viewBox: `0 0 ${width} ${height}`, width, height, role: "img", "aria-label": c.label },
    bands,
    grid,
    xLabels,
    ...series,
  );
}

/** Horizontal padding and border of `.trend-chart` (2 × 8 px + 2 × 1.5 px), to keep in step with the stylesheet. */
const FIGURE_INSET = 19;

/**
 * Width to draw a chart at, from the content width of the column that holds the charts (the whole screen on a
 * phone, its left half on a wide screen): every chart of the Carnet gets the same, even while the trend chart
 * itself is hidden. jsdom and a hidden screen measure 0: a phone width then.
 */
export function chartWidth(screen: HTMLElement): number {
  const w = Math.round(screen.clientWidth);
  return w > 0 ? w - FIGURE_INSET : 340;
}
