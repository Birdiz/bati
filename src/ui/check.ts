/** Screen 1: quick check. Indoor and outdoor readings → AH, indoor dew point, one advice. Can be saved to the log. */
import { type Advice, decideAdvice, drierSide } from "../domain/humidity/advice";
import { createEntry } from "../domain/humidity/log";
import { absoluteHumidity } from "../domain/humidity/psychrometrics";
import { CODE_LABEL, READING_ERROR, SIDE_TAG, type Tone, adviceText, fmt, gapValue } from "../text/fr";
import { byId, flash, h, showAdvice } from "./dom";
import { type AppState, type Draft, type FieldErrors, draftInput, parseReading } from "./state";

const FIELDS = ["indoorT", "indoorRh", "outdoorT", "outdoorRh"] as const;

/**
 * Bounds of the absolute humidity scale: 0–20 g/m³ covers the Vosges most of the year; a humid summer day goes
 * beyond, then the scale grows to the next step instead of clipping the marker.
 */
export function scaleFor(values: number[]): { max: number; step: number } {
  const top = Math.max(20, ...values);
  const step = top <= 30 ? 5 : 10;
  return { max: Math.ceil(top / step) * step, step };
}

/** Position on the scale, in percent of its width. */
const pct = (v: number, max: number) => (Math.min(Math.max(v, 0), max) / max) * 100;

/** Labels near an end are shifted so they stay inside the scale; the tick stays on the value. */
function place(mark: HTMLElement, p: number): void {
  mark.style.setProperty("--pos", `${p}%`);
  mark.style.setProperty("--shift", p < 12 ? "0%" : p > 88 ? "-100%" : "-50%");
}

export function mountCheck(state: AppState): { show(): void } {
  const inputs = Object.fromEntries(FIELDS.map((f) => [f, byId<HTMLInputElement>(f)])) as Record<
    (typeof FIELDS)[number],
    HTMLInputElement
  >;
  const storm = byId<HTMLInputElement>("storm");
  const rain = byId<HTMLInputElement>("recentRain");
  const note = byId<HTMLTextAreaElement>("note");
  const saveForm = byId<HTMLFormElement>("saveForm");

  function fill(d: Draft): void {
    for (const f of FIELDS) if (inputs[f].value !== d[f]) inputs[f].value = d[f];
    storm.checked = d.storm;
    rain.checked = d.recentRain;
  }

  function showErrors(errors: FieldErrors): void {
    for (const f of FIELDS) {
      const err = errors[f];
      const p = byId(`${f}-error`);
      p.hidden = !err;
      p.textContent = err ? READING_ERROR[err] : "";
      inputs[f].setAttribute("aria-invalid", String(!!err));
    }
  }

  function showAH(id: string, tRaw: string, rhRaw: string): void {
    const r = parseReading(tRaw, rhRaw).reading;
    byId(id).textContent = r ? `${fmt(absoluteHumidity(r))} g/m³` : "";
  }

  /** Lighter panel and "plus sec / plus humide" tags on the side holding less water; nothing within the band. */
  function showSides(advice: Advice | null): void {
    const side = advice ? drierSide(advice.gap) : null;
    const form = byId("checkForm");
    if (side) form.dataset.drier = side;
    else delete form.dataset.drier;
    for (const s of ["indoor", "outdoor"] as const) {
      const tag = byId(`${s}Tag`);
      tag.hidden = !side;
      tag.textContent = side ? (side === s ? SIDE_TAG.drier : SIDE_TAG.wetter) : "";
    }
  }

  function showScale(advice: Advice | null, tone: Tone): void {
    const scale = byId("ahScale");
    scale.hidden = !advice;
    if (!advice) return;
    scale.dataset.tone = tone;
    const { indoorAH: i, outdoorAH: o } = advice;
    const { max, step } = scaleFor([i, o]);
    byId("scaleGap").textContent = gapValue(advice.gap);
    byId("scaleIndoorValue").textContent = fmt(i);
    byId("scaleOutdoorValue").textContent = fmt(o);
    place(byId("scaleIndoor"), pct(i, max));
    place(byId("scaleOutdoor"), pct(o, max));
    const band = byId("scaleBand");
    band.style.setProperty("--from", `${pct(Math.min(i, o), max)}%`);
    band.style.setProperty("--width", `${Math.max(pct(Math.abs(i - o), max), 0.6)}%`);
    const ticks: HTMLElement[] = [];
    for (let v = 0; v <= max; v += step) {
      const t = h("span", { class: "scale-tick" }, String(v));
      t.style.setProperty("--pos", `${pct(v, max)}%`);
      ticks.push(t);
    }
    byId("scaleTicks").replaceChildren(...ticks);
  }

  function render(): void {
    const d = state.draft;
    const { input, errors } = draftInput(d);
    showErrors(errors);
    showAH("indoorAH", d.indoorT, d.indoorRh);
    showAH("outdoorAH", d.outdoorT, d.outdoorRh);
    const dew = byId("dewPointLine");
    const verdict = byId("adviceVerdict");
    saveForm.hidden = !input;
    if (!input) {
      showSides(null);
      showScale(null, "neutral");
      showAdvice(byId("advice"), byId("adviceTitle"), byId("adviceLines"), {
        empty: "Saisir les relevés intérieur et extérieur.",
      });
      verdict.hidden = true;
      dew.hidden = true;
      return;
    }
    const advice = decideAdvice(input, state.profile);
    const text = adviceText(advice, state.profile);
    showSides(advice);
    showScale(advice, text.tone);
    showAdvice(byId("advice"), byId("adviceTitle"), byId("adviceLines"), text);
    verdict.hidden = false;
    verdict.textContent = CODE_LABEL[advice.code];
    dew.hidden = false;
    dew.textContent = `Point de rosée intérieur : ${fmt(advice.indoorDewPoint)} °C. Une surface plus froide se couvre d'eau.`;
  }

  for (const f of FIELDS)
    inputs[f].addEventListener("input", () => {
      state.setDraft({ [f]: inputs[f].value });
      render();
    });
  storm.addEventListener("change", () => {
    state.setDraft({ storm: storm.checked });
    render();
  });
  rain.addEventListener("change", () => {
    state.setDraft({ recentRain: rain.checked });
    render();
  });
  byId("checkForm").addEventListener("submit", (e) => e.preventDefault());

  saveForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const { input } = draftInput(state.draft);
    if (!input) return;
    const entry = createEntry(input, decideAdvice(input, state.profile), {
      id: state.newId(),
      at: state.now(),
      note: note.value,
    });
    state.addEntry(entry);
    note.value = "";
    flash(
      byId("saveStatus"),
      state.stored
        ? "Enregistré dans le carnet."
        : "Gardé pour cette session seulement : l'appareil refuse d'enregistrer.",
      !state.stored,
    );
  });

  // The profile changes the advice (VMC, facades).
  state.subscribe(render);

  return {
    show() {
      fill(state.draft);
      render();
    },
  };
}
