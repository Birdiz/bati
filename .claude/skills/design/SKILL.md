---
name: design
description: Visual identity of the app ("Chaux et ocre", Claude Design model B3) — tokens, fonts, panels, drier side, absolute humidity scale, switches, advice box, CSP constraints. Read before touching index.html, src/styles or the look of a screen.
---

# Visual identity: Chaux et ocre

Model B (Pierre et chaux) was chosen 2026-11-22 among three Claude Design models (A Instrument, B Pierre et chaux, C Signal); its variant B3, Chaux et ocre, replaced it 2026-11-23. The lime wash and yellow ochre of rendered façades: cream whites, ochre earth, oxide red, moss green. Same structure as B: panels, lighter drier side, gap scale. No italics anywhere. Product name shown: **Maison Bloc**, with a house pictogram (`.brand-mark`, also the favicon and icons).

Only the Relevé screen has a mock-up; the other screens apply the same tokens and components by extrapolation. A future mock-up of another screen wins over this extrapolation.

## Tokens (`src/styles/app.css`, light then dark)

`--bg --surface --field-bg --text --muted --rule --field-rule --accent --on-accent`, `--dry --damp` (panels of the drier / wetter side), and one pair per advice tone: `--go(-bg, -on)` moss, `--stop(-bg, -on)` oxide red, `--alert(-bg, -on)` ochre, `--neutral(-bg, -on)` stone; `-on` is the text colour on a filled `--go` etc. (the verdict badge). Dark theme follows `prefers-color-scheme`, overridable by `data-theme` on `<html>`. Change colours by token, never in a rule.

## Fonts

Lora 500/600 (titles, legends, verdict title, scale gap, dew point line), never italic, and Nunito Sans 400/500/700 (text, figures in tabular lining numerals). Latin woff2 in `src/fonts/` (OFL, `OFL.txt`), bundled by Vite and cached by the service worker. Never load fonts from a CDN: the app must work offline and the CSP has `font-src 'self'`. A new weight is a new file of 14 to 22 kB: think twice.

## Relevé components

- **Panels**: a `fieldset` per side, legend floated inside as a serif title. The drier side is lighter, like a wall that has dried: `data-drier="indoor|outdoor"` on `#checkForm`, from `drierSide(gap)` (domain), absent within the neutral band. Tags "plus sec / plus humide" (`SIDE_TAG`) under each AH.
- **AH scale** `#ahScale`: shown once both readings are valid. 0–20 g/m³, grown to the next step of 5 (then 10 above 30) when a value exceeds it, never clipped (`scaleFor`). Indoor marker above the line, outdoor below, the band between them in the advice tone. Labels near an end are shifted inward; the tick stays on the value.
- **Switches**: storm and rain are `<input type="checkbox" role="switch">`, styled with `appearance: none`. Other checkboxes stay checkboxes (`accent-color`).
- **Advice box**: `data-tone` = go / stop / alert / neutral / empty. Uppercase verdict (`CODE_LABEL`) as a filled badge in the tone (`--tone-fg` on `--tone-on`), serif title in the text colour, lines with an em dash in the tone, dew point in serif under a rule.
- **Save block** `.save`: note, full-width primary button and status, 20 px under the result box. The Surface screen uses the same block.

## Carnet: trend

- Section `#trend` above the entries (hidden while the log is empty), `h3` "Tendance", then "Relevés" before the list.
- Period: a `.segmented` group of `.btn.small` with `aria-pressed`, the pressed one in accent.
- Comparison in a compact advice box (`.advice.compact`, title 22 px), same tones as the advice.
- Chart: hand-made SVG (`dayChart` in `src/ui/chart.ts`, shared by every chart of the Carnet) whose viewBox is the real width in pixels (labels stay 12 px), 210 px high, on a surface panel. Series coloured by `--series` set per `data-series`: excess `--text` thick with 3 px dots, indoor `--accent`, outdoor `--muted` dashed. Grid in `--rule`, zero line in `--field-rule`. `role="img"` with a French `aria-label` summary. HTML legend under it.

## Carnet: cold surfaces

- Section `#surfaces` between the trend and the entries, one `article.surface-history` per surface: serif `h4` (plus "(retirée de Ma maison)" in muted text), compact advice box in the tone of the worst day, then a 160 px margin chart when there are at least two days.
- Risk zones as bands behind the grid: below 0 °C in `--stop-bg`, 0 to 1 °C in `--alert-bg`; the range always shows −1 to 3 °C. Line in `--text`, dots coloured by `data-status`: condensation `--stop`, near the limit `--alert`.
- Every chart of the Carnet shares the same horizontal axis (same period, `carnetAxis`) and the same width (content width of the Carnet screen minus the figure's inset), redrawn on resize.
- Surface froide screen: the reminder `#surfaceLast` is a muted hint under the surface picker.

## Constraints

- The CSP has no `'unsafe-inline'` for styles: no `style=""` in markup or `setAttribute("style")`. Positions computed in scripts go through custom properties set with `el.style.setProperty("--pos", …)` (CSSOM, allowed).
- Components that set `display` rely on the global `[hidden] { display: none !important }`.
- Fields stay large (56 px for readings, 28 px figures): the app is read standing in a room, phone in hand.
- Print (Fiche): black on white, no tab bar, unchanged by the identity.
