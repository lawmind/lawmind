# BODY_EVIDENCE_INCREMENTAL_V1

**Lane:** NEW2 · **Round:** R7 §10 (P1) · **25 August 2026**

> R7 §10: *"Ensure new documents are screened incrementally without inheriting
> old coverage. Worker health uses real output delta."*

---

## 1. Does a new document inherit old coverage today? **No — and it is by construction, not by luck.**

`judgment_body_text_evidence` decides `SCREENED_NO_DAMAGE_FOUND` with:

```sql
EXISTS (SELECT 1 FROM quality_screen_runs r
        WHERE r.covers_corpus AND j.created_at < r.started_at)
```

**`j.created_at < r.started_at`** is the whole guarantee. A document that landed
after a screen began cannot be covered by it, whatever the screen's scope said it
would do. So a new document is `NEVER_SCREENED` until a *later* corpus-covering
run exists, and it cannot inherit anything.

**Verified on the live corpus.** Corpus-wide state today:

| state | documents | share |
| --- | ---: | ---: |
| `SCREENED_NO_DAMAGE_FOUND` | 16,906,647 | 90.42% |
| `SCREENED_DAMAGED` | 1,322,722 | 7.07% |
| `PROVEN_DAMAGED` | 469,599 | 2.51% |
| **`NEVER_SCREENED`** | **16** | 0.0001% |

**All 16 `NEVER_SCREENED` documents are the leaked `SYNTHETIC` test fixtures**
(`court = 'Test Court'`), created 23 Aug 09:14Z — after the last corpus-covering
run started on 21 Aug 17:54Z. The mechanism is doing exactly what it should: 16
documents arrived after the screen, and 16 documents are correctly marked
unscreened.

## 2. The three runs, and why only one confers coverage

`quality_screen_runs` records all three with an explicit `covers_corpus`:

| method | scope | covers_corpus | rows screened | convicted | why |
| --- | --- | --- | ---: | ---: | --- |
| `english_density_screen_v1` | staged | **false** | 701,805 | 62,215 | a staged subset, superseded three minutes later; establishes no coverage |
| `english_density_screen_v1` | all | **true** | 18,698,968 | 1,712,802 | the completed corpus pass |
| `text-damage-v2.0` | all | **false** | 1,626,762 | 79,381 | **proof-grade but partial** — read 1.6M of 18.7M |

**The third row is the one worth reading twice.** Its scope is `all` and its
`covers_corpus` is `false`, and the note says why: *"coverage is a measured fact
and not an intention."* A run that intended to cover the corpus and read 8.7% of
it does not confer coverage, and the column records what happened rather than
what was planned. That is the same distinction as `NEVER_INGESTED` vs `STALE`
and `DATE_UNCHECKED` vs `DATE_UNKNOWN` — three tables, one discipline.

## 3. `SCREENED_NO_DAMAGE_FOUND` is still not "clean", and the run row says so itself

The corpus-covering run's own note: *"Its silence is SCREENED_NO_DAMAGE_FOUND,
which is NOT clean: this same screen missed 32 of 43 glyph dumps whose signature
footer lifts the English rate."*

**A 74% miss rate on a known damage class.** So 90.42% of the corpus sits in a
state that means *one screen looked and did not convict*, and that screen is
measurably blind to at least one damage family.

`scripts/check-screened-not-clean.mjs` enforces the wording across 1,007 shipping
files and is proven non-vacuous — a planted violation exits 1, and a planted
`SCREENED_CLEAN` exits 1. **It is still not wired into `ci-local.mjs`**, which is
LCC's file. Re-raised in bus 1216; unchanged since the last round.

## 4. The gap this leaves, stated plainly

**Passage-level damage is not covered by any of this.** Every state above is a
*document* verdict. `PASSAGE_SAFETY_ROLE_CONTRACT_V1` measured **90 of 13,944
passages (0.65%) as damaged inside documents the screen calls safe** — a
document-level column cannot express "clean except for pages 4–6", which is what
a partial extraction failure produces.

At 0.65% over 91,231,179 paragraphs that is on the order of **593,000 damaged
passages**, all currently retrievable. It is gate **G-P2** of the passage
contract and it is the single largest hole in body evidence.

## 5. Worker health for this class

No screening worker ran this round. If one is started, its progress metric is
**rows written to `judgments.script_quality`**, never process liveness, never
checkpoint motion — the failure that hid a 19.5-hour dead walker in this repo,
and the same failure NEW1 reported in bus 1183 one table over.

## 6. States

| question | state |
| --- | --- |
| new documents inherit old coverage | `OBSERVED_BY_CODE` + `OBSERVED_BY_LIVE_DB` — **no**, `created_at < started_at` prevents it |
| documents awaiting a screen | 16, all synthetic fixtures |
| is `SCREENED_NO_DAMAGE_FOUND` equivalent to clean | **no** — the screen missed 32 of 43 known glyph dumps |
| proof-grade damage coverage | 1,626,762 of 18,698,984 — **8.70%**; its verdicts are a floor, its silence means nothing |
| passage-level damage | **`NOT_COVERED`** — no per-span verdict exists |
| OCR recovery of the 469,599 proven-damaged | **never run** — `text_extraction_method = 'ocr'` is true for 0 documents |
