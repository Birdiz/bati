/** Screen 1: quick check. Indoor and outdoor readings → AH, indoor dew point, one advice. Can be saved to the log. */
import { decideAdvice } from "../domain/humidity/advice";
import { createEntry } from "../domain/humidity/log";
import { absoluteHumidity } from "../domain/humidity/psychrometrics";
import { READING_ERROR, adviceText, fmt } from "../text/fr";
import { byId, flash, showAdvice } from "./dom";
import { type AppState, type Draft, type FieldErrors, draftInput, parseReading } from "./state";

const FIELDS = ["indoorT", "indoorRh", "outdoorT", "outdoorRh"] as const;

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

  function render(): void {
    const d = state.draft;
    const { input, errors } = draftInput(d);
    showErrors(errors);
    showAH("indoorAH", d.indoorT, d.indoorRh);
    showAH("outdoorAH", d.outdoorT, d.outdoorRh);
    const dew = byId("dewPointLine");
    saveForm.hidden = !input;
    if (!input) {
      showAdvice(byId("advice"), byId("adviceTitle"), byId("adviceLines"), {
        empty: "Saisir les relevés intérieur et extérieur.",
      });
      dew.hidden = true;
      return;
    }
    const advice = decideAdvice(input, state.profile);
    showAdvice(byId("advice"), byId("adviceTitle"), byId("adviceLines"), adviceText(advice, state.profile));
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
