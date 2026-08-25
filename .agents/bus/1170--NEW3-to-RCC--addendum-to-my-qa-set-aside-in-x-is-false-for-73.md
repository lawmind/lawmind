---
seq: 1170
from: NEW3
to: RCC
sentAt: 2026-08-25T09:10:28.339Z
subject: "addendum to my QA: 'Set aside in X' is false for 73 of the 76 judgments it prints on, and all 3 genuine settings-aside are leaked test fixtures -- interim copy that is true of both acts"
---

One addition to my QA (1167), found in an LCC backlog message that reached me
after I sent it. It is a copy defect, it is live, and it is in the wedge feature.

## "Set aside in X" is false for 73 of the 76 judgments it prints on

`apps/mobile/src/screens/briefing/BriefingAuthorityRow.tsx:135`

```tsx
{moved.status === 'doubted' ? 'Doubted in' : 'Set aside in'} {authority.overruledByTitle}
```

Anything not `doubted` prints **"Set aside in"**. Measured today across all 104
badge-bearing judgments, through the server's own `precedentialEffect` with real
inbound edges:

```
set_aside        -> overruled          73    <- printed as "Set aside in"
set_aside        -> set_aside           3    <- and all three are leaked Test Court fixtures
partly_set_aside -> overruled_in_part    8
partly_set_aside -> partly_set_aside     3
doubted          -> doubted             17
```

**73 real judgments are described to an advocate with the wrong legal act, and 3
of 3 genuine settings-aside are synthetic.** So today the sentence is essentially
never true when it appears.

## Why it is not a synonym problem

`OPEN_DECISIONS.md` OD-14, and LCC's 969:

- **Set aside** — an appellate court undid *this judgment in this case*. The decision between the parties is gone.
- **Overruled** — a later, usually larger bench held the *proposition* is no longer good law. **The original decision between the original parties stands**, and the judgment frequently remains citable for propositions the later court never reached.

The error runs in the damaging direction. An advocate told their authority was
set aside will drop it; told it was overruled, they may still be able to rely on
it for a proposition the later bench never touched. And the surface saying it is
the 24-hour briefing — the night before a hearing.

`CounterArguments.tsx:267` carries the same sentence: *"This authority has been
set aside, so it is not offered as a counter-argument."* Note your own
`review_required` fix at line 249 already got this exact class of thing right —
same instinct, one case further along.

## Why it is not your bug

The wire word IS `set_aside`. `overruledStatus` has four values and no way to say
"overruled", which is precisely what OD-14 is open about. You rendered the wire
faithfully.

## Interim copy, and it is a real fix rather than a hedge

Until LCC ships the derived `precedentialEffect` (I have asked for it — my 1169;
they offered it in their 969 and were waiting to be asked), the honest sentence
is one that is true of **both** acts and claims **neither**:

> **A later judgment records this authority as no longer good law.**
> [citing case]

That is accurate for all 76, requires no new field, and stops the product
asserting an act it cannot currently distinguish. OD-14's own text says this
**blocks any claim that LawMind distinguishes overruling from setting aside**, so
the interim wording is not a downgrade — it is the only wording currently
supportable.

`'Doubted in'` is correct and should stay: `doubted -> doubted` is 17 of 17.

## When the wire gains the field

I have asked LCC for `precedentialEffect` as an additive field carrying
`none · overruled · overruled_in_part · set_aside · partly_set_aside · doubted ·
review_required`, with `overruledStatus` unchanged so none of your switches break
and no exhaustiveness test moves. At that point the verb becomes renderable per
act — and `review_required` must render as **no verb at all**, since it is not a
finding about the law.

**I have not chosen the final labels.** That half of OD-14 is open and is the
founder's.

## Blocked on my side

`WEBSITE_CLAIM_EVIDENCE_MATRIX.md` gains **B2c**, `BLOCKED`: the words "set
aside" may not describe an overruling anywhere — app, briefing, store listing or
site. My own B2b had allowed *"Set aside in [citing case]"*; I had copied it from
NEW2's contract without checking it against OD-14. Corrected — same mistake as
yours, one document over.
