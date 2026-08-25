# PRODUCT QA OF RCC's CLIENT IMPLEMENTATION — round 1

**NEW3, 25 August 2026.** Sprint plan V2 §10 NEW3-7, against RCC's handoff
(bus 1137).

**Method:** RCC's working tree read directly (their work is uncommitted —
`git status` shows 14 modified and 2 new files under `apps/mobile`), plus the
server behaviour measured through the real routes
(`docs/ai/new3/ten-matter-regression-run2.json`). **No file under `apps/**` was
edited.** CLIENT_APPS is RCC's.

Verdicts are against `PREMIUM_PREVIEW_SPEC_V2.md`,
`WEBSITE_CLAIM_EVIDENCE_MATRIX.md` and plan §9.

---

## Summary

| # | Surface | Verdict |
| --- | --- | --- |
| 1 | Case-number / CNR / citation entry | **PASS** |
| 2 | Ambiguity and disambiguation | **PASS** |
| 3 | Degraded-search rendering | **FAIL** — see §3, and it is the one to fix first |
| 4 | Premium preview — flag-off behaviour | **PASS** |
| 5 | Premium preview — safety facts free | **PASS** |
| 6 | Premium preview — no fabricated stance | **PASS** |
| 7 | Premium preview — empty-matter state | **FAIL** |
| 8 | Premium preview — `notComputed[]` | **FAIL** |
| 9 | Premium preview — the paid promise | **PARTIAL**, and my own spec is complicit |
| 10 | Premium preview — reserved visual language | **PARTIAL** |
| 11 | Counterargument abstention | **PARTIAL** |
| 12 | Website | **NOT STARTED**, and RCC's reason is now stale |

RCC's own `DEVICE_UNVERIFIED` caveat stands and is not counted against them.

---

## 1 · Case-number / CNR / citation entry — **PASS**

The search placeholder names all three routes in both languages:

```
en   Ask, or enter a CNR, case number, or citation
hi   सवाल, CNR, केस नंबर या citation डालें
```

Identifiers are sent unchanged. Measured server-side, four neutral citations
returned exactly one result at rank 1 in 4–15 ms, so the entry point and the
route behind it agree.

**One product note, not a defect:** the placeholder leads with "Ask," and claim
`[A5]`/`[A6]` block any implication that LawMind searches by legal situation.
"Ask" is a thin edge — it reads as a natural-language question, which is exactly
the thing that scores 2.2%. Recommend "Search, or enter a CNR, case number, or
citation". Not blocking; raise before any screenshot uses it.

## 2 · Ambiguity and disambiguation — **PASS**

The copy is identifier-neutral and truthful about the cap:

```
This identifier matches {total} judgments — showing {n}. Pick the one you meant,
or add a court or date to narrow it further.
```

It names the true total when the page is capped, requires a choice, and never
auto-opens rank 1. Confirmed against the server: `2023:AHC:169979` returns two
Allahabad judgments with `ambiguous: true`, both rendered.

**This is the strongest surface in the handoff** and it is the hero screenshot in
`WEBSITE_PRODUCT_SPEC_V1.md` §5. Approved as-is.

## 3 · Degraded-search rendering — **FAIL**

RCC built the right *shape* and it is genuinely good work: a degraded response
with zero results does **not** render as "no law found". It renders:

> **This search did not finish**
> One search method could not finish in time, so this is not a confirmed answer.
> Try again, or narrow the search…
> `[Try again]`

The reasoning in the comment is correct — partial results with zero shown is not
complete-no-results. **But the copy and the action are both wrong for the arm
that actually fires most.**

`apps/mobile/src/api/contract.ts:1333`:

```ts
export type DegradedArm = 'sparse_timeout' | 'dense_timeout';
```

The server's `DegradedArm` (`services/api/src/search/retrieve.ts:82`) also
carries **`sparse_unbounded`**, and the client type does not know it exists.

`sparse_unbounded` is **not a timeout.** `sparseAny` refuses to rank when its
rarest lexeme exceeds document frequency 0.05, and it refuses **in 4 ms**,
deterministically. So:

- *"could not finish in time"* misdescribes the cause — nothing ran out of time;
- **`Try again` cannot work.** Document frequency does not change between
  attempts. The advocate pays for a second full-cost query and is guaranteed the
  identical empty result.

And this is not an edge case. Measured against `lexeme_document_frequency`:

```
REFUSES  rarest df 0.06902   anticipatory bail
REFUSES  rarest df 0.25774   bail application
REFUSES  rarest df 0.11922   quashing of FIR
```

`bail` alone is in 25.77% of the corpus. **The most common failure an Indian
criminal advocate will hit shows a message that misstates the cause and offers
an action that provably cannot succeed.**

**What it should say** — the honest version is more useful, not less:

> **This search was too broad to run completely**
> Every word in it is common across millions of judgments, so LawMind could not
> rank them. This is not an answer about whether the law exists.
> Add a section, a citation, a court or a date — or search the case name if you
> know it.

with the retry replaced by a narrowing affordance. Owner: RCC for the copy and
the contract type; the arm already exists on the wire, so nothing is needed from
LCC.

## 4 · Premium preview — flag-off behaviour — **PASS**

`MatterScreen.tsx:218` — `if (!alive || !r.ok) return;` leaves `premiumPreview`
null on a 404, and the card renders only under `premiumPreview && onOpenPremiumPlans`.
So a `NOT_ENABLED` server refuses and the client shows **nothing** — no skeleton,
no disabled control, no "coming soon". That is `PREMIUM_PREVIEW_SPEC_V2.md` §2
State D exactly, and it is the single most important premium behaviour to get
right. Verified server-side: 404 on all ten matters in both runs.

## 5 · Safety facts stay free — **PASS**

`PremiumPreviewCard.tsx:43-54` renders `adverseAuthorities` **outside** the
paywalled box, with `accessibilityRole="alert"`, and states the boundary in
words: *"This remains visible without Pro."*

Saying it out loud is better than my spec asked for, and it should stay.

## 6 · No fabricated stance split — **PASS**

`stanceNotComputed` is consumed and rendered honestly: *"LawMind has not
classified which authorities help or hurt. That analysis has not been
generated."* No invented supporting/contrary counts anywhere. This closes the
`PREMIUM_GROWTH_SPEC_V1.md` §6 error at the client end.

## 7 · Empty-matter state — **FAIL**

There is no State A. A matter with nothing in it renders:

> 0 authorities saved · 0 matter events · 0 unresolved filings
> **See which help and which hurt**
> [View Pro plans]

**That is a purchase prompt for the analysis of nothing**, and it is the fake-
value failure the whole spec is built to avoid. `PREMIUM_PREVIEW_SPEC_V2.md` §2
State A requires the card to say *"Nothing saved to this matter yet"* and to
carry **no purchase CTA**.

## 8 · `notComputed[]` is dropped — **FAIL**

The server returns four named items — *issues*, *counter-positions*,
*unresolved risks*, *whether each authority helps or hurts* — each labelled
"requires generation". The card renders none of them.

That list is the honest scope statement. Without it the CTA is an unbounded
promise; with it, the advocate knows exactly what they would be buying. Spec §6
item 4.

## 9 · The paid promise — **PARTIAL**, and my own spec is complicit

RCC's headline: **"See which help and which hurt"**.

`PREMIUM_PREVIEW_SPEC_V2.md` §1.1 says the preview *"may never state, imply, or
tease whether an authority helps or hurts."* This headline is that tease in its
strongest form — it promises the outcome, not the attempt.

**But my own spec's State B copy is barely better** — *"LawMind does not store
whether an authority helps or hurts your case — the review works that out."*
"Works that out" is the same promise one clause later.

NEW1's 1093 and 1150 make both untenable: `adverse_authority` scores **zero for
every representation tested**, and held-out abstention evidence will cover 6 of 8
posed classes — `statute` and `pasted_passage` cannot be covered at all. So
neither the product nor the measurement can currently stand behind a help/hurt
determination.

**Both need to change**, and I am fixing mine rather than only marking RCC's.
The honest paid promise is about assembly, not adjudication:

> **Generate a structured matter review**
> Issues, counter-positions and unresolved risks, drawn together from what you
> have saved. LawMind will say where it could not find relevant authority rather
> than filling the gap.

## 10 · Reserved visual language — **PARTIAL**

Two collisions, both worth a design decision rather than a unilateral fix:

**a. `LAW MOVED` in neutral ink.** `PremiumPreviewCard.tsx:80` styles the
`LAW MOVED` label `color.ink` with a neutral left border. Amber `#B4690E` is
reserved *for exactly this meaning*. My spec §3 rule 6 forbids amber on a premium
**control**, and this is a safety line rather than a control — so neutral is
defensible, but it means the product's most important warning appears
under-weighted in the one place it sits next to a sales pitch. Ask the design
owner; do not guess.

**b. The dashed border on the paywall box.** `CLAUDE.md`: *"Our uncertainty
renders as neutral ink with a dashed edge."* The dashed edge is the reserved
visual for **our epistemic uncertainty**. Using it for a **commercial boundary**
makes a paywall look like a caveat, and it erodes a signal the citation harness
depends on. Recommend a different treatment for the locked box.

## 11 · Counterargument abstention — **PARTIAL**

The exact required phrase ships — *"No sufficiently relevant authority found."*
(`CounterArguments.tsx:112`), which is plan §9 RCC-4's wording verbatim. Good.

**But it is derived from `authorities.length === 0`**, not from a server signal —
because no server signal exists. Measured, both runs: `counterKeys` is exactly
`position, asOf, authorities, excluded, unverifiedReferences`. No
`reviewRequired`, no abstention field.

So the client conflates two different facts:

| Server actually | Client shows | Correct? |
| --- | --- | --- |
| found nothing (M07, M08 — 0 authorities) | "No sufficiently relevant authority found" | ✅ |
| found 12 wrong-domain authorities (M06 — IPC §394 robbery for a contract position) | 12 confident authorities, no signal | ❌ |

NEW1's 1150 commits to *"an explicit abstention outcome on the wire, distinct
from 'zero results' and distinct from 'degraded'"*. Building the state now
against a placeholder is what NEW1 advised (their 1139) and is right — **the
derivation is what must change** when the field lands, and it should be marked
in the code as provisional so it is not left inferring from a count.

## 12 · Website — **NOT STARTED**, and the stated reason is now stale

RCC's 1137: *"no canonical public-site source or claim matrix was handed off;
lawmind.co is external to this repo and required launch routes 404."*

Accurate when written (1137 at 04:00), superseded 15 minutes later. **My 1147
(04:15) hands off exactly what was missing**:

- `WEBSITE_PRODUCT_SPEC_V1.md` — 7-page IA, homepage section by section with exact copy, screenshot list with what must not be in frame, CTA, download story, premium story, acceptance criteria;
- `WEBSITE_CLAIM_EVIDENCE_MATRIX.md` — 24 rows, four statuses, verifying owner and exact allowed wording per row;
- and the answer to "locate the current site": **there is none.** `apps/` holds `mobile` and `admin`. It is greenfield, so there is no external source to locate and no `CLIENT_WEB` lease to contend for.

`lawmind.co` serving 404 is the finding, not the blocker. Recommendation
(implementation call RCC's): `apps/site`, Next.js static export — Next 14 is
already in the repo for `apps/admin`.

**This is the critical path.** Both stores reject a submission without a
reachable privacy policy URL (`STORE_RELEASE_CHECKLIST_V1.md` §4).

---

## What I am changing on my side because of this review

1. `PREMIUM_PREVIEW_SPEC_V2.md` §2 State B copy — the "works that out" promise is withdrawn for the reason in §9. My error, found by reviewing someone else's.
2. `PREMIUM_PREVIEW_SPEC_V2.md` gains an explicit statute/`pasted_passage` limit from NEW1's 1150: **do not write copy implying we can tell an advocate we checked a statutory question and found nothing** — that is one of the two classes where held-out abstention evidence will not exist.

## Ranked for RCC

1. **§3** — the degraded copy and `DegradedArm` type. Highest-volume failure in the market, and the offered action cannot work.
2. **§12** — the website. Critical path to any store submission.
3. **§7** and **§8** — State A, and render `notComputed[]`. Both small.
4. **§9** — the headline, once I have republished the spec copy.
5. **§10** — two design questions for the design owner.
6. **§11** — mark the abstention derivation provisional; change it when NEW1's field lands.
