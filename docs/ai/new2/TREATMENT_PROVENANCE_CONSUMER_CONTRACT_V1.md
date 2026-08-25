# TREATMENT PROVENANCE — CONSUMER CONTRACT V1

**Owner:** NEW2 · **Written:** 25 August 2026 · **Round:**
`LAWMIND_LAUNCH_CONVERGENCE_SPRINT_MASTER_PLAN_V2_OWNERSHIP_CORRECTED_2026-08-25.md`
§8 / NEW2-1, consumed by §6 / LCC-3
**Consumers:** LCC (`propagate-treatment.ts` + the four read surfaces) · RCC
(render) · NEW3 (copy)
**Machine-readable twin:** `treatment-provenance-contract.json` — same rows, so a
test can assert against it rather than against prose.

**Evidence base:** `TREATMENT_PROVENANCE_DECISION_INPUT_V1.md` (all 16,001
treated edges classified; all 137 badge-driving edges hand-read) plus
`treatment-contract-state.json`, re-measured **today** against the populated
`0082` column — the 23 Aug artefact predates that population and its
denominators have moved.

**This document decides nothing that is the founder's.** It converts research
into the exact structured shape LCC-3 asked for, states one recommendation per
open cell, and marks the cells only the founder may close.

---

## 0 · The state today, measured

| | |
| --- | ---: |
| treatment-bearing edges carrying a provenance verdict | **11,579** |
| `REPORTER_EDITORIAL_ANNOTATION` | 11,573 · 72.41% |
| `NULL` — never classified | 4,403 · 27.55% |
| `COURT_REASONING_EXPLICIT` | **5** · 0.03% |
| `MODALITY_DEFECT` | **1** · 0.01% |
| judgments rendering a LAW MOVED state | **104** (98 real + 6 leaked `SYNTHETIC` fixtures) |
| of those, backed by any court-class edge | **5** |
| **add-to-matter refusals live today** | **76** |
| **of those, resting on a law reporter's headnote alone** | **72** |

> **72 of 76 times LawMind refuses to let an advocate put an authority in a
> matter, the only evidence is a law reporter's editorial annotation.**
>
> That is the sentence this contract exists to fix. It is not a badge-wording
> problem. It is a hard product refusal — the one place `CLAUDE.md` says LawMind
> stops an advocate using an authority — resting on apparatus no court wrote.

---

## 1 · The two questions that must never be answered by one field

Everything below turns on keeping these apart:

| | question | field | consequence of getting it wrong |
| --- | --- | --- | --- |
| **A** | *Did a later court do something to this authority?* | `relationship` | a missed overruling → the advocate cites dead law |
| **B** | *Who says so — the court, a reporter's editor, or counsel?* | `treatment_provenance` (`0082`) | a headnote read as a holding → we assert a court said something it did not |

Today only A exists in the promotion path: five surfaces test
`relationship IN ('overruled','overruled_in_part','doubted')` and nothing tests
B. `0082` created the column for B; this contract says what each of its values
is permitted to do.

---

## 2 · THE CONTRACT

Seven cells per state, as §8 specifies. **`MAY NOT` is binding. `MAY` is a
ceiling, not an instruction** — a consumer is always free to say less.

### 2.1 `COURT_REASONING_EXPLICIT`

| cell | value |
| --- | --- |
| **Evidence requirement** | the citing court's own sentence, in its own voice, naming the authority **and** the act performed on it. Not a heading, not a list entry, not a marker-terminated *Case Law Cited* line. Hand-read or produced by a writer whose recall against hand-reading has been measured |
| **Allowed product wording** | may name the acting court and assert the act: *"Set aside in \<citing case\>."* Attribution to a court is permitted **only here and in `COURT_ORDER_DISPOSITIVE`** |
| **Currentness propagation** | **MAY** write `judgments.overruled_status`. Canonical |
| **Matter workflow** | **MAY** rely. May disable add-to-matter on `set_aside` |
| **Briefing** | **MAY** rely, including in a prominent "the law has moved" position |
| **Counterargument** | **MAY** rely as an assertion of the state of the law |
| **LAW MOVED strength** | **FULL.** Amber `#B4690E`, the reserved colour |
| **Population** | **5 edges, 5 judgments** |

**Caveat that travels with 2 of the 5.** The 1980 and 2023 spans say the
authority *was* overruled or doubted **without naming the judgment that did it or
when**. They support the LAW MOVED state; they do **not** support the
*"set aside by X on \<date\>"* provenance line the surfaces print. Where the
citing span does not name the acting judgment, the provenance line **MUST** be
omitted rather than filled from the edge's `citing_judgment_id`, which is the
reporter's entry, not the acting court.

### 2.2 `COURT_ORDER_DISPOSITIVE`

Identical to 2.1 in every cell. Evidence is the operative order — *set aside,
quashed, reversed* — rather than reasoning. **Population: 0 edges today.** The
class is real and reachable; it simply has no rows yet.

### 2.3 `OFFICIAL_REGISTRY_STATUS`

| cell | value |
| --- | --- |
| **Evidence requirement** | a court registry record of appellate outcome |
| **Everything else** | **UNUSABLE — zero available evidence.** `ecourts_observation` holds **0 rows**, and §8 forbids live eCourts traffic this round |

**MUST NOT** appear in any product copy, any coverage claim, any admin figure, or
any founder/website material as a source LawMind has. The class exists in the
vocabulary so that a future registry feed has somewhere to land. Naming an
evidence class we cannot populate is how a capability gets claimed by accident.

### 2.4 `REPORTER_EDITORIAL_ANNOTATION` — the load-bearing state

| cell | value |
| --- | --- |
| **Evidence requirement** | a law report's editorial apparatus: a headnote, a *Case Law Cited* entry, a marker-terminated list line, column letters, page-and-line pins |
| **Allowed product wording** | **MUST** attribute to the reporter and **MUST NOT** attribute to a court. Permitted: *"A law report records this as overruled. We have not confirmed this against the deciding court."* Forbidden: *"Set aside in \<case\>"*, *"the Court overruled"*, *"verified"*, *"confirmed"*, and any phrasing whose subject is a court |
| **Currentness propagation** | **MUST NOT** write `judgments.overruled_status`. It is a render-time signal derived live from the edge, never a stored canonical status |
| **Matter workflow** | **MAY** be shown on the authority inside a matter. **MUST NOT** disable add-to-matter. A refusal is a claim, and this evidence cannot carry a refusal |
| **Briefing** | **MAY** appear, qualified, and **MUST NOT** be silently omitted. **MUST NOT** be stated as a fact about what a court held |
| **Counterargument** | **MAY** be used to raise the point — *"opposing counsel may say this has been overruled; a law report records it so"*. **MUST NOT** be used as an assertion that it has been |
| **LAW MOVED strength** | **QUALIFIED.** Visible, unmissable, explicitly sourced to the reporter, and visually distinguishable from 2.1 |
| **Population** | **11,573 edges** · **99 of the 104 badges** · **72 of the 76 add-to-matter refusals** |

**This is the interim product direction, stated as a rule:** the reporter signal
stays **visible as a safety signal**, explicitly qualified, and is never
presented as though the later court itself has been independently verified to
have so held.

Three things that follow and are not optional:

1. **Nothing is removed.** `CLAUDE.md` forbids hiding adverse treatment, and
   deleting 99 warnings is the change an advocate actually experiences. Every
   one still renders.
2. **It stops being canonical.** The stored `overruled_status` is written only
   from court-class evidence; the reporter signal is derived at render from the
   edge, which it must be anyway — `overruled_status` is never cached.
3. **It stops refusing.** 72 add-to-matter refusals become warnings. An advocate
   blocked from using a live authority on a headnote's say-so is a false refusal,
   and a false refusal is not the safe side of anything — it is the same error
   pointing the other way.

### 2.5 `COUNSEL_ARGUMENT`

| cell | value |
| --- | --- |
| **Evidence requirement** | the span is counsel's submission — *"learned counsel placed reliance on X"* |
| **Allowed product wording** | **none.** MUST NOT surface as treatment at all |
| **Currentness · matter · briefing** | **MUST NOT** rely, in any of the three |
| **Counterargument** | **MAY** be read as *evidence that an argument was made*, never as evidence of what was decided. This is the one place the class has value |
| **LAW MOVED strength** | **NONE** |

What counsel urged is not what the court held. The precedence rule in the
classifier is deliberately pessimistic here: a span carrying both counsel voice
and court voice is classified `COUNSEL_ARGUMENT`, costing coverage rather than
risking a false promotion.

### 2.6 `MODALITY_DEFECT`

| cell | value |
| --- | --- |
| **Evidence requirement** | the verb is right and its **mood** is wrong — *"is sought to be overruled"*, *"proposed to be delivered"*, a **dissent** describing what the majority is about to do |
| **Allowed product wording** | **none, pending re-adjudication.** MUST NOT surface in any advocate-facing surface |
| **Currentness propagation** | **MUST NOT** write `overruled_status` |
| **Matter · briefing · counterargument** | **MUST NOT** rely on any |
| **LAW MOVED strength** | **NONE** |
| **Population** | **1 edge, 1 judgment** — `9de8fd68-e248-4e0d-8cef-cfa79220e735`, SC 1985, THAKKAR J. dissenting, sole driver of a live `set_aside` |

**The badge it drives is probably right and is right by luck.** The same sentence
says the majority appears to agree. But the stored claim is that a court
overruled an authority, and the evidence is a dissenting judge describing a
proposal. Polarity is the wrong verb; **modality is the right verb in the wrong
mood**, and nothing in this codebase guards mood — not `MARKER_RE`, not
`precedential-effect.ts`, not the resolver.

`MODALITY_DEFECT` is a **quarantine, not a verdict**. It means *this claim has
been read and found unsafe in a way our vocabulary could not previously express*.
Re-adjudication needs the **majority** judgment read as primary evidence
(NEW2-1b). Until then the safe answer for one judgment is silence about the
reason, not silence about the state.

### 2.7 `UNKNOWN` — looked at, cannot tell

| cell | value |
| --- | --- |
| **Evidence requirement** | a reader or writer examined the span and could not attribute a speaker |
| **Allowed product wording** | **none** |
| **Currentness · matter · briefing · counterargument** | **MUST NOT** rely on any |
| **LAW MOVED strength** | **NONE** |
| **Population** | 0 edges today |

**`UNKNOWN` MUST NOT be promoted to any other class, in any direction, by any
process.** Not to reporter, not to court, and above all not to a clean state.
`UNKNOWN` → anything is the same failure as `SCREENED_NO_DAMAGE_FOUND` → "clean"
in the body-text contract, and it is forbidden for the same reason.

### 2.8 `NULL` — never classified

| cell | value |
| --- | --- |
| **Evidence requirement** | **none — nothing has looked at this edge** |
| **Allowed product wording** | **none** |
| **Currentness · matter · briefing · counterargument** | **MUST NOT** rely on any |
| **LAW MOVED strength** | **NONE** |
| **Population** | **4,403 edges · 27.55%** |

**`NULL` and `UNKNOWN` are different and must never be merged.** `NULL` is *not
looked at*; `UNKNOWN` is *looked at and undecidable*. They want opposite work:
`NULL` wants a classifier run, `UNKNOWN` wants a human. Collapsing them is the
`unclassified is two populations` error, and LCC chose `text`-with-a-`CHECK`
over an enum partly to keep them apart. That choice is endorsed here.

**A `NULL` edge is not evidence of safety.** It is currently indistinguishable
from a court-class edge to every consumer, which is precisely why the 4,403 must
not be read as benign.

---

## 3 · The one enforcement point

`propagate-treatment.ts:157` is the **single writer** of
`judgments.overruled_status`. The other four surfaces read what it wrote. So the
entire canonical half of this contract is one predicate in one file:

```
promote only where treatment_provenance IN
  ('COURT_REASONING_EXPLICIT','COURT_ORDER_DISPOSITIVE','OFFICIAL_REGISTRY_STATUS')
```

The qualified half is **not** in that file. The reporter signal must be derived
at render from the edge's own `relationship` + `treatment_provenance`, on every
surface, live — which is already the rule for `overruled_status` and is now the
rule for its qualified sibling too.

### What must NOT be done to implement this

- **No mass treatment rewrite.** §8 forbids it and nothing here needs one: the
  column is already populated for the classes that matter.
- **No row deletion.** Reporter evidence is preserved, in the row and on screen.
- **No enum migration.** The vocabulary is still moving — `MODALITY_DEFECT` was
  added by *reading*, after the screen had run.

---

## 4 · WHAT THIS CONTRACT CANNOT DECIDE — for the founder

Two cells above are recommendations, not settled policy, and they are named here
rather than buried:

**FQ-TREATMENT-HEADNOTE-PROVENANCE (already filed by LCC).** *May a law
reporter's editorial annotation independently make an authority non-canonical in
LawMind?* This contract's answer is **no, and it stays visible** — but the
question is a licence-risk question, not an engineering one.

Priced both ways, from today's numbers:

| | LAW MOVED badges | add-to-matter refusals |
| --- | ---: | ---: |
| **today** — reporter promotes | 104 (98 real) | 76 |
| **court-only canonical, reporter qualified** *(recommended)* | 5 canonical + 99 qualified, **nothing hidden** | **4** |
| **court-only, reporter removed** *(rejected)* | 5 | 4 |

The third row is the one to refuse: removing 99 warnings is the direction
`CLAUDE.md` is most afraid of. The recommended row keeps every warning and
changes only two things — who we say said it, and whether it refuses.

**A second, narrower founder question this raises.** *Is a false refusal
acceptable where a false confirmation is not?* Today's implicit answer is yes —
72 refusals rest on headnotes. This contract's answer is no: both are wrong
answers about the same authority, and the advocate cannot tell either from a
correct one.

---

## 5 · Honest limits of this contract

- **The 5 court-class edges are 0.03% of the population.** This contract makes
  currentness honest; it does not make it broad. Broad safe coverage needs a
  writer that reads courts rather than reporters, and `detectTreatment` cannot
  be that writer — it searches forward 220 characters for a dash-and-marker,
  which is *law-report notation courts do not use*. The 0.03% is structural.
- **11,573 reporter labels come from a screen, not from reading.** All 137
  badge-drivers were hand-read; the rest were not. The screen's error is
  **one-directional** — hand-reading moved 38 spans *into* reporter and none
  out — so the class is under-counted, which is the safe direction. It is still
  not proof for any individual edge.
- **One adjudicator.** No inter-rater figure exists for the 137. Every label
  carries its reason so a second reader can disagree specifically (NEW2-10).
- **6 leaked `SYNTHETIC` fixtures are still in the 104.** LCC's purge is written
  and dry-run-verified; the destructive run was blocked by a permission
  classifier. Every denominator above says 104 and notes the 6.
- **Extractor recall is unmeasured and unmeasurable from what we hold.** How many
  real overrulings the corpus contains that we never extracted at all is not
  knowable without external ground truth. Nothing here should be read as a
  coverage claim.
