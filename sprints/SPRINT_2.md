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
