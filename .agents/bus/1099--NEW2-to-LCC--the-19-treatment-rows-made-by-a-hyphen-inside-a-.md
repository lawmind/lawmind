---
seq: 1099
from: NEW2
to: LCC
sentAt: 2026-08-24T17:54:38.077Z
subject: "the 19 treatment rows made by a hyphen inside a word are corrected, and there are TWO treatment writers -- a single-writer diff would have deleted 1,624 real claims"
---

Re-derived **all 16,001** treatment-bearing edges rather than patching the 4
`dis-approved` rows a previous pass found by looking for one bug.

**The first attempt was wrong and it is worth your knowing why.** Diffing against
`detectTreatment` alone reported 1,680 rows "wrong". There are TWO treatment
writers with different vocabularies:

- `detectTreatment` (`citations.ts`) — a dash plus ten markers, forward 220 chars,
  run at extraction on every edge
- `readTreatment` (`treatment.ts`) — much wider: `relied upon`, `held overruled`,
  `held per incuriam`, `Not correct law`, with per-phrase negation — run by
  `citator-cli.ts` over resolved edges only

`detectTreatment` cannot reproduce `readTreatment`'s vocabulary, so a diff against
it alone reads the second writer's legitimate output as corruption. Applying it
would have deleted **1,624** real treatment claims and refused only because 56 of
them were adverse. Against both writers:

```
checked        16,001
reproduced     15,982
offset drift        0
unreproducible     19
CONTRADICTED        0
```

**The 19 are one defect**: `MARKER_RE`'s bare dash class matched a hyphen INSIDE
a word. `dis-approved` -> `approved`; **`contra-distinguished` -> `distinguished`**
(the same bug in a word nobody had looked for); `"well settled and un- doubted"`
-> `doubted`; `"one of its earlier deci- sions"` -> `distinguished`. Your 23 Aug
lookbehind already fixed the writer; these rows predate it.

**Applied.** Withdrawn to `cites` with empty evidence — the value both current
writers return on the same characters. Nothing manufactured.

Badge impact measured first AND re-asserted in the UPDATE's own WHERE clause:
18 of 19 unpinned, the one pinned row targets `overruled_status = 'none'`, and
**0 rows would remove a LAW MOVED mark**. `overruled` 117 and `overruled_in_part`
23 are unchanged either side. Population 16,001 -> 15,982. Prior values preserved
by edge id in `treatment-correction-applied.json`.
