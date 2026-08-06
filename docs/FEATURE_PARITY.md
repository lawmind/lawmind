# FEATURE PARITY — match everything, then beat it

**Founder decision, 5 August 2026.** Lawmind matches every capability a competitor
ships, and wins on accuracy, quality and experience rather than on price.

`PRODUCT_BRIEF.md` requires a stop-and-ask before building outside the four core
features and the daily loop. **This file is that ask, answered.** It records what
was decided, what it costs, and which settled decisions it touches — so nothing
here arrives later as a surprise.

Competitor detail and sources: `docs/COMPETITIVE_TEARDOWN.md`.

---

## The through-line — why "the same feature" is not the same feature

Every competitor tool in §2 is **stateless, unverified and dead on delivery**:

| Theirs | Ours |
|---|---|
| A chatbot answer with citations **asserted** | Citations **resolved through three tiers**, rendered from the database row, never from model output |
| A draft that lands in a Downloads folder | A draft **bound to a matter**, citations locked server-side, re-verified on every write |
| An answer that is correct on the day it is given | An authority **monitored after delivery** — when the law moves, the advocate is told (PD-5, PD-6, `citation_fanouts`) |
| A document uploaded to a model as-is | A document **pseudonymised before any model call**, one document per call (OD-6) |

That is the answer to "make it better." Not more tools — the **same tools wired
into a harness and a workspace that nobody else has**. A competitor can add a
template library in a sprint. Adding verification means rebuilding what they sell.

**Every feature below inherits this or it does not ship.** A tool that emits an
unverified citation is not parity, it is the failure mode `CITATION_HARNESS.md`
exists to prevent.

---

## 1 · Parity map

Status: **HAVE** built or specced · **BUILD** approved here, new · **REFRAME** ships
differently and better · **DECLINE** deliberately not built, reason stated.

| # | Competitor capability | Who has it | Us | Where |
|---|---|---|---|---|
| 1 | Research chat with citations | Prism, CaseMine, SCC, VIDUR | **HAVE** | S1 + S2 |
| 2 | Draft templates (80+) | Prism DocHub | **BUILD** — expand 10 → 80+ | S4 |
| 3 | Document review (risk / negotiation) | Prism DocHub | **BUILD** | S4b |
| 4 | Side-by-side document compare | Prism DocHub | **BUILD** | S4b |
| 5 | Upload and chat over a document | Prism, CaseMine | **BUILD** — gated on OD-6 DPA | S4 |
| 6 | Precedent graph / case tree | CaseMine AMICUS | **BUILD** — our best-in-class opportunity | S3b |
| 7 | Precedent suggested while drafting | LegitQuest iDraf | **BUILD** | S4 |
| 8 | Case outcome prediction | Prism CasePredictAI | **REFRAME** → Treatment Analysis | S3b |
| 9 | Counter-argument generation | Prism | **BUILD** — grounded only | S4b |
| 10 | Standing query alerts | Prism (2/25/100) | **REFRAME** → see §3, touches PD-5 | S3 |
| 11 | Case summaries / digests | LegitQuest iDigest, Prism | **HAVE** — two-sentence holding | S1 |
| 12 | Document annotation | Prism NoteIK | **BUILD** | S4b |
| 13 | Text-to-speech | Law4u | **BUILD** — real accessibility win | S3b |
| 14 | 18 regional languages | Law4u | **REFRAME** — touches OD-5, see §3 | post-launch |
| 15 | Court copies / PDF export | Prism, Law4u | **HAVE** | S4 |
| 16 | Bare acts library | Law4u, Prism | **HAVE** — live | S1 |
| 17 | Moot court / exam prep | Prism Legal Sandbox | **DECLINE** — see §4 | — |
| 18 | 30M+ judgment corpus | Prism | **See §5** | — |
| 19 | Case tracking, cause lists | Provakil, Notify | **HAVE** — nobody else pairs it with research | S3 |
| 20 | 24-hour hearing briefing | **nobody** | **HAVE** — the wedge | S3 |
| 21 | Matter workspace | **nobody** | **HAVE** — the moat | S3 |

**Net: we already have or have specced 8 of 21. Twelve are new build. One declined.**

---

## 2 · How each new build beats the original

### 2 · Draft templates — 10 → 80+
Theirs: 80+ templates, output lands nowhere.
Ours: every template scored against `draft_templates.gate_results` — court-format
compliance, no invented citations, no overruled authority cited as good law, Hindi
parity — and **nothing ships below 90 without a founder override that writes to the
audit ledger**. Citations locked server-side (PD-7): `PATCH /documents/:id` rejects
`422` on any citation divergence. Export carries no watermark (PD-8).

**The claim: they have more templates; ours cannot cite a case that does not exist.**

Cost: template authoring is the bulk. 70 new templates × court-format research is
the single largest line item in this document.

### 3 · Document review — risk and negotiation analysis
Sensitive-class (OD-6): pseudonymise first, one document per call, Claude only.
Ours: every clause flagged links to the **authority** it relies on, verified.
Theirs: a model's opinion about your contract.

### 4 · Side-by-side compare
Straightforward. Differentiator is that a **citation changed between versions is
flagged and re-verified**, not just diffed as text.

### 5 · Upload and chat
**Blocked on the OD-6 countersigned DPA — the admin surface refuses sensitive
routing without one, with no founder override.** Not a technical blocker.
Ours: PII pseudonymised before the call, coverage **measured not asserted**
(`data_requests`, currently 99.2%), never claimed as complete.

**The claim: the only Indian legal AI that tells you what it did with your client's
name.**

### 6 · Precedent graph — the one where we can be best in market
CaseMine's case tree is the strongest single feature any competitor has, and the
data to beat it is already in our schema: `overruled_by_judgment_id`,
`overruled_paras`, `citation_checks.judgment_id_matched`.

Ours: **every node carries live overruled status, read at render, never cached**
(`CITATION_HARNESS.md`). A citation graph where a set-aside judgment looks like any
other node is a trap; ours renders the law moving.

`set_aside` nodes disable add-to-matter, consistent with every other surface.

### 7 · Precedent while drafting
`citation_checks` already binds authorities to `document_id`. Suggestions come from
the verified set only, and go through `POST /documents/:id/citations`, which
re-runs the tiers. **A suggestion can never introduce an unverified citation.**

### 9 · Counter-arguments
Grounded in retrieved authorities only — same rule as search: the model references
judgment IDs handed to it, never emits a citation from memory. Authorities that are
`set_aside` are excluded from the argument and shown as such.

### 12 · Annotation
Highlight and save to a matter already exists in PD-9. Annotation is that plus
persistence — small increment, real retention value.

### 13 · Text-to-speech — the accessibility win we should have had already
Our user is *"frequently over fifty"*, reads *"in daylight, in court corridors"*,
and travels between hearings. Listening to a judgment on the way to court is a
genuine unlock, and it carries **no legal-quality risk** because it reads published
text aloud rather than generating anything.

Must use a Devanagari-capable voice for Hindi. Ships with the reading view.

---

## 3 · Two items that touch settled decisions — founder call needed

**#10 · Standing query alerts.** Prism sells 2/25/100 per tier. **PD-5 explicitly
excluded subject-following alerts**: *"That is discovery, not an alert. It belongs
in the app, never in a notification."* PD-6 reinforces it — wrong cadence trains
advocates to disable notifications permanently.

Our four triggers are strictly better *for matters you own*. Prism's are better for
*watching a topic*. Proposed reframe, which keeps PD-5 intact: **a saved-search feed
inside the app, never a push.** That matches PD-5's own reasoning rather than
overturning it. **Confirm before building.**

**#14 · 18 regional languages.** OD-5 settled Hindi ships gated on two law
graduates approving 20 drafts, with Tamil and Bangla post-launch, because *"a bad
search result is discarded in a second, a bad draft gets filed."*

Law4u's 18 languages are machine translation in a consumer app. Matching the count
means either dropping the register gate or paying for review in 18 languages.

Proposed: **match the count for reading, not for drafting.** Judgment and bare-act
*display* translation in 18 languages carries far lower risk than generating a
filing. Drafting stays gated per OD-5. **Confirm — this is an OD-5 boundary.**

---

## 4 · One deliberate decline

**#17 · Legal Sandbox — moot court and entrance-exam prep.** `PRODUCT_BRIEF.md`:
*"It assists licensed practitioners; it does not advise the public."* Students are
not our user, and the sandbox is what makes Prism a student product. Building it
would dilute a professional instrument, cost S4-scale effort, and serve nobody who
pays ₹3,499.

**Recommend declining and saying so.** "We do not build exam prep" is a positioning
statement to a senior advocate, not a gap.

**#8 · CasePredictAI is reframed, not matched.** Predicting an outcome cannot be
sourced to a primary record, cannot be verified by any tier, and invites exactly the
reliance the Supreme Court is sanctioning. It is the one feature where matching them
imports their liability.

**Ships instead as Treatment Analysis** — how courts have actually treated this
issue: how many benches followed, distinguished, doubted or overruled the authority,
built from real citation relationships in our own corpus. Every number traceable to
a judgment ID. **More useful than a prediction and defensible in open court**, which
a prediction is not.

---

## 5 · Corpus — the honest position

Prism has 30M+ judgments; we have 38,341. Parity here is not a sprint, it is the
storage and ingest problem currently parked (`docs/MIGRATION_WINDOWS.md`, OD-4
stages 3 and 4).

Two things are true at once and both belong in the plan:

- **Feature parity does not require corpus parity.** Every build above works on the
  corpus we have. Treatment analysis, precedent graph, drafting, review and TTS all
  operate on Supreme Court law, which is the citation backbone advocates actually
  cite.
- **Corpus depth is a real feature-comparison risk** and High Courts are staged in
  OD-4 for that reason.

**Sequence: ship the twelve features on the corpus we have, ingest High Courts in
the background.** A feature gap is visible in a demo; a corpus gap is visible only
when a specific High Court judgment is missing — and lexical search over an
un-embedded corpus still finds it.

---

## 6 · What this costs

Rough scale, for planning only — not estimates to commit to.

| Item | Scale |
|---|---|
| 70 new draft templates | **largest single line** — court-format research per type |
| Document review + compare + annotate | one sprint, S4b |
| Precedent graph | one sprint, server + client |
| Treatment analysis | server-only, reuses citation data |
| Upload and chat | small build, **blocked on the DPA** |
| Precedent-while-drafting | small, extends S4 |
| Text-to-speech | small, client-side |
| 18-language reading | medium, depends on §3 |

**This roughly doubles the build between here and launch.** Gate S2 does not move —
every one of these renders citations, so all of them sit behind the harness. A
counter-argument generator that hallucinates is worse than not shipping one.

**Recommended order**, cheapest-to-differentiating first:
1. Text-to-speech and annotation — small, immediate accessibility gain
2. Precedent graph — best-in-market opportunity, data already present
3. Treatment analysis — server-only, strongest honest answer to CasePredictAI
4. Precedent-while-drafting — extends S4 naturally
5. Templates 10 → 80+ — the long pole, start authoring early
6. Review, compare, upload-and-chat — S4b, after the DPA lands

---

## 7 · Open items

- **§3 · saved-search feed vs PD-5** — confirm the in-app reframe
- **§3 · 18 languages for reading vs OD-5** — confirm the boundary
- **§4 · decline Legal Sandbox** — confirm
- **OD-6 DPA** — still owed, blocks #5 and #3
- **Corpus staging** — OD-4 stages 3 and 4, storage parked
