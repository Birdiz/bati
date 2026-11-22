/** Element by id; a missing element is a template error, not a case to handle. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} not found`);
  return el as T;
}

type Child = Node | string | null | undefined | false;

/** Creates an element. Text children are inserted as text, never as HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false) continue;
    if (k === "class") el.className = String(v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

const timers = new WeakMap<HTMLElement, number>();

/** Short message that disappears on its own. */
export function flash(el: HTMLElement, text: string, isError = false, ms = 3500): void {
  el.textContent = text;
  el.classList.toggle("error", isError);
  el.hidden = false;
  clearTimeout(timers.get(el));
  timers.set(
    el,
    window.setTimeout(() => (el.hidden = true), ms),
  );
}

/** Makes the browser save `text` as a file. */
export function downloadText(text: string, filename: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Fills a list with an advice text: title, tone, lines. */
export function showAdvice(
  box: HTMLElement,
  title: HTMLElement,
  lines: HTMLElement,
  t: { title: string; tone: string; lines: string[] } | { empty: string },
): void {
  if ("empty" in t) {
    box.dataset.tone = "empty";
    title.textContent = t.empty;
    lines.replaceChildren();
    return;
  }
  box.dataset.tone = t.tone;
  title.textContent = t.title;
  lines.replaceChildren(...t.lines.map((l) => h("li", {}, l)));
}
