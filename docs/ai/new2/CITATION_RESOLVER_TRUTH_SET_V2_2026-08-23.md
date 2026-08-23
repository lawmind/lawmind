# CITATION RESOLVER TRUTH SET v2.0.0 — the independent ground truth LCC's resolver is graded against

**Owner:** NEW2 · **Built:** 23 August 2026 · **Consumer:** LCC
(`citation-resolver-v0.1`), the fifth agent

`citation-truth-set-v2.json` · **283 records** · `truth_set_version` 2.0.0 ·
`resolver_version_under_test` recorded on every record so a later resolver
cannot re-grade itself silently.

v1.0.0 (22 Aug, 412 records) proved the four-question battery works. v2 is built
to the founder's field contract and is deliberately **harder**: the strata that
break a resolver are named populations rather than accidents of sampling.

**No corpus mutation. Nothing written to the database.**

---

## 1 · The relationship vocabulary, which is the whole point

| relationship | meaning | correct resolver behaviour |
| --- | --- | --- |
| `UNIQUE` | exactly one held judgment is the target, and the evidence says which | resolve |
| `LEGITIMATE_MULTI_TARGET` | several held judgments legitimately carry it | **REFUSE — never a pick** |
| `TARGET_NOT_HELD` | the reference is real; we hold nothing it names | refuse, and say so |
| `NOT_A_CITATION` | registry stamp, month code, or an extraction sentinel | reject before lookup |
| `SOURCE_UNAVAILABLE` | the citing document cannot be read well enough to say | refuse |
| `UNKNOWN` | the evidence does not settle it | **recorded as unsettled, never guessed** |

| relationship | records |
| --- | ---: |
| UNKNOWN | 81 |
| TARGET_NOT_HELD | 66 |
| UNIQUE | 56 |
| NOT_A_CITATION | 40 |
| LEGITIMATE_MULTI_TARGET | 39 |
| SOURCE_UNAVAILABLE | 1 |

## 2 · The strata, and what each one breaks

| stratum | records | what it is for |
| --- | ---: | --- |
| `NEUTRAL_BENCH_QUALIFIED` / `NEUTRAL_UNQUALIFIED` | 27 / 19 | the `-DB` suffix is part of the identity |
| `ALLAHABAD_LKO_AUR` | 24 | **20 of 24 are `LEGITIMATE_MULTI_TARGET`** — the single most dangerous stratum |
| `PH_SHARED_COMMON_ORDER` | 20 | the 253-judgment disposal event |
| `INSC` | 21 | the court's own neutral citation, resolves best |
| `SCC` / `SCR` / `AIR` | 30 / 30 / 16 | reporter forms. **AIR: 15 of 16 `TARGET_NOT_HELD`** |
| `OCR_DAMAGED_CITING` | 18 | does corrupt text manufacture citations? |
| `LOW_TEXT_QUALITY_CITING` | 13 | the same question from the other screen |
| `OTHER_FORM` | 22 | everything the pattern list does not name |
| `PLACEHOLDER_SENTINEL` | 10 | rows that must never enter a resolver at all |
| `PSEUDO_MONTH_STAMP_KEY` | 30 | registry despatch stamps sitting in the identity table |
| `SEED_UNSAFE_AMBIGUITY` | 3 | carried by edge id so sampling cannot lose them |

### Two strata that came back EMPTY, and that is the finding

- **`SCC_ONLINE` — zero edges exist.** `extractCitations()`'s pattern list covers
  INSC, HC neutral, SCC (two forms), `AIR YYYY SC N`, SCR (two forms) and SCALE.
  There is **no SCC OnLine pattern**, and no AIR High Court pattern. Those
  references are not extracted at all, so they can never be resolved, and they
  are invisible in every resolution-rate denominator. That is a recall gap of a
  different kind from `TARGET_NOT_HELD`, and it is not currently measured.
- **Month stamps in the edge table — 0.009%** (2 of 21,726). They are effectively
  absent there. **They live on `judgments.neutral_citation`: 441 judgments**, all
  Madras HC 2011, up to **9 sharing one stamp**, and they carry **no row in
  `judgment_citation_keys`** (probed on 200, zero key rows). A resolver reading
  only the key table never sees them; one reading `neutral_citation` — the second
  of three identity arms — resolves a despatch stamp to nine judgments.

## 3 · The unsafe ambiguity case: carried in, and then corrected

The founder's instruction was to include the unsafe ambiguity case v1 found. All
three v1 candidates are seeded by edge id. **On better evidence, none of them is
unsafe**, and saying so is more useful than preserving the scarier number:

| seed | v1 said | v2 says, with byte-identity |
| --- | --- | --- |
| `2025:AHC:20135-DB` | different authorities | same case title **and** case number across 2 rows — duplicate ingestion |
| `2025:AHC:52350` | different authorities | **BYTE-IDENTICAL** documents |
| `2025:AHC:119408` | different authorities | **BYTE-IDENTICAL** documents |

v1's classifier had no `content_hash` witness, so duplicate ingestion read as two
different authorities. v1's *"materially unsafe pin rate 5.88%"* is therefore an
overstatement of the dangerous class. **Corrected: 0 materially unsafe pins in
this sample** — every `LEGITIMATE_MULTI_TARGET` record that carries a stored pin
is a duplicate or a connected matter.

| ambiguity kind | records |
| --- | ---: |
| `SAME_AUTHORITY_HELD_MORE_THAN_ONCE` | 27 |
| `CONNECTED_MATTER_COMMON_ORDER` | 11 |
| **`DIFFERENT_AUTHORITIES`** | **1** |

### The one genuinely dangerous record

`T2-0044` — **`2026:JHHC:16965`**, carried by two different Jharkhand bail
matters:

| | |
| --- | --- |
| MD. MUSTAKIM KHAN v. STATE OF JHARKHAND | A.B.A./3820/2026 · 2026-07-14 · hash `0e460f3a` |
| SHEKH MAGANN v. STATE OF JHARKHAND | A.B.A./3051/2026 · 2026-06-12 · hash `7554c64e` |

Different parties, different case numbers, a month apart, different bytes. **A
pin on either shows an advocate the wrong authority as a fact.** It is currently
unpinned, which is correct. This is the record the truth set exists for.

## 4 · Primary-source validation — and the half of it that is structurally impossible

26 `UNIQUE` records were checked against the source PDFs with **poppler**, an
extractor independent of the `unpdf` path used at ingest. Two questions per
record: does the CITING document print this reference, and does the TARGET print
this citation as its own?

| | |
| --- | ---: |
| citing document prints the reference | **26 of 26 = 100%** |
| target prints the citation as its own | 13 of 26 |
| both confirmed | 13 |
| source unavailable | 0 |

Split by form, the second number stops looking like a failure:

| form | both confirmed |
| --- | ---: |
| INSC | 10 of 12 |
| neutral | 3 of 4 |
| **reporter (SCC/SCR/AIR)** | **0 of 10** |

**A judgment does not print its own reporter citation, because the reporter
assigns it after publication.** So primary-source corroboration of a resolved
target is available for court-assigned citations (**13 of 16 = 81.3%**) and is
**structurally unavailable for reporter forms**. A reporter-form pin can never be
strengthened by the paper; it rests entirely on our own alias and key tables.
That belongs in the resolver's confidence, not in a footnote.

## 5 · Fields, per the contract

```
truth_id · truth_set_version · source_checked_at · resolver_version_under_test
stratum · form_class
raw_reference · normalised_reference_stored · canonical_key
source_judgment_id · source_evidence{ court, date, case_title, case_number,
                                      source_pdf, text_quality, script_quality,
                                      full_text_chars, primary_source_checked }
printed_reference{ printed_span, offset_recorded, offset_found,
                   printed_in_citing_text }
canonical_candidates[]{ judgment_id, via, case_title, court, date, case_number,
                        neutral_citation, content_hash, title_check,
                        case_number_printed }
correct_target_ids[] · relationship · ambiguity_kind · ambiguity_reason
expected_resolver_behaviour
stored_cited_judgment_id · stored_relationship · stored_treatment_evidence
primary_source_verdict          (on the records checked against paper)
```

Two independent corroborations per candidate, chosen because they share no
tokens: **party names** printed beside the citation, and the **case number**
printed in the same span. A candidate agreeing on both is not one witness twice.

## 6 · A defect this build re-made, and caught

24 records first read `REFUSE_SPAN_UNVERIFIED` — the citing judgment apparently
not printing its own citation. All 24 had a newline inside `citation_text`
(`"2024 INSC\n262"`) matched against a whitespace-collapsed span. **This is the
exact bug v1 made, corrected in v1, and re-made here.** The needle is now
collapsed to the haystack's convention, and the comment saying why is the first
thing the loop does.

## 7 · Reproduce

```
node --env-file=.env services/ingest/.n2b-p0-truthset-v2.mjs    # 253 sampled records
node --env-file=.env services/ingest/.n2b-p0-supplement.mjs     # + 30 month-stamp keys
node --env-file=.env services/ingest/.n2b-p0-primary.mjs        # PDFs, independent extractor
```

Artifacts: `citation-truth-set-v2.json` ·
`citation-truth-primary-evidence.json`.
