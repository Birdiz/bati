# Maison Bloc (internal code: bati)

Ventilation advice for old stone farmhouses in the Vosges: compare **absolute humidity** inside and outside, check cold surfaces against the indoor dew point, keep a measurement log. Installable PWA, works fully offline once loaded, no account, no backend: all data stays on the device.

## What it does

1. **Relevé** (quick check): indoor and outdoor temperature + RH → absolute humidity of both (drier side lightened, both on a g/m³ scale), indoor dew point, one advice.
2. **Ma maison** (house profile): VMC type, facades (orientation, wet area, upstairs windows), known cold surfaces. The advice uses it ("ouvrir à l'étage, côté Jardin (sud-ouest)").
3. **Surface froide**: a known surface and its temperature → condensation risk yes/no, margin in °C.
4. **Carnet** (log): each check can be saved with a note; JSON backup export/import (merge or replace).
5. **Fiche**: printable sheet with the rules and an AH table, 5–40 °C × 30–100 % RH.

### Rules (field-validated)

| Situation                              | Advice                                                               |
| -------------------------------------- | -------------------------------------------------------------------- |
| Outdoor AH < indoor AH (by ≥ 0.5 g/m³) | Open + VMC at full speed                                             |
| Outdoor AH > indoor AH (by ≥ 0.5 g/m³) | Keep closed + reduce the VMC                                         |
| Gap under 0.5 g/m³                     | Neutral (within hygrometer accuracy)                                 |
| Storm declared                         | Keep closed + reduce VMC + dehumidifiers; overrides the measurements |
| Recent rain, facade facing a stream    | Do not open that facade; open upstairs on the opposite side          |

Atmospheric pressure is deliberately not modelled. Formula: Magnus with Alduchov & Eskridge (1996) coefficients, valid −40 to +50 °C (see `src/domain/humidity/psychrometrics.ts`).

## Structure

Strict TypeScript, Vite, no UI framework: same toolchain as Quart de tour.

```
index.html            the single page (screens switched by #releve, #surface, #maison, #carnet, #fiche)
src/
  domain/             pure, no DOM, no French: runs in Node for the tests
    house/            house profile, the shared core (the materials side will extend it)
    humidity/         formulas, advice rules, surface check, log, reference table
    backup.ts         JSON export/import
  text/fr.ts          French wording of the domain results
  storage/            localStorage behind a key-value interface
  ui/                 screens, state, PWA registration
  sw.js               service worker (file list injected at build)
  styles/app.css      visual identity "Chaux et ocre", on tokens (see .claude/skills/design)
  fonts/              Lora and Nunito Sans, latin woff2 (OFL), served with the app
server/               static server for Railway (compression, cache, CSP), no API
tests/                Vitest (domain + screens with jsdom)
scripts/offline-check.ts  real offline check in Chromium
```

`bati` is the stable internal code: storage keys `bati-*`, backup format `bati-export`. The product name (Maison Bloc) only appears in the UI and the manifest: it can change without touching them.

## Development

Node 22 or newer.

```bash
npm install
```

```bash
npm run dev
```

| Command                | Role                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `npm run check`        | types, lint, formatting and tests, before every commit                                    |
| `npm test`             | tests only                                                                                |
| `npm run build`        | site in `dist/`, server in `dist-server/`                                                 |
| `npm start`            | serves `dist/` on `PORT` (3000 by default)                                                |
| `npm run test:offline` | after a build: real offline check, screenshots and printed sheet in `out/offline/`        |
| `npm run test:update`  | after a build: update from a previous version, on desktop (reload) and phone (background) |

The service worker is only registered in production builds: to try offline locally, `npm run build` then `npm start`.

## Offline check

`npm run test:offline` starts the production server, loads the app once in Chromium (Pixel 7 emulation), waits for the service worker, then **stops the server and puts the browser offline**, checks that a request outside the cache really fails, and uses every feature: reload, house profile, quick check (with rain and storm), cold surface, log, export, delete + import, reference sheet printed to PDF, and a final offline reload to check the data stayed on the device. Any console error or CSP violation fails the run. CI runs it on every push (`offline` job).

### On an iPhone (not automatable here)

1. Open the site in Safari, wait for the page to load, then Share → "Sur l'écran d'accueil".
2. Open the installed app once with network.
3. Airplane mode on. Close the app (swipe it away), reopen it from the home screen.
4. Go through each tab; save a check; Carnet → "Enregistrer une copie" (the file goes to Files); "Reprendre une copie" from Files; Fiche → Imprimer (preview).
5. Close and reopen in airplane mode: the log and the house profile are still there.

## Update check

`npm run test:update` serves a copy of the build as the "previous" version (another service worker version, a marker on the page), installs it in Chromium, then deploys the build and checks that the new version arrives: on desktop, the second plain reload after a deploy shows it; on a phone, the app going to the background hands over and reloads unseen. CI runs it after the offline check.

## Deployment

Railway, like Quart de tour: `railway.json` builds with `npm run build` and runs `npm start`, health check `/sante`. No database, no environment variable required.
