# ACTS_PARSER_PROOF_R8_3 — R8.3 §11 N2-6

**Lane:** NEW2 · **26 August 2026**
**IPC 1860 ingested at 552 sections, every gap explained by the Act's own repeals. The Indian Evidence Act is `NOT_ACQUIRED` and the reason is specific, not a shrug.**

**Artifacts** — `scripts/n2-act-acquire.mts` ·
`docs/ai/new2-r83/ipc-1860-acquisition.json` ·
`docs/ai/new2-r83/crpc-1973-acquisition.json`

---

## 1. What §11 N2-6 asks, per Act

| requirement | CrPC 1973 | IPC 1860 | IEA 1872 |
| --- | --- | --- | --- |
| source checksum | **two platforms agree** | **one platform** | — |
| TOC vs body distinction | body from `ACT NO.`, TOC discarded | same | — |
| expected section structure | 484 published | 511 published | 167 published |
| parser recall | **484 / 484 bare + 49 lettered** | **493 / 511 bare + 59 lettered** | — |
| gaps explained | 0 gaps | **18, all printed as repealed by the Act** | — |
| amendment/effective metadata | enforcement read from s.1(3) | recorded, see §4 | — |
| no false old↔new equivalence | no mapping written | no mapping written | — |
| **verdict** | `AVAILABLE_COMPLETE` | `AVAILABLE_COMPLETE` | **`NOT_ACQUIRED`** |

---

## 2. The evidence is NOT equal across the two, and the artifact says so

CrPC has a **byte-identical copy on a second government platform** — MHA's
`ccp1973.pdf` matches India Code's published MD5 and byte count exactly. That is
two independent custodians agreeing on the same bytes.

**The IPC has no such control.** The CENTRAL item `972afbe0` holds
`A1860-45.pdf` (1,104,850 B), which is a *different file* from the ingest source
`ipc_act.pdf` (1,529,218 B), and its text derivative is truncated at exactly
100,000 characters — 81 of 511 sections. No second platform was found serving
byte-identical IPC bytes.

So the IPC acquisition rests on **one platform's checksum**. The artifact records
`identity_control: NONE` with that reason in words rather than leaving the field
absent, because a missing field reads as an oversight and a stated `NONE` reads
as a measurement.

---

## 3. Recall, and the difference between a gap and a defect

```
IPC   parsed 552 sections — 493 of 511 bare (96.5%), 59 lettered
      missing 18 — 18 printed as repealed/omitted by the Act itself, 0 unexplained
```

**A missing section is not automatically a parse failure.** These editions print
repealed sections as a bracketed heading with no body:

```
13.  [Definition of “Queen”.] Omitted by the A. O. 1950.
226. [Unlawful return from transportation.] Rep. by the Code of Criminal Procedure (Amendment)…
478. [Trade Mark.] Rep. by the Trade and Merchandise Marks Act, 1958 (43 of 1958), s. 135…
492. [Breach of contract to serve at distant place…]
     Rep. by the Workmen's Breach of Contract (Repealing) Act, 1925 (3 of 1925), s. 2 and Sch.
```

The 18 gaps are 13, 15, 16, 56, 58, 59, 61, 62, 161–165, 226, 478, 480, 490, 492
— the classic IPC repeals, including ss.161–165 which the Prevention of
Corruption Act 1988 took over.

`all_gaps_explained` is now a **gate**: the run refuses to write if any gap is
not accounted for by the Act's own text. That is the difference between "our
parser lost 19 sections" and "Parliament repealed 18", and only one of those is
a defect.

### Two rules the IPC added to the parser

The IPC's typography broke two assumptions the CrPC run had not:

1. **s.492's repeal note is on the NEXT line.** A one-line repeal detector
   reported it as an unexplained gap. The marker is now looked for across the
   wrap.
2. **s.17 prints `[17 “Government”.—The word…` with NO period after the
   number** — the footnote bracket swallowed it. The period is now optional when
   a bracket opens the line.

The second fix also picked up one more CrPC lettered section, 48 → 49, which is
the useful kind of side effect: a rule derived from one Act found a gap in
another.

---

## 4. Amendment and effective metadata — what is recorded and what is not

| field | CrPC | IPC | basis |
| --- | --- | --- | --- |
| `enactment_date` | 1974-01-25 | 1860-10-06 | the Act's own title page |
| `enforcement_date` | 1974-04-01 | 1862-01-01 | CrPC s.1(3) read off the artifact; IPC s.1 |
| repealed by | BNSS 2023 (Act 46 of 2023) | BNS 2023 (Act 45 of 2023) | `DOMAIN_TRUTH.md` |
| repealed from | 2024-07-01 | 2024-07-01 | `DOMAIN_TRUTH.md` |

**Per-section amendment footnotes are `NOT_EXTRACTED` for either Act.** The
`statute_amendments` table exists and is populated for other Acts from printed
footnotes; these two carry footnote markers (`1*[`, `2*[`) in their body text but
the notes themselves were not parsed. That is a real follow-on, not a claim.

**No old↔new correspondence row was written.** India Code publishes no
IPC↔BNS mapping and `DOMAIN_TRUTH.md` forbids generating one. `statute_mappings`
is untouched.

---

## 5. Indian Evidence Act 1872 — `NOT_ACQUIRED`, and the reason

Three candidate text derivatives, all measured:

| item | file | chars | bare sections of 167 |
| --- | --- | ---: | ---: |
| `b62073e0` CENTRAL | `A1872-1.pdf.txt` | 100,000 | 66 |
| `e51341fa` | `indian_evidence_act.pdf.txt` | 100,000 | 65 |
| `61e8abcf` | `indian_evidence_act_1872.pdf.txt` | 164,754 | **95** |

**No untruncated official derivative reaches usable recall.** Two are the
100,000-character cap. The third is not truncated and still parses only 95 of
167 — it is the 1872 print scan that R8.1 recorded as `PROVEN_DAMAGED`, and the
loss is in the artifact, not in the reader.

The route that remains is **extracting text ourselves from the CENTRAL
`A1872-1.pdf` (639,810 B)**, which introduces an extractor whose recall is
`NOT_MEASURED` on this corpus — and `poppler deletes Devanagari` is a defect this
programme has already paid for once. That is a bounded piece of work with a real
verification requirement, and it is **not** done here.

**Cost of leaving it: 17,576 statute references stay unlinked.** Stated plainly
so nobody reads 79.94% as finished.

---

## 6. What the two acquisitions moved

```
judgment_statute_refs linkable
  session start   320,729   37.18%
  + CrPC          595,721   69.06%
  + IPC           689,547   79.94%
```

The apply is ~370k row updates and is `HEAVY_BOX` work. It is **prepared and
gated, not run**; the live DB reads 315,351 linked.

---

## 7. State

| item | state |
| --- | --- |
| IPC 1860 ingested, 552 sections | **`PROVEN`** — verified by re-read |
| every IPC gap explained by the Act's own repeal text | **`PROVEN`** — and now a gate |
| IPC identity rests on ONE platform | **`ACKNOWLEDGED_WEAKNESS`**, recorded in the artifact |
| CrPC ingested, 533 sections | **`PROVEN`** |
| per-section amendment footnotes | **`NOT_EXTRACTED`** for both Acts |
| old↔new code correspondence | **`NOT_WRITTEN`**, deliberately |
| IEA 1872 | **`NOT_ACQUIRED`** — no usable official derivative; needs our own extraction |
| our own PDF extractor's recall | **`NOT_MEASURED`** — the reason IEA is not forced through |
