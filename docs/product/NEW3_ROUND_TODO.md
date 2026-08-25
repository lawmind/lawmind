# NEW3 ROUND BOARD — Launch Convergence Sprint V2, §10

**25 August 2026.** Bound to
`LAWMIND_LAUNCH_CONVERGENCE_SPRINT_MASTER_PLAN_V2_OWNERSHIP_CORRECTED_2026-08-25.md`
§10. Supersedes `NEW3_NEXT_ROUND_TODO.md` (the 23–24 Aug board, bound to a
superseded plan).

`[x]` OBSERVED done · `[~]` partial, evidence attached · `[ ]` not started ·
`[!]` deferred, reason recorded.

**Lane:** NEW3, bound via `.agents/bus/.lane-*`. **CLIENT_APPS not acquired and
not needed — `apps/**` untouched this round.** RCC is the canonical client owner
and nothing here contends for it.

---

## NEW3-0 — acquire NEW3, do not acquire CLIENT_APPS · `[x]`

Bound. Zero writes under `apps/**`, verified by `git status`. Every code file
written this round is under `services/harness/src/new3-*`, which is this lane's
existing prefix in that directory.

## NEW3-1 — permanent 10-matter regression, specification + run · `[x]`

**The deliverable is a test, not a report.** `pnpm --filter @lawmind/harness product:ten`

| Artifact | Path |
| --- | --- |
| Spec + rubric + scored first run | `docs/product/TEN_MATTER_PRODUCT_REGRESSION_SPEC_V1.md` |
| Scenario definitions + invariants | `services/harness/src/new3-ten-matter-fixture.ts` |
| Runner | `services/harness/src/new3-ten-matter-cli.ts` |
| Raw results (retained, committed) | `docs/ai/new3/ten-matter-regression.json` |
| Per-matter checkpoint | `docs/ai/new3/ten-matter-regression.checkpoint.jsonl` |

All eight required scenarios covered, plus two: partial overruling · reporter
treatment signal · **court** treatment signal (the control for the reporter one)
· modality defect · wrong-domain retrieval · no-authority · ambiguous identifier
· normal · **fixture leak** · monitoring.

**Run: 10/10 matters, zero fixture drift.** Dense arm disabled (NEW1 owns dense
and the GPU was at 100%); premium flags left OFF; box `LOCAL_CONTENDED`.

Two P0s, both in the spec §4.2. Not `[~]` because the deliverable — a permanent,
re-runnable, artifact-retaining product test — exists and ran.

## NEW3-2 — activation funnel · `[x]`

`docs/product/ACTIVATION_FUNNEL_V2.md`. V1's finding (fully unwired, records
nothing anywhere) is **closed** — all seven steps have real call sites, verified
by reading each one. My original grep missed them because the export was renamed
to `recordStepInBackground` / `recordStepForAuthIdInBackground`.

`AUTHORITY_SAVED_TO_MATTER` is implemented as the second authority saved to a
matter and **stays labelled a hypothesis**, in LCC's code comment and in the doc.

New gap recorded, smaller than V1's: `funnel()` and `worstDropOff()` have zero
non-test consumers, so events accrue where nobody can read them. `experiments.ts`
is entirely unwired, which is currently *correct* per the plan and is stated
rather than left as an unnoticed absence.

No paywall A/B testing started. Precondition named.

## NEW3-3 — premium preview product spec · `[x]`

`docs/product/PREMIUM_PREVIEW_SPEC_V2.md`. Four states with exact copy, seven
prohibitions each with its reason, and the free/paid boundary stated as one rule:
safety facts free, synthesis paid.

**Supersedes `PREMIUM_GROWTH_SPEC_V1.md` §6**, which specified a
supporting/contrary stance split the schema cannot produce — no stance column
exists anywhere (LCC bus 1053). Made permanent: the preview may never state,
imply or tease whether an authority helps or hurts.

One addition V1 lacked, and it is a **precondition on selling rather than on
building**: no generation capability is sold until the pipeline carries a "No
sufficiently relevant authority found" state. Handed to RCC (bus 1147).

## NEW3-4 — website product specification + claim/evidence matrix · `[x]`

`docs/product/WEBSITE_PRODUCT_SPEC_V1.md` and
`docs/product/WEBSITE_CLAIM_EVIDENCE_MATRIX.md`.

**The finding that comes first: there is no website.** `apps/` holds `mobile` and
`admin`, nothing else. `lawmind.co` is verified with DNS via Spaceship and serves
nothing. RCC-7's "locate the current site" resolves to greenfield.

Competitor landing pages researched from source this round: **Jhana** (fetched —
"16M+ judgments", "India's first AI paralegal", "brute-forces research and reads
citations till correct", DPDPA/TLS badges, ₹15Cr, free tier), **Supreme Today**
(fetched — "Endorsed by Various High Court and Judicial Officers", freemium,
news-feed-heavy IA), **CaseMine** (403 to automated fetch — pricing recovered via
search, ~$149.99/mo entry, AMICUS credit tiers, **marked as second-hand**).
**None publishes a measured accuracy figure.**

Matrix: 22 rows across five sections, four statuses, every row with a verifying
owner and the exact allowed wording. 8 rows `BLOCKED`, and a §E list of eight
things with no allowed wording at all.

Positioning verified from primary source: *Pooja Ramesh Singh v. Jammu & Kashmir
Bank*, **2026 INSC 668**, 2 July 2026 — read from the judgment's own text in our
own corpus, and the spec requires quoting **para 17** rather than the SCR
headnote, for exactly the reason the matrix forbids headnote-as-court elsewhere.

Implementation handed to RCC. `apps/**` untouched.

## NEW3-5 — premium commercial decision package · `[x]`

`docs/product/PREMIUM_COMMERCIAL_DECISION_PACKAGE_V3.md`, an addendum to V2 (V2's
India economics unchanged and not restated).

**Challenged the hypothesis as the plan asks, and recorded that one of V2's own
arguments is gone** — the briefing defect V2 leaned on was fixed by LCC. The
replacement arguments are stronger and cut differently, including one that
weakens **Model A** specifically.

Measured and previously unknown: **generation cost does not exist.** All-time
`llm_calls` is 40,124 calls and **$0.1232**, entirely DeepSeek V4 Flash, **zero
calls ever to Sonnet or Haiku**, and no Hearing Pack has ever been generated. No
COGS figure printed; what would produce one is specified instead.

No price set. No model selected.

## NEW3-6 — store / release product checklist · `[x]`

`docs/product/STORE_RELEASE_CHECKLIST_V1.md`. Listing copy (short, subtitle,
full) with every line bound to a claim row; screenshots; URLs; review account;
data-safety declarations; entitlement state; a ten-item blocker table; and an
explicit launch-visible vs hidden-everywhere split.

**Three absolute submission blockers, none a code problem** — no website → no
privacy URL; no reviewer can complete magic-link sign-in and no test-account
bypass exists anywhere (grepped, zero hits); `FQ-HOSTING` means no production
binary can build.

## NEW3-7 — product QA of RCC · `[x]`

**No longer deferred — RCC handed off (bus 1137) after the first round closed.**
`docs/product/RCC_PRODUCT_QA_R1.md`, returned as bus 1167.

Read against their **working tree** (their work is uncommitted — 14 modified and
2 new files under `apps/mobile`). **No file under `apps/**` edited.**

```
PASS  1 case-number / CNR / citation entry
PASS  2 ambiguity and disambiguation
FAIL  3 degraded-search rendering
PASS  4 premium preview, flag-off (renders nothing on 404 — State D exactly)
PASS  5 safety facts stay free (better than the spec asked for)
PASS  6 no fabricated stance
FAIL  7 premium preview, empty-matter state
FAIL  8 notComputed[] dropped
PART  9 the paid promise
PART 10 reserved visual language
PART 11 counterargument abstention
—    12 website, not started
```

Their build claims **verified independently rather than taken on trust**: `tsc
--noEmit` clean, **61 suites / 620 tests passed** in 13.2 s, exactly as reported.
`DEVICE_UNVERIFIED` stands and is not counted against them.

**§3 is the one to fix first.** `DegradedArm` in the client contract is
`'sparse_timeout' | 'dense_timeout'` and does not know `sparse_unbounded` exists.
So the highest-volume failure class in Indian criminal practice renders as *"could
not finish in time"* — wrong, it is a 4 ms refusal — and offers a `Try again`
that **provably cannot succeed**, because document frequency does not change
between attempts.

**§12's stated reason was 15 minutes stale.** RCC's 1137 (04:00) said no claim
matrix or public-site source had been handed off; my 1147 (04:15) hands off
exactly that, plus the answer that there is no current site to locate.

## Re-run after LCC's provenance landing — the fixture earned its keep

LCC's 1155 landed `treatment_provenance` into production reads. Re-ran the same
command 4 hours later: **10/10, zero drift, one observation changed.**

```
M04-modality-defect   saveStatus 201 -> 409   saveRefusedCode -> AUTHORITY_SET_ASIDE
```

A real 1975 Supreme Court authority is now **refused add-to-matter**, because
excluding the modality edge leaves `EFFECT_FOR_EDGE` undefined → `review_required`
→ `refuse`. The cause is a subjunctive in a 1985 dissent, not anything about the
law. Raised with LCC (1164) and NEW2 (1165) — NEW2's contract 1.1.0, published two
hours earlier with *"REAL refusals: 0"* in every row, is stale for a reason having
nothing to do with reporter promotion.

Two further results from the re-run:

- **"Production reads it" is not "the client can render it".** The treatment row on the wire is unchanged — no provenance field — so the column now *gates behaviour* while M02 and M03 still *render identically*. `[B4]` stays BLOCKED; RCC-5 remains unbuildable.
- **The 40-second 500 on `GET /judgments/:id` did not reproduce** under a quiet box. n=1, recorded as not-reproduced rather than left standing as a P0.

## DO-NOT list · `[x]`

No generic feature ideation. No pricing by intuition — no price set. No client
file race — zero `apps/**` writes. No Hearing Pack public claim — forbidden in
the matrix §E and in the store checklist. No semantic-search overclaim — rows
A5/A6/A7 `BLOCKED` with NEW1's numbers cited. No fake scarcity — matrix §E2, and
grep confirms none exists in the codebase. No cloud purchase. No product claim
without evidence — that is the matrix's entire function.

---

## Corrections made to my own work this round

1. **M04's acceptance text.** My first draft said the modality defect blocks add-to-matter. **It does not** — OD-14 as resolved 21 Aug derives `precedentialEffect` from the edge, and an `overruled` edge maps to `addToMatter: 'allow'`. M02/M03/M04 all saved at 201. Corrected in the fixture before it could reach a report, and reported to NEW2 (bus 1143).
2. **The activation-funnel grep.** V1 reported `recordStep` unwired. That was true when written and is now false; the function was renamed, and my grep for the old name would have kept returning nothing forever. Verified by reading six call sites, not by grepping a name.
3. **The runner silently skipped five steps, twice.** Wrong key for the matter id, `undefined`, five workflow steps skipped, every executed step 200, run reported success. `matter_id_missing` is now a recorded step so no future artifact can show a pass that measured half the workflow.
4. **My own premium copy made the promise I marked RCC down for.** Reviewing their headline *"See which help and which hurt"* against the rule that the preview may never tease a help/hurt split made it obvious that my State B line — *"the review works that out"* — was the same promise one clause later. Both withdrawn; the paid promise is now **assembly, never adjudication**. Found by reviewing someone else's work, which is the argument for the review existing.
5. **The M04 position, three times.** I wrote that the modality defect blocks add-to-matter; the measurement said 201 and I corrected myself; the measurement now says 409. Wrong, then right for the wrong reason, then right by accident — and only a pinned matter re-run on one command could have shown it.

## Not done, and not claimed

- **No device testing.** No phone, no simulator, no accessibility run. Unchanged from 23 Aug and still `MOBILE_RELEASE_AUDIT_V1.md`'s standing caveat.
- **Briefing quality is UNMEASURED**, not passed — `N/A` on all ten matters because no briefing exists for a matter created seconds ago.
- **Monitoring is `ALERT_PATH_ONLY`** — endpoints answer, `alerts` holds zero rows corpus-wide, no alert observed firing.
- **Drafting not exercised**, English or Hindi.
- **`advocate_would_prefer` is blank on all ten.** It needs a practising advocate and this lane will not invent one.
- **No dense-arm numbers.** Disabled for the run and stated in the artifact itself.
- **CaseMine's landing page not read directly** — 403 to automated fetch; pricing is second-hand and marked as such.

## Bus

| seq | to | subject |
| --- | --- | --- |
| 1141 | LCC | judgment reader 500'd after 40 s · empty 200 on "anticipatory bail" by design · provenance reaches no surface · `parties` wire shape · 1111 verified closed |
| 1142 | NEW1 | IPC §394 miss is a pinned regression case · abstention is emptiness-only · `bail` at df 0.258 makes the passage build a coverage question |
| 1143 | NEW2 | three provenance classes pinned as product fixtures · Test Court leak 6→16 cumulative · my own modality claim corrected |
| 1147 | RCC | there is no website · three specs ready · four client defects |

## Founder queue

`FQ-STORE-REVIEWER-ACCOUNT` · `FQ-SITE` · `FQ-SEARCH-COVERAGE-COMMERCIAL` —
each with what was built anyway and what stays broken without it.
