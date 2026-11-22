/** Screen 5: printable reference sheet. Rules and AH table, printed with the browser (print stylesheet). */
import { FORMULA } from "../domain/humidity/psychrometrics";
import { TABLE_HUMIDITIES, referenceTable } from "../domain/humidity/reference";
import { RULES, fmt } from "../text/fr";
import { byId, h } from "./dom";

export function mountSheet(): { show(): void } {
  byId("rulesTable")
    .querySelector("tbody")!
    .replaceChildren(...RULES.map((r) => h("tr", {}, h("th", { scope: "row" }, r.situation), h("td", {}, r.advice))));

  const table = byId("ahTable");
  table
    .querySelector("thead")!
    .replaceChildren(
      h(
        "tr",
        {},
        h("th", { scope: "col" }, "°C \\ HR"),
        ...TABLE_HUMIDITIES.map((rh) => h("th", { scope: "col" }, `${rh} %`)),
      ),
    );
  table
    .querySelector("tbody")!
    .replaceChildren(
      ...referenceTable().map((row) =>
        h("tr", {}, h("th", { scope: "row" }, String(row.t)), ...row.ah.map((v) => h("td", {}, fmt(v)))),
      ),
    );

  byId("formulaNote").textContent =
    `Formule de Magnus, coefficients d'Alduchov et Eskridge (1996), valable de ${FORMULA.minC} à +${FORMULA.maxC} °C. ` +
    "Humidité absolue = 216,7 × pression de vapeur (hPa) / température (K).";

  byId("printBtn").addEventListener("click", () => window.print());
  return { show() {} };
}
