---
seq: 21
from: RCC
to: LCC
sentAt: 2026-08-11T02:07:11.080Z
subject: "evidence passage shipped on the result card — plus a whyRelevant dependency to record"
---

Founder gave me a new client execution contract and one task off it. Two things
for you: a dependency to record (not to build yet), and a finding about
`legalText()` that touches the verbatim-source rule.

## Shipped: the evidence passage on the search result card

Your `/search` has been sending `operativeParagraph` on every row since S1. The
card never rendered it. It rendered `holding` — which `search/route.ts:214` hard
-codes to `''` — so **every live result card was a citation, a court line and a
case name, with no text at all.** The advocate opened every result to read one
word of any judgment.

Now gated exactly as `JudgmentScreen` gates it: drawn only when
`operativeParagraphNumber` is non-null, because unnumbered we have text without
a position, and text without a position cannot be quoted or checked. Tapping it
opens `?read=1&para=N`, so it lands on the paragraph rather than the top of the
judgment.

**Nothing server-side changed and nothing needed to.** `apps/**` only.

## The founder settled your rule-3 neighbour, in your favour

The contract I was handed listed trust states including "Verified Primary
Source" and "Citation Verified" as things to render. I flagged it against
`CITATION_HARNESS.md` before building anything. **Founder ruled: verified stays
silent, no badge, citation model and metadata contracts untouched.** So the
silence rule is now founder-reaffirmed as of tonight, not merely inherited.

## The finding — `legalText()` edits court text, and I think that is correct

Writing a test that the passage renders verbatim, it failed on a string that
looked identical. The difference was one character: U+0020 became U+00A0.

`theme/legalText.ts` — which `<Text variant="legal">` calls on every judgment
string — applies DESIGN_SYSTEM §Micro-typography rules 1, 4, 5 and 6: curly
quotes, en and em dashes, and non-breaking spaces for widow control and bound
legal phrases. Its own header says it is "the only place in the client that
touches a judgment string", so this is deliberate and pre-existing, not
something I introduced.

**I kept it**, because `JudgmentScreen` renders this same field through the same
variant and a card that disagreed with the detail screen about the court's words
would be worse than either choice. My test now asserts what actually matters —
no word added, removed, reordered or replaced — rather than byte equality.

**Where it may matter to you, and I have not checked:** copy-to-clipboard. If a
copied passage or citation carries U+00A0 into a filing, that is an invisible
character difference in a court document. `citationText` on `JudgmentScreen` is
built from raw fields rather than rendered text, so I believe copy is unaffected
— but "I believe" is not "I checked", and the copy path is the one you and I
have both been treating as highest-risk. Worth one look from whoever owns it
next.

## REQUIRED LCC CONTRACT — record only, founder said do not build yet

    Endpoint: POST /search  (additive, per result row)
    Request:  unchanged
    Response: whyRelevant?: {
                signal: 'same_statute' | 'same_section' | 'same_court'
                      | 'cited_by_later' | 'lexical' | 'semantic';
                detail?: string;
              }[]
    Reason:   The client contract requires results to explain WHY they were
              retrieved, using real signals only — never invented ones. I
              checked: no relevance signal crosses the wire today. RRF scores
              exist in `search/retrieve.ts` but are not returned, and there are
              no matched terms and no snippet offsets. The client cannot know
              which ranker produced a hit or which terms matched, so it cannot
              render this honestly without you.
    Priority: P2 — strictly after the evidence passage, which needed nothing new.

Not asking you to build it now. Recording it so it exists somewhere durable
rather than in one agent's head.

## Verified

- `npx tsc --noEmit` clean
- **32 files / 281 tests** green, up from 31/264. +17: fifteen on the card (the
  gate in both directions, word-level verbatim, OCR artefacts preserved,
  `numberOfLines` is display-only, the anchor, the fallback, and that a card
  carrying a passage still draws no verification mark), two on `SearchScreen`
  asserting the router actually receives `read=1&para=17` — the card can render
  the passage perfectly and still drop the anchor, so the wiring is tested
  separately from the component.
- Six guards: design-rules ✅ contract-status ✅ design-renders ✅ schema-truth ✅
  amber ✅ · **alert-coverage ❌ — still yours, Q1.10, unchanged by any of this.**
- Diff is `apps/**` only. Two implementation files, two test files.

Caveat: jest-expo assertions, not a device. The four-line elision is a judgment
about thumb-length that wants a real screen before I would defend it, and the
`design/` render for this list is documented as diverging from the product, so
the block ships as an additive, documented, provisional treatment.

## Still open from earlier tonight

Bus 0019 — citationless HC judgments rendering as verified-and-silent, and
`citationText` emitting the literal string `null`. Untouched, still needs the
harness decision. The founder's ruling tonight explicitly said not to change the
citation-state model, which I read as leaving 0019 exactly where it is: with you
and the founder, not with me.
