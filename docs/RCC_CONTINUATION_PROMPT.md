# RCC — CLIENT LANE · CONTINUATION PROMPT

**Written 11 August 2026 by LCC.** Paste this whole file into a new RCC session.

---

## 0 · WHO YOU ARE AND WHAT YOU MAY TOUCH

You are **RCC, the client lane**. You write **only** `apps/**`.

**LCC owns `services/**`, `packages/**`, `packages/db/drizzle/*.sql`, root
config, CI, scripts, `docs/**`.** Never write there. We work the same tree in
separate sessions.

**Read before any work:** `PRODUCT_BRIEF.md` → `.ai/README.md` →
`docs/OPEN_DECISIONS.md` → `PRODUCT_DECISIONS.md` → **`docs/CURRENT_PLAN.md` §Q**
→ `docs/SCHEMA_TRUTH.md` → `docs/CITATION_HARNESS.md` → `docs/API_CONTRACTS.md`.

**Work continuously.** Emitting prose ends your turn. A key, an account, money or
a founder-only decision goes to `docs/FOUNDER_QUEUE.md` — but **that file is
LCC's lane**, so hand the entry to LCC or to the founder rather than editing it.

---

## 1 · YOUR AUDIT WAS RIGHT. ALL OF IT. INDEPENDENTLY VERIFIED.

**This section exists because you were right and the record should say so
plainly.** LCC re-ran every check against the live system rather than taking the
report at face value — which is the correct treatment in both directions.

| your claim | LCC's independent check | verdict |
| --- | --- | --- |
| production is 42 commits behind | `git rev-list --left-right --count origin/main...main` → **`0 43`** (43 now; LCC added one commit after you looked). `origin/main` = `7bbde78`, 9 Aug 12:24 | **CONFIRMED** |
| `cite:"(1994) 3 SCC 1"` returns the wrong case | production returns **KAUSHAL KISHOR versus STATE OF UTTAR PRADESH**, not S.R. Bommai | **CONFIRMED** |
| no `parsed`/`total` in the response | top-level keys are `results, unverifiedReferences, searchId` only | **CONFIRMED** |
| `GET /me/training-consent` 404s | **404**, while `GET /me/alert-settings` returns **401** on the same unauthenticated call | **CONFIRMED — and the 401 is what proves it.** A 401 means deployed-and-auth-rejected; a 404 means absent. The pair is the evidence, not the 404 alone |
| `SearchResult` is missing `operativeParagraphNumber` and `asOf` | the deployed response **already carries both** on every result | **CONFIRMED — server sends them, the client type omits them.** Yours to fix |

**You also found the thing LCC's own verification missed**, and it is worth
naming: LCC verified "landed" against the **repository and the database**. The
database *is* production and those row counts are real. **The API serving
requests is 43 commits old.** Repo + DB ≠ deployed. `CURRENT_PLAN.md` §Q0 and
§Q1.0 now record that correction.

**One escalation beyond a deploy gap.** In production today, an advocate typing
an exact citation gets **a different case returned as an ordinary result** with
nothing saying the query was not understood. That is exactly what A2.7 —
*"structure decides, semantics fills, never blended; zero structured matches
returns zero"* — was written to prevent. Nothing is fabricated; every row is a
real judgment. But a wrong-but-plausible result reads as *"these are the cases"*,
and that is the whole reason the rule exists.

**You were also right not to push.** It is outward-facing and shared. It sits
with the founder, with the evidence assembled in `CURRENT_PLAN.md` §Q1.0.

---

## 2 · WHAT YOU BUILT, AND THE ONE THING TO RE-CHECK

Accepted as described, no rework requested:

- **`settings.unavailable`** — a named row rendering as not-yet-working with no
  Switch, driven by `settings.unavailable.includes(key)`. **The synthetic-key
  test is the right instinct**: it proves the client is not keyed to the two
  literal names, so a shipped producer reverts the row with no client change.
- **`ecourts_bulk`** — added to the union and the label map as *"eCourts
  record"*, with a test asserting it never equals `ecourts`'s label and never
  matches *"you confirmed"*. **Correct and load-bearing**: a machine may not wear
  a human's badge.
- **Your finding that `renderState.ts` never branches on `verifiedBySource`** —
  so degrade-to-silent held **by construction** rather than by a new branch. That
  is a better answer than the one asked for, and recording it in a comment was
  right.
- **`TrainingConsentScreen`** — three distinct states, `currentVersion` echoed
  from the server rather than a client constant, one-tap withdrawal with no
  confirmation dialog per DPDP s.6(4)–(6).

**Re-check one thing.** LCC could not verify from here that the **PD-8 onboarding
consent** and the **training consent** cannot be confused by a user — separate
screens is necessary, not sufficient. Confirm the copy on each names *which*
consent it is, and that withdrawing training consent visibly does **not** revoke
terms acceptance.

---

## 3 · YOUR QUEUE, IN ORDER

### R1 · `SearchResult` — add `operativeParagraphNumber` and `asOf` · DO THIS FIRST

Additive, safe, and **LCC has verified the server already sends both on every
result** — confirmed against the deployed API, not just the repo. Nothing blocks
it and it needs no deploy.

`DONE:` both fields on the `SearchResult` type and rendered where they belong.
`VERIFY:` `tsc --noEmit` clean; a test asserts a result carrying both.

**`asOf` matters more than it looks.** It is the *"last checked"* instant behind
`overruled_status`, and `CLAUDE.md` is absolute that good-law status is never
cached and is read live at render. **Offline-first, when it lands, must render
"last checked 08:14" and never silently as good law.** Wiring `asOf` now is what
makes that possible later.

### R2 · Structured search UI — UNBLOCKED, and the contract is frozen

`docs/API_CONTRACTS.md` documents it and the contract is frozen for this sprint,
so **you are not waiting on LCC**. Build against the contract; the deploy gap
changes *when it works against production*, not whether you can build it.

**The two rules that are not cosmetic:**

1. **`parsed` must be shown to the advocate, always.** It is the plain-English
   echo of how the query was interpreted. **A misparse produces *results*, not an
   error** — so stating the interpretation and letting the advocate check it is
   the only defence. It is a correctness feature wearing a UI hat.
2. **Zero structured matches renders as ZERO.** Not "here are some related
   cases". `judge:"Chandrachud"` returning another judge's judgment is the exact
   harm A2.7 exists to prevent. Semantic suggestions, if shown at all, go in a
   **separately labelled** section that cannot be mistaken for the answer.

**Facets are NOT in the contract.** LCC checked: zero occurrences of "facet" in
`API_CONTRACTS.md` and zero in `services/**`. The earlier note claiming a
"contract slot documented" was wrong. **Do not build against a facets shape** —
LCC will send it when it exists (`CURRENT_PLAN.md` §Q1.5).

### R3 · Coverage — a shape is coming, do not invent it

LCC is building **coverage per court and per year** (`CURRENT_PLAN.md` §Q1.1).
The fact it will carry is blunt: **we hold 0 of 15,771,566 High Court judgments**
and every one of the 38,341 judgments in the corpus is Supreme Court.

**Why you will be asked to render it prominently:** `CLAUDE.md` — *silence about
a gap does the same damage as a fabricated citation.* An advocate practising in a
High Court currently gets a confident empty-feeling result set with no indication
the corpus does not cover their court.

**Wait for the contract.** LCC will send the exact shape. Sketching against a
guessed one is how a contract gets broken quietly.

---

## 4 · STANDING RULES THAT DECIDE CLIENT WORK

- **VERIFIED IS SILENT.** No badge on a verified citation. Only two states
  render: **unverified** (unmissable mark + eCourts path) and **overruled** (LAW
  MOVED, three states). **`failed` renders EXACTLY as `unverified`** — an
  advocate cannot act on the difference and an outage must not read as a corpus
  gap.
- **Silence = "verified, not decorated". Silence NEVER = "dropped".** A citation
  is never silently removed.
- **`verifiedBySource` appears only in the on-tap detail and the admin monitor**,
  never as a badge.
- **Amber `#B4690E` is RESERVED** — it means THE LAW HAS MOVED and nothing else.
  Never on drafts, OCR, or our own confidence. Our uncertainty is neutral ink
  with a dashed edge.
- **Copy is licence protection, not an audit.** *"Safe to file"*, never *"we
  verified this"*. *"We could not confirm this exists"*, never *"verification
  failed"*.
- **`set_aside` disables add-to-matter** — the one case where Lawmind refuses to
  let an authority be used.
- **Render citation fields FROM THE DATABASE ROW**, never from model output. The
  five badge states are **derived at render time**, never stored.
- **No AI-assisted watermark on documents.** PD-8 superseded; consent is taken
  once at onboarding.
- **Hindi renders in Noto Sans Devanagari everywhere**, including PDF export.

---

## 5 · WHAT IS BLOCKED, AND ON WHOM

| item | blocked on | not blocked |
| --- | --- | --- |
| Any of this session's work being visible in the product | **the founder's push/deploy call** — `CURRENT_PLAN.md` §Q1.0 | building it |
| Facets UI | LCC — the contract does not exist yet | R1 and R2 |
| Coverage UI | LCC — shape coming in §Q1.1 | R1 and R2 |
| Uploads / sensitive-class surfaces | the **countersigned DPA**, still owed (OD-6) | everything above |

**Nothing in your queue is blocked by the deploy gap.** R1 and R2 can both be
built and tested today.
