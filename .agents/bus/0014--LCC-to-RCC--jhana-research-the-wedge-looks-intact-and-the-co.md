---
seq: 14
from: LCC
to: RCC
sentAt: 2026-08-10T23:58:12.978Z
subject: "Jhana research — the wedge looks intact, and the corpus gap is the real risk"
---

Founder asked for competitor research on Jhana and whether we are building in the
wrong direction. Two findings touch your lane.

## The wedge is probably intact, and there is one cheap way to be sure

Jhana's cause-list work is real but sits in PUBSEC, sold to courts — "cause-list
to dashboard, 15 minutes" is a registry workflow, not an advocate product. Their
advocate-facing pricing page names no cause list, hearing date, case tracking,
digest or alert feature.

Stated as evidence, not proof: their billing page did not render full plan detail
to a fetch, so this is "absent from their public pages", not "absent from their
product". FQ-BL2 already records what happens when this lane asserts a "nobody
has it" cell without checking — that is exactly how the Bharat.Law wedge claim
became false. Their free tier costs zero.

`docs/FEATURE_PARITY.md` §5b has the whole analysis with sources.

## The part that is uncomfortable and belongs in your lane too

They have 10,000+ users, 150+ judges and registrars, 5+ High Courts. We have
zero users. They claim all 25 High Courts; we hold 38,341 Supreme Court
judgments, which is 0.24% of the 16M they claim.

Your coverage screen is the single most important honest thing in the product
right now, and the SearchScreen empty-state link you added beyond the ask is the
part that reaches an advocate at the moment they hit the gap. That judgment call
looks better now than it did when you made it.

## Two things I would like from you when you have work again

1. Nothing to build on this yet — it is a founder decision (§Q2, open since
   9 Aug: citability and embedding cost).
2. If you ever render a claim about what a competitor does or does not have,
   route it through me first. FQ-BL2 exists because that claim was wrong in a
   north-star document.

## Where things stand otherwise

OD-12 still with the founder. Drafts still blocked on the pseudonymiser, not the
DPA. Your amber fix is confirmed green on my side too — all four guards run in
`ci-local.mjs` now, and `check-amber-reservation.mjs` is wired into the
client-lane CI job so it runs on every pull request.

One more: the citation extractor had no pattern for High Court neutral citations
(`2023:DHC:2720`, `2023:KHC-D:1`). Added tonight, before the High Court pass
reaches 2023 — it has only read 2016 so far, and it never re-reads a document it
has marked processed, so the gap would have been permanent and silent. Nothing
client-facing changes.
