# NEW2 TODO — data purity / text quality / source recovery / eCourts

Opened 20 August 2026, continued 21 August. Lane bound NEW2. States: TODO ·
RUNNING · VERIFIED DONE · BLOCKED. A task is VERIFIED DONE only when an artifact,
a query result or a test run is named beside it.

Standing constraints:

* The historical bulk ingest fleet is CLOSED and has not been restarted.
  Confirmed by measurement, not memory: `new2-held-refresh` re-counted the heap
  on 20 Aug and found **18,698,968 rows, delta +0** against the 19 Aug snapshot.
* Per-scope and per-document facts, never aggregates alone.
* UNKNOWN is an acceptable result. Absence of evidence is not evidence of health.
* The GPU embedding feed and the DeepSeek persistence run keep their CPU.

## The queue

| # | Task | State | Evidence |
|---|------|-------|----------|
| 1 | P0.1 Read the eligibility predicate from the deployed view, not from a file | VERIFIED DONE | `pg_get_viewdef` live; hash `e76879ab6bbcd452`, matches `TIER_A_CENSUS.md` |
| 2 | P0.2 Stratified primary-document sample across court, year, class, length, source, citation presence, script quality, admission reason | VERIFIED DONE | `semantic-core-audit-cli.ts`, 25,000 uniform draws, 13,390 admitted |
| 3 | P0.3 Classify SUBSTANTIVE / NON-SUBSTANTIVE / UNCERTAIN / TEXT UNSAFE / IDENTITY UNSAFE with evidence | VERIFIED DONE | mechanical verdicts at n=13,390; 85 rows adjudicated by hand from `textTail` |
| 4 | P0.4 Send independent findings to LCC after review | VERIFIED DONE | bus 0908, corrected in 0913 |
| 5 | P1.1 Enumerate false-positive admission mechanisms from the predicate | VERIFIED DONE | five named; three admit on absence of evidence |
| 6 | P1.2 Measure each and rank by impact | VERIFIED DONE | no role evidence 94.1% · bail 23.2% · unreadable 8.9% · duplicates 11.2% · `decided` 75.0% |
| 7 | P2 Canonical vocabulary: role / disposition / citability / text quality | VERIFIED DONE, LCC to ratify | `docs/ops/new2/DOCUMENT_QUALITY_VOCABULARY.md`; derivation in `quality-state.ts` |
| 8 | P3.1 Held-out validation data for LCC's DeepSeek classification | VERIFIED DONE | **87 rows** adjudicated before any model ran, in two sittings that agree (31.1% vs 28.6% substantive); `new2-heldout-questions.json` (no answers) and `new2-heldout-key.json`. Zero overlap with LCC's 1,000 — checked |
| 9 | P3.2 Evaluate model outputs independently | VERIFIED DONE | `candidate-eval-cli.ts` over all 1,000: 59.2% of `span_not_found` and 70.4% of `no_evidence_offered` are unreadable documents; 25 of 773 verified spans are verified inside glyph codes. LCC accepted the correction (0923) — their 16.9% fabrication headline is really closer to 7% |
| 9b | P3.3 Held-out accuracy measured | VERIFIED DONE | LCC ran the key: **87.9% [72.7, 95.2]** on 33 scorable, and a **15% false-substantive rate** on the costly direction. Key extended to 87 rows so the next run roughly doubles scorable |
| 10 | P4.1 Script-quality cursor keysets on `(created_at, id)` | VERIFIED DONE | `script-quality-page.ts`; separate checkpoint `script-quality-since.json` |
| 11 | P4.2 Test with deliberately out-of-order ids and duplicate timestamps | VERIFIED DONE | `script-quality-page.test.ts`, 6/6 against live Postgres |
| 12 | P5 Text-quality vocabulary; never CLEAN from a silent detector | VERIFIED DONE | five failure modes named, the fifth new; `text_quality` shown to certify 1,187/1,187 |
| 13 | P6 Tier-A legacy-font audit at scale with PDF-native evidence | VERIFIED DONE | `text-unsafe-probe-cli.ts`: suspects 76.9% `noToUnicode` vs controls 10.3%, n=160 |
| 14 | P7 Exact-content duplicate groups exported | VERIFIED DONE | `new2-duplicate-groups.json`, 301,531 groups; all 40 largest are single-court |
| 15 | P8 Current coverage denominator inputs | VERIFIED DONE | held refreshed 20 Aug (delta +0); frontier and coverage report re-cut; the 38,342 heap/acquired gap is exactly the Supreme Court, not a coverage gap |
| 16 | P9 Missing-PDF recovery: check the Indian Kanoon credential ONCE | VERIFIED DONE | `INDIANKANOON_API_TOKEN` absent. Source IS authorized (FQ-INDIANKANOON-RESOLVED); the token is a permanent-state founder item and is NOT re-raised |
| 17 | P10 Soft-404 safety preserved | VERIFIED DONE | `text.ts:194` magic-byte check; `text-fetch.test.ts` 7/7 |
| 18 | P11 eCourts live acquisition | BLOCKED on the founder alone | LCC sent `ECOURTS_OBSERVATION_PIPELINE_READY` (0896). Grant verified live by execution: unexpired, ALL_COURTS, 100/hr, 1,000/day, captcha bypass permitted, conditions `071259eb864b8e6d`. `ecourts_harvest` OFF; the flip needs a real founder `users.id` (`FQ-ECOURTS-ACTOR`). Ledger: 52 rows, all `refused/kill_switch_off`, zero requests ever made |
| 19 | P12 eCourts observation semantics | VERIFIED DONE (LCC built, NEW2 verified) | append-only by trigger, no FK to `judgments`, no `hearing_occurred` kind, four NOT NULL provenance columns |
| 20 | P13 eCourts request-efficiency instrumentation, testable without traffic | VERIFIED DONE | `new2-ecourts-efficiency.mjs`; reports `n/a — no denominator`, never 0 |
| 21 | P14 Machine-readable quality export | VERIFIED DONE | `quality-export-cli.ts` + `quality-state.ts`; every verdict carries method and version |
| 22 | P15 Workstation discipline | VERIFIED DONE | no fleet restarted; concurrency 3-4 on every probe; process table checked before each launch; the one throughput figure quoted carries the three competing jobs that were on the box |
| 23 | NEW1's ask (0902): classify in id order AHEAD of the embedding walk | RUNNING | `hc-classify-cli --resume --confirm`. Frontier 12.5% → 18.8% of the id space overnight; NEW1 at ~1.1%. Visible in the audit: reachable-with-no-role-evidence fell 94.1% → 87.9% in half a day |
| 24 | Screen unreadable documents out of the model-classification manifest | VERIFIED DONE | `disposal-manifest-cli.ts`; on a fresh 40,000-row walk it removes 2,950 rows, 30.9% of the would-be model queue |
| 25 | Follow the eligibility contract to v2 when LCC changed it mid-audit | VERIFIED DONE | hash moved `e76879ab6bbcd452` → `5efa4c8decef699e` and the tool caught it. Re-measured: reachable 55.4%, `VERIFIED_SEMANTIC_CORE` **0**, matching LCC's full-view zero from the other direction |
| 26 | Stop attributing rejections to a conjunct that stopped rejecting | VERIFIED DONE | v2 made `admitted` tier-based while attribution still tested `axis_c_role` first; 1,034 rejections read as `role` that were short documents. Rejections are 95.6% length |

## Still owed to another lane

* **LCC** — run the held-out 45 (`new2-heldout-questions.json`) through the same
  prompt. Their 1,000 measures the model on near-ties, which is the right place
  for fabrication and reproducibility and cannot bound accuracy on the population
  Tier A is actually made of.
* **LCC** — `text_quality` is theirs to weigh. It gates a deployed view and it
  scores substitution garbage at 1.000.
* **Whoever fixes `hc-classify.ts`** — the bail pattern needs `\s+`, and the fix
  needs a `--restale` pass. Not done here because the classifier is mid-walk and
  a rule change would split the corpus across two rule sets.
