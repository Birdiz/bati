# bati (working title)

Ventilation advice and humidity tracking for old stone farmhouses in the Vosges. Installable PWA, fully offline, no account, no backend: all data stays on the device.

- UI text in French; code, identifiers, comments and commits in English.
- `src/domain` is pure: no DOM, no storage, no French text. It runs in Node for the tests. French wording lives in `src/text`, the DOM in `src/ui`.
- `bati` is the stable internal code (storage keys `bati-*`, export format `bati-export`). The product name is not decided: it only appears in the UI, the manifest and the domain name, never in keys.
- No feature may need the network.
- `noUncheckedIndexedAccess`: `!` on index accesses guaranteed by construction.
- `npm run check` before every commit.
- Domain knowledge lives in `.claude/skills/`: a change that contradicts a skill updates it in the same commit.
