/** Screen 4: measurement log, backup (JSON export/import) and installation. */
import {
  applyImport,
  backupFileName,
  isEmptyProfile,
  type ParsedBackup,
  parseBackup,
  toBackup,
} from "../domain/backup";
import type { LogEntry } from "../domain/humidity/log";
import { BACKUP_ERROR, CODE_LABEL, fmt } from "../text/fr";
import { byId, downloadText, flash, h } from "./dom";
import type { AppState } from "./state";
import { mountTrend } from "./trend";

/** After this many days without a copy, the log screen reminds the user. */
export const BACKUP_REMINDER_DAYS = 30;

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

function entryItem(e: LogEntry, onDelete: () => void): HTMLLIElement {
  const c = e.computed;
  const conditions = [e.conditions.storm && "orage", e.conditions.recentRain && "après la pluie"]
    .filter(Boolean)
    .join(", ");
  const del = h(
    "button",
    { type: "button", class: "btn small danger", "aria-label": "Supprimer ce relevé" },
    "Supprimer",
  );
  del.addEventListener("click", onDelete);
  return h(
    "li",
    { "data-id": e.id, "data-code": c.code },
    h(
      "p",
      { class: "log-head" },
      h("time", { datetime: e.at }, dateFmt.format(new Date(e.at))),
      h("strong", {}, CODE_LABEL[c.code]),
    ),
    h(
      "p",
      {},
      `Dedans ${fmt(e.indoor.t)} °C · ${fmt(e.indoor.rh, 0)} % → ${fmt(c.indoorAH)} g/m³ — `,
      `dehors ${fmt(e.outdoor.t)} °C · ${fmt(e.outdoor.rh, 0)} % → ${fmt(c.outdoorAH)} g/m³`,
    ),
    h("p", {}, `Point de rosée ${fmt(c.indoorDewPoint)} °C${conditions ? ` · ${conditions}` : ""}`),
    e.surface &&
      h(
        "p",
        { class: e.surface.atRisk ? "risk" : "" },
        `${e.surface.name} : ${fmt(e.surface.tempC)} °C, ${e.surface.atRisk ? "condensation" : "pas de condensation"} (marge ${fmt(e.surface.marginC)} °C)`,
      ),
    e.note && h("p", { class: "note" }, e.note),
    del,
  );
}

function setupInstall(): void {
  const standalone =
    matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return;
  const box = byId("install");
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (ios) {
    box.hidden = byId("installIos").hidden = false;
    return;
  }
  let prompt: (Event & { prompt(): Promise<void> }) | null = null;
  const btn = byId<HTMLButtonElement>("installBtn");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    prompt = e as Event & { prompt(): Promise<void> };
    box.hidden = btn.hidden = false;
  });
  window.addEventListener("appinstalled", () => (box.hidden = true));
  btn.addEventListener("click", () => {
    void prompt?.prompt();
    prompt = null;
    box.hidden = true;
  });
}

export function mountLog(state: AppState): { show(): void } {
  const importFile = byId<HTMLInputElement>("importFile");
  const choice = byId("importChoice");
  let pending: Extract<ParsedBackup, { ok: true }> | null = null;
  const trend = mountTrend(state);

  function backupStatus(): string {
    if (!state.lastBackup) return state.log.length > 0 ? "Aucune copie enregistrée pour l'instant." : "";
    const days = Math.floor((state.now().getTime() - Date.parse(state.lastBackup)) / 86_400_000);
    const when = `Dernière copie : ${dateFmt.format(new Date(state.lastBackup))}.`;
    return days >= BACKUP_REMINDER_DAYS ? `${when} Pensez à en refaire une.` : when;
  }

  function render(): void {
    byId("logEmpty").hidden = state.log.length > 0;
    byId("logTitle").hidden = state.log.length === 0;
    trend.render();
    byId("logList").replaceChildren(
      ...state.log.map((e) =>
        entryItem(e, () => {
          if (confirm("Supprimer ce relevé du carnet ?")) state.removeEntry(e.id);
        }),
      ),
    );
    byId("backupStatus").textContent = backupStatus();
  }

  byId("exportBtn").addEventListener("click", () => {
    const now = state.now();
    downloadText(toBackup(state.data(), now), backupFileName(now));
    state.markBackup();
  });

  importFile.addEventListener("change", () => {
    const file = importFile.files?.[0];
    importFile.value = "";
    if (!file) return;
    file
      .text()
      .then((text) => {
        const parsed = parseBackup(text);
        if (!parsed.ok) {
          flash(byId("importStatus"), BACKUP_ERROR[parsed.error], true, 6000);
          return;
        }
        pending = parsed;
        const parts = [`${parsed.log.length} relevé${parsed.log.length > 1 ? "s" : ""}`];
        if (parsed.profile && !isEmptyProfile(parsed.profile)) parts.push("la description de la maison");
        const dropped = parsed.dropped
          ? ` (${parsed.dropped} élément${parsed.dropped > 1 ? "s" : ""} illisible${parsed.dropped > 1 ? "s" : ""} laissé${parsed.dropped > 1 ? "s" : ""} de côté)`
          : "";
        byId("importSummary").textContent = `Cette copie contient ${parts.join(" et ")}${dropped}.`;
        choice.hidden = false;
      })
      .catch(() => flash(byId("importStatus"), "Lecture du fichier impossible.", true));
  });

  function finishImport(mode: "merge" | "replace"): void {
    if (!pending) return;
    if (mode === "replace" && !confirm("Remplacer tout le carnet et la description de la maison par cette copie ?"))
      return;
    const { data, added } = applyImport(state.data(), pending, mode);
    state.replaceData(data);
    pending = null;
    choice.hidden = true;
    flash(
      byId("importStatus"),
      mode === "replace" ? "Copie reprise." : `${added} relevé${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""}.`,
    );
  }
  byId("importMerge").addEventListener("click", () => finishImport("merge"));
  byId("importReplace").addEventListener("click", () => finishImport("replace"));
  byId("importCancel").addEventListener("click", () => {
    pending = null;
    choice.hidden = true;
  });

  setupInstall();
  state.subscribe(render);
  return { show: render };
}
