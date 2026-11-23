/**
 * "±" buttons next to temperature fields: phone decimal keypads (inputmode="decimal" on iPhone) have no minus key,
 * and the Vosges go below zero. A button `[data-sign-for="<input id>"]` flips the sign of that field, then hands the
 * focus back so the digits can follow. `aria-pressed` tells whether the value is negative.
 */
import { byId } from "./dom";
import { isNegative, toggleSign } from "./state";

const buttons = () => document.querySelectorAll<HTMLButtonElement>("[data-sign-for]");

/** Brings every button's pressed state in line with its field, after the fields were filled by script. */
export function syncSignToggles(): void {
  for (const b of buttons()) {
    const input = byId<HTMLInputElement>(b.dataset.signFor ?? "");
    b.setAttribute("aria-pressed", String(isNegative(input.value)));
  }
}

export function mountSignToggles(): void {
  for (const b of buttons()) {
    const input = byId<HTMLInputElement>(b.dataset.signFor ?? "");
    b.addEventListener("click", () => {
      input.value = toggleSign(input.value);
      // The screens listen to "input": the draft, the errors and the advice follow as if typed.
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
    input.addEventListener("input", () => b.setAttribute("aria-pressed", String(isNegative(input.value))));
  }
}
