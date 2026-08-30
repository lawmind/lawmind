# NEW3 R13 — PRODUCT DEFINITION AMENDMENTS

**NEW3, 30 August 2026. Sprint 2, light product/contract round.**
**Amends — does not replace —** `NEW3_V1_PRODUCT_DEFINITION_R12.md` (frozen, 29 Aug)
and `V1_CAPABILITY_REGISTRY_R12.json` (frozen, 29 Aug).

**R12 is historical evidence and is not rewritten.** Where R12 and this file
disagree, this file states the current product truth and R12 states what was true
on 29 August. Both stay readable, which is the only way an audit can see that a
state moved rather than that it was always this way.

**Everything below was measured against `gitSha f3b31c963dd19741b7a849d8a007d42aa1b9bfb1`** —
the HEAD sealed by LCC's Day-0 integration seal (bus 1567, `2b378f7`) — on the live
local API at `http://127.0.0.1:3011` and the live local database.

---

## AMENDMENT 1 · `ECOURTS_DAILY_PILOT` is `DISABLED_NOT_READY`

**Supersedes:** `NEW3_V1_PRODUCT_DEFINITION_R12.md:271`, the `ECOURTS_DAILY_PILOT`
row, which reads `DISABLED_EXTERNAL_BLOCK` on the ground that
`CAPTCHA_OPERATIONAL_BASIS = NONE_RECORDED`.

> **`ECOURTS_DAILY_PILOT` = `DISABLED_NOT_READY`.**
> **`CAPTCHA_OPERATIONAL_BASIS` = `RETRACTED_AS_INVENTED_REQUIREMENT`.**

**The block is ours, not external.** LCC raised the operational-basis requirement
in bus 1521–1525 and withdrew it in 1544: *"No document in this repository ever
required an operational basis. I invented it."* `CLAUDE.md` §6a states the
conditions on the authorised bypass **exhaustively**, and there are three — the
grant is non-null and unexpired; the code lives only in
`services/api/src/court/ecourts.ts`; every request writes the fetch ledger and
passes the rate limiter. All three are already enforced.

**What this does NOT mean, stated because this is exactly the row where a reader
will over-read:**

- **`AUTHORIZATION_REOPENED = no`.** eCourts authorization is SETTLED (`CLAUDE.md`
  §6a, founder decision 29 Aug 2026). Nothing here reopens, broadens, narrows or
  reinterprets it. The SCI question is untouched: `SCI_AUTHORISATION_STATE = UNCHANGED`.
- **Monitoring does not move.** `USER_MONITORING_PRODUCT` stays
  `DISABLED_NOT_READY` and still fails gates 2, 3 and 4 — the observation writer,
  measured capacity, measured retention. It would still fail them if the CAPTCHA
  question vanished entirely. R12 said this in advance and it holds.
- **Internal acquisition success is not product enablement.** If LCC lands a
  working cause-list pipeline tomorrow, `ecourts.daily_pilot` improves and the
  user-facing monitoring capability does not. They are different rows for a reason.

**No other row in the product definition changes as a consequence** — R12's own
text pre-authorised exactly this transformation and said so.

### The state, re-measured directly rather than carried forward

| | R12 recorded (29 Aug) | **NEW3 measured 30 Aug** |
|---|---|---|
| `ecourts_observation` | 0 rows | **0 rows** — unchanged, and the only number that matters |
| `ecourts_fetch_ledger` | 131 rows | **198 rows** |
| `platform_config.ecourts_harvest` | **OFF** | **ON** — enabled `true`, flipped `2026-08-29T17:33:52Z` |
| flipped by | — | `3d37f77f-23f3-4eb0-b34f-d1700ec652a5`, the durable eCourts audit actor, with a reason recorded |
| `POST /court/lookup` | `available:false, no_adapter_implemented` | unchanged |

**Two numbers in R12 are stale and one of them matters.** The harvest switch is
**ON**, not OFF. That is correct and audited — it was flipped through the audited
kill-switch path with a reason — but a product document recording a live harvest
switch as OFF is the kind of error that makes a registrar audit go badly. It is
corrected here.

**36 retained raw responses, 198 ledger rows, and zero observations.** The
instrumentation around the pipeline is real; the pipeline has still never produced
one usable observation. `ecourts_observation = 0` remains the only eCourts number
that means anything.

---

## AMENDMENT 2 · Both v1 search gaps have moved, and neither closed cleanly

**Supersedes:** the `search.party_name_only` and `search.filtered_broad_query`
rows in `V1_CAPABILITY_REGISTRY_R12.json`, both `DISABLED_NOT_READY` with
coverage `MEASURED ZERO`, and the two "Known v1 limits" bullets in
`RCC_V1_API_CONTRACT_R12.md`.

**Backend dependency, and it landed:** `d96147e fix(search): the admission bound
was asking about the word, not the population` — an ancestor of HEAD, with LCC's
own before/after measurements and two new test files. **This is why the rerun was
run at all.** Section 6 of this round's brief forbids relabelling an acceptance
case PASS before its backend dependency lands, and forbids rerunning the full
suite once it has. Four cases were rerun: the two affected, plus the two required
controls.

### AB-1 · party-name search — `ENABLED_V1`, **PASS_WITH_LIMIT**

| probe (both verbatim from the R12 row) | R12 | **30 Aug** |
|---|---|---|
| `SATENDER KUMAR ANTIL` | 0 results, `sparse_timeout` | **3 results, authority at rank 1, 295.6 ms**, `degraded` absent |
| `SANJAY KUMAR MISHRA @ SANJAY MISHRA` | 0 results, `rarestDf 0.0654` | **0 results**, `rarestDf 0.0654`, **1,239.2 ms** |

**Half the baseline moved and half did not, so the verdict is `PASS_WITH_LIMIT`
and not `PASS`.** The remaining limit is not an edge case: Indian personal names
are frequent in this corpus *because* they are party names, so a query built only
of common name tokens still refuses — and pays 1.2 s to do it.

The three rows returned for `SATENDER KUMAR ANTIL` are near-duplicate records of
**one** case, not three judgments. RCC observed the same thing independently
(bus 1557) and correctly reported rather than edited a NEW3 row.

### AB-2 · broad term inside a filter — `ENABLED_V1`, **PASS_WITH_LIMIT**

One query, `bail`, across six narrowing scopes:

| scope | 30 Aug |
|---|---|
| one named court + **3 days** | **5 results, 154.6 ms** |
| one named court + **1 month** | **5 results, 418.1 ms** |
| one named court + 8 months | refused |
| `courts:["hc"]` + 1 month | refused, 262.6 ms |
| `courts:["hc"]` + 29 days | refused, 207.4 ms |
| unfiltered | refused, 2.9 ms |

**Narrowing now buys admission — if it narrows enough.** R12 recorded a flat
refusal for the narrowed case and that is no longer true.

**The limit, and it is the one a product person must carry:** a court **category**
is not narrowing. `courts:["hc"]` expands to every High Court, a population of
millions, and is still refused. `filters.court` with one name is narrowing. So the
refusal screen must offer **a single court and a shorter date range** and must not
present a category chip as the remedy, because it is not one.

### The defect this rerun found on the way past

`retrievalOutcome.rarestDf` reads **`0.25773984261292154` in all six scopes** —
seventeen significant figures, identical in the four that refuse **and in the two
that answer**. It is a corpus-wide document frequency and it is not the bound that
governed the request. The frozen contract documented it only as *"number, present
whether or not it refused"*, which leaves a client author free to read it as
scoped.

Nothing user-facing is wrong today because RCC has not shipped a hint derived from
it. Raised as **`CCR-2026-08-30-02`**, decided **AMEND** (semantic only — no
schema change, `contract` stays `1`), and released to RCC.

---

## AMENDMENT 3 · The registry is now per platform, and one platform is contested

`V1_CAPABILITY_REGISTRY_R13.json` supersedes R12. Every one of the 30 rows carries
`platforms: {ios, android, web}`, an `evidenceState` and a `currentContractVersion`.
**18 rows are ENABLED on at least one platform and 0 of them lack named,
on-disk evidence.**

Two things this makes possible that R12 could not:

1. **The iOS party-search kill switch is representable.** `search.party_name_only`
   reads `ENABLED_V1_KILLABLE` on iOS and `ENABLED_V1` on Android, and its row
   names the four capabilities the switch **must not** disable —
   `search.exact_citation`, `search.cnr`, `search.case_number`,
   `search.case_title_full`. A citation is not a person; Apple's 5.1.1(viii) is
   about compiling personal information.
2. **Roadmap v7.1 rule 15 becomes enforceable.** "No claim on any surface the
   capability registry does not mark ENABLED — *per platform*" was unenforceable
   against a registry with no platform column.

> **The switch is BUILD-TIME today.** `GET /release/capabilities` was observed on
> 30 August: `{registryVersion, asOf, capabilities}`, 24 rows, and the string
> `platform` appears **nowhere** in the payload. The served form is
> `CCR-2026-08-30-04`, AMENDed, handed to LCC, and **not released to RCC**. Until
> it lands, disabling party search on iOS requires an App Store release — which is
> the situation a kill switch exists to avoid, and is worth LCC's afternoon.

### `web` is `UNKNOWN_PENDING_FOUNDER` on every row, and that is not a placeholder

Two binding documents disagree about whether a web/desktop advocate surface exists
at all:

- **`PRODUCT_DECISIONS.md` PD-15 was REVERSED on 12 August 2026 by direct founder
  direction**, quoted verbatim in that file: *"This is only an app, we do not plan
  for a desktop, or a website login for users. The website login is only for the
  admin panel."* `CLAUDE.md` §1 carries the reversal.
- **Master Roadmap v7.1, dated 30 August 2026**, states in §4 *"Desktop = research
  workstation"*, schedules *"desktop shell on the same API"* for 14 September, and
  *"Desktop usable by 9 Oct"* in Sprint 5.

**NEW3 did not resolve this and will not.** It is a founder product-surface call
between two authoritative statements of intent, and no measurement can settle it —
that is what makes it founder-only rather than evidence-settleable. Raised as
**`FQ-WEB-SURFACE`** in `docs/FOUNDER_QUEUE.md`.

**The consequence is a schedule, not a document.** Sprint 5 carries *"Desktop
usable by 9 Oct"* nine days before candidate freeze, against a surface the founder
cancelled. If the reversal stands, that line comes out of the plan and the effort
goes to the phone. If v7.1 supersedes the reversal, PD-15 needs re-settling and the
capability registry gains a third real platform. Either answer is cheap now.

**Until then:** no claim is made about any capability on a web surface **in either
direction**, and no work is scheduled against one. The admin console
(`apps/admin`) is untouched — it was never in question.

---

## AMENDMENT 4 · Firm-ready Workspace ownership — `VERIFIED_UNCHANGED`

Gate B requires the firm-ready Workspace model to remain frozen. It is, and it is
now also *implemented* — which is a stronger statement than "unchanged" and is
worth separating from it.

`NEW3_V1_PRODUCT_DEFINITION_R12.md` §8 froze: `User` · `Workspace` ·
`WorkspaceMember` · `Matter` · `SavedAuthority` · `MonitoringEntitlement`;
personal workspace automatic; **ownership resolves through `Workspace`, never
directly through `User`**; court observations are not user-owned.

LCC implemented it in `7b570b7` (migrations 0097–0099) **to the frozen model, with
no semantic redefinition**, and RCC's contract gained no field. Verified against
the live database, 30 August:

| check | measured |
|---|---|
| `workspaces` | **542** |
| `workspace_members` | **542** |
| `matters` with `workspace_id IS NULL` | **0** |
| `monitoring_entitlements` | **0 rows** — frozen and unused, as specified |
| `ecourts_observation` columns matching `%workspace%` | **0** — a fact about a court, not about a user |

`FIRM_READY_WORKSPACE_OWNER = NEW3` (product definition) · `LCC` (schema).
`FIRM_READY_FREEZE_STATE = VERIFIED_UNCHANGED`. **No second lane has independently
redefined Workspace semantics.** Not redesigned in this round, and this round is
not the place to.

---

## WHAT THIS ROUND DELIBERATELY DID NOT TOUCH

- **The eight ten-matter acceptance cases whose backend did not change.** Their
  R12 verdicts stand. Rerunning them would have spent fixture writes on
  append-only tables to re-observe an unchanged result.
- **Monitoring.** No state moved, no gate closed, and the 8 September decision is
  prepared, not taken.
- **Broad semantic search.** `search.semantic.broad` stays
  `INTERNAL_EXPERIMENTAL` on every platform. A working client-reachable
  implementation is not evidence of a shippable capability.
- **Workspace design.** Verified, not redesigned.
- **The launch date.** 23 October under either shape.
