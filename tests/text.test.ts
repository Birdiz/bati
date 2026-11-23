import { describe, expect, it } from "vitest";
import type { Facade, HouseProfile } from "../src/domain/house/profile";
import { type CheckInput, decideAdvice } from "../src/domain/humidity/advice";
import { checkSurface } from "../src/domain/humidity/surface";
import { adviceText, fmt, list, parseDecimal, signed, surfaceText, trendText } from "../src/text/fr";

const facade = (id: string, name: string, orientation: Facade["orientation"], wet = false, up = false): Facade => ({
  id,
  name,
  orientation,
  facesWetArea: wet,
  hasUpstairsOpenings: up,
});

const house: HouseProfile = {
  version: 1,
  ventilation: "singleFlow",
  facades: [facade("ne", "Côté ruisseau", "NE", true, true), facade("sw", "Jardin", "SW", false, true)],
  coldSurfaces: [{ id: "s1", name: "plancher du salon", location: "au-dessus de la cave" }],
};

const input = (outdoor: CheckInput["outdoor"], storm = false, recentRain = false): CheckInput => ({
  indoor: { t: 21, rh: 73 },
  outdoor,
  conditions: { storm, recentRain },
});
const text = (i: CheckInput, p = house) => adviceText(decideAdvice(i, p), p);

describe("fmt / parseDecimal", () => {
  it("formats with a French comma and no negative zero", () => {
    expect(fmt(7.513)).toBe("7,5");
    expect(fmt(-0.04)).toBe("0,0");
    expect(fmt(-5.84)).toBe("-5,8");
  });

  it("parses comma or dot decimals and refuses anything else", () => {
    expect(parseDecimal("12,5")).toBe(12.5);
    expect(parseDecimal(" 21.3 ")).toBe(21.3);
    expect(parseDecimal("-4")).toBe(-4);
    expect(parseDecimal("12abc")).toBeNaN();
    expect(parseDecimal("")).toBeNaN();
  });

  it("joins lists the French way", () => {
    expect(list(["a"])).toBe("a");
    expect(list(["a", "b", "c"])).toBe("a, b et c");
  });
});

describe("adviceText", () => {
  it("drier outside: open, VMC at full speed", () => {
    const t = text(input({ t: 10, rh: 80 }));
    expect(t).toMatchObject({ title: "Ouvrir + VMC à fond", tone: "go" });
    expect(t.lines).toEqual([
      "L'air extérieur est plus sec de 5,8 g/m³ : aérer fait sortir de la vapeur d'eau.",
      "Ouvrir les fenêtres en grand.",
      "Mettre la VMC en grande vitesse.",
    ]);
  });

  it("after rain: names the facade to avoid and where to open, with orientations", () => {
    const t = text(input({ t: 10, rh: 80 }, false, true));
    expect(t.lines).toContain("Il a plu : ne pas ouvrir la façade Côté ruisseau (nord-est).");
    expect(t.lines).toContain("Ouvrir à l'étage, côté Jardin (sud-ouest).");
  });

  it("after rain with every facade wet: VMC only", () => {
    const allWet: HouseProfile = { ...house, facades: [facade("ne", "nord-est", "NE", true)] };
    expect(text(input({ t: 10, rh: 80 }, false, true), allWet).lines).toContain(
      "Toutes les façades donnent sur une zone humide : aérer par la VMC seule en attendant que ça sèche.",
    );
  });

  it("wetter outside: keep closed, explains the single-flow VMC", () => {
    const t = text(input({ t: 22, rh: 90 }));
    expect(t).toMatchObject({ title: "Garder fermé + réduire la VMC", tone: "stop" });
    expect(t.lines[1]).toBe("Réduire la VMC : une VMC simple flux fait entrer l'air extérieur jour et nuit.");
  });

  it("storm: closed, VMC reduced, dehumidifiers near cold surfaces, conflict explained", () => {
    const t = text(input({ t: 10, rh: 80 }, true));
    expect(t).toMatchObject({ title: "Orage : garder fermé", tone: "alert" });
    expect(t.lines).toContain("Faire tourner les déshumidificateurs, en priorité près de : plancher du salon.");
    expect(t.lines.at(-1)).toContain("la consigne d'orage l'emporte");
  });

  it("balanced: free choice", () => {
    expect(text(input({ t: 21, rh: 72 }))).toMatchObject({ title: "Équilibre : au choix", tone: "neutral" });
  });

  it("without a VMC, never mentions it", () => {
    const noVmc: HouseProfile = { ...house, ventilation: "none" };
    for (const i of [input({ t: 10, rh: 80 }), input({ t: 22, rh: 90 }), input({ t: 22, rh: 90 }, true)]) {
      const t = text(i, noVmc);
      expect(`${t.title} ${t.lines.join(" ")}`).not.toMatch(/VMC/);
    }
  });
});

describe("surfaceText", () => {
  const indoor = { t: 21, rh: 73 };
  it("says yes or no with the margin", () => {
    expect(surfaceText(checkSurface(14, indoor))).toMatchObject({ title: "Risque de condensation", tone: "stop" });
    expect(surfaceText(checkSurface(14, indoor)).lines[0]).toMatch(/^La surface est 2,0 °C sous le point de rosée/);
    expect(surfaceText(checkSurface(16.5, indoor))).toMatchObject({ title: "À la limite" });
    expect(surfaceText(checkSurface(19, indoor))).toMatchObject({ title: "Pas de condensation", tone: "go" });
  });
});

describe("trendText", () => {
  const base = { recent: 1.1, previous: 1.9, recentDays: 5, previousDays: 1 };

  it("asks for more readings, with the counts so far", () => {
    const t = trendText({ kind: "notEnough", recentDays: 2, previousDays: 0 });
    expect(t).toMatchObject({ title: "Pas encore de comparaison", tone: "neutral" });
    expect(t.lines[0]).toContain("au moins 3 jours de relevés sur les 14 derniers jours");
    expect(t.lines[0]).toContain("(pour l'instant : 2 et 0)");
  });

  it("says lower with a true minus sign, both means and the day counts", () => {
    const t = trendText({ kind: "lower", ...base, delta: -0.8 });
    expect(t.title).toBe("Excès d'humidité en baisse : −0,8 g/m³");
    expect(t.tone).toBe("go");
    expect(t.lines[0]).toBe(
      "1,1 g/m³ en moyenne sur les 14 derniers jours (5 jours de relevés), contre 1,9 g/m³ les 14 jours d'avant (1 jour).",
    );
    expect(t.lines[1]).toContain("rend moins d'eau");
  });

  it("says higher in ochre, and stable within the band", () => {
    expect(trendText({ kind: "higher", ...base, delta: 0.8 })).toMatchObject({
      title: "Excès d'humidité en hausse : +0,8 g/m³",
      tone: "alert",
    });
    const s = trendText({ kind: "stable", ...base, delta: -0.3 });
    expect(s.title).toBe("Excès d'humidité stable");
    expect(s.lines[1]).toContain("(−0,3 g/m³) reste sous 0,5 g/m³");
  });

  it("signs without a sign on zero", () => {
    expect(signed(0.04)).toBe("0,0");
    expect(signed(-0.04)).toBe("0,0");
    expect(signed(1.25)).toBe("+1,3");
  });
});
