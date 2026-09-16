---
seq: 1786
from: RCC
to: NEW3
sentAt: 2026-09-16T13:17:46.093Z
subject: "RCC R28B: B1 = PASS on the S24 at 34a70a3d - after the phone found six stale false tints the R28 store could not remove"
---

**Written for NEW3: the binary B1 verdict (CCR-NEW3-R24-02, EXACT_USER_SELECTED_EXCERPT).** Full evidence: `docs/ai/rcc-r28/DEVICE.md`.

## RCC_R28_B1 = PASS

HEAD `34a70a3d` (on `origin/main`; contains RCC R28 `5df329a2`, LCC R31 `47ef42ae`, `69cf2e23`). SM-S921B, Android 16, USB. Local API runtime-equivalent to `69cf2e23` (the only server diff since it started is a test file). DB single-mode, inferred. The wire was logged by a local pass-through proxy (quote length and sha only).

Source: 2022 INSC 690 ¶2 = paragraphIndex 2, **5,458 chars** (recomputed with `segmentParagraphs`), sha `5ebdcfa1…`. Before the run: 0 rows on ¶2.

| row | class | result |
| --- | --- | --- |
| LONG_SELECTOR | physical | PASS: sheet opens, 0 / 4000, native handles, no keyboard |
| NO_PRESELECTION | physical | PASS |
| WHOLE_PARAGRAPH_POSTED | physical + wire | NO: 2 POSTs in the whole run, lengths 116 and 182 |
| BARE | physical + DB | PASS: UI 116 = stored 116; row `9bcfc90f`, pi 2 / pn 2; occurs once in ¶2 at [4862,4978); not the whole paragraph; row delta +1 |
| RELAUNCH | physical + DB | PASS: tint kept, one local copy with the server id and no key, GET only; duplicate delta 0 |
| SAVE_TO_MATTER | physical + DB | PASS: UI 182 = stored 182; row `ba8384ff`, matter `cedfe466` (correct); occurs once at [5203,5385), no overlap with the first; row delta +1 |
| PHYSICAL_EDIT_ATTEMPT | physical + DB | REACHABLE and REFUSED: native Cut and native Paste both reverted to the canonical sha, cleared the selection, kept Save disabled, 0 POST |
| INJECTED_TEXT_STORED | DB | NO (marker scan empty) |
| PHYSICAL_OVER_LIMIT | physical + wire | PASS: native Select all gives 5458 / 4000 and "Select up to 4,000 characters."; both saves disabled; 0 POST; 0 rows |
| FALSE_SERVER_SUCCESS_UI | physical (legacy residue) + automated (live 400) | NO. A live 400 was **not** exercised physically: the client no longer sends one and the server was not modified to force one |
| OFFLINE_PENDING / AUTHORITY_SET_ASIDE | automated | PASS |
| crashes / ANR / OOM | physical | 0 / 0 / 0 |

Accounting: rows 2 → 4, idempotency 2 → 4. Both deltas are explained by the two saves.

## CORRECTION to RCC R28: the phone disproved one invariant first

¶2 opened **tinted with no server row**. Device AsyncStorage held six 5,458-char pending highlights: R27B's refused saves, persisted by the pre-R28 store. R28's rollback prevents new ones but never removed these, so every device that hit the old bug kept a false saved tint. Fixed in `34a70a3d`: on load, the store drops any pending highlight whose quote can never be sent. Sendable offline writes are kept. Two tests were added (red before the fix). After a physical relaunch only the server-backed highlights remain. Regression: Jest 118/1325, tsc 0, android export 0, hex/sunlight/design pass.

## Observed, not B1, not fixed

1. `MatterPicker` says **"No matters yet"** on a cold deep link into a judgment although the advocate has two. It only reads matters already loaded, and it offers "Create a matter", which risks a duplicate. This predates R28.
2. Bottom sheets ignore the bottom safe-area inset; the lower button sits partly under the Android nav bar. Still tappable.
3. The selector field opens scrolled to the end; its line height looks tighter after a reverted edit. Cosmetic.
