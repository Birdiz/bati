/**
 * French wording of the domain results. Pure (no DOM), so it is tested like the domain.
 * Words aimed at homeowners: no jargon beyond "humidité absolue", "point de rosée" and "VMC", which they use.
 */
import type { Advice } from "../domain/humidity/advice";
import type { BackupError } from "../domain/backup";
import type { HouseProfile, Orientation, Ventilation } from "../domain/house/profile";
import { type AdviceCode, NEUTRAL_BAND } from "../domain/humidity/advice";
import { COMPARE_DAYS, type DayPoint, type ExcessTrend, MIN_DAYS, type TrendWindow } from "../domain/humidity/trend";
import type { ReadingError } from "../domain/humidity/psychrometrics";
import type { SurfaceCheck } from "../domain/humidity/surface";

/** One decimal, French comma, no "-0,0". */
export function fmt(x: number, digits = 1): string {
  const s = x.toFixed(digits);
  return (Number(s) === 0 ? (0).toFixed(digits) : s).replace(".", ",");
}

/** Minus signs a keyboard may produce: hyphen, true minus (U+2212), en dash (smart punctuation). */
const MINUS = /^[-\u2212\u2013]\s*/;

/** Parses a number typed with a comma or a dot, and any minus sign; NaN if it is not exactly a number. */
export function parseDecimal(s: string): number {
  const t = s
    .trim()
    .replace(MINUS, "-")
    .replace(/^\+\s*/, "")
    .replace(",", ".");
  return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : Number.NaN;
}

/** A number still being typed ("-", "-,"): no value yet, but no error to show either. */
export function isUnfinishedNumber(s: string): boolean {
  return /^[-\u2212\u2013+]\s*[.,]?$/.test(s.trim());
}

export const ORIENTATION_LABEL: Record<Orientation, string> = {
  N: "nord",
  NE: "nord-est",
  E: "est",
  SE: "sud-est",
  S: "sud",
  SW: "sud-ouest",
  W: "ouest",
  NW: "nord-ouest",
};

export const VENTILATION_LABEL: Record<Ventilation, string> = {
  none: "Pas de VMC",
  singleFlow: "VMC simple flux",
  doubleFlow: "VMC double flux",
};

export const CODE_LABEL: Record<AdviceCode, string> = {
  drierOutside: "Aérer",
  wetterOutside: "Garder fermé",
  storm: "Orage",
  balanced: "Équilibre",
};

/** Tag under each side's absolute humidity once both are known. */
export const SIDE_TAG = { drier: "plus sec", wetter: "plus humide" } as const;

/** Value next to "Écart" on the absolute humidity scale. */
export function gapValue(gap: number): string {
  return `${fmt(Math.abs(gap))} g/m³`;
}

export const READING_ERROR: Record<ReadingError, string> = {
  notANumber: "Saisir un nombre.",
  temperatureOutOfRange: "Température entre −40 et 50 °C.",
  humidityOutOfRange: "Humidité entre 1 et 100 %.",
};

export const BACKUP_ERROR: Record<BackupError, string> = {
  notJson: "Ce fichier n'est pas une sauvegarde lisible.",
  notABackup: "Ce fichier n'est pas une sauvegarde de l'application.",
  newerVersion: "Cette sauvegarde vient d'une version plus récente de l'application : mettez-la à jour d'abord.",
};

export type Tone = "go" | "stop" | "alert" | "neutral";

export interface AdviceText {
  title: string;
  tone: Tone;
  lines: string[];
}

/** "Sud (sud-ouest)", or just the orientation when the name says nothing more. */
function facadeLabel(profile: HouseProfile, id: string): string {
  const f = profile.facades.find((x) => x.id === id);
  if (!f) return "";
  const o = ORIENTATION_LABEL[f.orientation];
  return f.name.toLowerCase() === o ? o : `${f.name} (${o})`;
}

/** "a", "a et b", "a, b et c". */
export function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items.at(-1)!}`;
}

function vmcLine(a: Advice, ventilation: Ventilation): string | null {
  if (a.vmc === "full") return "Mettre la VMC en grande vitesse.";
  if (a.vmc === "normal") return "VMC en marche normale.";
  if (a.vmc === "reduce")
    return ventilation === "doubleFlow"
      ? "Réduire la VMC : même en double flux, elle fait entrer l'air extérieur sans le sécher."
      : "Réduire la VMC : une VMC simple flux fait entrer l'air extérieur jour et nuit.";
  return null;
}

export function adviceText(a: Advice, profile: HouseProfile): AdviceText {
  const gap = fmt(Math.abs(a.gap));
  const vmc = vmcLine(a, profile.ventilation);
  const lines: string[] = [];

  if (a.code === "storm") {
    lines.push("Fenêtres fermées.");
    if (vmc) lines.push(vmc);
    const surfaces = profile.coldSurfaces.map((s) => s.name);
    lines.push(
      surfaces.length > 0
        ? `Faire tourner les déshumidificateurs, en priorité près de : ${list(surfaces)}.`
        : "Faire tourner les déshumidificateurs dans les pièces sensibles.",
    );
    if (a.conflict)
      lines.push(
        `Les mesures seules diraient d'aérer (dehors plus sec de ${gap} g/m³) : la consigne d'orage l'emporte.`,
      );
    return { title: "Orage : garder fermé", tone: "alert", lines };
  }

  if (a.code === "drierOutside") {
    lines.push(`L'air extérieur est plus sec de ${gap} g/m³ : aérer fait sortir de la vapeur d'eau.`);
    const o = a.openings;
    if (o && o.avoid.length > 0) {
      const avoid = list(o.avoid.map((id) => facadeLabel(profile, id)));
      lines.push(`Il a plu : ne pas ouvrir ${o.avoid.length > 1 ? "les façades" : "la façade"} ${avoid}.`);
      if (o.prefer.length === 0)
        lines.push(
          vmc
            ? "Toutes les façades donnent sur une zone humide : aérer par la VMC seule en attendant que ça sèche."
            : "Toutes les façades donnent sur une zone humide : attendre que ça sèche.",
        );
      else {
        const prefer = list(o.prefer.map((id) => facadeLabel(profile, id)));
        lines.push(o.upstairsOnly ? `Ouvrir à l'étage, côté ${prefer}.` : `Ouvrir côté ${prefer}.`);
      }
    } else lines.push("Ouvrir les fenêtres en grand.");
    if (vmc) lines.push(vmc);
    return { title: vmc ? "Ouvrir + VMC à fond" : "Ouvrir les fenêtres", tone: "go", lines };
  }

  if (a.code === "wetterOutside") {
    lines.push(`L'air extérieur est plus chargé de ${gap} g/m³ : aérer ferait entrer de la vapeur d'eau.`);
    if (vmc) lines.push(vmc);
    return { title: vmc ? "Garder fermé + réduire la VMC" : "Garder fermé", tone: "stop", lines };
  }

  lines.push(`Écart de ${gap} g/m³, dans la marge d'erreur des hygromètres : aérer ne change rien à l'humidité.`);
  if (vmc) lines.push(vmc);
  return { title: "Équilibre : au choix", tone: "neutral", lines };
}

export function surfaceText(c: SurfaceCheck): AdviceText {
  const td = fmt(c.dewPoint);
  const m = fmt(Math.abs(c.marginC));
  if (c.atRisk)
    return {
      title: "Risque de condensation",
      tone: "stop",
      lines: [`La surface est ${m} °C sous le point de rosée de la pièce (${td} °C) : l'eau s'y dépose.`],
    };
  if (c.nearLimit)
    return {
      title: "À la limite",
      tone: "alert",
      lines: [
        `Seulement ${m} °C au-dessus du point de rosée (${td} °C) : c'est dans la marge d'erreur du thermomètre.`,
      ],
    };
  return {
    title: "Pas de condensation",
    tone: "go",
    lines: [`${m} °C de marge au-dessus du point de rosée de la pièce (${td} °C).`],
  };
}

export const TREND_WINDOW_LABEL: Record<TrendWindow, string> = { "30": "30 jours", "90": "90 jours", all: "Tout" };

/** "+0,8" or "−0,8", with a true minus sign. */
export function signed(x: number): string {
  const s = fmt(Math.abs(x));
  return s === fmt(0) ? s : `${x < 0 ? "−" : "+"}${s}`;
}

const days = (n: number) => `${n} jour${n > 1 ? "s" : ""}`;

/** The comparison of the moisture excess, last COMPARE_DAYS days against the ones before. */
export function trendText(t: ExcessTrend): AdviceText {
  if (t.kind === "notEnough")
    return {
      title: "Pas encore de comparaison",
      tone: "neutral",
      lines: [
        `Il faut au moins ${MIN_DAYS} jours de relevés sur les ${COMPARE_DAYS} derniers jours, et autant sur les ${COMPARE_DAYS} jours d'avant (pour l'instant : ${t.recentDays} et ${t.previousDays}).`,
      ],
    };
  const figures = `${fmt(t.recent)} g/m³ en moyenne sur les ${COMPARE_DAYS} derniers jours (${days(t.recentDays)} de relevés), contre ${fmt(t.previous)} g/m³ les ${COMPARE_DAYS} jours d'avant (${days(t.previousDays)}).`;
  if (t.kind === "stable")
    return {
      title: "Excès d'humidité stable",
      tone: "neutral",
      lines: [
        figures,
        `L'écart (${signed(t.delta)} g/m³) reste sous ${fmt(NEUTRAL_BAND)} g/m³ : les hygromètres ne font pas la différence.`,
      ],
    };
  if (t.kind === "lower")
    return {
      title: `Excès d'humidité en baisse : ${signed(t.delta)} g/m³`,
      tone: "go",
      lines: [
        figures,
        "À usage comparable, la maison rend moins d'eau à l'air : les murs sèchent, ou l'aération est plus efficace.",
      ],
    };
  return {
    title: `Excès d'humidité en hausse : ${signed(t.delta)} g/m³`,
    tone: "alert",
    lines: [figures, "À usage comparable, la maison rend plus d'eau à l'air qu'avant."],
  };
}

/** Accessible name of the trend chart: what a screen reader announces instead of the curves. */
export function trendChartLabel(points: readonly DayPoint[], from: string, to: string): string {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return "";
  return `Courbes sur ${days(points.length)} de relevés, du ${from} au ${to}. Excès d'humidité : ${fmt(first.excess)} g/m³ le premier jour, ${fmt(last.excess)} g/m³ le dernier.`;
}

/** The rules as printed on the reference sheet. */
export const RULES: { situation: string; advice: string }[] = [
  {
    situation: "Humidité absolue dehors plus basse que dedans",
    advice: "Ouvrir les fenêtres et mettre la VMC à fond.",
  },
  {
    situation: "Humidité absolue dehors plus haute que dedans",
    advice: "Garder fermé et réduire la VMC : une VMC simple flux fait entrer l'air extérieur jour et nuit.",
  },
  {
    situation: "Écart de moins de 0,5 g/m³",
    advice: "Équilibre : aérer ne change rien à l'humidité.",
  },
  {
    situation: "Orage",
    advice: "Garder fermé, réduire la VMC, déshumidificateurs près des surfaces froides.",
  },
  {
    situation: "Après la pluie, ruisseau ou zone humide à proximité",
    advice: "Ne pas ouvrir la façade côté ruisseau ; aérer à l'étage, du côté opposé.",
  },
  {
    situation: "Surface plus froide que le point de rosée de la pièce",
    advice: "L'eau s'y dépose : assécher l'air de la pièce (aérer si dehors est plus sec, déshumidificateur sinon).",
  },
];
