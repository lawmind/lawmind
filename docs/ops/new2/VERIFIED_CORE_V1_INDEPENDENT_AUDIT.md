# INDEPENDENT AUDIT — VERIFIED_CORE_V1

**Owner:** NEW2 · **21 Aug 2026** · **n = 40 of 125, judged from the documents' own
text before anything of LCC's was opened.**

---

## 1. Method, and the part of it that matters

LCC asked for this rather than resting on their own number, and said why: their
precision figure was produced by one adjudicator, and that adjudicator wrote the
verifier.

- The population is `docs/ai/lcc-semantic-core/verified-core-v1-ids.txt`, 125 ids.
  **Only the id list was read.** `role-claims.jsonl`,
  `ACCEPT_PRECISION_ADJUDICATION.md` and `VERIFIED_CORE_V1.md`'s per-document
  material were not opened until the verdicts below were written to disk.
- 40 drawn by `sha256('new2-core-audit-v1:' + id)` order — deterministic, so the
  sample cannot be re-rolled until it flatters a conclusion.
- Each document judged from its **own text**: cause title, and the operative tail
  where an Indian order states its direction. Every verdict carries the sentence
  it rests on.

**The question is P4's, and it is not the question LCC's verifier answers.** They
verify that a claim's span sits in the court's voice. This asks whether the
DOCUMENT is a substantive, citable authority. Both are legitimate; they are not
the same, and §5 is about which of them the word "core" promises.

---

## 2. Result

```
SUBSTANTIVE       18    45.0%
PROCEDURAL        11    27.5%     <- false-substantive
BAIL               4    10.0%
IDENTITY_UNSAFE    3     7.5%
UNCERTAIN          4    10.0%
```

```
false-substantive, procedural only          11 / 40   27.5%   [13.7, 41.3]
+ bail, which is not a substantive authority 15 / 40   37.5%   [22.5, 52.5]
excluding UNCERTAIN                          11 / 36   30.6%   [15.5, 45.6]
```

**The directive on this audit says not to accept 12–15%. The measured rate is
27.5%, and the lower bound of the interval is 13.7%.** Even the most favourable
reading of this sample does not clear the bar.

### The eleven, and the sentence each rests on

| | court | why it is not a substantive authority |
|---|---|---|
| 1 | Kerala | records a Government Pleader's undertaking; *"no further specific directions are necessary"* |
| 6 | Gauhati | interlocutory suspension application refused *"at this stage"* |
| 8 | Orissa | directs the Tahasildar to work out a direction **already contained in Annexure-4** |
| 11 | Himachal Pradesh | *"This order does not pronounce on the finality of the rights of the parties"* — the court says it itself |
| 12 | Allahabad | disposed at counsel's own request in view of settled law |
| 15 | Andhra Pradesh | directs an authority to *"safeguard the interest of the Hamalies"*; no determination |
| 16 | Gauhati | **transfer petition** — case management between District Judges |
| 18 | Gujarat | vehicle-release directions: photographs, panchnama, videography |
| 22 | Gujarat | disposed *"with these observations"*; police told to inform the petitioner |
| 26 | Bombay | **chamber summons** disposed; a motion stands adjourned |
| 33 | Karnataka | directs the Deputy Commissioner **to consider** the application within 15 days |

Number 11 is the one to read twice. The court states in terms that the order
decides nothing about the parties' rights, and it is inside a set named a core.

---

## 3. Four findings that are not about LCC at all

**Three of the four UNCERTAIN rows are uncertain because the document's TAIL IS A
SERVICE LIST.** Madras and Telangana orders end with the addressee list and the
certified-copy footer, so the last 1,800 characters contain no operative text.
Any method that reads a tail to find the direction — mine here, and any
verifier's window — silently gets a footer for those courts. This is the same
failure shape as the tail-only probe NEW2 has been caught by before.

**Three of forty documents are one document covering many registered cases** —
7.5%, and each carries a single case number:

- Bombay `EXA/1367/2025`, headed *"SERIAL NOS. 901 TO 1086 AND 1090, 1094 AND 1097
  TO 1156"*;
- Gujarat `SCA/7364/2003`, covering Special Civil Applications **7202 to 7456** of
  2003;
- Telangana `TRCMP/572/2015`, 23 Transfer CMPs in one common order.

That is an identity question and it bears directly on LCC's `DECISION_IDENTITY_V1`
(bus 0973): a CNR-to-decision model that assumes one document is one decision has
the inverse problem here — one document is **255** decisions.

**Two documents carry visible extraction damage my own detector calls UNKNOWN.**
Chhattisgarh #5 reads *"Divisian Benc"*, *"edch"*, *"o1 Qkm Paijam'ya"* — OCR
noise below any threshold in `text-damage-v2.0`. Bombay #26 has its header
**triplicated** by the extractor (`IN THE HIGH COURT OF JUDICATURE AT BOMBAYIN
THE HIGH COURT…`). Neither is a glyph dump, neither destroys word spacing, and
both are damaged. **My detector's recall is not measured and these two are the
evidence that it is not 100%** — which is exactly why its output is
`TEXT_UNSAFE_VERIFIED` and `UNKNOWN`, never `CLEAN`.

**One document's stored class is contradicted by its own text.** Bombay #34 is
`procedural_disposal` via a `Dispossed Off/Dismiss for Default` disposal string,
while the text is a reasoned refusal to exercise writ jurisdiction at an
interlocutory stage. A false-PROCEDURAL, which is the cheaper error of the two
but is still the disposal string overriding the document.

---

## 4. What this does NOT say

- **It does not refute the role verifier.** Nothing here re-checks whether a span
  sits in the court's voice. A document can carry a correctly verified
  court-authored span and still be a transfer order.
- **n = 40.** The interval is ±14 points. "About a quarter" is the honest phrasing;
  "27.5%" is the point estimate and should not be quoted without the interval.
- **Bail is reported apart from procedural on purpose.** Judges cite bail orders —
  12 of NEW3's 250 verified gold authorities are bail orders — and NEW2 has
  already had to correct itself for calling them impure. They are not substantive
  authorities and they are not noise.
- **One labeller — me.** The same objection LCC raised against their own figure
  applies to this one. What it has that theirs does not is independence from the
  verifier, and a quoted sentence for every verdict so any of them can be
  overturned by reading the document rather than by trusting the labeller.

---

## 5. The recommendation

**The definition is defensible; the NAME is not.** `SEMANTIC_ROLE_VERIFIED` means
what LCC says it means, precisely and narrowly, and their own message says it does
not identify a ratio. But `VERIFIED_CORE_V1` — and calling the last clause "the
real purity cost" — invites every downstream lane to read the 125 as a clean
authority set, and about a quarter of it is not.

One clause would close most of the gap and it already exists in this repo:
`hc_document_class`. Nine of the eleven false-substantives are transfers, chamber
summonses, directions-to-consider and interlocutory refusals — the shapes
`procedural_disposal` and the role vocabulary already name. **Requiring a document
role before admitting to a core costs almost nothing and removes the failure this
audit found**, and it does not touch the verifier at all.

If the set keeps its name, the caveat has to travel with it: *a core document is
one whose verified span is in the court's voice, and that is not a claim that the
document is an authority.*
