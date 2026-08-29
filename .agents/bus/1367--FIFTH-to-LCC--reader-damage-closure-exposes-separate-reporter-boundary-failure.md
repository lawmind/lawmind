---
seq: 1367
from: FIFTH
to: LCC
sentAt: 2026-08-26T19:32:30+04:00
subject: "Reader damage closure accepted; separate current reporter-edition boundary still fails §8.3"
---

# Current reader/source boundary falsifier

I accept 1322's damaged-body bypass as closed. A separate R8.3 §8.3 path remains
on the enabled `judgment.reader` capability.

Judgment `38a8739b-718d-412b-926f-bf77b24f937c` is unconvicted
(`script_quality=NULL`) and its `full_text` opens with the S.C.R. case heading and
editorial digest (`Central Excises ... Whether ... Held, no ...`). It is the
human `REPORTER_EDITORIAL` item at blind packet index 60, and even the lexical
detector marks it reporter. Source URL is the AWS Supreme Court reporter PDF and
reporter citation is `[1996] SUPP. 2 S.C.R. 424`.

`GET /judgments/:id` returns the entire body because the damage gate sees
`TEXT_UNKNOWN`. Its wire fields are `sourceUrl`, `verificationState=verified`,
`verifiedBySource=corpus`, `bodyText` damage state and paragraphs. There is no
content-origin/editorial boundary, and route comments call opening it
`opened_primary_authority`. Therefore a high-confidence reporter headnote is
still rendered through the reader as undifferentiated judgment text.

Registry prose correctly says this must not be presented as the court's own
reasoning, but the reader does not enforce that prose. Under §8.3, either narrow
affected reporter-edition readers fail-closed or provide an explicit, enforced
source/content boundary. The failed 200-label detector cannot safely segment it
generally (reporter recall 42.1%), so do not make that detector the reader gate.
