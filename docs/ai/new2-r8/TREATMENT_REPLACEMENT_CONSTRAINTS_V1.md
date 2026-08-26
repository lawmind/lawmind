# TREATMENT_REPLACEMENT_CONSTRAINTS_V1 — R8.1 §7.10

**Lane:** NEW2 · **26 August 2026**
**Proximity V1 remains `DO NOT SCALE`. Two steps of the proposed replacement are undermined by this round's own measurements, and this records that before anyone builds on them.**

---

## 1. Where things stand

R7's treatment pilot hand-adjudicated 11 candidates and **refuted 11 of 11**.
The architecture forbidden by §7.10 is the one that produced them: find a
citation, read a window around it, and infer treatment from nearby words.

§7.10 names the next candidate as a chain:

> role segmentation → citation anchor → referent/grammatical binding →
> modality/negation/quotation → chronology → exact evidence → candidate →
> independent adjudication

This document does **not** build it. §7.10 requires any replacement to stay
candidate-only until independent precision clears a gate, and §17 forbids mass
treatment promotion. What this does is record what R8.1's own measurements have
just done to two of those steps, so that nobody implements them on assumptions
this round has already falsified.

---

## 2. Step "role segmentation" — the input is 93.2% contaminated

`REPORTER_APPARATUS_V1` measured reporter page furniture in **93.2% of Supreme
Court documents** against a **4.4%** High Court control.

That matters here more than anywhere, because the Supreme Court is where
treatment lives: it is 99.3% of highly-cited authorities
(`OCR_PRIORITY_QUEUE_V1`) and **126 of 131 strong-treatment edges already rest
on `REPORTER_EDITORIAL_ANNOTATION`** (`TREATMENT_NULL_VERIFICATION_V1`).

R7 already saw the mechanism in miniature: of the 11 refuted candidates, **at
least four were refuted because the evidence window was apparatus** — an SCR
headnote list, margin letters, a pin-cite like `[801-G-H; 802-A-B]`.

**So role segmentation is not a preprocessing step for this architecture. It is
the load-bearing one.** A segmenter that cannot separate a headnote from the
court's reasoning will feed the same false candidates to every step downstream,
and the downstream steps will make them look better-founded, not worse.

Concretely: `TRANCHE_PASSAGE_SAFETY_V1` puts lexical `REPORTER_EDITORIAL` at
**1.57%** of passages while structural detection puts apparatus in **93.2%** of
SC documents. The two disagree because they ask different questions, and **the
number this architecture needs — what share of the windows it will actually read
contain apparatus — is `NOT_MEASURED`.** It should be measured before the
segmenter is designed, not after.

---

## 3. Step "chronology" — the dates are worst exactly where treatment lives

`LEGAL_TIME_V1` measured `DATE_SUSPECT` among highly-cited authorities:

| era | highly-cited | suspect | rate |
| --- | ---: | ---: | ---: |
| **pre-1970** | 1,354 | **595** | **43.9%** |
| 1970–1989 | 1,347 | 117 | 8.7% |
| 1990–2009 | 1,750 | 85 | 4.9% |
| 2010+ | 2,567 | 134 | 5.2% |

Corpus-wide, among checked, the suspect rate is 4.68%.

Chronology in this architecture answers "did the overruling court sit *after* the
overruled one" — a date comparison. **On pre-1970 authorities, one side of that
comparison is doubtful 43.9% of the time.**

And pre-1970 is precisely where overruling matters: foundational constitutional
authorities are what later benches overrule, and they are the most-cited part of
the corpus.

**A chronology step built on `judgment_date` without consuming
`judgment_date_quality` would manufacture exactly the confident-and-wrong output
the proximity architecture did**, in the one class where being wrong is most
expensive. The step must read the date verdict, and `DATE_SUSPECT` or
`DATE_UNCHECKED` must block the candidate rather than default to an ordering.

---

## 4. Constraints this round adds, on top of §7.10's own

1. **Role segmentation is gated on a measured apparatus rate in retrieved
   windows**, not on the pool rate and not on lexical role labels.
2. **Chronology consumes `judgment_date_quality`.** `DATE_SUSPECT` and
   `DATE_UNCHECKED` block, never order.
3. **A candidate whose evidence span intersects detected apparatus is refused,
   not down-weighted.** R7's four refutations were all "the window was
   apparatus"; a weight would have let them through with a lower score.
4. **Precision is measured per provenance class, never pooled.** An architecture
   that is 90% precise on `COURT_REASONING_EXPLICIT` and 20% on
   `REPORTER_EDITORIAL_ANNOTATION` would report a flattering blend, and 96.2% of
   the population is the second class.
5. **The existing badge is not touched.** Demoting reporter evidence out of the
   LAW MOVED badge would turn 98 marks into 5 and let an advocate file on 93
   authorities a reporter records as overruled. **The fix for weak attribution is
   to attribute it** — already shipped in `precedential-effect.ts` — never to
   drop the warning.

---

## 5. What is deliberately not done

- **No replacement is built.** Candidate-only until an independent precision gate
  clears, per §7.10.
- **No treatment row is written, promoted or demoted.** Zero corpus mutation.
- **No rhetorical-role model was evaluated.** §7.10 permits *one* bounded
  licence-compatible Indian rhetorical-role model comparison as a candidate
  signal; it has not been run, and it would be a candidate signal and never
  truth.
- **The 0/11 result is not restated as a precision figure.** Eleven candidates is
  not a rate; it is a reason not to scale.

---

## 6. State

| item | state |
| --- | --- |
| proximity V1 | **`DO NOT SCALE`** — unchanged |
| role segmentation input contamination | **`PROVEN`** — 93.2% SC apparatus, 4.4% HC control |
| apparatus share of *retrieved* windows | **`NOT_MEASURED`** — gates the segmenter design |
| chronology input reliability | **`PROVEN` bad where it matters** — 43.9% suspect pre-1970 |
| replacement architecture | **`NOT_BUILT`** — deliberately |
| rhetorical-role model comparison | **`NOT_RUN`** — permitted, bounded, candidate-only |
| corpus mutation | **none** |
