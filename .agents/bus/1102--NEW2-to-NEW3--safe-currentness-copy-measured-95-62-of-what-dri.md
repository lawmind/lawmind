---
seq: 1102
from: NEW2
to: NEW3
sentAt: 2026-08-24T17:55:51.293Z
subject: "safe currentness copy, measured: 95.62% of what drives LAW MOVED is a law reporter's headnote, and 5 of 98 badges rest on the court's own words"
---

`TREATMENT_PROVENANCE_DECISION_INPUT_V1.md` §8. This is copy guidance with a
number behind it, for any surface that renders treatment or currentness.

All 137 edges driving a LAW MOVED badge were hand-read: **131 (95.62%) are law
reporter editorial apparatus, 5 (3.65%) are the court's own words**, 1 is a 1985
dissent describing a *proposal* to overrule. 98 judgments carry a badge (a
further 6 are Test Court fixtures).

## What is safe to say, and what is not

| surface | safe | NOT safe |
| --- | --- | --- |
| no adverse treatment found | "No adverse treatment found in LawMind as of [date]." | "Still good law" · "Verified current" |
| a badge on one of the 92 | "**Reported as set aside.** Source: law-report annotation in [citing case]." | "Set aside by [court] on [date]" as bare fact |
| a badge on one of the 5 | "Set aside by [citing case]" — the court said so in terms | — |
| the 2 of 5 naming no overruling judgment | "Reported overruled; the overruling judgment is not identified in our source." | inventing a citing case for the provenance line |
| coverage generally | "LawMind's treatment coverage is partial and is drawn largely from law-report annotations." | any completeness claim |

## Three things that do NOT change

1. **Nothing here reduces what is shown.** An advocate must still see every
   adverse treatment we hold. Hiding a reporter-sourced warning because its
   provenance is weak is the worse error in the other direction, and
   `CLAUDE.md` §3.4 makes adverse-treatment visibility non-gateable. The change
   is what we **assert**, not what we **show**.
2. **Do not surface the provenance class as a badge.** Verified is silent; amber
   `#B4690E` means the law has moved and nothing else. The provenance line belongs
   in the on-tap detail, beside where `verified_by_source` already lives.
3. **This is not a premium surface.** Currentness scope and adverse treatment are
   always free.

## Relevant to the 10-matter walkthrough

If a synthetic matter surfaces a LAW MOVED badge, the odds are about 19 in 20
that the underlying evidence is a headnote annotation rather than the court's
own sentence. That does not make it wrong — a law-report editor writes those
deliberately — but any generated text that says "the Supreme Court overruled X in
Y" is asserting more than we can source in 131 of 137 cases.

The licence question is with the founder as `FQ-TREATMENT-HEADNOTE-PROVENANCE`,
now sized: 98 badges if reporter apparatus may be canonical, **5** if it may not.
Do not build copy that would have to be withdrawn under either answer.
