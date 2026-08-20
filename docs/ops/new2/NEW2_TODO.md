# NEW2 TODO — data purity / text quality / source recovery / eCourts

Session opened 20 August 2026. Lane bound NEW2. States: TODO · RUNNING ·
VERIFIED DONE · BLOCKED. A task is only VERIFIED DONE when an artifact, a query
result or a test run is named beside it.

Standing constraints for this session:

* The historical bulk ingest fleet is CLOSED at zero actionable rows and has not
  been restarted. Confirmed by measurement, not by memory: `new2-held-refresh`
  re-counted the heap on 20 Aug and found **18,698,968 rows, delta +0** against
  the 19 Aug snapshot.
* Per-scope and per-document facts, never aggregates alone.
* UNKNOWN is an acceptable result. Absence of evidence is not evidence of health.
* No workstation monopoly: the GPU embedding feed and the DeepSeek persistence
  run keep their CPU.

## The queue

| # | Task | State | Evidence |
|---|------|-------|----------|
| 1 | P0.1 Read the real eligibility predicate from the deployed view, not from a file | VERIFIED DONE | `pg_get_viewdef` read live; hash `e76879ab6bbcd452`, matches `TIER_A_CENSUS.md` |
| 2 | P0.2 Stratified primary-document sample across court, year, class, length, source, citation presence, script quality, admission reason | VERIFIED DONE | `semantic-core-audit-cli.ts`, 25,000 uniform draws, 13,284 admitted → `docs/ops/migration/new2-semantic-core-audit.json` |
| 3 | P0.3 Classify HIGH-CONFIDENCE SUBSTANTIVE / NON-SUBSTANTIVE / UNCERTAIN / TEXT UNSAFE / IDENTITY UNSAFE with evidence per row | VERIFIED DONE | mechanical verdicts at n=13,284; 40 rows adjudicated by hand from `textTail` |
| 4 | P0.4 Send independent findings to LCC after the review is complete | TODO | |
| 5 | P1.1 Enumerate false-positive admission mechanisms from the predicate itself | VERIFIED DONE | five named; three admit on absence of evidence |
| 6 | P1.2 Measure each mechanism and rank by measured impact | VERIFIED DONE | no role evidence 94.4% · bail phrase 18.07% · unreadable text 8.3% · `decided` at 75.0% · duplicates 12.1% |
| 7 | P2 Canonical vocabulary: role / disposition / citability / text quality | VERIFIED DONE (needs LCC sign-off) | `docs/ops/new2/DOCUMENT_QUALITY_VOCABULARY.md` |
| 8 | P3.1 Held-out validation data for LCC's DeepSeek classification | TODO | |
| 9 | P3.2 Evaluate span correctness and role correctness independently | TODO | waits on LCC outputs |
| 10 | P4.1 Script-quality incremental cursor keysets on `(created_at, id)` | VERIFIED DONE | `script-quality-page.ts`; separate checkpoint `script-quality-since.json` |
| 11 | P4.2 Test the cursor with deliberately out-of-order ids and duplicate timestamps | VERIFIED DONE | `script-quality-page.test.ts`, 6/6 pass against live Postgres |
| 12 | P5 Text-quality state vocabulary; never label CLEAN from a silent detector | VERIFIED DONE | vocabulary doc §4; `text_quality` shown to certify 1,117/1,117 unreadable rows |
| 13 | P6 Tier-A legacy-font audit at scale, with PDF-native evidence | VERIFIED DONE | `text-unsafe-probe-cli.ts`: suspects 76.9% `noToUnicode` vs controls 10.3%, n=160 |
| 14 | P7 Exact-content duplicate groups exported for LCC | VERIFIED DONE | `new2-duplicate-groups.mjs` → `docs/ops/migration/new2-duplicate-groups.json`, 301,531 groups |
| 15 | P8 Current coverage denominator inputs; retract stale frontier percentages | RUNNING | held snapshot refreshed 20 Aug (delta +0); frontier and coverage report to re-cut |
| 16 | P9 Missing-PDF recovery: check the Indian Kanoon credential ONCE | VERIFIED DONE | `INDIANKANOON_API_TOKEN` absent from `.env`. Source is AUTHORIZED (FQ-INDIANKANOON-RESOLVED); the token is a permanent-state founder item and is NOT re-raised |
| 17 | P10 Soft-404 safety preserved | VERIFIED DONE | `text.ts:194` magic-byte check; `text-fetch.test.ts` 7/7 pass |
| 18 | P11 eCourts live acquisition | BLOCKED on the founder only | LCC sent `ECOURTS_OBSERVATION_PIPELINE_READY` (bus 0896). Grant verified live by execution. `ecourts_harvest` kill switch OFF; flipping it needs a real founder `users.id` (`FQ-ECOURTS-ACTOR`). Ledger: 52 rows, all `refused/kill_switch_off`, zero requests ever made |
| 19 | P12 eCourts observation semantics | VERIFIED DONE (LCC built it, NEW2 verified) | `ecourts_observation` append-only by trigger, no FK to `judgments`, no `hearing_occurred` kind, four NOT NULL provenance columns |
| 20 | P13 eCourts request-efficiency instrumentation, testable without traffic | TODO | budget is 1,000/day, 100/hour, 2,000 ms minimum interval |
| 21 | P14 Machine-readable quality export for LCC and NEW1 | TODO | |
| 22 | P15 Workstation discipline held throughout | RUNNING | no fleet restarted; concurrency 4 on every probe; process table checked before each launch |
| 23 | NEW1's ask (bus 0902): classify in id order AHEAD of the embedding walk | RUNNING | `hc-classify-cli --resume --confirm` started 20 Aug. Prevents ~1.4M impure documents reaching the GPU, about 1.6 GPU-days |
