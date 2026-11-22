/** Mounts every screen and switches between them from the address fragment (#releve, #maison…). */
import { mountCheck } from "./check";
import { byId } from "./dom";
import { mountHouse } from "./house";
import { mountLog } from "./log";
import { mountSheet } from "./sheet";
import type { AppState } from "./state";
import { mountSurface } from "./surface";

export const SCREENS = ["releve", "surface", "maison", "carnet", "fiche"] as const;
export type Screen = (typeof SCREENS)[number];

export function screenFromHash(hash: string): Screen {
  const s = hash.replace(/^#/, "");
  return (SCREENS as readonly string[]).includes(s) ? (s as Screen) : "releve";
}

export function startApp(state: AppState): { go(s: Screen): void } {
  const screens: Record<Screen, { show(): void }> = {
    releve: mountCheck(state),
    surface: mountSurface(state),
    maison: mountHouse(state),
    carnet: mountLog(state),
    fiche: mountSheet(),
  };

  function storeStatus(): void {
    const p = byId("storeStatus");
    const msgs: string[] = [];
    if (!state.stored) msgs.push("Cet appareil refuse d'enregistrer : les données ne seront pas gardées.");
    if (state.droppedOnLoad > 0) msgs.push(`${state.droppedOnLoad} relevé(s) illisible(s) laissé(s) de côté.`);
    p.hidden = msgs.length === 0;
    p.textContent = msgs.join(" ");
  }

  function go(s: Screen): void {
    for (const id of SCREENS) byId(`screen-${id}`).hidden = id !== s;
    for (const a of document.querySelectorAll<HTMLAnchorElement>("[data-tab]"))
      a.toggleAttribute("aria-current", a.dataset.tab === s);
    document.body.dataset.screen = s;
    screens[s].show();
  }

  window.addEventListener("hashchange", () => go(screenFromHash(location.hash)));
  state.subscribe(storeStatus);
  storeStatus();
  go(screenFromHash(location.hash));
  return { go };
}
