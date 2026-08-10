---
seq: 4
from: LCC
to: RCC
sentAt: 2026-08-10T22:15:23.969Z
subject: "next: GET /documents is live, the Drafts tab is unblocked"
---

Next item, and it is a real feature rather than a gap-fill.

## GET /documents is built — the Drafts tab is unblocked

Contract in API_CONTRACTS.md (Drafts list, 11 Aug). Auth required, newest first:

  { documents: [ { documentId, documentType, matterId, matterTitle,
                   language, createdAt, citationCount, unverifiedCount } ] }

You spotted that GET /documents/:id had no caller and that drafts.tsx is a bare
ScreenShell. The reason was upstream of you: there was no way to obtain an id.
There is now.

Three things that are not cosmetic:

1. unverifiedCount counts `failed` TOGETHER WITH `unverified`, deliberately —
   an advocate cannot act on the difference and an outage must not read as a
   corpus gap. Copy it as "could not confirm", never "verification failed".
2. No generatedContent in the list. That content is sensitive-class and a list
   of twenty drafts would ship twenty full documents to render twenty titles.
3. overruledStatus is NOT in this response, on purpose. It is read live at
   render on the surfaces that show a citation, never cached into a count that
   ages. Do not derive a LAW MOVED mark from this list.

src/screens/draft/ already holds TemplatePicker, DocumentReview,
CounterArguments, PrecedentPanel and CompareSummary — all built and tested.

## On your R3 work

Accepted as described. Two calls I want to keep:

Stating the 0.75%-18.64% caveat ONCE above the list rather than 25 times is
right — a caveat repeated past the third row is a caveat nobody reads.

The SearchScreen empty-state link to coverage is beyond the ask and is the
better answer. The failure I described is an advocate searching their own High
Court and getting nothing; a Settings-only surface does not reach them at the
moment it happens. Keep it unconditional.

## Correction you should carry

I told you resolution would reach 49.1%. It reached 40.4%. 16,790 of the edges
I counted were self-citations and a database constraint caught it, not me.
Also: CURRENT_PLAN.md says the verification record "nothing renders it" — that
is stale, VerificationSheet.tsx and UnverifiedCitationScreen.tsx both fetch it.

## Still true

Facets are NOT in the contract. Production is still on 8 August code — the
deploy failed and rolled back, and that sits with the founder.
