# LAWMIND — DOMAIN TRUTH

Indian legal facts. **If a legal fact is not in this file, it does not exist.**
Never state a section number, citation format or procedural rule from model
memory. Additions require the advocate on retainer signing off.

## The 2024 criminal law replacement — most important section

On 1 July 2024 three new codes replaced the colonial-era criminal statutes:

| Old | New | Full name |
|---|---|---|
| Indian Penal Code, 1860 | BNS | Bharatiya Nyaya Sanhita, 2023 |
| Code of Criminal Procedure, 1973 | BNSS | Bharatiya Nagarik Suraksha Sanhita, 2023 |
| Indian Evidence Act, 1872 | BSA | Bharatiya Sakshya Adhiniyam, 2023 |

**No frontier language model was trained on these.** Every model answers with
IPC/CrPC sections. Our largest factual edge and our largest hallucination risk.

Rules:
- Any criminal-law answer states which regime applies. Offence before 1 July 2024
  is tried under IPC/CrPC; after, under BNS/BNSS.
- When a user names an old section, show the new equivalent and vice versa.
- The mapping lives in `statute_mappings`, seeded from indiacode.nic.in. Never
  hardcode a mapping in application code. Never let a model generate one.
- Mappings are not always 1:1. Some sections split, some merge. Where the mapping
  is not clean, say so rather than picking one.

## Four classes of statutory material — never collapsed into one

**Government-published does not mean statutory.** The BPRD handbooks NEW3 found
(bus 0568, 0604) are Ministry of Home Affairs work product, authored by a serving
IPS officer, hosted on `bprd.nic.in` — official by every ordinary meaning of the
word, and **still not the law**. They self-describe as *"commentaries added to
provide the rationale behind the changes"*. A rationale for a section is not the
section.

The distinction is load-bearing rather than pedantic. An advocate quoting a
handbook's paraphrase to a judge as the text of BNS s. 103 is in the same
position as one citing a case that does not exist, and the four classes below
travel through different parts of this system for that reason:

| class | what it is | example | may be quoted as law | may be trained on |
| --- | --- | --- | --- | --- |
| **PRIMARY STATUTE** | the enacted text | BNS 358 sections, `statute_sections` | **yes** | yes |
| **OFFICIAL EXPLANATORY MATERIAL** | government commentary on the text | BPRD handbooks — BNS 553,880 · BNSS 797,158 · BSA 257,046 chars | **no** | yes — it is a primary *government* source, not a model's commentary |
| **CORRESPONDENCE TABLE** | official old↔new section mapping | BPRD comparison summaries, `statute_mappings` | as a mapping, **never as text** | yes |
| **DERIVED LAWMIND OBJECT** | anything we computed | extracted section roles, chronologies | **no** | only with its evidence span |

Rules:

- **Explanatory material never populates `statute_sections`.** That table is the
  enacted text and nothing else. A handbook paragraph appearing there is
  indistinguishable from statute once it has been retrieved.
- A handbook may be **retrieved and shown**, labelled as commentary, and may
  answer *"why did this change"* — the question the bare correspondence table
  cannot answer and the reason these documents are worth holding at all.
- Its size is not evidence of importance: the BNSS handbook is **10.2x** its own
  comparison table because prose is longer than a table, not because it says
  more law.
- **Never train on a model's commentary about law** (CLAUDE.md §6) is untouched
  by this. A Ministry of Home Affairs handbook is a primary government source; a
  frontier model's summary of it is not, and no amount of quoting makes it one.

## Court hierarchy
Supreme Court → 25 High Courts → District and Sessions → Judicial Magistrate /
Civil Judge. Tribunals sit outside this line; appeal routes differ by statute —
do not assume.

Precedent: SC binds all. A High Court binds courts within its territorial
jurisdiction only. One High Court does not bind another — where they diverge,
show both. That divergence is high-value to an advocate and is exactly what
generic tools flatten.

## Citation formats
Neutral citations and reporter citations are different and both appear. Store
both. Never construct a citation string by pattern — render only what is stored.

**A neutral citation is NOT a unique identifier.** It identifies a *disposal
event*, and an Indian High Court routinely disposes of hundreds of connected
matters in one event while issuing each party a separate sheet. Every sheet
carries the same neutral citation, printed by the Registry, over different
parties, different case numbers and different text.

Measured 26 Aug 2026: 155,387 neutral citations are shared by 361,044 judgments,
the worst by 1,257. Eight of the eight worst groups, across eight different High
Courts, were refetched from the canonical source and **every one prints the
shared citation on the face of the PDF** — the court assigned it, not our
extractor and not the source metadata. `docs/ai/new2-r8/SHARED_NEUTRAL_RCA_V1.md`.

Three consequences that are easy to get wrong:

- **There is nothing to repair.** A "fix" that de-duplicated or re-assigned
  these citations would falsify the record.
- **`AMBIGUOUS` is the correct answer** when a citation resolves to several
  judgments, and it is the only correct one. There is no right rank-1 to pick.
- **Copy must not blame us.** "We could not confirm which case this is" is
  false. The truth is "this citation covers a batch of connected matters" — the
  first sounds like our failure, the second is the court's design, and they send
  the advocate to different next actions.

## Overruled judgments
`overruled_status` and `overruled_by_judgment_id` on every judgment. An advocate
citing overruled law is nearly as damaged as one citing a fake case. Overruled
status renders wherever the judgment renders.

**Three states, never a boolean:** `set_aside` · `partly_set_aside` · `doubted`
(plus `none`). Indian practice distinguishes them and the consequences differ —
`set_aside` means the authority cannot be relied on at all, `partly_set_aside`
means specified paragraphs fell while the rest stands, and `doubted` is still
binding. Collapsing them to a boolean is a correctness bug, not a simplification.
`overruled_paras` records which paragraphs fell. See `docs/SCHEMA_TRUTH.md`.

## Language
Legal Hindi is not conversational Hindi. Compound formal terms, specific forms of
address, archaic register. A draft that reads machine-translated is worse than
English. Law-graduate review gates every Hindi feature.

Devanagari renders in Noto Sans Devanagari everywhere including PDF export.

## Bar Council enrolment
No public verification API exists. Capture, mark unverified, review manually.
Never gate access — manual review on every signup strangles activation.

## Positioning — legal exposure
Lawmind is a research and drafting tool for licensed practitioners. It does not
give legal advice to the public. Never phrase output as advice to an end client.
Never claim to be a lawyer. This keeps us outside Bar Council scope and outside
unauthorised-practice exposure.
