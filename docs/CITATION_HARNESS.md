# CITATION HARNESS — BINDING SPEC

The file that decides whether Lawmind survives. Read before touching retrieval,
prompts, verification or render. Spec, not guidance.

## Why
An advocate who files a document containing a case that does not exist is
humiliated in open court. They do not return, and they tell their bar
association. A single occurrence is an extinction event for a product whose whole
proposition is trustworthy citations.

In late 2024 an ITAT order cited four judgments that did not exist and was
recalled within a week. That is the failure mode. Not hypothetical.

## The mechanism

A model cannot be instructed into never hallucinating. The guarantee is
structural.

1. **Retrieve first.** Hybrid search returns chunks, each carrying `judgment_id`.
2. **Hand the model IDs.** Prompt contains chunk text AND judgment IDs. The model
   may reference judgments only by IDs present in context.
3. **Model returns structured references** — judgment IDs plus the claim each
   supports. Never prose citations.
4. **Tier 1 — internal corpus.** Resolve each ID against `judgments`.
   Resolved → `verification_state = verified`, `verified_by_source = corpus`.
5. **Tier 2 — independent cross-reference.** For anything unresolved or
   low-confidence, query IndianKanoon and cross-check against the AWS S3 open
   judgment datasets. Match on citation first, then fuzzy title with a recorded
   similarity score. **Both agree** → `verification_state = verified`,
   `verified_by_source = public_x2`. Cache permanently.
6. **Tier 3 — human confirmation via eCourts.** Where Tiers 1 and 2 disagree or
   both miss, open the eCourts search pre-filled and let the advocate solve the
   CAPTCHA. **Never bypass it** — government system, and circumventing it is
   fragile and legally reckless. Confirmed → `verification_state = verified`,
   `verified_by_source = ecourts`. Cache permanently.
7. **Tier 4 — say so plainly.** If no tier confirms, render an explicit
   `unverified` state: we found this reference but could not confirm it exists.
   **Never silently drop it. Never present it as confirmed.**
8. **Render from the database row**, never from model output. Title, citation,
   court, date come from the resolved row — not from what the model typed.
9. **Check whether the law moved.** Independently of steps 4–7, read
   `judgments.overruled_status`. This is a different question answered by a
   different source, and it runs even when verification succeeded at Tier 1.

Step 8 is most often skipped, and skipping it reintroduces the whole problem: a
model can reference a real ID and still mistype the case name beside it.

## Three concerns, not one enum

A citation carries **three independent answers**, from three different sources.
Folding them into a single state was wrong: **a judgment can be verified and
overruled at the same time.**

| Field | Values | Question | Source |
|---|---|---|---|
| `verification_state` | `verified` · `unverified` · `failed` | Does this authority exist? | Tiers 1–3 |
| `verified_by_source` | `corpus` · `public_x2` · `ecourts` · `none` | Who confirmed it? | whichever tier resolved |
| `overruled_status` | `none` · `set_aside` · `partly_set_aside` · `doubted` | Is it still good law? | `judgments`, step 9 |

`failed` means the check itself could not run — a tier was unreachable. It renders
identically to `unverified` (never as confirmed), but is separated so an outage
does not masquerade as a corpus gap in the metrics.

### The five badge states are derived

| Badge | Condition |
|---|---|
| `VERIFIED` | `verified` · `corpus` |
| `VERIFIED ×2` | `verified` · `public_x2` |
| `VERIFIED BY YOU` | `verified` · `ecourts` |
| `NOT CONFIRMED` | `unverified` or `failed` |
| `LAW MOVED` | `overruled_status != none`, **whatever the verification state** |

Render rules per state are in `design/screens/IMPLEMENTATION.md` §Badge and are a
design deliverable — do not restate geometry here.

An unverified citation may be shown. It may never be shown as confirmed, and it
may never be silently removed. `set_aside` additionally **disables add-to-matter**
— the only case where Lawmind refuses to let an authority be used.

## The harness — run before any gate

Fixed set, 30 queries with known-correct answers: criminal (10), civil (10),
BNS/BNSS mapping (5), Hindi (5).

Plus the **adversarial set** — `docs/DATASETS.md`. Drawn from real errors found
in public legal instruction datasets. Correct behaviour on every one is refusal
or an honest unverified state.

Metrics:
- **Hallucination rate** — references shown as verified that no tier confirms ÷
  total references. **Threshold 0.0%. Any failure blocks the gate.**
- **Silent-drop rate** — references removed without an unverified state shown.
  **Threshold 0.0%.**
- **Retrieval precision@5** — ≥ 0.7.
- **Overruled leakage** — a judgment with `overruled_status != none` rendered
  without the `LAW MOVED` badge. Threshold 0.
- **Adversarial pass rate** — 100%. Reproducing any known-bad output is a fail.

## Gate rule
Any change to retrieval, prompts, verification or render runs the harness and
reports every number. A regression blocks the change regardless of green tests.
Gate S2 is a hard stop on this harness.

## What the advocate on retainer checks
Numbers are necessary, not sufficient. The advocate reviews 20 outputs per gate
for a failure the harness cannot see: citations that resolve, are real, and are
simply wrong for the question. Only a lawyer catches relevance.
