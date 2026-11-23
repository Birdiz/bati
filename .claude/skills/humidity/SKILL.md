---
name: humidity
description: Humidity domain of bati — absolute humidity and dew point formula, ventilation advice rules and their precedence, cold surface check, measurement log, backup format. Read before changing src/domain or src/text.
---

# Humidity domain

## Formula

Magnus, Alduchov & Eskridge (1996): A = 17.625, B = 243.04 °C, C = 6.1094 hPa, over water, valid −40 to +50 °C (`FORMULA`). AH = 216.7 · e / T(K). Dew point is the exact inverse. Readings outside the range or at 0 % RH are refused (`readingError`), never extrapolated.

Field references, tested: 10 °C / 80 % → 7.51 g/m³ (first noted 7.6 from a hygrometer display; every standard formula gives 7.51, decided 2026-11-22), 21 °C / 73 % → 13.35 g/m³ (displayed 13,3).

## Advice (`decideAdvice`)

Inputs: measured indoor/outdoor readings, plus two declared conditions (storm, recent rain). Precedence:

1. Storm → keep closed, reduce VMC, dehumidifiers. Overrides the measurements (decided 2026-11-22); `conflict` when the measurements alone say ventilate, and the text says so.
2. Gap ≤ −0.5 g/m³ → ventilate, VMC full.
3. Gap ≥ +0.5 g/m³ → keep closed, reduce VMC (single- and double-flow alike: neither dries outdoor air).
4. Otherwise neutral. 0.5 g/m³ ≈ uncertainty of a ±3 % RH hygrometer at 20 °C.

Recent rain only changes where to open (`openingPlan`): avoid facades facing a wet area; prefer facades ≥ 135° from every wet facade, upstairs if they have upstairs windows; fall back to any dry facade; none left → VMC only or wait.

`drierSide(gap)` names the drier air from the measurements alone (null within the band, unchanged by a storm): the quick check lightens that side.

No VMC → no VMC instruction anywhere. **Atmospheric pressure is not modelled** (mechanism not established): do not add it.

## Cold surface

At risk when surface ≤ indoor dew point; `nearLimit` within 1 °C (infrared thermometer accuracy). Yes/no plus margin.

## Log and backup

An entry stores the readings and what was computed then, with the formula id: changing the formula must never rewrite history. Backup `bati-export` v1: invalid or duplicate entries dropped and counted, newer versions refused. Merge = log union by id (existing wins) and the file's profile only if the device has none.

## Trend (`trend.ts`, Carnet)

Question: does the house give less water to the air over time? Indoor AH alone mostly follows the outdoor air (falls all autumn, rises in spring whatever the walls do): **do not use it as the indicator**. The indicator is the **moisture excess = indoor AH − outdoor AH** (g/m³), the water the house adds to the air, season removed (same quantity as EN ISO 13788 internal humidity classes). Decided 2026-11-23:

- One point per calendar day of the user (`dayOf` injected): mean of that day's entries, from the values computed when they were saved. A day measured five times weighs as much as a day measured once.
- Comparison (`compareExcess`): mean daily excess of the last 14 days (today included) against the 14 days before, over the whole log whatever window is shown. At least 3 days with readings in each period, else no comparison. Under `NEUTRAL_BAND` (0.5 g/m³) the gap is "stable"; below → lower (go tone), above → higher (alert tone, not stop: a rise is not a danger by itself).
- The wording stays causal and modest: "à usage comparable", lower = the walls dry or the airing works better. No ISO 13788 class thresholds without field validation.
- Chart windows 30 / 90 days (default) / all; lines broken over gaps of more than 7 days (`MAX_GAP_DAYS`), points always drawn: nothing is drawn where nothing was measured.
- Not recorded, so not shown: whether an advice was followed.

## Out of scope for now

Tradesperson side, sensors, weather API, accounts, sync, insulation material recommendations. The house profile (`src/domain/house`) is where the materials side will plug in.
