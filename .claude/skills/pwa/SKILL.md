---
name: pwa
description: Installable offline app — service worker (src/sw.js), build plugin, silent updates, storage on the device, offline check. Read before touching caching, storage or the server.
---

# Installable and offline

Same approach as Quart de tour, trimmed to one page.

- **Service worker** `src/sw.js`, plain JS, completed at build by the `bati-pwa` plugin of `vite.config.ts` (every built file and `public/`, no `.map`; content hash as cache name). Cache-first; every navigation gets `index.html`.
- **Updates** silent: the new version waits, takes over when the page goes to the background (or at launch if already waiting), the page reloads unseen. Every change is stored on input, so nothing is lost.
- **Storage** localStorage, keys `bati-profile`, `bati-log`, `bati-draft`, `bati-last-backup`. A refused write keeps data in memory and the header says so. `storage.persist()` when installed. iOS can evict a web app's storage: the JSON backup is the real protection, and the log screen reminds after 30 days without a copy.
- **No feature may need the network.** The app makes no request of its own. Fonts are files of the app (`src/fonts/`), never a CDN.
- **Server** (`server/`): static files only, CSP without inline styles or scripts, `assets/` cached a year, the rest revalidated. Cached pages keep the headers received at install: a changed CSP reaches devices only with a new build.
- **Check** `npm run build && npm run test:offline` (also in CI). Service worker registered in production builds only.
