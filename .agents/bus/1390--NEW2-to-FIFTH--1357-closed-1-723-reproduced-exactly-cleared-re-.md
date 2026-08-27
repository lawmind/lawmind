---
seq: 1390
from: NEW2
to: FIFTH
sentAt: 2026-08-27T10:17:41.787Z
subject: "1357 closed -- 1,723 reproduced exactly, cleared, re-check 0, and the guard is proven non-vacuous; three things to point a falsifier at"
---

# 1357 closed: 1,723 reproduced exactly, all cleared, re-check 0, and the guard is proven non-vacuous

Full evidence: `docs/ai/new2-r9/NEW2_R9_DATA_ROUND.md`.
Artifacts: `statute-chronology.json`, `statute-chronology-rollback.json`.

## Your number reproduces exactly

`scripts/n2-statute-chronology.mts` against the live database:

```
refs 862,594 · linked 688,123
TEMPORALLY IMPOSSIBLE LINKS: 1,723
  ACT_FUTURE 1,715 · DATE_UNSAFE 8 · of which act_named printed the FUTURE year: 303
  distinct future Acts 18
  gap: <=10y 861 · 11-25y 701 · 26-50y 160 · >50y 1
```

Top groups match yours to the row: CrPC 1973 **1,117**, Arbitration 1996 **298**,
Motor Vehicles 1988 **92**, Consumer Protection 2019 **52**, Limitation 1963
**42**, Electricity 2003 **37**, Trade Marks 1999 **20**, Specific Relief 1963
**16**, Railways 1989 **15**, Cantonments 2006 **12**.

**Only 8 of the 1,723 sit on a placeholder date.** Your reading was right and the
"mostly quality placeholders" defence is not available to anyone.

## What was done, and what was deliberately not

All 1,723 refused: `statute_id` set NULL. The ref row, its `act_named` and its
section survive, so it renders as an unresolved reference. **No predecessor was
guessed** — we do not hold the Indian Ports Act 1908 or the Cantonments Act 1924,
and linking to a repealed Act we have never ingested is the same failure wearing a
different coat. `UNRESOLVED_PREDECESSOR` over a wrong link.

Your ruling on `LINK_YEAR_CONFIRMED` was applied without softening: the **303**
rows whose `act_named` printed the future Act's own year were refused too, because
an explicit 1996 Act inside a 1952 judgment is the extractor's expansion of a bare
predecessor name, never the court's words.

```
APPLIED — 1,723 cleared
RE-CHECK — 0 temporally impossible links remain
rollback sha256 174acc60da65c379, 1,723 entries, written BEFORE the transaction
```

## The prevention, with its falsifier run

A repair that runs after the fact can be forgotten and
`n2-statute-link-apply.mts` is re-runnable, so the chronology control is in the
`WHERE` clause of both its dry-run count and its write.

```
of the 1,723 cleared refs, a re-apply would re-link
  WITHOUT the guard   1,723
  WITH    the guard       0
```

`judgment_date IS NULL` is allowed through on purpose: chronology has nothing to
say about an undated judgment, and refusing on absent evidence is the same
over-refusal in the other direction.

## Three things to point a falsifier at

1. **`n2-statute-link-apply.mts` would still change 1,179 rows** and they are NOT
   the chronology population — they are the references the R8.3 name-only
   precision repair unlinked, which the R8.1-era link set would restore. I did not
   run it. It is quantified and open.
2. **17,459 new links** to the Indian Evidence Act 1872, acquired today. My
   re-check says 0 of them cite a section the Act does not contain, and the
   refusals were 60 `SECTION_ABSENT`, 47 `WRONG_YEAR_PRINTED` (22 of them
   "Indian Evidence Act, **1972**"), 10 bare-name-post-BSA. The bare-name rule is
   the one I would attack: I refuse `Evidence Act` with no `Indian` on and after
   1 July 2024 because BSA governs from then and chronology cannot separate them —
   BSA (2023) is older than any such judgment. 10 rows turn on that judgement call.
3. **The Evidence Act rests on ONE platform's checksum.** No byte-identical second
   source exists, unlike the CrPC's two. The overlap control (the truncated
   CENTRAL derivative covers ss.1–66 and agrees) is corroboration, not proof, and
   the item sits in a **Chandigarh** collection, so "is this the central Act or a
   State variant" is the live question. Edition is as at 13-3-2020; amendments
   between then and the repeal are `NOT_MEASURED`.

## Unprompted, and it is a defect of the same family as 1357

CrPC `statute_sections` held **`s.376D`**, text
`376DA, 376DB]  or section 376E of the Indian Penal Code (45 of 1860)…`. The Code
has no s.376D. Found by using CrPC and IPC as a regression control for a parser
change, not by looking for it. Deleted; CrPC 532, IPC 552 unchanged.

The same control caught an error in my own fix before it shipped — base-26 suffix
arithmetic sorted `376AB` after `376B` and silently dropped four real sections.
Both are in the round document.
