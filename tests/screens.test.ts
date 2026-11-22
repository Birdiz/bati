// @vitest-environment jsdom
import fs from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KEYS, memoryStorage } from "../src/storage/device";
import { startApp } from "../src/ui/app";
import { AppState } from "../src/ui/state";

const html = fs.readFileSync("index.html", "utf8");
const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const text = (sel: string) => $(sel).textContent?.trim() ?? "";

function type(sel: string, value: string): void {
  const el = $<HTMLInputElement>(sel);
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function tick(sel: string, checked = true): void {
  const el = $<HTMLInputElement>(sel);
  el.checked = checked;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function choose(sel: string, value: string): void {
  const el = $<HTMLSelectElement>(sel);
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

let store: ReturnType<typeof memoryStorage>;
let app: ReturnType<typeof startApp>;
let n = 0;

beforeEach(() => {
  document.body.innerHTML = body;
  location.hash = "";
  window.confirm = vi.fn(() => true);
  store = memoryStorage();
  app = startApp(
    new AppState(
      store,
      () => new Date("2026-11-22T08:00:00Z"),
      () => `id-${++n}`,
    ),
  );
});

function fillCheck(): void {
  type("#indoorT", "21");
  type("#indoorRh", "73");
  type("#outdoorT", "10");
  type("#outdoorRh", "80");
}

describe("navigation", () => {
  it("shows one screen at a time and marks the current tab", () => {
    expect($("#screen-releve").hidden).toBe(false);
    app.go("carnet");
    expect($("#screen-releve").hidden).toBe(true);
    expect($("#screen-carnet").hidden).toBe(false);
    expect($('[data-tab="carnet"]').hasAttribute("aria-current")).toBe(true);
  });
});

describe("quick check", () => {
  it("prompts for readings, then shows AH, advice and dew point", () => {
    expect(text("#adviceTitle")).toBe("Saisir les relevés intérieur et extérieur.");
    expect($("#saveForm").hidden).toBe(true);
    fillCheck();
    expect(text("#indoorAH")).toBe("13,3 g/m³");
    expect(text("#outdoorAH")).toBe("7,5 g/m³");
    expect(text("#adviceTitle")).toBe("Ouvrir les fenêtres");
    expect($("#advice").dataset.tone).toBe("go");
    expect(text("#dewPointLine")).toContain("16,0 °C");
    expect($("#saveForm").hidden).toBe(false);
  });

  it("marks the drier side, places both on the scale and names the verdict", () => {
    expect($("#ahScale").hidden).toBe(true);
    expect($("#adviceVerdict").hidden).toBe(true);
    fillCheck();
    expect($("#checkForm").dataset.drier).toBe("outdoor");
    expect(text("#outdoorTag")).toBe("plus sec");
    expect(text("#indoorTag")).toBe("plus humide");
    expect($("#ahScale").hidden).toBe(false);
    expect($("#ahScale").dataset.tone).toBe("go");
    expect(text("#scaleGap")).toBe("5,8 g/m³");
    expect(text("#scaleIndoorValue")).toBe("13,3");
    expect($("#scaleOutdoor").style.getPropertyValue("--pos")).toMatch(/^37\.\d+%$/);
    expect([...document.querySelectorAll("#scaleTicks span")].map((t) => t.textContent)).toEqual([
      "0",
      "5",
      "10",
      "15",
      "20",
    ]);
    expect(text("#adviceVerdict")).toBe("Aérer");
  });

  it("keeps the measured drier side under a storm, and marks none within the band", () => {
    fillCheck();
    tick("#storm");
    expect(text("#adviceVerdict")).toBe("Orage");
    expect($("#ahScale").dataset.tone).toBe("alert");
    expect($("#checkForm").dataset.drier).toBe("outdoor");
    tick("#storm", false);
    type("#outdoorT", "21");
    type("#outdoorRh", "72");
    expect(text("#adviceVerdict")).toBe("Équilibre");
    expect($("#checkForm").dataset.drier).toBeUndefined();
    expect($("#indoorTag").hidden).toBe(true);
  });

  it("grows the scale past 20 g/m³ on a humid summer day", () => {
    fillCheck();
    type("#outdoorT", "30");
    type("#outdoorRh", "75");
    const ticks = [...document.querySelectorAll("#scaleTicks span")].map((t) => t.textContent);
    expect(ticks.at(-1)).toBe("25");
    expect(text("#adviceVerdict")).toBe("Garder fermé");
  });

  it("explains a field error and hides the advice", () => {
    fillCheck();
    type("#outdoorRh", "180");
    expect(text("#outdoorRh-error")).toBe("Humidité entre 1 et 100 %.");
    expect($("#outdoorRh").getAttribute("aria-invalid")).toBe("true");
    expect($("#advice").dataset.tone).toBe("empty");
  });

  it("follows the storm switch", () => {
    fillCheck();
    tick("#storm");
    expect(text("#adviceTitle")).toBe("Orage : garder fermé");
  });

  it("saves to the log with the note", () => {
    fillCheck();
    $<HTMLTextAreaElement>("#note").value = "matin";
    $<HTMLFormElement>("#saveForm").requestSubmit();
    const log = JSON.parse(store.dump()[KEYS.log]!) as { note: string; computed: { code: string } }[];
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ note: "matin", computed: { code: "drierOutside" } });
    expect(text("#saveStatus")).toBe("Enregistré dans le carnet.");
  });
});

describe("house profile", () => {
  it("adds facades and surfaces, and the advice uses them", () => {
    app.go("maison");
    choose("#ventilation", "singleFlow");
    type("#facadeName", "Côté ruisseau");
    choose("#facadeOrientation", "NE");
    $<HTMLInputElement>("#facadeWet").checked = true;
    $<HTMLFormElement>("#facadeForm").requestSubmit();
    type("#facadeName", "Jardin");
    choose("#facadeOrientation", "SW");
    $<HTMLInputElement>("#facadeUp").checked = true;
    $<HTMLFormElement>("#facadeForm").requestSubmit();
    type("#coldSurfaceName", "Plancher du salon");
    $<HTMLFormElement>("#coldSurfaceForm").requestSubmit();
    expect(document.querySelectorAll("#facadeList li")).toHaveLength(2);
    expect(document.querySelectorAll("#surfaceList li")).toHaveLength(1);

    app.go("releve");
    fillCheck();
    tick("#recentRain");
    expect(text("#adviceTitle")).toBe("Ouvrir + VMC à fond");
    expect(text("#adviceLines")).toContain("Ouvrir à l'étage, côté Jardin (sud-ouest).");
  });

  it("removes a facade after confirmation", () => {
    app.go("maison");
    type("#facadeName", "Sud");
    $<HTMLFormElement>("#facadeForm").requestSubmit();
    $<HTMLButtonElement>("#facadeList li button").click();
    expect(document.querySelectorAll("#facadeList li")).toHaveLength(0);
  });
});

describe("cold surface", () => {
  it("shares the room air with the quick check and saves with the surface", () => {
    fillCheck();
    app.go("surface");
    expect($<HTMLInputElement>("#surfIndoorT").value).toBe("21");
    expect($<HTMLSelectElement>("#surfaceId").value).toBe("autre");
    expect($("#noSurfaces").hidden).toBe(false);
    type("#surfaceT", "14");
    expect(text("#surfaceResultTitle")).toBe("Risque de condensation");
    $<HTMLButtonElement>("#surfaceSave").click();
    const log = JSON.parse(store.dump()[KEYS.log]!) as { surface: { name: string; atRisk: boolean } }[];
    expect(log[0]!.surface).toMatchObject({ name: "Autre surface", atRisk: true });
  });

  it("asks for the outdoor reading before saving", () => {
    type("#indoorT", "21");
    type("#indoorRh", "73");
    app.go("surface");
    type("#surfaceT", "19");
    expect(text("#surfaceResultTitle")).toBe("Pas de condensation");
    expect($("#surfaceSave").hidden).toBe(true);
    expect($("#surfaceSaveNote").hidden).toBe(false);
  });
});

describe("log", () => {
  it("lists entries newest first and deletes one", () => {
    fillCheck();
    $<HTMLFormElement>("#saveForm").requestSubmit();
    tick("#storm");
    $<HTMLFormElement>("#saveForm").requestSubmit();
    app.go("carnet");
    const items = document.querySelectorAll<HTMLElement>("#logList li");
    expect(items).toHaveLength(2);
    expect($("#logEmpty").hidden).toBe(true);
    expect(text("#backupStatus")).toBe("Aucune copie enregistrée pour l'instant.");
    items[0]!.querySelector("button")!.click();
    expect(document.querySelectorAll("#logList li")).toHaveLength(1);
  });
});

describe("reference sheet", () => {
  it("fills the rules and the 5–40 °C table", () => {
    app.go("fiche");
    expect(document.querySelectorAll("#rulesTable tbody tr")).toHaveLength(6);
    expect(document.querySelectorAll("#ahTable tbody tr")).toHaveLength(36);
    expect(text("#formulaNote")).toContain("Alduchov");
  });
});
