---
name: design
description: Visual identity of the app ("Pierre et chaux", Claude Design model B) — tokens, fonts, panels, drier side, absolute humidity scale, switches, advice box, CSP constraints. Read before touching index.html, src/styles or the look of a screen.
---

# Visual identity: Pierre et chaux

Chosen 2026-11-22 among three Claude Design models (A Instrument, B Pierre et chaux, C Signal). The house's materials: lime white, stone grey, ochre, oxide red, moss green. The app as a tool of the restoration trade. Product name shown: **Maison Bloc**, with a house pictogram (`.brand-mark`, also the favicon and icons).

Only the Relevé screen has a mock-up; the other screens apply the same tokens and components by extrapolation. A future mock-up of another screen wins over this extrapolation.

## Tokens (`src/styles/app.css`, light then dark)

`--bg --surface --field-bg --text --muted --rule --field-rule --accent --on-accent`, `--dry --damp` (panels of the drier / wetter side), and one pair per advice tone: `--go(-bg)` moss, `--stop(-bg)` oxide red, `--alert(-bg)` ochre, `--neutral(-bg)` stone. Dark theme follows `prefers-color-scheme`, overridable by `data-theme` on `<html>`. Change colours by token, never in a rule.

## Fonts

Alegreya 500, 500 italic, 600 (titles, legends, verdict title, dew point line) and Alegreya Sans 400/500/700 (text, figures in tabular lining numerals). Latin woff2 in `src/fonts/` (OFL, `OFL.txt`), bundled by Vite and cached by the service worker. Never load fonts from a CDN: the app must work offline and the CSP has `font-src 'self'`. A new weight is a new file of about 24 kB: think twice.

## Relevé components

- **Panels**: a `fieldset` per side, legend floated inside as an italic title. The drier side is lighter, like a wall that has dried: `data-drier="indoor|outdoor"` on `#checkForm`, from `drierSide(gap)` (domain), absent within the neutral band. Tags "plus sec / plus humide" (`SIDE_TAG`) under each AH.
- **AH scale** `#ahScale`: shown once both readings are valid. 0–20 g/m³, grown to the next step of 5 (then 10 above 30) when a value exceeds it, never clipped (`scaleFor`). Indoor marker above the line, outdoor below, the band between them in the advice tone. Labels near an end are shifted inward; the tick stays on the value.
- **Switches**: storm and rain are `<input type="checkbox" role="switch">`, styled with `appearance: none`. Other checkboxes stay checkboxes (`accent-color`).
- **Advice box**: `data-tone` = go / stop / alert / neutral / empty. Uppercase verdict (`CODE_LABEL`), serif title, lines with an em dash, dew point in italic under a rule.

## Carnet: trend

- Section `#trend` above the entries (hidden while the log is empty), `h3` "Tendance", then "Relevés" before the list.
- Period: a `.segmented` group of `.btn.small` with `aria-pressed`, the pressed one in accent.
- Comparison in a compact advice box (`.advice.compact`, title 22 px), same tones as the advice.
- Chart: hand-made SVG (`src/ui/trend.ts`) whose viewBox is the real width in pixels (labels stay 12 px), 210 px high, on a surface panel. Series coloured by `--series` set per `data-series`: excess `--text` thick with 3 px dots, indoor `--accent`, outdoor `--muted` dashed. Grid in `--rule`, zero line in `--field-rule`. `role="img"` with a French `aria-label` summary. HTML legend under it.

## Constraints

- The CSP has no `'unsafe-inline'` for styles: no `style=""` in markup or `setAttribute("style")`. Positions computed in scripts go through custom properties set with `el.style.setProperty("--pos", …)` (CSSOM, allowed).
- Components that set `display` rely on the global `[hidden] { display: none !important }`.
- Fields stay large (56 px for readings, 28 px figures): the app is read standing in a room, phone in hand.
- Print (Fiche): black on white, no tab bar, unchanged by the identity.
