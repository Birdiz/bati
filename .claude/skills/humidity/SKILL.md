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

A facade is a side with windows opening to the outside (decided 2026-11-23). In a maison-bloc the living quarters share walls with the barn or a neighbour: such a wall is not a facade (opening it lets in the barn's air, which the outdoor reading does not describe), and when it runs cold it is a cold surface. The profile does not model adjacent unheated spaces yet; the target is one model for cellar, barn and attic, each with an optional reading, which would also give the cold-side temperature the temperature factor needs (see Cold surface history).

`drierSide(gap)` names the drier air from the measurements alone (null within the band, unchanged by a storm): the quick check lightens that side.

No VMC → no VMC instruction anywhere. **Atmospheric pressure is not modelled** (mechanism not established): do not add it.

## Cold surface

Status (`surfaceStatus`, worst first): **condensation** when surface ≤ indoor dew point; **near the limit** within 1 °C (`NEAR_LIMIT_C`, infrared thermometer accuracy); **mould** when the surface is declared absorbent and the indoor air cooled to the surface temperature reaches 80 % RH (`MOULD_RH`, EN ISO 13788 design criterion); otherwise no condensation. Decided 2026-11-23:

- The dew point does not depend on the material: the infrared reading already includes what the material does to the surface temperature. The material only changes which threshold matters.
- Absorbent (wood, plaster, lime render, stone, unglazed terracotta) takes water in without visible droplets, so the risk is mould before condensation, about 3 °C above the dew point in a living room (19 °C / 60 %: dew point 11.1 °C, 80 % from 14.5 °C). Glazed tile, glass and gloss paint keep the dew point check alone. Declared per cold surface in the profile (`absorbent`, false when missing).
- 80 % only means trouble if it lasts days: the wording says so. No uncertainty band on the mould threshold (±1 °C ≈ ±6 % RH at the surface): the 80 % criterion is already conservative.
- Not modelled: the infrared reading is too warm on bare metal (low emissivity) and on a rug (the water forms under it); a damp wall with a clear positive margin points to rising damp or a leak, not condensation.

## Log and backup

An entry stores the readings and what was computed then, with the formula id: changing the formula must never rewrite history. A surface check also stores the surface RH and whether the surface was declared absorbent at the time; entries saved before have neither and read as non-absorbent, so their status does not change. Backup `bati-export` v1: invalid or duplicate entries dropped and counted, newer versions refused. Merge = log union by id (existing wins) and the file's profile only if the device has none.

## Trend (`trend.ts`, Carnet)

Question: does the house give less water to the air over time? Indoor AH alone mostly follows the outdoor air (falls all autumn, rises in spring whatever the walls do): **do not use it as the indicator**. The indicator is the **moisture excess = indoor AH − outdoor AH** (g/m³), the water the house adds to the air, season removed (same quantity as EN ISO 13788 internal humidity classes). Decided 2026-11-23:

- One point per calendar day of the user (`dayOf` injected): mean of that day's entries, from the values computed when they were saved. A day measured five times weighs as much as a day measured once.
- Comparison (`compareExcess`): mean daily excess of the last 14 days (today included) against the 14 days before, over the whole log whatever window is shown. At least 3 days with readings in each period, else no comparison. Under `NEUTRAL_BAND` (0.5 g/m³) the gap is "stable"; below → lower (go tone), above → higher (alert tone, not stop: a rise is not a danger by itself).
- The wording stays causal and modest: "à usage comparable", lower = the walls dry or the airing works better. No ISO 13788 class thresholds without field validation.
- Chart windows 30 / 90 days (default) / all; lines broken over gaps of more than 7 days (`MAX_GAP_DAYS`), points always drawn: nothing is drawn where nothing was measured.
- Not recorded, so not shown: whether an advice was followed.

## Cold surface history (`surfaceHistory.ts`, Carnet and Surface froide)

Question: how often was each surface condensing, or close to it, and when? **No "better or worse" verdict**: the margin follows the weather as much as the house (a floor above an unheated cellar cools with the cellar all winter). The EN ISO 13788 temperature factor would remove that but needs the cold-side temperature (the cellar's), which is not measured; computed with the outdoor temperature it would be wrong for the commonest case: do not add it without a cellar reading. Decided 2026-11-23:

- One value per day and surface: the **worst** margin of the day (one check in condensation marks the day), with the surface temperature of that check. Status with `surfaceStatus` from the saved margin, surface RH and material.
- Summary over the period shown (same 30 / 90 / all as the trend): days checked, days in condensation, days near the limit, days at risk of mould (named only when there are some), worst margin and its date. Tone of the worst case: stop, alert (near the limit, then mould), else go.
- Surfaces of the profile in its order, then removed ones (last saved name, "retirée de Ma maison"). "Autre surface" checks (`OTHER_SURFACE_ID`) are left out: different surfaces share that id.
- The cold surface screen reminds the last saved check of the chosen surface (when, status, margin).

## Out of scope for now

Tradesperson side, sensors, weather API, accounts, sync, insulation material recommendations. The house profile (`src/domain/house`) is where the materials side will plug in.
