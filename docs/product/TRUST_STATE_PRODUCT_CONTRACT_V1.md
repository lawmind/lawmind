# TRUST-STATE PRODUCT CONTRACT — v1

**NEW3, 30 August 2026. R13.** Product semantics for the ten states an advocate
must be able to tell apart. Shared with LCC (wire) and RCC (render); NEW3 owns the
semantics.

**The rule that governs the whole file:** *if the backend cannot represent a state,
do not invent UI semantics for it.* Open a contract change instead. A screen that
renders a distinction the data does not carry is a screen that lies confidently.

**Where a state is designed against a fixture, it says so.** A fixture is a design
input. **No fixture in this file is evidence that the product does the thing.**

---

## 0. WHAT THIS IS NOT

It is not the citation harness (`docs/CITATION_HARNESS.md` — spec, unchanged), and
it does not restate the three-field model. It answers one narrower question: **for
each state an advocate can land in, is it representable today, and what does the
product show?**

---

## 1. THE TEN STATES

| # | state | representable today? | evidence |
|---|---|---|---|
| 1 | partial citation graph is visibly partial | **YES** | `citation.graph_partial` + `coverage` block |
| 2 | VERIFIED ≠ UNVERIFIED | **YES** | three fields, observed on the wire |
| 3 | FAILED_CHECK ≠ VERIFIED | **YES** (renders *as* unverified, by design) | `verification_state` enum |
| 4 | AMBIGUOUS stays ambiguous | **YES** | multi-candidate identity results |
| 5 | NO_CITATION is not an invalid judgment | **YES** | absence of rows, not a failure state |
| 6 | SOURCE_LINK_ONLY ≠ retained evidence | **YES** | `judgment.source_evidence` |
| 7 | EVIDENCE_WITHHELD is explicit | **YES** | body-text safety refusal |
| 8 | IMAGE_ONLY never looks like full text | **YES** | image-only artifacts retained, never text evidence |
| 9 | SOURCE_UNAVAILABLE is explicit | **YES** | revalidatable state, not deletion |
| 10 | UNKNOWN stays UNKNOWN | **YES**, and this is the one under pressure | see §3 |

**Ten of ten are representable.** The gap is not representability — it is that two
of them are currently rendered *identically* to a neighbouring state, and one of
those is deliberate while the other is a deferred contract change.

---

## 2. STATE BY STATE

### 1 · A partial citation graph is visibly partial
The graph endpoint carries a `coverage` block and **RCC does not draw the graph
without it** (RCC R12, bus 1557). That is the correct dependency direction: a
citation graph rendered without its coverage looks complete, and a graph that
looks complete is a claim we cannot support — the resolved-edge population is a
floor, never a census.

**Product copy:** *"This is what we have found so far, not everything that exists."*
**Banned:** any count presented as a total. Any "cited by N cases" without the
partial mark beside it.

### 2 · VERIFIED is not UNVERIFIED — and verified is silent
The three fields survive the round trip; observed 30 Aug through the core-loop
smoke: `verificationState:"verified"`, `verifiedBySource:"corpus"`,
`overruledStatus:"none"`.

**Verified renders as nothing at all.** No badge, no tick, no colour. Only two
states render: `unverified` (an unmissable mark plus the eCourts path) and
`overruled` (LAW MOVED, three states). **Silence means "verified, not decorated".
Silence never means "dropped".**

### 3 · FAILED_CHECK is not VERIFIED — and renders exactly as UNVERIFIED
**Deliberate, and it is the subtlest rule in the product.** `failed` renders
byte-identically to `unverified` because the advocate cannot act on the
difference, and because an outage must not read as a corpus gap. The distinction
is preserved in the row, exposed in the admin monitor, and invisible in the app.

**Copy:** *"We could not confirm this exists."* **Never** *"verification failed"* —
that describes our machine, not their case.

### 4 · AMBIGUOUS stays ambiguous
Where a citation, case number or title matches more than one judgment, **every
reachable candidate is returned and none is pinned to rank 1**. The same case
number recurs across courts and years; guessing which one an advocate meant is the
failure mode that looks most like success.

**Never** collapse candidates to a "best match".

### 5 · NO_CITATION is not an invalid judgment
A judgment with no resolved citations is an ordinary judgment about which we know
less. It is not flagged, not down-ranked in exact identity, and not marked
suspicious. **72% of citation rows are sentinels** — row presence is near-universal
and nearly meaningless — so treating absence as a defect would mislabel most of the
corpus.

### 6 · SOURCE_LINK_ONLY is not retained evidence
"We hold this document" and "we hold a link to where this document was" are
different promises. `judgment.source_evidence` distinguishes them and the reader
shows which one applies. **Banned copy:** anything implying we hold a document we
only have a URL for.

### 7 · EVIDENCE_WITHHELD is explicit
Where body text is refused structurally — damaged extraction, control-character
density, an unreadable glyph dump — the product **says it is withholding**, and does
not silently show a shorter document. A truncated judgment that looks whole is
worse than a refusal, because an advocate reads the missing paragraph as absent
rather than as unfetched.

### 8 · IMAGE_ONLY never looks like full-text evidence
Image-only artifacts are retained and are **never** presented as text evidence.
No partial OCR shown as the judgment. No search snippet drawn from an unreviewed
OCR pass. `poppler` deletes Devanagari outright, so "zero defects" and "zero script"
are the same number on those documents — which is exactly why an image-only
document must announce itself.

### 9 · SOURCE_UNAVAILABLE is explicit
A source we could not reach stays **revalidatable**, and says so. It is never
deleted, never silently dropped from a count, and never rendered as "no such
judgment". **A failed observation means "could not observe", never "nothing
changed"** — roadmap rule 4, and it is the same rule that governs monitoring.

### 10 · UNKNOWN stays UNKNOWN
Applies to coverage, to freshness, to retention, and to the web platform. Where a
number is unmeasured the product says **UNMEASURED**, not an estimate, not a
plausible default, and not a blank that reads as zero.

---

## 3. THE TWO PLACES THIS CONTRACT IS UNDER STRAIN

### 3.1 LAW MOVED renders one state where the data holds two — **DEFERRED, not accepted**

`treatment_provenance` is not on the wire. A reporter's editorial annotation and a
court's own words render **identically**. Measured elsewhere: 99 of 104 LAW MOVED
states rest on a reporter, 5 on a court.

Nothing shown is false — the law *has* moved in both cases, and the amber mark
means only that. But the advocate cannot see **who said so**, and for a
professional deciding whether to cite an authority that is a material difference.

**Decision:** `CCR-2026-08-30-05`, **DEFER to Gate C, 18 September**, with a named
interim: the reporter-class copy is used wherever a source is implied — *"A law
report records this as overruled. We have not confirmed this against the deciding
court."* — and **the words "set aside" are blocked entirely** (claims register B2c).
Deferring is only safe *because* those two constraints are already in force.

### 3.2 `retrievalOutcome.rarestDf` describes the corpus, not the request

Measured 30 Aug across six scopes of one query: identical to seventeen significant
figures in the scopes that refuse **and** in the two that answer.

A client that reasoned from it would tell an advocate who had already narrowed to
one court and one month that their query is too broad — **the daily-loop case, and
the one where narrowing is exactly what they did.** Amended as a semantic
clarification (`CCR-2026-08-30-02`): the field is diagnostic only and may not
produce a user-facing narrowing hint. `emptyBecause` and `degraded[]` do describe
the request and are what the refusal screen uses.

---

## 4. AMBER IS RESERVED

`#B4690E` means **the law has moved**, and nothing else. Never on drafts, never on
OCR quality, never on our own confidence. **Our uncertainty renders as neutral ink
with a dashed edge** — a different visual language, because it is a different kind
of doubt: theirs is about the law, ours is about us.

---

## 5. FIXTURE DISCLOSURE

States 7, 8 and 9 were designed against isolated product fixtures because no live
surface reaches them on demand. **Those fixtures are design inputs and are not
evidence.** The registry rows for the capabilities behind them carry their own
evidence separately, and where none exists the row does not read `ENABLED`.
