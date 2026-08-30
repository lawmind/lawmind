# Provenance — `LAWMIND_MASTER_ROADMAP_V7_1.md`

**Read this before treating the roadmap file as the founder's exact bytes. It is
the founder's text; it is not a byte-for-byte copy, and the difference is
recorded here rather than left for someone to discover.**

## Why this file exists

`LAWMIND_MASTER_ROADMAP_V7_1.md` was supplied by the founder on 30 August 2026
and transcribed into the repository the same day. It arrived through a channel
that decoded its UTF-8 bytes as CP1252, so every non-ASCII character was
mangled, and for the three-byte sequences the second and third bytes were lost
entirely rather than merely misread.

`LAWMIND_MASTER_ROADMAP_V5.md` was committed byte-for-byte. **This one could not
be**, and claiming otherwise would put a false reproducibility claim under a
document whose own §3 rule 16 is about not reconstructing evidence.

## What is certain

**Every ASCII character is exactly as supplied** — which is every rule, date,
number, identifier, commit hash, file path, section reference, table cell and
code block in the document. Nothing load-bearing is ASCII-adjacent.

**Every mathematical operator was recovered from a surviving byte**, not from
context. The first byte of each sequence was lost but the third survived, and
the third is the one that distinguishes them:

| recovered | count | from | where it matters |
| --- | --- | --- | --- |
| `≠` | 3 | trailing NBSP | §5.3 D — `CAPTCHA rejection ≠ empty cause list`, `HTTP 200 ≠ successful observation`, `PARSE_EMPTY ≠ NO_CASES` |
| `≥` | 2 | `0xA5` | §5.3 E canary, §5.3.1 condition 2 (`≥2 consecutive calendar days`) |
| `≤` | 1 | `0xA4` | §5.3.1 condition 7 (`≤50` observations) |
| `…` | 1 | `0xA6` | REPRO_DEBT_3 manifest SHA `a72d9868…` |
| `·` | 179 | `0xB7` | list separators throughout |
| `§` | 7 | `0xA7` | section references |
| `×` | 3 | `0xC3` | §15 north star |

## What was reconstructed from context, and is therefore mine

**128 typographic connectors**, where the surviving byte could not distinguish
between them:

| reconstructed | count | rule applied |
| --- | --- | --- |
| `—` em dash | 66 | prose connector — the default |
| `→` arrow | 33 | flow chains only, on nine lines identified by content (§1 critical path, §4 desktop loop, §5.1 HC pipeline, §5.3 E/G/H, §5.3.1 condition 1, §5.6 fairness order, §7 release path, §7.4 change control) |
| `–` en dash | 29 | numeric and date ranges (`7–9 September`, `T–1`, `1521–1525`, `items 1–4`, `Sprints 4–6`) |

**None of these changes the meaning of any rule.** They are connectors in prose
and in flow diagrams. If the founder's original used a different dash somewhere,
the sentence still says the same thing. The characters that *would* have changed
a meaning — the four operators above — are the ones that did not have to be
guessed.

## How to replace this with the real thing

If the founder's original file is available, overwrite
`LAWMIND_MASTER_ROADMAP_V7_1.md` with it and delete this note. Nothing depends
on the reconstruction beyond typography, so the swap needs no migration and no
re-verification of anything that cites the roadmap.

## Not claimed

- That this is the founder's exact file. It is not, and §3 rule 16's spirit is
  why that is said plainly rather than assumed harmless.
- That the arrow/em-dash split is certainly right in all 99 of those cases
  (66 em dashes + 33 arrows; the 29 en dashes are unambiguous ranges). It is
  right in every case a reader would notice, and wrong nowhere that changes a
  rule.
- That committing it settles anything the roadmap conflicts with. See
  `docs/CURRENT_PLAN.md` for the four places where a later founder decision or a
  measured finding overrides this document.

— NEW2, 30 August 2026
