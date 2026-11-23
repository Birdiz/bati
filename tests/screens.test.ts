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
    expect(document.getElementById("adviceVerdictIcon")?.getAttribute("href")).toBe("#i-wind");
  });

  it("keeps the measured drier side under a storm, and marks none within the band", () => {
    fillCheck();
    tick("#storm");
    expect(text("#adviceVerdict")).toBe("Orage");
    expect(document.getElementById("adviceVerdictIcon")?.getAttribute("href")).toBe("#i-storm");
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

  it("takes a negative temperature from the ± button, with no error while only the sign is typed", () => {
    fillCheck();
    type("#outdoorT", "-");
    expect($("#outdoorT-error").hidden).toBe(true);
    type("#outdoorT", "4");
    const sign = $<HTMLButtonElement>('[data-sign-for="outdoorT"]');
    sign.click();
    expect($<HTMLInputElement>("#outdoorT").value).toBe("\u22124");
    expect(sign.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe($("#outdoorT"));
    expect(text("#outdoorAH")).toBe("2,9 g/m³");
    expect($("#outdoorT-error").hidden).toBe(true);
    sign.click();
    expect($<HTMLInputElement>("#outdoorT").value).toBe("4");
    expect(sign.getAttribute("aria-pressed")).toBe("false");
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

describe("log trend", () => {
  /** A stored entry at noon UTC (the same calendar day in any European time zone). */
  const stored = (day: string, indoorAH: number, outdoorAH: number) => ({
    id: `t-${day}-${indoorAH}`,
    at: `${day}T12:00:00.000Z`,
    indoor: { t: 20, rh: 60 },
    outdoor: { t: 8, rh: 85 },
    conditions: { storm: false, recentRain: false },
    computed: { indoorAH, outdoorAH, indoorDewPoint: 12, code: "drierOutside", formula: "test" },
  });

  function startWith(entries: ReturnType<typeof stored>[], extra: Record<string, string> = {}): void {
    document.body.innerHTML = body;
    store = memoryStorage({ [KEYS.log]: JSON.stringify(entries), ...extra });
    app = startApp(new AppState(store, () => new Date("2026-11-22T12:00:00Z")));
    app.go("carnet");
  }

  /** Excess 3 g/m³ from 26 Oct to 1 Nov, then 2 g/m³ from 16 to 22 Nov (an 8-day gap in between). */
  const autumn = [
    ...["10-26", "10-27", "10-28", "10-29", "10-30", "10-31", "11-01"].map((d) => stored(`2026-${d}`, 10, 7)),
    ...["11-16", "11-17", "11-18", "11-19", "11-20", "11-21", "11-22"].map((d) => stored(`2026-${d}`, 9, 7)),
  ];

  it("is absent from an empty log", () => {
    app.go("carnet");
    expect($("#trend").hidden).toBe(true);
    expect($("#logTitle").hidden).toBe(true);
  });

  it("waits for a second day before drawing, and for 3 days per period before comparing", () => {
    fillCheck();
    $<HTMLFormElement>("#saveForm").requestSubmit();
    app.go("carnet");
    expect($("#trend").hidden).toBe(false);
    expect($("#logTitle").hidden).toBe(false);
    expect($("#trendFigure").hidden).toBe(true);
    expect($("#trendFew").hidden).toBe(false);
    expect(text("#trendResultTitle")).toBe("Pas encore de comparaison");
    expect(text("#trendResultLines")).toContain("(pour l'instant : 1 et 0)");
  });

  it("compares the excess and draws the three series, broken over the gap", () => {
    startWith(autumn);
    expect($("#trendResult").dataset.tone).toBe("go");
    expect(text("#trendResultTitle")).toBe("Excès d'humidité en baisse : −1,0 g/m³");
    expect($("#trendFigure").hidden).toBe(false);
    const svg = $("#trendChart svg");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toContain("Courbes sur 14 jours de relevés, du 26 oct. au 22 nov.");
    for (const s of ["excess", "indoor", "outdoor"]) {
      expect(svg.querySelectorAll(`[data-series="${s}"] path`)).toHaveLength(2);
      expect(svg.querySelectorAll(`[data-series="${s}"] circle`)).toHaveLength(14);
    }
    expect(svg.querySelector(".x-labels .end")?.textContent).toBe("22 nov.");
  });

  it("shows 90 days by default and remembers the chosen period on the device", () => {
    startWith(autumn);
    expect($('[data-window="90"]').getAttribute("aria-pressed")).toBe("true");
    $('[data-window="30"]').click();
    expect($('[data-window="30"]').getAttribute("aria-pressed")).toBe("true");
    expect(store.dump()[KEYS.trendWindow]).toBe('"30"');
    // 30 days back from 22 Nov starts on 24 Oct: every point stays.
    expect(document.querySelectorAll('#trendChart [data-series="excess"] circle')).toHaveLength(14);

    startWith([stored("2026-06-01", 12, 11), ...autumn], { [KEYS.trendWindow]: '"30"' });
    expect($('[data-window="30"]').getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll('#trendChart [data-series="excess"] circle')).toHaveLength(14);
    $('[data-window="all"]').click();
    expect(document.querySelectorAll('#trendChart [data-series="excess"] circle')).toHaveLength(15);
    expect($("#trendChart .x-labels .start").textContent).toBe("1 juin");
  });
});

describe("cold surface history", () => {
  /** A stored check of a surface at noon UTC, margin as given. */
  const checkOf = (day: string, surfaceId: string, name: string, marginC: number) => ({
    id: `s-${day}-${surfaceId}-${marginC}`,
    at: `${day}T12:00:00.000Z`,
    indoor: { t: 20, rh: 60 },
    outdoor: { t: 4, rh: 85 },
    conditions: { storm: false, recentRain: false },
    computed: { indoorAH: 10, outdoorAH: 5.5, indoorDewPoint: 12, code: "drierOutside", formula: "test" },
    surface: { surfaceId, name, tempC: 12 + marginC, marginC, atRisk: marginC <= 0 },
  });
  const profile = {
    version: 1,
    ventilation: "singleFlow",
    facades: [],
    coldSurfaces: [{ id: "floor", name: "Plancher du salon", location: "au-dessus de la cave" }],
  };
  const floor = [
    checkOf("2026-11-10", "floor", "Plancher du salon", 2.4),
    checkOf("2026-11-12", "floor", "Plancher du salon", -0.4),
    checkOf("2026-11-12", "floor", "Plancher du salon", 1.5),
    checkOf("2026-11-18", "floor", "Plancher du salon", 0.6),
    checkOf("2026-11-21", "floor", "Plancher du salon", 1.8),
  ];

  function startWith(entries: ReturnType<typeof checkOf>[], screen: "carnet" | "surface" = "carnet"): void {
    document.body.innerHTML = body;
    store = memoryStorage({ [KEYS.log]: JSON.stringify(entries), [KEYS.profile]: JSON.stringify(profile) });
    app = startApp(
      new AppState(
        store,
        () => new Date("2026-11-22T12:00:00Z"),
        () => `id-${++n}`,
      ),
    );
    app.go(screen);
  }

  it("is absent without surface checks", () => {
    fillCheck();
    $<HTMLFormElement>("#saveForm").requestSubmit();
    app.go("carnet");
    expect($("#trend").hidden).toBe(false);
    expect($("#surfaces").hidden).toBe(true);
  });

  it("sums up each surface on its worst day and draws the margin with the risk zones", () => {
    startWith([
      ...floor,
      checkOf("2026-11-20", "gone", "Seuil de la cave", 3),
      checkOf("2026-11-20", "autre", "Autre surface", -3),
    ]);
    const blocks = document.querySelectorAll<HTMLElement>("#surfaceHistories article");
    expect([...blocks].map((b) => b.dataset.surface)).toEqual(["floor", "gone"]);
    const f = blocks[0]!;
    expect(f.querySelector("h4")?.textContent).toBe("Plancher du salon");
    expect(f.querySelector(".advice")?.getAttribute("data-tone")).toBe("stop");
    expect(f.querySelector(".advice-title")?.textContent).toBe("Condensation 1 jour sur 4");
    expect(f.querySelector(".advice-lines")?.textContent).toContain(
      "Sur les 90 derniers jours : 4 jours vérifiés, 1 en condensation, 1 à la limite.",
    );
    expect(f.querySelector(".advice-lines")?.textContent).toContain("-0,4 °C le 12 nov. (surface à 11,6 °C)");
    const dots = [...f.querySelectorAll("circle")].map((c) => c.getAttribute("data-status"));
    expect(dots).toEqual(["ok", "atRisk", "nearLimit", "ok"]);
    expect([...f.querySelectorAll(".bands rect")].map((r) => r.getAttribute("data-tone"))).toEqual(["stop", "alert"]);
    expect(f.querySelector("svg")?.getAttribute("aria-label")).toContain("Dernière : 1,8 °C, pas de condensation.");

    const gone = blocks[1]!;
    expect(gone.querySelector("h4")?.textContent).toBe("Seuil de la cave (retirée de Ma maison)");
    expect(gone.querySelector(".advice")?.getAttribute("data-tone")).toBe("go");
    expect(gone.querySelector("svg")).toBeNull(); // one day: the summary says it all
  });

  it("follows the period of the trend", () => {
    startWith([checkOf("2026-09-01", "gone", "Seuil de la cave", 3), ...floor]);
    $('[data-window="30"]').click();
    const gone = $('[data-surface="gone"]');
    expect(gone.textContent).toContain("Aucune vérification sur cette période.");
    $('[data-window="all"]').click();
    expect($('[data-surface="gone"] .advice-title').textContent).toBe("Pas de condensation");
  });

  it("reminds the last saved check of the chosen surface before measuring again", () => {
    startWith(floor, "surface");
    expect($<HTMLSelectElement>("#surfaceId").value).toBe("floor");
    expect(text("#surfaceLast")).toBe("Dernière vérification enregistrée : hier, pas de condensation (marge 1,8 °C).");
    choose("#surfaceId", "autre");
    expect($("#surfaceLast").hidden).toBe(true);
    choose("#surfaceId", "floor");
    fillCheck();
    app.go("surface");
    type("#surfaceT", "15");
    $<HTMLButtonElement>("#surfaceSave").click();
    expect(text("#surfaceLast")).toContain(": aujourd'hui, ");
  });
});

describe("reference sheet", () => {
  it("fills the rules and the 5–40 °C table", () => {
    app.go("fiche");
    expect(document.querySelectorAll("#rulesTable tbody tr")).toHaveLength(7);
    expect(document.querySelectorAll("#ahTable tbody tr")).toHaveLength(36);
    expect(text("#formulaNote")).toContain("Alduchov");
  });
});
