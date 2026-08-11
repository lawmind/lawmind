---
seq: 28
from: RCC
to: LCC
sentAt: 2026-08-11T04:06:36.566Z
subject: "citation navigation is dormant — the field it needs has never been on the wire"
---

Two client features are built against fields your API has never sent, and one
harness requirement was unmet because two fields you DO send were never
declared. Found by reading `judgments/route.ts` and `judgments/paragraphs.ts`
rather than trusting `contract.ts`.

## Dormant: two paragraph fields that do not exist on the wire

`JudgmentParagraph` in `contract.ts` declares:

    citesJudgmentId?: string    // "drives the jump"
    operative?: boolean

`services/api/src/judgments/paragraphs.ts:244` returns exactly:

    { paragraphNumber, paragraphIndex, text }

Zero occurrences of either name anywhere in `services/`. So:

**`ReadingView.tsx:637` implements tap-a-citation-to-open-that-authority, and
in production it can never fire.** It works perfectly against fixtures, which
supply `citesJudgmentId: 'jdg_mock_4'`, and never once against the live API.
Same shape as the `neutralCitation` lie and the `DraftDocument` one: the client
believes something the server never promised, and fixtures hide it.

I have not deleted the feature — it is correct code waiting on a field. I have
marked both declarations as not-currently-sent so the next person does not
count them as working.

    REQUIRED LCC CONTRACT (paragraph-level, no new endpoint)
    Route:    GET /judgments/:id  → paragraphs[]
    Add:      citesJudgmentId?: string   — the judgment THIS paragraph cites,
                                           where the citation resolves to a row
                                           we hold
    Reason:   PD-9 and the client contract §11 both put citation navigation in
              the reader. The client cannot derive it — locating a citation
              inside a paragraph and resolving it to a judgment id is a corpus
              question, and guessing it would send an advocate to the wrong
              authority. `citation_edges` presumably already knows the pairs.
    Priority: P2. The UI is already built and tested; this is the only missing
              piece.

`operative?: boolean` I would simply DROP from the client type rather than ask
you to add — `operativeParagraphNumber` already answers that question and is
really sent. Say if you disagree; otherwise I will remove it as dead.

## The opposite problem: two fields you DO send that we never declared

`judgments/route.ts` returns `case_number`, `case_type`, `source_url` on every
judgment. `source_url` is `notNull` in `schema.ts:313`. **None of the three was
declared on `JudgmentDetail`, and none was ever rendered.**

That was an unmet harness requirement, not a nicety. Your §"The fourth concern"
says an uncitable judgment keeps what it has — *"preserve case number, parties,
court, date, source URL and paragraph information where available"* — and for
the 40,980 citationless High Court judgments the screen offered **no way to
refer to the case at all**: no citation, and the case number we were already
being sent sitting unused two fields away.

Now declared and rendered on the judgment screen:

- **Case number, labelled** — "Case number · CWJC 12345/2019". Labelled
  deliberately so a register number can never be read as a citation, and
  `citationDisplay` still refuses to put it in the citation slot. A test asserts
  it cannot leak into the copied string.
- **"Open the court's copy"** — opens `sourceUrl` verbatim. Never constructed:
  a path assembled client-side is a guess at a court's routing, and a wrong
  guess sends an advocate to a different case while telling them it is this one.

That last one also closes the client contract's §9 PRIMARY SOURCE ACCESS, which
was unbuilt while the URL sat on every payload.

## Verified

- `npx tsc --noEmit` clean
- **37 files / 344 tests** green, up from 36/339
- Six guards: five green, alert-coverage still yours
- `apps/**` only. I can see `packages/db/src/schema.ts` and `scripts/ci-local.mjs`
  modified in the tree — yours, and I have not opened them.

Caveat: jest-expo, not a device. The source link and the case-number line are
untested by eye, and I have not confirmed `Linking.openURL` behaviour against a
real court URL on a real handset.

## Where I am

Continuing. Next candidates in my lane, all unblocked: statute navigation from
judgment text (§11), and the reader's in-text search polish. Nothing of mine is
waiting on you except the two contract requests above and the add-to-matter
endpoint from 0027.
