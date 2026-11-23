---
name: pwa
description: Installable offline app — service worker (src/sw.js), build plugin, silent updates, storage on the device, offline check. Read before touching caching, storage or the server.
---

# Installable and offline

Same approach as Quart de tour, trimmed to one page.

- **Service worker** `src/sw.js`, plain JS, completed at build by the `bati-pwa` plugin of `vite.config.ts` (every built file and `public/`, no `.map`; content hash as cache name). Cache-first; every navigation gets `index.html`.
- **Updates** silent: the new version waits, takes over when the page goes to the background (or at launch if already waiting), the page reloads unseen. Every change is stored on input, so nothing is lost.
  - A reload or a closed tab also hides the page: activating then raced the navigation, the next page came from the old cache and found nothing waiting, so on desktop (tab never in the background, F5) the new version only showed on the 3rd load. `pagehide` marks the page as leaving and the activation on hide is deferred one task: when leaving, nothing is activated and the next launch does it, so the 2nd load shows the new version. Fixed 2026-11-23: devices that still run an older build go through the old behaviour one last time.
  - Chromium may install the new version twice in the first seconds after a deploy (navigation update check, then the page's `register`), the second replacing the first. Harmless; a reload in between costs one more load.
- **Storage** localStorage, keys `bati-profile`, `bati-log`, `bati-draft`, `bati-last-backup`, `bati-trend-window` (period of the log's trend, a device preference not in the backup). A refused write keeps data in memory and the header says so. `storage.persist()` when installed. iOS can evict a web app's storage: the JSON backup is the real protection, and the log screen reminds after 30 days without a copy.
- **No feature may need the network.** The app makes no request of its own. Fonts are files of the app (`src/fonts/`), never a CDN.
- **Server** (`server/`): static files only, CSP without inline styles or scripts, `assets/` cached a year, the rest revalidated. Cached pages keep the headers received at install: a changed CSP reaches devices only with a new build.
- **Check** `npm run build && npm run test:offline && npm run test:update` (also in CI). The update check serves a copy of the build as the previous version, then the build, and checks both ways an update arrives: a plain reload on desktop, the app going to the background on a phone (emulated: headless Chromium never hides a page). Service worker registered in production builds only.
