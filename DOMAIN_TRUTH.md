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

## Overruled judgments
`is_overruled` and `overruled_by_judgment_id` on every judgment. An advocate
citing overruled law is nearly as damaged as one citing a fake case. Overruled
status renders wherever the judgment renders.

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
