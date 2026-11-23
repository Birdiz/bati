/** Screen 3: cold surface check. A known surface and its temperature → condensation risk and margin. */
import { decideAdvice } from "../domain/humidity/advice";
import { createEntry } from "../domain/humidity/log";
import { OTHER_SURFACE_ID, checkSurface } from "../domain/humidity/surface";
import { lastSurfaceCheck } from "../domain/humidity/surfaceHistory";
import { daysBetween } from "../domain/humidity/trend";
import { READING_ERROR, lastCheckText, parseDecimal, surfaceText } from "../text/fr";
import { localDay } from "./chart";
import { byId, flash, h, showAdvice } from "./dom";
import { type AppState, draftInput, parseReading } from "./state";

/** Value of the "other surface" option: a check on a surface that is not in the profile. */
export const OTHER_SURFACE = OTHER_SURFACE_ID;

export function mountSurface(state: AppState): { show(): void } {
  const select = byId<HTMLSelectElement>("surfaceId");
  const surfaceT = byId<HTMLInputElement>("surfaceT");
  const indoorT = byId<HTMLInputElement>("surfIndoorT");
  const indoorRh = byId<HTMLInputElement>("surfIndoorRh");
  const save = byId<HTMLButtonElement>("surfaceSave");

  function fillSelect(): void {
    const surfaces = state.profile.coldSurfaces;
    select.replaceChildren(
      ...surfaces.map((s) => h("option", { value: s.id }, s.location ? `${s.name} — ${s.location}` : s.name)),
      h("option", { value: OTHER_SURFACE }, "Autre surface"),
    );
    const wanted = state.draft.surfaceId;
    select.value =
      surfaces.some((s) => s.id === wanted) || wanted === OTHER_SURFACE ? wanted : (surfaces[0]?.id ?? OTHER_SURFACE);
    byId("noSurfaces").hidden = surfaces.length > 0;
  }

  /** The check if every field is usable. */
  function current() {
    const t = parseDecimal(state.draft.surfaceT);
    const indoor = parseReading(state.draft.indoorT, state.draft.indoorRh).reading;
    if (Number.isNaN(t) || !indoor) return null;
    return { tempC: t, check: checkSurface(t, indoor) };
  }

  /** The last saved check of the chosen surface, to compare with before measuring again. */
  function showLast(): void {
    const last = lastSurfaceCheck(state.log, select.value);
    const p = byId("surfaceLast");
    p.hidden = !last;
    p.textContent = last
      ? lastCheckText(daysBetween(localDay(last.at), localDay(state.now().toISOString())), last.marginC, last.status)
      : "";
  }

  function render(): void {
    showLast();
    const raw = state.draft.surfaceT;
    const err = raw.trim() !== "" && Number.isNaN(parseDecimal(raw));
    const p = byId("surfaceT-error");
    p.hidden = !err;
    p.textContent = err ? READING_ERROR.notANumber : "";
    surfaceT.setAttribute("aria-invalid", String(err));

    const c = current();
    showAdvice(
      byId("surfaceResult"),
      byId("surfaceResultTitle"),
      byId("surfaceResultLines"),
      c ? surfaceText(c.check) : { empty: "Saisir la température de la surface et l'air de la pièce." },
    );
    const full = draftInput(state.draft).input;
    save.hidden = !c || !full;
    byId("surfaceSaveNote").hidden = !c || !!full;
  }

  select.addEventListener("change", () => {
    state.setDraft({ surfaceId: select.value });
    render();
  });
  surfaceT.addEventListener("input", () => {
    state.setDraft({ surfaceT: surfaceT.value });
    render();
  });
  indoorT.addEventListener("input", () => {
    state.setDraft({ indoorT: indoorT.value });
    render();
  });
  indoorRh.addEventListener("input", () => {
    state.setDraft({ indoorRh: indoorRh.value });
    render();
  });
  byId("surfaceForm").addEventListener("submit", (e) => e.preventDefault());

  save.addEventListener("click", () => {
    const c = current();
    const { input } = draftInput(state.draft);
    if (!c || !input) return;
    const known = state.profile.coldSurfaces.find((s) => s.id === select.value);
    state.addEntry(
      createEntry(input, decideAdvice(input, state.profile), {
        id: state.newId(),
        at: state.now(),
        surface: {
          surfaceId: known?.id ?? OTHER_SURFACE,
          name: known?.name ?? "Autre surface",
          tempC: c.tempC,
          check: c.check,
        },
      }),
    );
    showLast();
    flash(
      byId("surfaceSaveStatus"),
      state.stored ? "Enregistré dans le carnet." : "Gardé pour cette session seulement.",
      !state.stored,
    );
  });

  return {
    show() {
      fillSelect();
      surfaceT.value = state.draft.surfaceT;
      indoorT.value = state.draft.indoorT;
      indoorRh.value = state.draft.indoorRh;
      render();
    },
  };
}
