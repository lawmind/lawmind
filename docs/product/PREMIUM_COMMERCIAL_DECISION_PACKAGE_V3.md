# Premium commercial decision package — V3

**NEW3, 25 August 2026.** Sprint plan V2 §10 NEW3-5.

**This is an addendum to `PREMIUM_COMMERCIAL_DECISION_PACKAGE_V2.md`, not a
replacement.** V2's India economics (RevenueCat D35 IN/SEA 1.4% vs NA 2.6%; UPI
Autopay 8–15% mandate failure vs 2–3% cards; Google Play India stays at
15%/30% until 30 Sep 2027) are unchanged and are not restated. V2's Model A/B/C
comparison stands.

What V3 adds is this round's evidence, **including one piece that argues against
V2's own conclusion**, and one number nobody had measured.

**This document still does not select a model and still does not set a price.**

---

## 1 · The argument V2 made that no longer holds

V2 argued against Model B (subscription + Hearing Pack credit) partly on a
**specific, reproduced, named defect**: the briefing's authority block read the
wrong table and told an advocate who had saved an authority that they had saved
nothing.

**That is closed.** LCC fixed it same-round (bus 1078) and found it was three
defects wider than the walkthrough alone showed — `judgments/annotations.ts`,
`documents/route.ts` and `arguments/counter.ts` were all running the pre-OD-14
rule, and `blocks.checklist` was served from a stored blob while `authorities[]`
beside it was read live. All four now share `treatment-lookup.ts`, and the fix
has a regression fixture proven to FAIL under deliberately restored pre-OD-14
semantics.

So one of V2's two arguments against Model B has been removed by engineering.
Recording that plainly, because the alternative is quietly keeping a conclusion
after its reason has gone.

## 2 · The argument that replaces it, and it is stronger

Two findings from the 10-matter regression
(`TEN_MATTER_PRODUCT_REGRESSION_SPEC_V1.md`, raw artifact retained):

**2.1 `/arguments/counter` has no abstention signal, and it returns wrong-domain
authorities confidently.** `counterKeys` is exactly `position, asOf, authorities,
excluded, unverifiedReferences`. A commercial breach-of-contract position
returned an IPC §394 robbery conviction at rank 1 — **reproduced deterministically
two days running**. NEW1: `adverse_authority` and `statute` concept classes score
zero for every representation tested.

A Hearing Pack is a synthesis over exactly this retrieval. Sold, it would
confidently assemble a matter review from wrong-domain authorities — and an
advocate who **paid** for it has more reason to trust it, not less. That is a
worse failure than the free version of the same defect.

**2.2 The commonest query class in the market has one working arm, and its
coverage is 0.21%.** `retrieve.ts` refuses to rank when its rarest lexeme exceeds
df 0.05. Measured: `anticipatory bail` 0.069, `bail application` 0.258,
`quashing of FIR` 0.119 — all refused. `bail` alone is in 25.77% of the corpus.
For that class dense is the only remaining arm, and it reaches 40,161 judgments
of 18.7 million.

**This is the finding that bears on Model A, not just Model B**, and V2 did not
have it. A subscription's revenue durability rests on the daily loop, and the
daily loop is search. If a criminal advocate's most common search returns an
empty result whenever the embedder is cold, D35 retention is not a pricing
question — it is a product question wearing a pricing question's clothes.

**Neither of these is an argument for a different model. Both are arguments that
the readiness gate, not the model choice, is the live decision.**

## 3 · The number nobody had measured: generation cost is unmeasured

The plan lists "generation cost" as an input. It does not exist yet. From
`llm_calls`, all-time:

| model | calls | measured cost |
| --- | ---: | ---: |
| `deepseek-v4-flash-0731` | 39,492 | $0.0000 |
| `deepseek-v4-flash` | 486 | $0.0003 |
| `deepseek/deepseek-chat` | 138 | $0.1228 |
| `deepseek/deepseek-v4-flash` | 8 | $0.0001 |
| **total** | **40,124** | **$0.1232** |

**Zero calls to Claude Sonnet 4.6 or Haiku 4.5 have ever been made.** Every
model call in this product's history is DeepSeek V4 Flash on the free pool, plus
138 paid calls totalling twelve cents.

Drafting and briefings route to Sonnet by `CLAUDE.md` §5, and **no Hearing Pack
has ever been generated**. So the unit cost of the thing Model B would sell is a
projection from list prices, not a measurement, and this package will not print a
COGS figure it cannot source.

**What would produce the number:** generate ten Hearing Packs on the ten
regression matters through the real routed path, and read `llm_calls`. That is
cheap, bounded, and it is the single most useful commercial measurement available
— it turns the margin on Model B from an assumption into an observation. It is
blocked only on `premium_generation_jobs` being enabled locally and on §2's
readiness question being acceptable for an internal-only run.

## 4 · Where this leaves the hypothesis

The plan's standing hypothesis: *subscription first; keep the Hearing Pack credit
architecture; do not activate the credit until the Hearing Pack proves
exceptional value.*

**Still supported, and for a partly different reason than V2 gave.** V2's reason
(a named briefing defect) is gone. The replacement reasons are stronger and they
are about retrieval rather than about assembly:

| | Model A — subscription only | Model B — subscription + credit | Model C — one-off only |
| --- | --- | --- | --- |
| Depends on Hearing Pack quality | no | **yes** | **yes** |
| Depends on §2.1 abstention landing | no | **yes** | **yes** |
| Depends on §2.2 search coverage | **yes** (retention) | yes | less — a one-off buyer judges one artifact |
| Depends on UPI Autopay reliability | yes | **yes, twice** | no |
| Unit cost known | n/a | **no** (§3) | **no** (§3) |
| Revenue durability under India D35 1.4% | weakest | mixed | strongest per-transaction, no compounding |

**The honest challenge to the hypothesis**, since the plan asks for one: §2.2
weakens Model A specifically. A subscription is a bet on habit, habit is the
daily loop, and the daily loop's commonest query currently depends on an index
covering 0.21% of the corpus. Model C — charge per artifact, no retention
promise — is the model least exposed to that, and V2 dismissed it partly on
grounds §1 has now removed.

**It is still not the recommendation**, for one reason V2 got right and this
round did not change: Model C makes every rupee depend on a generated artifact,
and §2.1 says the generation is not yet safe to charge for. Model C trades a
retention risk we can measure for a correctness risk we cannot yet bound.

**So: subscription first stands, and the reason to revisit it is now named and
measurable** — NEW1's passage build clearing whatever bar the founder sets, and
an abstention state landing on `/arguments/counter`.

## 5 · Founder decisions this package asks for

1. **Fund the passage build, or accept the search gap as a launch condition.** ~6 GPU-days, ~18 GPU-days for the full build (NEW1 bus 1088), 2.2% → 37.8% on posed advocate questions. §2.2 makes this a commercial decision, not only a research one.
2. **Permit ten internal Hearing Pack generations** so §3's unit cost becomes a measurement. Nothing is sold; nothing is shown to a user.
3. **Price and model remain unset**, per PD-13, and this document does not move them.

## 6 · What this document does not do

- Does not set a price or select a model.
- Does not activate the credit ledger; flags stay OFF.
- Does not restate V2's India economics — read V2 for those and their sources.
- Does not print a COGS figure. §3 explains why, and what would fix it.
- Does not treat NEW1's 37.8% as a product number; it is a retrieval ceiling on a benchmark, and the product number does not exist yet.
