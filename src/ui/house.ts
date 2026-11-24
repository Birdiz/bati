/** Screen 2: house profile. VMC type, facades, known cold surfaces. Saved on every change. */
import {
  type ColdSurface,
  type Facade,
  type HouseProfile,
  ORIENTATIONS,
  type Orientation,
  VENTILATIONS,
  type Ventilation,
} from "../domain/house/profile";
import { ORIENTATION_LABEL } from "../text/fr";
import { byId, h } from "./dom";
import type { AppState } from "./state";

export function mountHouse(state: AppState): { show(): void } {
  const ventilation = byId<HTMLSelectElement>("ventilation");

  const update = (patch: Partial<HouseProfile>) => state.setProfile({ ...state.profile, ...patch });
  const updateFacade = (id: string, patch: Partial<Facade>) =>
    update({ facades: state.profile.facades.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const updateSurface = (id: string, patch: Partial<ColdSurface>) =>
    update({ coldSurfaces: state.profile.coldSurfaces.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  function orientationSelect(value: Orientation, label: string): HTMLSelectElement {
    const s = h(
      "select",
      { "aria-label": label },
      ...ORIENTATIONS.map((o) => h("option", { value: o }, ORIENTATION_LABEL[o])),
    );
    s.value = value;
    return s;
  }

  function facadeItem(f: Facade): HTMLLIElement {
    const name = h("input", { type: "text", value: f.name, maxlength: "200", "aria-label": "Nom de la façade" });
    const orient = orientationSelect(f.orientation, `Orientation de ${f.name}`);
    const wet = h("input", { type: "checkbox", checked: f.facesWetArea });
    const up = h("input", { type: "checkbox", checked: f.hasUpstairsOpenings });
    const del = h("button", { type: "button", class: "btn small danger" }, "Retirer");
    name.addEventListener("change", () => {
      const v = name.value.trim();
      if (v) updateFacade(f.id, { name: v });
      else name.value = f.name;
    });
    orient.addEventListener("change", () => updateFacade(f.id, { orientation: orient.value as Orientation }));
    wet.addEventListener("change", () => updateFacade(f.id, { facesWetArea: wet.checked }));
    up.addEventListener("change", () => updateFacade(f.id, { hasUpstairsOpenings: up.checked }));
    del.addEventListener("click", () => {
      if (confirm(`Retirer la façade « ${f.name} » ?`))
        update({ facades: state.profile.facades.filter((x) => x.id !== f.id) });
    });
    return h(
      "li",
      { "data-id": f.id },
      name,
      orient,
      h("label", { class: "check" }, wet, " Ruisseau ou zone humide"),
      h("label", { class: "check" }, up, " Fenêtres à l'étage"),
      del,
    );
  }

  function render(): void {
    const p = state.profile;
    ventilation.value = p.ventilation;
    byId("facadeList").replaceChildren(...p.facades.map(facadeItem));
    byId("surfaceList").replaceChildren(
      ...p.coldSurfaces.map((s) => {
        const del = h("button", { type: "button", class: "btn small danger" }, "Retirer");
        del.addEventListener("click", () => {
          if (confirm(`Retirer la surface « ${s.name} » ? Les relevés du carnet la gardent.`))
            update({ coldSurfaces: p.coldSurfaces.filter((x) => x.id !== s.id) });
        });
        const absorbent = h("input", { type: "checkbox", checked: s.absorbent });
        absorbent.addEventListener("change", () => updateSurface(s.id, { absorbent: absorbent.checked }));
        return h(
          "li",
          { "data-id": s.id },
          h("span", {}, s.location ? `${s.name} — ${s.location}` : s.name),
          h("label", { class: "check" }, absorbent, " Matière absorbante"),
          del,
        );
      }),
    );
  }

  ventilation.addEventListener("change", () => {
    const v = ventilation.value as Ventilation;
    if (VENTILATIONS.includes(v)) update({ ventilation: v });
  });

  byId<HTMLFormElement>("facadeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = byId<HTMLInputElement>("facadeName");
    if (!name.value.trim()) return;
    const facade: Facade = {
      id: state.newId(),
      name: name.value.trim(),
      orientation: byId<HTMLSelectElement>("facadeOrientation").value as Orientation,
      facesWetArea: byId<HTMLInputElement>("facadeWet").checked,
      hasUpstairsOpenings: byId<HTMLInputElement>("facadeUp").checked,
    };
    update({ facades: [...state.profile.facades, facade] });
    byId<HTMLFormElement>("facadeForm").reset();
  });

  byId<HTMLFormElement>("coldSurfaceForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = byId<HTMLInputElement>("coldSurfaceName");
    if (!name.value.trim()) return;
    const location = byId<HTMLInputElement>("coldSurfaceLocation").value.trim();
    const absorbent = byId<HTMLInputElement>("coldSurfaceAbsorbent").checked;
    update({
      coldSurfaces: [
        ...state.profile.coldSurfaces,
        { id: state.newId(), name: name.value.trim(), location, absorbent },
      ],
    });
    byId<HTMLFormElement>("coldSurfaceForm").reset();
  });

  state.subscribe(render);
  return { show: render };
}
