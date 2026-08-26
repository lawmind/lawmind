# REPORTER_APPARATUS_V1 — R8.1 §7.9

**Lane:** NEW2 · **26 August 2026**
**93.2% of Supreme Court documents carry reporter page furniture, against a 4.4% High Court control.**

**Artifacts** — `scripts/n2-reporter-apparatus.mts` · `docs/ai/new2-r8/reporter-apparatus.json`

---

## 1. Why this stopped being tidy and became urgent

Two R8 findings collided:

- **The Supreme Court corpus is the cleanest and most-cited part of the corpus.**
  99.3% of highly-cited authorities, 0.00% measured damage
  (`OCR_PRIORITY_QUEUE_V1`). It is also, per R7, the **SCR reporter edition** —
  35,570 of 38,342 documents carrying a running head.
- **R7's treatment pilot refuted 11 of 11 candidates, and at least four were
  refuted because the evidence window was reporter apparatus** — an SCR headnote
  list, margin letters, a pin-cite like `[801-G-H; 802-A-B]`.

Apparatus is not cosmetic. It is already manufacturing evidence in the one place
the product cannot afford it, and it is concentrated in exactly the documents
retrieval reaches most.

**This is the epistemic half only.** Whether we may *hold* the SCR edition is a
licensing question for counsel and is already in `FOUNDER_QUEUE.md`. Whether a
sentence printed by a law reporter may be shown to an advocate as something *the
court said* is a data-truth question, and §7.9 and G4 both answer no.

---

## 2. Detection is structural, and the control proves it

Markers are **typographic shapes** court prose does not produce, never
vocabulary. Vocabulary would convict a court quoting a headnote, which is a
different thing.

1,200 Supreme Court documents and 1,200 High Court documents, randomised.

| marker | SC docs | HC control |
| --- | ---: | ---: |
| `MARGIN_LETTER_LINE` — a lone `A`–`H` on its own line | **88.9%** (60,313 hits) | **0.6%** |
| `PARA_CROSSREF` — `[Para 30]` editorial cross-reference | **34.0%** | **0.0%** |
| `PAGE_PARA_PINCITE` — `[801-G-H; 802-A-B]` | **17.7%** | **0.0%** |
| `RUNNING_HEAD` | 3.3% | 0.0% |
| `DISPOSAL_APPARATUS` — jurisdiction banner | 0.2% | 3.8% |
| `HEADNOTE_BLOCK` | **0.0%** | 0.0% |
| **any marker** | **93.2%** | **4.4%** |

**93.2% against 4.4% is a 21× separation.** The markers are detecting reporter
apparatus rather than generic legal text — which is what a control group is for,
and it is the difference between this and a phrase list that scores 100% on the
documents it was written from.

**Independent corroboration:** 93.2% here against R7's **92.8%** running-head
figure, arrived at by a completely different marker set. Two methods, 0.4 points
apart.

---

## 3. Two of my six markers do not work, and saying so is the point

- **`HEADNOTE_BLOCK` fired zero times, in both groups.** It looks for an
  explicit `HEADNOTE:` heading. Either the extractor drops it or the SCR edition
  does not print it that way. **A marker that never fires is not evidence of
  absence** — headnote *text* is certainly present, since R7 refuted treatment
  candidates on it. What is absent is the heading I looked for.
- **`RUNNING_HEAD` fired on 3.3%** where R7 found 92.8% by a different method.
  My regex is too narrow. **R7's figure is the better one** and mine should not
  be quoted.

The 93.2% headline does not depend on either: it is carried by margin letters,
cross-references and pin-cites.

---

## 4. Volume is tiny; structural reach is total

The apparatus **character floor is 0.166%** of Supreme Court text — margin
letters are single characters on their own lines.

That number is small and it is the wrong one to be reassured by. **88.9% of SC
documents have margin letters interleaved through the body**, which means:

- **any passage sliced out of SC text is likely to contain apparatus**, and the
  passage retrieval path slices by character offset
  (`TRANCHE_PASSAGE_SAFETY_V1`);
- **a proximity window around a citation is likely to straddle it**, which is
  exactly the mechanism that refuted four of R7's eleven treatment candidates.

The floor also **understates** apparatus badly: a headnote paragraph reads like
prose and only its heading is structural, so nothing in the 0.166% counts
headnote body text. Recorded as a floor, never as the share.

---

## 5. What this binds

| rule | status |
| --- | --- |
| reporter/editorial text is never court reasoning | G4, already binding; this measures the exposure |
| treatment may not be inferred from a window containing apparatus | R7 proved the failure; this shows it is a 93.2% population, not an edge case |
| passage evidence must carry role | `REPORTER_EDITORIAL` was 1.57% of tranche passages by lexical rules — **structural detection says the exposure is far larger** |
| a public claim that SC coverage is our strongest | true on coverage, **and it is the most apparatus-contaminated part of the corpus** |

The two lexical and structural numbers disagree (1.57% vs 93.2%) because they
measure different things: the lexical rule asks "is this passage *made of*
editorial text", the structural one asks "does this document *contain* reporter
furniture". Both are true. **The reconciliation — what share of retrieved
passages contain apparatus — is `NOT_MEASURED` and belongs with the §7.7 top-k
run.**

---

## 6. State

| item | state |
| --- | --- |
| SC apparatus prevalence 93.2% | **`PASS_AT_MEASURED_SCOPE`** — 1,200 randomised documents |
| HC control 4.4%, 21× separation | **`PROVEN`** — markers detect apparatus, not legal text |
| corroborates R7's 92.8% | **`PROVEN`** — two methods, 0.4 points apart |
| `HEADNOTE_BLOCK` marker | **`FAILED`** — never fires; absence of the heading, not of headnotes |
| `RUNNING_HEAD` marker | **`FAILED`** — 3.3% against R7's 92.8%; use R7's |
| apparatus character share | **`PARTIAL`** — 0.166% is a floor that excludes headnote prose |
| apparatus share of RETRIEVED passages | **`NOT_MEASURED`** — needs the §7.7 top-k run |
| marker precision vs hand adjudication | **`NOT_MEASURED`** |
| any document reclassified | **none.** This measures; it does not act. |
