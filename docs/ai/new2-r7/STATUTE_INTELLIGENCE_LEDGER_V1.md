# STATUTE_INTELLIGENCE_LEDGER_V1

**Lane:** NEW2 · **Round:** R7 §10 · **25 August 2026**
**Machine-readable acquisition evidence:** `docs/ai/new2-r7/statute-acquisition-probe.json`

---

## 0. The headline

**The three most-cited statutes in the corpus that we do not hold are IPC 1860,
CrPC 1973 and the Indian Evidence Act 1872 — and the Code of Criminal Procedure
is the single most-cited statute in the entire corpus.**

| statute | references | judgments citing it | held? | sections held |
| --- | ---: | ---: | --- | ---: |
| **Code of Criminal Procedure, 1973** | **280,027** | **186,382** | **NO** | **0** |
| Bharatiya Nagarik Suraksha Sanhita, 2023 | 129,295 | 111,199 | yes | 531 |
| **Indian Penal Code, 1860** | **93,881** | **58,599** | **NO** | **0** |
| Code of Civil Procedure, 1908 | 52,299 | 44,548 | yes | 171 |
| Bharatiya Nyaya Sanhita, 2023 | 21,175 | 16,929 | yes | 358 |
| Negotiable Instruments Act, 1881 | 18,136 | 12,202 | yes | 155 |
| **Indian Evidence Act, 1872** | **17,576** | **11,355** | **NO** | **0** |
| Motor Vehicles Act, 1988 | 14,055 | 10,612 | yes | 257 |
| NDPS Act, 1985 | 12,602 | 8,510 | yes | 129 |
| Limitation Act, 1963 | 11,546 | 9,519 | yes | 32 |
| Arms Act, 1959 | 7,817 | 7,318 | yes | 48 |
| POCSO Act, 2012 | 7,220 | 5,253 | yes | 47 |
| Hindu Marriage Act, 1955 | 5,503 | 4,239 | yes | 37 |
| Companies Act, 2013 | 4,227 | 2,626 | yes | 526 |

**391,484 references across 256,336 judgments point at the three repealed
criminal codes, and we hold no text for any of them.** Every pre-July-2024
criminal judgment in the corpus — the overwhelming majority of 18.7 million — is
decided under statutes we cannot show the advocate.

---

## 1. What is held

| | |
| --- | ---: |
| Acts in `statutes` | **846** |
| Acts with at least one section | 824 |
| Sections in `statute_sections` | **35,395** |
| Acts with an enactment date | 846 (100%) |
| Acts with an enforcement date | 758 (89.6%) |
| Acts with a Hindi title | 718 (84.9%) |
| Statute references extracted from judgments | 862,594 |
| **References linked to a `statutes` row** | **0** |

### The new criminal codes are complete

| Act | act number | enacted | in force | sections | India Code handle |
| --- | --- | --- | --- | ---: | --- |
| Bharatiya Nyaya Sanhita, 2023 | 45 of 2023 | 2023-12-25 | **2024-07-01** | 358 | `123456789/20062` |
| Bharatiya Nagarik Suraksha Sanhita, 2023 | 46 of 2023 | 2023-12-25 | **2024-07-01** | 531 | `123456789/20099` |
| Bharatiya Sakshya Adhiniyam, 2023 | 47 of 2023 | 2023-12-25 | **2024-07-01** | 170 | `123456789/20063` |

### The old criminal codes are absent

`statutes` contains **no row** whose title matches the Indian Penal Code, the
Code of Criminal Procedure or the Indian Evidence Act, under any spelling. The
only 1860/1872/1973 Acts held are the Societies Registration Act, the Indian
Contract Act, the Indian Christian Marriage Act, the Punjab Laws Act, and four
unrelated 1973 Acts.

---

## 2. Every statute reference is unlinked — `statute_id IS NULL` on all 862,594

`judgment_statute_refs` carries `act_key`, `act_named`, `section_number` and a
nullable `statute_id`. **The `statute_id` is NULL on every single row**, for
every act, including the 824 acts whose sections we do hold.

So today: an advocate reading a judgment that cites *"Section 138 of the
Negotiable Instruments Act"* cannot be shown s. 138 — even though the corpus
holds all 155 sections of that Act. The extraction and the library exist and are
not joined.

This is the cheapest large win in this ledger: a deterministic join on `act_key`
→ `statutes`, needing no acquisition, no model and no new source. **Measured
yield: 323,524 references.**

```
distinct act_key values                      10,483
  matching a held Act after normalisation        267
  references they carry                      323,985
  of which the Act is unambiguous            323,524
```

An earlier draft put this at 471,110 by subtracting the three missing codes from
the total. That over-counts: the extractor emits 10,483 act-name variants against
846 held Acts, so "not a missing code" does not mean "an Act we hold". **The
remaining 10,216 unmatched keys are a second gap — act-name normalisation — which
this measurement is the first to size.**

---

## 3. The adapter path — fixed, and a live source-drift event

R7 §10: *"Fix the real India Code/official-source adapter path first."*

### 3.1 The old path is dead

`services/ingest/src/repealed-acts.ts` carries three handles verified against the
site on 8 Aug 2026. `OBSERVED_BY_PRIMARY_SOURCE`, today:

```
https://www.indiacode.nic.in/handle/123456789/11091   404   686 B of "500 Server Error/404 Page Not Found"
https://www.indiacode.nic.in/handle/123456789/4221    404
https://www.indiacode.nic.in/handle/123456789/4218    404
https://indiacode.gov.in/handle/123456789/11091       200   2,338 B of Angular SPA shell
```

**The new host answers HTTP 200 with a JavaScript shell.** That is the exact
anomaly R7 §10 names, observed live: an adapter that trusts a 200 parses an empty
page and reports success. `repealed-acts-cli.ts` refused correctly —
*"REFUSED: handle returned "", expected INDIAN PENAL CODE"* — because it checks
the title rather than the status code. That check is why this is a diagnosis and
not a silent corruption.

Recorded as `FAILED_SOURCE_SHAPE` in `SOURCE_FRESHNESS_AND_DRIFT_CONTRACT_V1`.

### 3.2 The working path is DSpace 7 REST

```
base       https://indiacode.gov.in/server/api
search     /discover/search/objects?query=<q>&dsoType=item&size=N[&scope=<uuid>]
bundles    /core/items/{uuid}/bundles  ->  /core/bundles/{uuid}/bitstreams
content    /core/bitstreams/{uuid}/content
CENTRAL community            f467b316-98f0-4c08-a722-a2627e45bc19
"Acts Not Enforced" community 500e8c30-1eeb-4313-9361-39eb76bee358
```

`/pid/find?id=hdl:...` returns 404 and `/core/items` requires authentication;
discovery search is the route that works unauthenticated.

### 3.3 What the site actually holds for the three codes

Searched exact-title, then fetched every item's bundles. `OBSERVED_BY_PRIMARY_SOURCE`:

| code | exact-title items | items carrying a PDF | verdict |
| --- | ---: | ---: | --- |
| Indian Penal Code, 1860 | 3 | **1** — `123456789/547803` | **PARTIAL** |
| Indian Evidence Act, 1872 | 4 | **2** — `123456789/547821`, `123456789/550883` | **COMPLETE (one of them)** |
| Code of Criminal Procedure, 1973 | 4 | **0** | **NOT AVAILABLE** |

**"Acts Not Enforced" does not hold them.** Scoped search returns the Whistle
Blowers Protection Act and the Delhi Rent Act, and nothing else. India Code
describes itself as holding *enforced* Acts; these three were repealed on
1 July 2024 and have largely left it.

**And the one IPC item with a PDF is a state record, not the Central Act.** Its
metadata:

```
dc.identifier.act_id      AC_CH_60_1313_00014_00014_1563339518623      <- CH = Chandigarh
dc.identifier.state_name  Chandigarh
dc.identifier.department_name  Model Jail Department Chandigarh
dc.identifier.uri         http://test1.indiacode.nic.in/handle/...     <- a TEST host
```

The CrPC items are Chhattisgarh's records and carry `refact =
AC_CEN_5_23_000010_197402_1517807320555`, pointing at a Central act id whose item
has no bitstream.

---

## 4. What was acquired, parsed, and why NOTHING was written

All three PDFs were downloaded and parsed. **`statutes` and `statute_sections`
were not written to.**

| file | bytes | sha256 (16) | pages | extracted chars |
| --- | ---: | --- | ---: | ---: |
| `the_indian_penal_code,_1860.pdf` | 191,038 | `4e861464e71d4cfe` | 58 | 100,429 |
| `indian_evidence_act.pdf` (547821) | 452,020 | `a36ef40d2f3b2c61` | 60 | 175,991 |
| `indian_evidence_act_1872.pdf` (550883) | 8,602,305 | `403ae31e1420d82d` | — | — |

### 4.1 The Evidence Act: complete document, 93.4% section recall

The 547821 PDF is complete — it ends at `THE SCHEDULE. –– [Enactments repealed.]
Rep. by the Repealing Act, 1938`. Recall measured against **the document's own
arrangement of sections**, which is ground truth from the document rather than
from memory:

```
arrangement of sections lists   183 distinct section numbers
body parsed                     171                          (93.44%)
parsed but not in the TOC         0                          (no fabrication)
missing                          12   — 13, 17, 18, 82, 86, 105, 123, 131, 145, 146, 158, 161
```

Three parser defects were found and fixed to get there (§5). **93.44% is still
not writable.** s. 105 — burden of proving that a case falls within an exception —
is among the missing, and a corpus that holds the Evidence Act without it is
worse than one holding no Evidence Act at all: a search for s. 105 returns a
confident empty from a table claiming to hold the Act.

### 4.2 The Indian Penal Code: the source document is partial

58 pages, 100,429 characters, and the running text stops in the theft/extortion
region. Parsed sections run **1 → 120B** plus a single stray 511. The IPC has
511 sections. **This is not a parsing shortfall — the Chandigarh PDF does not
contain the whole Act.**

### 4.3 The 1872 original scan is unusable

`123456789/550883` is an 8.5 MB scan of the 19th-century printed original. Its
extracted text reads `THE INDIAN EVIDENCE ACT, 1872~ / CONT'ENT S. / RELEVANCY
OF }'ACl'S. / SJiJCTION. / nepeal of enactments.` — `PROVEN_DAMAGED` by any
measure. Retained as the historical original; unusable as text.

### 4.4 The IPC text we do hold is a pre-2019 version

The Chandigarh PDF's s. 1 reads *"shall extend to the whole of India except the
State of Jammu and Kashmir"* — text superseded by the J&K Reorganisation Act,
2019. So even the partial document is not the IPC as it stood at repeal on
1 July 2024. **Recorded, per R7 §10: enacted text is not current text, and this
lane does not infer one from the other.**

---

## 5. Three parser defects fixed, each with its cause

`services/ingest/src/repealed-acts.ts`. All 21 existing tests pass; recall on the
Evidence Act went **138 → 171 of 183**.

| # | defect | why it mattered |
| --- | --- | --- |
| 1 | **a heading that wraps across a line break never terminates** — `32. Cases in which statement of relevant fact by person who is dead or cannot be found, etc., is\nrelevant. –– …` | s. 32 is dying declarations. The fix is one optional, lazy group, so it is strictly additive: every heading that parsed before parses identically |
| 2 | **the amendment marker does not always carry an asterisk** — this Act prints `2[65A.`, the IPC prints `4*[18.`, and `\*+` required at least one | invisible: s. 65A and 65B (electronic records), s. 113A (abetment of suicide by a married woman), s. 113B (dowry death), s. 114A — the modern provisions, absent precisely because they are the amended ones |
| 3 | **`keepAscendingRun` ranked sections by `parseInt`**, so `65`, `65A` and `65B` were all 65 — and a strictly increasing run can hold one value | **30 sections lost, silently.** The survivor looked perfectly correct; only counting the Act's own arrangement against the body revealed it. Fixed by a single `sectionOrdinal()` used by both the comparator and the run |

Defect 3 is the instructive one: it was invisible as a parse failure. Nothing
errored, nothing looked wrong, and the output was a plausible statute missing a
sixth of itself.

---

## 6. Correspondence — official, dated, and 2.7% complete for IPC→BNS

`statute_mappings`, 226 rows, all from the **Bureau of Police Research and
Development** comparison PDFs — an official source, and each row carries an
`effective_date`.

| old → new | rows | with an effective date | source |
| --- | ---: | ---: | --- |
| Evidence Act → BSA | 117 | 117 | `bprd.nic.in/.../Comparison Summary BSA to IEA.pdf` |
| CrPC → BNSS | 95 | 95 | `bprd.nic.in/.../Comparison summary BNSS to CrPC.pdf` |
| **IPC → BNS** | **14** | 14 | `bprd.nic.in/.../COMPARISON SUMMARY BNS to IPC .pdf` |

**14 mappings for the transition an advocate meets every day.** The IPC has 511
sections and the BNS 358. An advocate asking "what is the new section 302" is
answered for 14 sections and unanswered for the rest.

**R7 §10 is explicit and is obeyed: `Do not infer temporal applicability from
correspondence.`** These rows say s. X corresponds to s. Y. They do not say which
applies to an offence committed on a given date, and nothing in this lane derives
that.

---

## 7. States, per R7 §10's required fields

| field | state |
| --- | --- |
| official identity / source | **HELD** for all 846 acts — India Code `act_id`, handle, act number, year |
| enacted text | **HELD** for 824 acts (35,395 sections); **NOT HELD** for IPC, CrPC, IEA |
| current / versioned text | **NOT HELD for any act.** `statutes` has one text per act with no version dimension |
| section aliases | **NOT HELD** |
| amendment events | `statute_amendments` and `statute_amendment_unparsed` are **both empty (0 rows)** |
| commencement / effective evidence | enforcement date on 758 of 846; per-section commencement `NOT HELD` |
| repeal / substitution | **NOT HELD** — `dc.identifier.repealed` reads `false` even on records of repealed Acts, so the source field is not trustworthy either |
| correspondence provenance | **HELD** — BPRD, with dates, 226 rows |
| judgment references | **HELD but UNLINKED** — 862,594 refs, `statute_id` NULL on all |
| unknown state | recorded here rather than defaulted |

---

## 8. What to do next, in the order the demand data implies

1. **Link the 323,524 statute references we can already satisfy.** A
   deterministic `act_key` join, measured yield. No acquisition, no model, no new
   source. Largest value per unit of work in this document. Normalising the other
   10,216 act-name variants is the natural follow-on.
2. **Acquire CrPC 1973** — 280,027 references, the most-cited statute in the
   corpus, and India Code does not hold it. Needs a different authorised source;
   see `AUTHORIZED_SOURCE_DELTA_PLAN_V1`.
3. **Acquire a complete IPC 1860.** The India Code copy is partial and pre-2019.
4. **Finish the Evidence Act parse** from 171 to 183, then write all three.
5. **Complete IPC→BNS correspondence** beyond the 14 official rows — and never by
   inference. If the BPRD PDF holds only 14, the rest is `UNKNOWN` and must
   render as `UNKNOWN`.

Items 2 and 3 are source questions, not engineering ones, and are the only
statute items in `docs/FOUNDER_QUEUE.md`.
