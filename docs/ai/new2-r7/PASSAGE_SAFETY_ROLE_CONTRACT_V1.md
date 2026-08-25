# PASSAGE_SAFETY_ROLE_CONTRACT_V1

**Lane:** NEW2 · **Round:** R7 §10 · **25 August 2026**
**Consumers:** NEW1 (passage retrieval), LCC (retrieval outcome contract)
**Machine-readable:** `docs/ai/new2-r7/passage-role-summary.json` ·
labels + raw passage text: `docs/ai/new2-r7/passage-role-sample.json`

---

## The one sentence this contract exists to state

**Whole-document eligibility is not sufficient for passage retrieval**, and the
measurement below is what makes that a fact rather than a caution: **20.0% of the
passages inside documents we consider retrievable are not the court speaking**,
and **0.65% are damaged text inside documents the body screen calls safe**.

---

## 1. Frame — and one substitution stated up front

| | |
| --- | --- |
| population | paragraphs of documents carrying a staged document vector (`new1_doc_vector_stage`, 2,026,872 distinct documents) |
| sampling | deterministic — `md5(judgment_id) % 1000 = 7`, then **every paragraph of the selected documents** |
| n | **13,944 passages** across **2,822 documents** |
| label source | rule set below, high-precision / low-recall, residual named `OTHER_UNKNOWN` |

**The substitution.** R7 §10 asks for this study over NEW1's 100k passage
tranche. That selection is BLOCKED after three attempts (NEW1 bus 1175). The
substitute is the population semantic retrieval can reach *today*. It is stated
here rather than hidden in the script, and **the study must be re-run against the
real tranche when it exists** — the numbers below are about a different, larger,
and probably lower-quality population than a curated tranche would be.

**It is a cluster sample of whole documents, deliberately.** A first attempt
sampled documents *and* paragraphs independently, returned 131 passages, and
produced an empty neighbour table — because independent sampling is precisely
what destroys neighbours, and "what sits next to a court-reasoning passage" is
one of the four questions. Every rate below is therefore a rate over
documents-and-their-paragraphs, which is what a retrieval system actually draws
from.

---

## 2. The role vocabulary, and what a label means

Rules are ordered; the first to fire wins. Order encodes precedence: **damage is
checked first**, because a damaged passage's apparent role is not evidence of
anything; **quotation is checked before reasoning**, because a quoted precedent
inside a reasoning paragraph is still someone else's words.

| role | fires on |
| --- | --- |
| `DAMAGED_OR_OCR_SUSPECT` | control/replacement characters, or letter density below 0.45 over 120+ chars |
| `REPORTER_EDITORIAL` | `HEADNOTE`, `Held :—`, `Editor's Note`, `CASE REFERRED`, `ADVOCATES WHO APPEARED` |
| `PARTY_SUBMISSION` | a counsel attribution **and** a submission verb — "learned counsel … submitted/contended/urged" |
| `QUOTED_PRECEDENT` | "observed as under", "held as follows", "in paragraph N … held", or a 200+ char passage opening on a quotation mark |
| `PROCEDURAL_HISTORY` | listing / adjournment / registry-direction / withdrawal apparatus |
| `CASE_HEADER` | the caption block — `Applicant :-`, `Counsel for`, `Hon'ble … , J.` — under 1,200 chars |
| `HOLDING_OPERATIVE` | the operative order — "in the result", "the appeal is allowed", "impugned order is set aside" |
| `COURT_REASONING` | first-person judicial reasoning — "in my considered view", "we are of the opinion", "having heard", "it is well settled" |
| `FACTS` | "the prosecution case", "brief facts", "as per the FIR", "it is alleged that" |
| `OTHER_UNKNOWN` | **everything else** |

**`OTHER_UNKNOWN` being the largest class is a finding, not a failure of the
rules.** A passage with no marker is not thereby court reasoning, and labelling it
so would manufacture exactly the false confidence this study measures. Any
consumer that needs "is this the court speaking" must treat `OTHER_UNKNOWN` as
`UNKNOWN` and never as a weak yes.

---

## 3. Results

### 3.1 Role distribution — n = 13,944

| role | passages | share |
| --- | ---: | ---: |
| `OTHER_UNKNOWN` | 10,386 | **74.49%** |
| `PARTY_SUBMISSION` | 1,570 | **11.26%** |
| `CASE_HEADER` | 950 | 6.81% |
| `COURT_REASONING` | 261 | **1.87%** |
| `HOLDING_OPERATIVE` | 232 | 1.66% |
| `FACTS` | 187 | 1.34% |
| `QUOTED_PRECEDENT` | 134 | 0.96% |
| `PROCEDURAL_HISTORY` | 118 | 0.85% |
| `DAMAGED_OR_OCR_SUSPECT` | 91 | 0.65% |
| `REPORTER_EDITORIAL` | 14 | 0.10% |

**Non-authoritative share — party submission + case header + quoted precedent +
procedural history + reporter editorial — is 19.99%.** One passage in five inside
a document we consider retrievable is not the court's own reasoning or order,
and 11.26% of them are specifically counsel's argument.

**Confidently-court text is 3.53%** (`COURT_REASONING` + `HOLDING_OPERATIVE`).
The rules are low-recall so the true figure is higher, but the *identifiable*
court-speech fraction is small, and nothing downstream may assume otherwise.

### 3.2 The four safety questions

**(a) How often does passage retrieval surface non-authoritative text?**
`19.99%` of the retrievable passage pool, before any ranking. This is a base
rate, not a retrieval rate — whether ranking makes it better or worse is NEW1's
measurement, and this is the prior it should be compared against.

**(b) Are party submissions semantically attractive — do they sit where the
answer sits?** Yes, and that is the dangerous part. Neighbours (within 3
paragraph positions) of a `COURT_REASONING` passage:

| neighbour role | count |
| --- | ---: |
| `OTHER_UNKNOWN` | 326 |
| **`PARTY_SUBMISSION`** | **45** |
| `COURT_REASONING` | 32 |
| `CASE_HEADER` | 17 |
| `HOLDING_OPERATIVE` | 10 |
| `QUOTED_PRECEDENT` | 6 |
| `FACTS` | 6 |
| `DAMAGED_OR_OCR_SUSPECT` | 1 |
| `PROCEDURAL_HISTORY` | 1 |

**`PARTY_SUBMISSION` is the most common *identified* neighbour of court
reasoning — more common than court reasoning itself.** Counsel's argument is
written in the same register, about the same proposition, in adjacent text.
A retriever that scores on topical similarity has no signal separating
"the petitioner argued X" from "we hold X", and a generation step that quotes the
first as authority produces a proposition no court ever accepted.

**(c) Does reporter/editorial text contaminate candidates?**
`0.10%` in this frame — 14 passages of 13,944 — **and that number does not
generalise. `CORRECTION_OF` this document's own first draft, same day.**

- **old claim:** reporter contamination is low because the corpus is raw court
  text from AWS Open Data rather than a law reporter's edition.
- **new fact:** that is true of the **High Courts** and false of the **Supreme
  Court**. Measured after this study was first written:

| tier | documents | carry a reporter running head | carry a headnote marker |
| --- | ---: | ---: | ---: |
| Supreme Court of India | 38,342 | **35,570 (92.77%)** | **15,691 (40.92%)** |
| High Courts | 93,175 `SAMPLED` (0.5%) | 2 (0.002%) | 2 (0.002%) |

**Our Supreme Court corpus is the SCR reporter edition.** 92.77% of it carries
the `SUPREME COURT REPORTS` running head.

- **why this frame missed it:** the frame is documents carrying a staged vector,
  of which the Supreme Court is 9,941 of 2,026,872 — 0.49%. The sample drew
  almost no Supreme Court text, so it measured the High Courts and reported the
  corpus.
- **affected downstream:** the Supreme Court subset carries **43.9% of all
  resolved citations** and is where authority-bearing retrieval will concentrate.
  A passage build that treats §3.1's 0.10% as a corpus-wide reporter rate will be
  wrong by two orders of magnitude precisely where it matters most. The licensing
  question this raises is in `docs/FOUNDER_QUEUE.md`; the retrieval consequence
  is gate **G-P5** below.

**(d) Does whole-document body screening catch damaged PASSAGES? No.**

| | passages |
| --- | ---: |
| document screened safe **and** passage damaged | **90** |
| document screened safe and passage fine | 13,854 |
| document screened damaged and passage fine | 0 |
| document screened damaged and passage damaged | 0 |

**90 of 13,944 — 0.65% — are damaged text inside documents the body screen calls
safe.** Whole-document `script_quality` is a document-level verdict and cannot
express "clean except for pages 4–6", which is exactly what a partial extraction
failure produces. Those 90 passages are retrievable today.

The two zero rows are also a finding: **no document the screen calls damaged
appears in this frame at all**, because such documents never reach
`new1_doc_vector_stage`. So R7's question "are there usable passages inside
damaged documents" **cannot be answered from the retrievable frame** — it needs a
separate draw from the 1,792,321 documents in `PROVEN_DAMAGED` +
`SCREENED_DAMAGED`, and it is recorded here as `NOT_MEASURED`.

---

## 4. The contract

### 4.1 Binding on any passage-retrieval path

1. **A passage inherits none of its document's safety.** Document eligibility
   admits the document to the pool; it says nothing about the span. A passage
   must carry its own role and its own damage verdict, or be treated as
   `OTHER_UNKNOWN` / `UNKNOWN`.
2. **`OTHER_UNKNOWN` is not a weak yes.** It is the 74.49% residual and it may
   never be rendered, quoted or summarised as the court's words.
3. **`PARTY_SUBMISSION`, `QUOTED_PRECEDENT` and `REPORTER_EDITORIAL` must never
   be presented as the holding of the case they appear in.** They may be
   retrieved — an advocate reading the argument is legitimate — but the role
   must travel with the passage to the surface, and generation must not treat
   them as propositions the court accepted.
4. **`CASE_HEADER` is metadata, not law.** 6.81% of the pool. It is topically
   attractive (it names the parties, the counsel and the provision) and it
   contains no reasoning at all.
5. **Damage is per-span.** A body-evidence state of `SCREENED_NO_DAMAGE_FOUND` on
   the document does not license the span; measured leakage is 0.65%.
6. **Nothing here is a licence to filter silently.** A passage excluded for role
   or damage is excluded *visibly* — the retrieval outcome says `unsafe_body` or
   `low_relevance` per §7.1, and the count is reported. A silent drop is the
   failure mode this whole contract descends from.

### 4.2 What must be true before a full passage build

Stated as gates, not as advice, because R7 §10 says this contract is delivered
*before* any full passage scaling:

- **G-P1** — the study is re-run against the real 100k tranche, not this
  substitute frame. Blocked on NEW1.
- **G-P2** — per-passage damage detection exists as a stored verdict, not as a
  study-time rule. 0.65% of 91,231,179 paragraphs is ~593,000 damaged passages
  corpus-wide if the rate holds; that is the population a build would embed.
- **G-P3** — the role label is available at retrieval time for at least
  `PARTY_SUBMISSION`, `QUOTED_PRECEDENT` and `REPORTER_EDITORIAL`, or those
  classes are excluded from the build.
- **G-P4** — the party-submission adjacency in §3.2(b) is measured *after*
  ranking, by NEW1, on real queries. The base rate here is the prior; the
  post-ranking rate is the risk.
- **G-P5** — the Supreme Court subset is re-measured separately for reporter
  apparatus before it is embedded, and reporter apparatus is detected
  **structurally** — running heads, margin letters `A B C D E F G H`, pin-cite
  brackets like `[801-G-H; 802-A-B]` — not by the word `HEADNOTE`. The
  treatment pilot's `SPEAKER_IS_REPORTER` rule refused 5 of 40,000 edges while
  4 of its 11 hand-read survivors turned out to be headnote text, which is what
  a word-list rule is worth against this apparatus.

### 4.3 What this contract does NOT claim

| | state |
| --- | --- |
| recall of each rule | `NOT_MEASURED` — rules are precision-first and unvalidated against hand labels |
| whether `OTHER_UNKNOWN` is mostly reasoning or mostly narrative | `UNKNOWN` |
| usable passages inside screen-damaged documents | `NOT_MEASURED` — not present in this frame |
| whether ranking amplifies or suppresses party submissions | `NOT_MEASURED` — NEW1's |
| Hindi / Devanagari passages | `NOT_MEASURED` — `language <> 'en'` is 0 rows corpus-wide, which is itself suspect given 18,619,647 rows carry `native_text` |

The rule set and every labelled passage are in
`docs/ai/new2-r7/passage-role-sample.json` **with the raw text retained**, so
Fifth or anyone else can re-score the sample by hand without re-querying and
without trusting these labels.
