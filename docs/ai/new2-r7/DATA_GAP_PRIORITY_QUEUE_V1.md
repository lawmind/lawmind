# DATA_GAP_PRIORITY_QUEUE_V1

**Lane:** NEW2 · **Round:** R7 §10 · **25 August 2026**
**Ranked by advocate value**, not by engineering convenience or by size of number.

The ranking question throughout: *what does an advocate try to do today that this
corpus makes impossible or, worse, answers wrongly?*

---

## The queue

| # | gap | measured | who it stops | cost class |
| --- | --- | --- | --- | --- |
| **G1** | **`judgment_statute_refs.statute_id` is NULL on all 862,594 rows** | **323,524** references match an Act we hold, unambiguously, on a deterministic join | every advocate reading any judgment that cites a statute | **join, no acquisition** |
| **G2** | **IPC / CrPC / Indian Evidence Act are not held at all** | 391,484 refs · 256,336 judgments · 0 sections | every criminal practitioner, on every pre-July-2024 matter | **source blocked** |
| **G3** | **~24,500 existing citation resolutions are ambiguous pins** | 10.6% of 1,104 sampled resolved refs have a key mapping to >1 judgment | any advocate who follows a citation and lands on the wrong case | **repair, deterministic** |
| **G4** | **61 live false pins from despatch stamps** | 827 stamp rows, 61 resolved, 35 targets | as G3, and it is a `CITATION_HARNESS` violation | **61-row UPDATE** |
| **G5** | **eCourts has never run** | `ecourts_observation` = 0; last real ingest 19 Aug | anyone who needs law newer than six days, and the six blind High Courts | **founder: the grant's numbers** |
| **G6** | **6 High Courts, 4,922,537 documents, ~0 citation identity** | Madras 258/1.7M · Patna 1/1.7M · MP 0/650k · Gujarat 0/422k | advocates in Chennai, Patna, Jabalpur, Ahmedabad, Hyderabad, Cuttack | **needs G5** |
| **G7** | **26.32% of citation-bearing judgments share their neutral citation** | 155,299 ambiguous keys; worst maps to 1,257 judgments | anyone citing a High Court judgment by neutral citation | **diagnose: ours or the source's** |
| **G8** | **469,599 documents are `PROVEN_DAMAGED` and OCR has never run** | `text_extraction_method = 'ocr'` on **0** documents | anyone whose authority happens to be one of them | **compute** |
| **G9** | **96.19% of judgment dates have no quality verdict** | 713,136 of 18,698,984 checked; 4.68% of those SUSPECT | every "later authority" and currentness claim silently | **compute** |
| **G10** | **Coram absent for 18,660,626 documents** | bench held for 38,326, all Supreme Court | any bindingness or bench-strength question | **hypothesis: our own headers** |
| **G11** | **0 source documents retained** | `storage_key` non-null on 0 of 18,698,984 | "show me the PDF" — impossible, not slow | **storage decision** |
| **G12** | **The Supreme Court corpus is the SCR reporter edition** | 35,570 of 38,342 carry the reporter running head | licensing exposure; training data; passage safety | **founder: legal** |
| **G13** | **131,056 byte-identical extractor-contamination documents** | 545 groups, largest 7,160 spanning 11 months | retrieval — identical nearest neighbours | **quarantine, 545 hand-adjudicable** |
| **G14** | **16 synthetic fixtures live in the production corpus** | `court = 'Test Court'`, growing 6 → 16 | the only add-to-matter refusals an advocate can hit are fake | **LCC's fixture path** |

---

## Why the order is this order

**G1 is first and it is not close.** It needs no source, no permission, no model
and no founder. Today an advocate reading a s. 138 Negotiable Instruments Act
judgment cannot be shown s. 138, although the corpus holds all 155 sections of
that Act. Highest value per unit of work in the entire ledger.

**Measured rather than assumed, and the first figure was wrong.** An earlier
draft of this queue said 471,110, derived as "862,594 total less the 391,484 that
point at the three missing codes". Running the join says otherwise:

```
distinct act_key values in judgment_statute_refs   10,483
  matching an Act we hold, after normalisation         267
  references those 267 keys carry                  323,985
  of which the Act is unambiguous                  323,524
```

**323,524, not 471,110.** The difference is that the extractor emits 10,483
distinct act-name variants against 846 held Acts, so "not one of the three
missing codes" does not imply "an Act we hold". The remaining 10,216 keys are
the measured size of a second gap — act-name normalisation — which nobody had
quantified.

**G2 outranks everything except G1 on pure advocate value** and sits second only
because it is genuinely blocked on a source. The Code of Criminal Procedure is
the **most-cited statute in the corpus** and we hold none of it.

**G3 and G4 are above the coverage gaps because a wrong answer beats a missing
one.** Verified is silent, so an advocate has nothing to distrust on a false
pin. A gap is visible; a false pin is not. G4 is 61 rows and one `UPDATE`.

**G5 unlocks G6 and most of G10**, which is why it sits above both.

**G8 is placed on evidence rather than size.** NEW2's earlier probe recovered
20/20 damaged documents by OCR against 0/20 by re-extraction, at ~3.7s a page.
The population is known and the method is known; only the compute has not been
spent.

**G12 is low in the queue and high in seriousness.** It changes nothing an
advocate can see today, and it is a licensing question with a real answer that
this lane cannot give.

---

## What is deliberately NOT in this queue

- **A bindingness / binding-vs-persuasive classifier.** The inputs do not exist
  for 99.8% of the corpus — `AUTHORITY_HIERARCHY_INPUT_LEDGER_V1`.
- **Bulk citation resolution at scale.** Gated behind G3 and G7, and
  `CITATION_RESOLUTION_SCALE_DECISION_V1` explains why scaling before repairing
  multiplies the defect.
- **Treatment enrichment at scale.** The pilot returned 0 of 11 hand-adjudicated
  candidates; scaling it would manufacture LAW MOVED badges.
- **A suppression mechanism.** No verified requirement exists, and building
  content suppression from an unverified policy assumption is what R7 §10
  forbids.
- **Destructive dedup.** 73.5% of what a content-hash dedup would delete are
  common orders that must never be deleted.
- **Any unauthorised source.** IndianKanoon, SCC Online, Manupatra, CaseMine,
  tribunal sites, gazette mirrors and state Act portals remain `NOT_AUTHORIZED`.
