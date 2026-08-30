# CORRECTION WORKFLOW — v1

**NEW3, 30 August 2026. R13.** How a user tells us the law is wrong on our screen,
and what happens next.

---

## THE HARD RULE, FIRST

> **User attachment, text or evidence NEVER directly mutates canonical legal truth.**

Not with a moderator's approval, not with a "trusted user" flag, not in a hurry, not
for a Senior Advocate. A submission is a **pointer to a primary source**, and the
primary source is what we read. The submission is retained as provenance for how we
came to look — never as the authority for what we found.

**Why this is absolute:** the corpus is the product. A path by which a motivated
party can edit what an Indian court is recorded as having held is not a moderation
problem, it is an attack surface, and it would be the single most valuable thing to
compromise in this system.

---

## THE SIX STATES

```
SUBMITTED → TRIAGED → PRIMARY_SOURCE_VERIFIED → APPROVED → RELEASED → REPORTER_NOTIFIED
```

| state | who | what happens | what the reporter sees |
|---|---|---|---|
| **SUBMITTED** | user | the report is stored with what they were looking at, what they say is wrong, and what they believe is right | "We have this. We will tell you what we find." |
| **TRIAGED** | ops | classified by **class** (see below) and by severity. Duplicates linked, not closed | nothing — this state is internal |
| **PRIMARY_SOURCE_VERIFIED** | ops | **the deciding court's own record is opened and read.** Outcome is CONFIRMED, REFUTED, or `UNRESOLVABLE_FROM_PRIMARY_SOURCE` | nothing yet |
| **APPROVED** | ops | the correction is written against the primary source, with the source recorded | nothing yet |
| **RELEASED** | system | the correction is live, and **carries its provenance** | — |
| **REPORTER_NOTIFIED** | system | the reporter is told the outcome — including **REFUTED** and **UNRESOLVABLE** | the answer, and what we read to get it |

**A report that is refuted is still answered.** An advocate who took the trouble to
tell us gets a reply either way; silence on a refutation teaches them not to bother
next time, and their next report might be the one that matters.

**`UNRESOLVABLE_FROM_PRIMARY_SOURCE` is a real terminal state**, not a polite
refusal. It means the primary source does not settle it — and it stays visible as
an open uncertainty on the judgment rather than resolving to "we checked, it's
fine". UNKNOWN remains UNKNOWN here too.

---

## CORRECTION CLASSES — because the fix is different for each

| class | example | where the fix lands |
|---|---|---|
| `SOURCE` | the upstream document itself is wrong or was superseded | re-acquire; NEW2 |
| `PARSER` | our extraction mangled a date, a party, a section number | parser + reprocess the raw artifact; LCC |
| `CITATION_RESOLUTION` | we bound a citation to the wrong judgment | resolver; LCC |
| `TREATMENT` | we say the law moved and it did not, or we miss that it did | NEW2 + OD-14 semantics |
| `METADATA` | court, bench, date, case number | ingest |
| `DUPLICATE_IDENTITY` | two rows are one judgment | canonical identity; **link, never merge blindly** |
| `OUR_LABEL` | the *state* we rendered was wrong, not the data | this file's owner, NEW3 |

**Classifying by class is what makes the metric useful.** A rising `PARSER` count
is an engineering signal; a rising `SOURCE` count is a supplier signal; a rising
`OUR_LABEL` count means the trust-state contract is not landing. One undifferentiated
"corrections" number tells you none of that.

---

## METRICS — and the one we deliberately do not optimise

| metric | denominator |
|---|---|
| validated submissions | per 1,000 active users |
| % of submissions backed by a primary source | of all submissions triaged |
| median time SUBMITTED → PRIMARY_SOURCE_VERIFIED | of verified submissions |
| median time APPROVED → RELEASED | of released corrections |
| repeat error rate | same defect class recurring, per class, per month |
| correction class distribution | by source and by parser |

> **We do not optimise for "corrections accepted per week."**

That number goes up when we lower the bar, and it goes up fastest exactly when the
verification step is being skipped. It rewards the behaviour this workflow exists to
prevent. **The metric that matters is repeat error rate**, because it is the only one
that falls when we actually fix the cause instead of the instance.

---

## WHAT THE ADVOCATE SEES WHILE A CORRECTION IS OPEN

A judgment with an open, triaged report **says so**, in neutral ink with a dashed
edge — our uncertainty, never amber. Amber is reserved: it means the law has moved.

**Copy:** *"Someone has told us something on this page may be wrong. We are checking
it against the court's own record."*

**Never** remove the judgment, never hide the disputed field, and never silently
change it and hope nobody noticed. An advocate who read it yesterday needs to know
today that it is disputed — that is precisely the person the report protects.

---

## RATE LIMITS AND ABUSE

Submissions are rate-limited per user and per judgment. A judgment attracting a
sudden burst of contradictory reports is **flagged for a human**, not auto-resolved
by majority — the majority position on a contested authority is not evidence about
the authority.

No PII from a submission enters analytics. The submission body is matter-adjacent
text and is treated as **sensitive class**: pseudonymised before any model call, one
document per call, never mixed.
