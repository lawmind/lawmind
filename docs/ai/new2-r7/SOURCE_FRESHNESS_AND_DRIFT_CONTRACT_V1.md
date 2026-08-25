# SOURCE_FRESHNESS_AND_DRIFT_CONTRACT_V1

**Lane:** NEW2 · **Round:** R7 §10 · **25 August 2026**
**Detector:** `scripts/n2-source-freshness.mjs` (`--strict` exits 1 on any non-`FRESH` adapter)
**Machine-readable:** `docs/ai/new2-r7/source-freshness.json`

---

## 0. The rule

**HTTP 200 plus an implausibly empty ingest is `FAILED_SOURCE_SHAPE`, never
success.** A run that fetched, parsed nothing, and exited 0 has not succeeded —
it has failed in the one way nobody notices.

**And freshness is not throughput.** The AWS buckets are a periodic dump; zero
new documents for a week is their normal state and an alarm on volume would cry
wolf daily. So each adapter declares its own expected behaviour and its own
staleness horizon, and a source with no live feed at all says so rather than
being quietly forgiven.

---

## 1. Per-adapter state, measured

| adapter | kind | state | held | last useful document | age | horizon |
| --- | --- | --- | ---: | --- | ---: | ---: |
| `aws_open_data_hc` | bulk dump | **FRESH** | 18,660,626 | 2026-08-19 23:05:38Z | 5.65 d | 30 d |
| `aws_open_data_sc` | bulk dump | **FRESH** | 38,342 | 2026-08-11 09:52:23Z | 14.20 d | 30 d |
| `indiacode_statutes` | HTTP API | **FRESH** | 846 | 2026-08-13 00:31:27Z | 12.59 d | 180 d |
| **`ecourts`** | HTTP API | **NEVER_INGESTED** | **0** | — | — | 2 d |

Per adapter the contract records: last request · last useful document · parser
signature · expected delta band · empty-result anomaly · wrong-content anomaly ·
checkpoint · backlog · freshness state. The machine-readable file carries all of
them; the two that need discussion are below.

### 1.1 `ecourts` is `NEVER_INGESTED`, not `STALE` — and the distinction is the point

`ecourts_observation`, `cause_list_syncs` and `harvest_fetches` are **all zero
rows**. Nothing has ever been ingested through the eCourts path.

`NEVER_INGESTED` and `STALE` are separate states deliberately: `STALE` implies
the adapter once worked and has stopped, which would send someone to look for a
regression that does not exist. This is the same distinction the body-evidence
contract draws between `NEVER_SCREENED` and `SCREENED_NO_DAMAGE_FOUND`, and it
has the same reason — **a thing never done and a thing done and found clean want
opposite work.**

**This is the finding with the largest product consequence in the whole
freshness picture.** eCourts is the only adapter that can make the corpus
*current*; the AWS buckets are a periodic dump of the past. The registrar's
written authorisation has existed since 7 Aug 2026 and runs to January 2029. The
harvest has never run.

### 1.2 The AWS adapters read `FRESH` and ingest has in fact stopped

Both are inside their 30-day horizon and both are correct to be. But the cadence
tells a story the state does not:

```
2026-08-14   4,251,202
2026-08-15   1,697,439
2026-08-17   1,107,452
2026-08-18   9,423,960
2026-08-19     871,488
2026-08-23          16     <- the leaked SYNTHETIC test fixtures, not judgments
```

**The last real judgment entered the corpus on 19 August. It is now 25 August.**

That is not a fault: a bulk dump is expected to be quiet, and this contract
deliberately does not alarm on it. It is recorded because the *combination* is
what matters — a corpus whose only live source has never run, and whose bulk
source last delivered six days ago, is **not becoming more current with time**,
and no state in this table says so on its own. Anything that renders "our corpus
is up to date" is making a claim this data does not support.

### 1.3 The failure ledger is the other half of freshness

`source_url` records only successes. A source failing every request looks exactly
like a source with nothing new, unless failures are counted.

| outcome | permanence | rows | last attempt |
| --- | --- | ---: | --- |
| `pdf_absent` | permanent | **217,794** | 2026-08-19 23:05:18Z |
| `no_text` | retryable | 10,062 | 2026-08-19 22:46:06Z |
| `pdf_failed` | retryable | 2,794 | 2026-08-19 23:05:25Z |
| `no_text` | permanent | 218 | 2026-08-19 22:45:58Z |
| `pdf_timeout` | retryable | 60 | 2026-08-19 19:02:56Z |
| `no_title` | permanent | 3 | 2026-08-19 00:11:16Z |
| | | **230,931** | |

**217,794 documents are indexed at the source and permanently un-fetchable.**
12,916 are retryable and have not been retried since 19 August.

---

## 2. The drift event this round found, in full

R7 §10 asks for wrong-content and JS-shell anomaly detection. Here is one,
observed live, on an official source.

`services/ingest/src/repealed-acts.ts` carries three India Code handles
*"verified against the site 8 Aug 2026"*. Seventeen days later:

```
https://www.indiacode.nic.in/handle/123456789/11091   404   686 B   "500 Server Error/404 Page Not Found"
https://www.indiacode.nic.in/handle/123456789/4221    404   686 B
https://www.indiacode.nic.in/handle/123456789/4218    404   686 B
https://indiacode.gov.in/handle/123456789/11091       200 2,338 B   Angular SPA shell, zero content
```

India Code migrated from DSpace 6 (`indiacode.nic.in`, server-rendered handles)
to DSpace 7 (`indiacode.gov.in`, an Angular front end with a JSON API). The old
handle numbers do not resolve on the new site.

**The `200` is the dangerous one.** An adapter checking status codes sees success,
parses an empty document, and reports a clean run for ever.

**What actually caught it** was not a status check: `repealed-acts-cli.ts`
verifies the *fetched title against an expected title* and refused —

```
REFUSED: handle returned "", expected INDIAN PENAL CODE
A handle that resolves to the wrong Act is how a corpus gets the wrong law.
```

That is the pattern this contract makes general: **every adapter must assert
something about the CONTENT it received, not about the transport.**

The working route is recorded in `STATUTE_INTELLIGENCE_LEDGER_V1` §3.2.

---

## 3. The contract

### 3.1 States

| state | meaning |
| --- | --- |
| `FRESH` | last useful document is inside the adapter's declared horizon |
| `STALE` | the adapter worked and has stopped delivering inside its horizon |
| `NEVER_INGESTED` | the adapter has never delivered a document. **Not `STALE`** |
| `FAILED_SOURCE_SHAPE` | requests succeed at the transport layer and yield no usable content |
| `UNKNOWN_NO_TIMESTAMP` | documents held, no last-useful timestamp — the check itself is broken |
| `UNKNOWN_CHECK_FAILED` | the freshness query errored. **Never silently `FRESH`** |

### 3.2 Rules

1. **Assert on content, never on transport.** Every adapter declares a
   content-level invariant — an expected title, a minimum row count, a required
   field — and a fetch that does not satisfy it is `FAILED_SOURCE_SHAPE`
   regardless of the status code.
2. **A parser signature is recorded and compared.** When the shape of what comes
   back changes, that is a drift event and it is named, not absorbed.
3. **A horizon is declared per adapter.** A bulk dump and a live feed cannot
   share a staleness threshold; forcing them to share one produces either a daily
   false alarm or a silent live-feed outage.
4. **Failures are counted alongside successes.** An adapter's health is the pair.
   230,931 ledger rows against 18.7M successes is the shape of a healthy-looking
   source with a real 217,794-document hole.
5. **`NEVER_INGESTED` never ages into `FRESH`.** No amount of elapsed time makes
   an adapter that has never run healthy.
6. **Zero new documents is not automatically an alarm, and never automatically
   fine either.** It is judged against the adapter's declared expectation.

### 3.3 Wired in

`node scripts/n2-source-freshness.mjs --strict` exits 1 if any adapter is not
`FRESH`. It exits 1 today, on `ecourts = NEVER_INGESTED`, which is the correct
answer and is why it is **not** yet proposed for CI — a gate that is red on the
day it lands teaches everyone to ignore it. It should be wired once eCourts
either runs or is explicitly declared deferred with the horizon set to match that
decision.

---

## 4. Canonical source naming — reconciled, and one contradiction resolved

R7 §15: *reconcile contradictory historical source names/maps using the canonical
source registry. Do not broaden permissions from memory.*

| source | authorised? | ingested? | rows |
| --- | --- | --- | ---: |
| AWS Open Data (HC + SC) | yes — CC-BY-4.0, Copyright Act s. 52(1)(q)(iv) | **yes** | 18,698,968 |
| India Code | yes — official government publication | **yes** | 846 acts / 35,395 sections |
| BharatLaw | **yes** — CLAUDE.md §6a, valid to 13 Nov 2029 | **no** | 0 |
| Supreme AI | **yes** — CLAUDE.md §6a, valid to 13 Nov 2029 | **no** | 0 |
| eCourts India | **yes** — §6a, plus the registrar's grant of 7 Aug 2026 to Jan 2029 | **no** | 0 |
| Supreme Today | **not the same source as Supreme AI**; licence not yet available | no | 0 |

**Three authorised sources have contributed zero rows.** Not a permissions
problem — a "never built" problem. Detailed in
`AUTHORIZED_SOURCE_DELTA_PLAN_V1`.

**One contradiction found and resolved by measurement rather than by memory.**
`docs/AUTHORIZED_SOURCE_MAP.md` and `docs/SOURCE_REGISTRY.md` both describe
Supreme Court judgments as a distinct provenance class. Measured, they are one:
every Supreme Court row's `source_url` is
`indian-supreme-court-judgments.s3.ap-south-1.amazonaws.com`, i.e. AWS Open Data.
**No Supreme Court judgment in this corpus came from anywhere else** — and, per
`COURT_REASONING_TREATMENT_ENRICHMENT_V1` §6, 92.77% of what that bucket contains
is the SCR reporter edition rather than raw court text. That second fact is a
licensing question and is in `docs/FOUNDER_QUEUE.md`; this lane does not decide
it and has not broadened anything.
