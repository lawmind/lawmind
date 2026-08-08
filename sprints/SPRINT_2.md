# SPRINT 2 — VERIFICATION 🛑 HARD STOP

**This is the sprint the product lives or dies on.** `BUILD_GUIDE.md` names it as
the instruction most likely to be rationalised away under schedule pressure. Do
not proceed to S3 on a failing harness.

**Read first, both lanes:** `docs/CITATION_HARNESS.md` **in full** — it is binding
spec, not guidance · `docs/DATASETS.md` §Adversarial · `PRODUCT_BRIEF.md` §The one
rule above all others.

---

## LCC

**OWN:** `services/api/**`, `packages/verification/**`, `services/harness/**`

**BLOCK ON:** nothing. S1 must be green.

**TASK**

1. **The three-tier pipeline**, exactly as specified:
   - Retrieve first. **Hand the model judgment IDs only** — never let it emit a
     citation from memory
   - Model returns **structured references**: judgment IDs plus the claim each
     supports. Never prose citations
   - **Tier 1** — resolve each ID against `judgments` → `verified` / `corpus`
   - **Tier 2** — IndianKanoon **and** AWS S3 datasets. **Both must agree** →
     `verified` / `public_x2`. Cache permanently
   - **Tier 3** — eCourts, human-confirmed. **Never bypass the CAPTCHA** —
     government system, and circumventing it is fragile and legally reckless →
     `verified` / `ecourts`. Cache permanently
   - **Tier 4** — no tier confirms → explicit `unverified`. **Never silently
     drop. Never present as confirmed**
   - **Render from the database row**, never from model output. This is the step
     most often skipped, and skipping it reintroduces the whole problem: a model
     can reference a real ID and still mistype the case name beside it
   - **Step 9** — read `overruled_status` **live**, independently, even when
     Tier 1 succeeded
2. **`citation_checks` and `verification_cache`.** One `citation_checks` row per
   citation per surface, carrying `overruled_status_shown` and `surface`.
   **Overruledness is never cached** — it changes when a later judgment moves the
   law, so a permanent cache goes stale silently.
3. **The harness.** 30 fixed queries — 10 criminal, 10 civil, 5 BNS/BNSS/BSA
   mapping, **5 Hindi** — with known-correct answers.
4. **The adversarial set**, built from the five documented `nisaar` errors
   (`docs/DATASETS.md`): bail application for a civil employment matter · the
   dissent in a unanimous judgment · *Indra Sawhney* stated backwards · IP-law
   implications of a labour judgment · a criminal question with no date given.
   **Correct behaviour is refusal or an honest unverified state.**
5. **Metrics, all reported every run:** hallucination rate · silent-drop rate ·
   **stale-overruled rate** · overruled leakage · precision@5 · adversarial pass.

**DONE**
- **Hallucination rate 0.0%**
- **Silent-drop rate 0.0%**
- **Stale-overruled rate 0.0%**
- Overruled leakage 0 · precision@5 ≥ 0.7 · **adversarial pass 100%**
- Every number reported, not just the failures

**NEVER**
- Bypass the eCourts CAPTCHA
- Cache `overruled_status`
- Let a citation render without all three fields present in the payload
- Weaken a threshold to pass a gate. **All five are zero or absolute**

---

### FIRST REAL RUN — 8 Aug 2026 · GATE S2 FAILED

`pnpm harness`, against the production corpus (38,341 judgments · 616,197
embedded chunks · 44,785 resolved citation edges · 22 overruled).

| metric | threshold | measured | |
| --- | --- | --- | --- |
| hallucinationRate   | ≤ 0    | **not measured** | FAIL |
| silentDropRate      | ≤ 0    | **not measured** | FAIL |
| staleOverruledRate  | ≤ 0    | 0.0%             | pass |
| overruledLeakage    | ≤ 0    | 0                | pass |
| successAt5          | ≥ 0.70 | **0.240**        | FAIL |
| adversarialPassRate | = 1    | **not measured** | FAIL |
| querySetComplete    | 30     | 25               | FAIL |

Diagnostics, ungraded: mean precision@5 4.8% · **recall@20 44.0%** · MRR 0.239 ·
DRM 95.2%.

**Four findings, and none of them is "the retriever needs tuning".**

**1 · precision@5 ≥ 0.7 was arithmetically unreachable.** Ground truth comes from
a citation edge, so each query has exactly ONE gold judgment, and mean precision@5
over single-gold queries has a ceiling of 1/5 = 0.20. Every successful query in
the first run scored exactly 0.20, which is the tell. The threshold now attaches
to **success@5** — the share of queries whose gold answer appears in the top five
— which is the standard single-gold measure and the thing an advocate
experiences. **0.7 is untouched and nothing passes that did not pass before**:
the number moves 4.8% → 24.0% and fails either way. Mean precision@5 is still
computed and printed every run so the correction cannot hide a regression. Full
reasoning in `services/harness/src/metrics.ts` §THE CORRECTION.

**2 · The sparse half of hybrid search was contributing one candidate.**
`plainto_tsquery` ANDs every lexeme; a 900-character query therefore matched
**1 judgment out of 38,341**, and Reciprocal Rank Fusion cannot rank what it was
not given. Nothing failed — search answered from the dense half alone and looked
healthy. The same trap sits under ordinary queries, just shallower: *"bail
anticipatory NDPS commercial quantity twin conditions section 37"* requires every
one of those words in one judgment. `sparse()` now falls back to an OR pass when
AND returns almost nothing, and `ts_rank` discriminates within the wider set.
This was found by the harness on its first run, which is the harness working.

**3 · The gap is two different problems, not one.** recall@20 is 44% against
success@5 of 24%. So **20 points sit in the 6–20 band — a reranking problem**,
recoverable by a cross-encoder over candidates we already retrieve. The other 56%
never appear at all — a **recall** problem, which reranking cannot touch and which
late chunking, summary-augmented chunking (DRM is 95.2%) and citation-graph
re-scoring address. Two workstreams, measured separately, against this baseline.

**4 · Three metrics cannot be measured at all**, because the generation path
needs a model key this deployment does not have. They are reported as NOT
MEASURED and graded as failures. That is correct and not a placeholder: a
citation gate that has never asked a model to produce a citation has not tested
the thing it exists to test. `docs/FOUNDER_QUEUE.md`.

Per A4.3 and the NEVER list above: **the failure is the finding.** No threshold
was moved and Workstream D does not start.

Zero Hindi judgments exist in the corpus (`language = 'hi'` on 0 of 38,341), so
the five Hindi queries are Hindi questions against the English corpus — which is
the case that actually occurs, since every Supreme Court judgment is delivered in
English. They measure cross-lingual retrieval and are labelled as such.
`services/harness/src/fixtures/queries.hand.json`.

---

## RCC

**OWN:** `apps/mobile/**`

**BLOCK ON:** nothing. Mock from the contract.

**TASK — the inverted trust UI**

This is the delicate one. Read `docs/CITATION_HARNESS.md` §Rendering before
writing a component.

1. **Verified renders nothing.** No badge, no chip, no tick. On a five-result list
   that is **zero marks instead of five**. Verification is the expected state;
   decorating it is noise, and decorating it everywhere is what made the product
   read as defensive about the thing it should be most confident about.
2. **Two marks render, and only two:**
   - `unverified` / `failed` — **dashed** mark, `NOT CONFIRMED`, border `#8A8578`,
     label `#5A6478`. Never red, never an alert triangle, never the word "failed"
     — those say *the product is broken*. Dashed neutral ink says *open, nothing
     was impressed here*
   - `overruled_status != none` — solid, white fill, `LAW MOVED`, `#B4690E` /
     text `#8A5109`, on the amber card wash `#FBF0DF`. Three sub-states:
     `set_aside` (danger band, **add-to-matter disabled**) · `partly_set_aside`
     (caution band naming the paragraphs, "what still stands" first) · `doubted`
     (**no band at all**, one muted line)
   - Geometry unchanged: rectangle, radius 2px, **1.5px** border, JetBrains Mono
     600 at 10px / 0.06em, 20px tall at 1x
3. **Unverified citation detail screen** — canvas `10i`,
   `design/screens/renders/49-unverified-citation@2x.png`. What we found, why we
   could not confirm it, each source checked with a result and a timestamp, and
   the **eCourts path** spelled out.
4. **Where verification stays visible — three places, all pull not push:**
   draft footer ("4 of 4 citations verified", in-app only) · **on tap**, showing
   how and by which source · admin citation monitor, unchanged.

**DONE**
- A verified result renders **no mark** — assert the absence in a test, so a
  regression that reintroduces badges is caught
- Unverified is unmissable and offers the eCourts path
- All three overruled sub-states render correctly, and `set_aside` **disables**
  add-to-matter
- The two marks are distinguishable **in greyscale** — dashed edge vs filled
  block (`design/screens/renders/43-badge-greyscale.png`)

**NEVER**
- Reintroduce a verified badge because a screen "looks empty". It is supposed to
- Let silence stand for removal. An unverified citation is **always** shown and
  **always** marked

---

## GATE S2 — HARD STOP
Zero unverified shown as confirmed · zero silent drops · 100% adversarial pass ·
**advocate sign-off**.

The advocate reviews **20 outputs** for the failure the harness cannot see:
citations that resolve, are real, and are simply **wrong for the question**. Only
a lawyer catches relevance. Per `PID.md` they can block this gate and engineering
cannot overrule it.
