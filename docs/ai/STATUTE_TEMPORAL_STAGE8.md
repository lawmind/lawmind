# Stage 8 — statute / point-in-time foundation

**Landed 11 Aug 2026.** Migration `0041`. Extractor
`services/ingest/src/statute-amendments.ts`, CLI `statute-amendments-cli.ts`.

---

## The finding: we already held the data and had never read it

Stage 8 asks for Act → provision → version → amendment → commencement → repeal
→ substitution → notification → effective date, with a standing instruction to
**check whether indiacode already publishes amendment/commencement dates before
assuming a new source is needed.**

It does. And we ingested it on the first pass.

`statute_sections.footnote` holds each bare act's own printed amendment notes,
verbatim, for **9,064 of 34,928 sections**. Nothing had ever parsed them. This
is the same class of gap as `cnr`, `disposal_nature` and
`petitioner`/`respondent` — data present at source and dropped — except one step
worse: here it was not dropped. It was **stored and never looked at**.

    1. Ins. by Act 99 of 1976, s. 12 (w.e.f. 1-8-1976).
    2. Subs. by Act 45 of 1965, s. 8, for clause (a) (w.e.f. 1-4-1966).
    3. Subs. by s. 8, ibid ., for "enter any coal mine or its office" (w.e.f. 1-4-1966).

That is an amendment history with effective dates, in the database, since the
first `acts` run.

---

## What was extracted — measured against production, 11 Aug 2026

| | |
| --- | --- |
| footnoted sections parsed | **9,064** |
| events extracted | **18,590** |
| substituted · inserted · omitted | 9,871 · 5,589 · 2,222 |
| renumbered · repealed · commenced | 286 · 170 · 452 |
| carrying a real effective date | **15,388** |
| with no date stated by the source | 3,202 — stored NULL, never guessed |
| amending Act resolved through `ibid` | **2,708** |
| `ibid` that could not be resolved | 1,994 — recorded as unresolved |
| footnote entries yielding no event | 596 — recorded, not discarded |
| distinct effective dates | **1,208**, spanning 1870 → 2026 |

### It answers the question Stage 8 was asked

```
NI Act s.138 — the archetypal advocate query

 1  inserted     1989-04-01  Act 66 of 1988   Ins. by Act 66 of 1988, s, 4 (w.e.f. 1-4-1989).
 2  substituted  2003-02-06  Act 55 of 2002   Subs. by Act 55 of 2002, s.7, for certain words…
 3  substituted  2003-02-06  Act 55 of 2002   Subs. by s. 7, ibid., for within fifteen days…
     ↑ ibid_resolved — entry 3 names no Act of its own
```

Also answerable now: *which provisions changed between two dates* (indexed on
`effective_date`), and *what did one amending Act touch* — the citator question,
for statutes rather than judgments. `Act 39 of 2020` touched 26 provisions.

---

## The four things the real data does that an imagined parser would miss

Every one was found by reading real footnotes, not by reasoning about the format.

**1 · `ibid` is a back-reference, and 1,651 sections name no Act without it.**
`Subs. by s. 8, ibid.` means *the same Act as the entry before*. A parser
reading entries independently drops it, or — far worse — attributes it to
whatever Act it finds next. Resolution walks **backwards within the same
footnote only**, and an `ibid` with nothing before it stays **unresolved rather
than guessed**: a gap is visible, a wrong attribution is not.

**2 · Dates contain spaces.** `(w.e.f. 31- 10- 2019)` is real — the Limitation
Act and the Aadhaar Act both print it. A tight `[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}`
matches 7,276 sections; tolerating internal whitespace matches 7,330. **54
sections would have vanished with no error anywhere** — the "0 results is a
finding" trap this program has now hit four times.

Dates are read **day-first**, because that is how the source prints them.
`13-1-2012` is 13 January; read month-first it is 1 December, which is a
silently wrong legal date on the field that answers *was this in force when I
filed*. An impossible printed date (`31-2-2019`) is rejected rather than rolled
forward the way `Date` would silently do.

**3 · Not every amendment has a date.** `Ins. by Act 11 of 1994, s. 12.` states
none. The effective date is **NULL**, never the amending Act's year — those are
different facts, and conflating them dates a legal event by guess.

**4 · The printed punctuation is not reliable, and the corpus-wide pass is what
proved it.** The 60-footnote hand sample gave `Subs. by` and `Ins. by`. Running
the finished parser over all 9,064 and **reading its failures** turned up five
more real forms it had silently missed:

    Subs by Act 62 of 1952          no dot after the abbreviation
    Subs. bys. 17, ibid             no space at all
    Subs. ibid ., for clause (h)    no "by" whatsoever
    Subs., ibid ., for "the L.G."   a comma before ibid
    Section 3 re-numbered as …      hyphenated; also "relettered"

Fixing those took unparsed entries from **960 → 596** and added 364 events. The
596 that remain are genuine non-events — *"See now the Arbitration Act, 1940"*,
*"For notification, see Gazette of India, 1917"* — editorial cross-references
that must **not** be parsed as amendments, because doing so would invent legal
history.

---

## What this deliberately does NOT do

**It is not a version history of the text.** Knowing clause (a) was substituted
on 1-4-1966 is not knowing what clause (a) said before. indiacode publishes only
the **current** wording; the prior text is sometimes quoted in the note
(`for "enter any coal mine or its office"`) and usually is not.
`substituted_text` keeps that fragment verbatim and it is **never assembled into
a reconstructed provision** — a partial reconstruction served as the law as it
stood would be the statutory equivalent of a fabricated citation, and this
product exists to prevent exactly that.

**It does not resolve state amendments to a jurisdiction.** `Delhi Act 12 of
2011` and `W.B. Act 18 of 1990` appear. A Central Act amended in one state does
not read the same in another. The prefix is kept verbatim in
`amending_act_raw`; guessing which prefixes name states would put confident
wrong rows in front of advocates, and needs its own hand-read sample first.

**It does not touch `statute_mappings`.** IPC→BNS / CrPC→BNSS / IEA→BSA remains
**0 rows by design**. REB §7 forbids inventing equivalence, and nothing in a
footnote establishes it — same section number is not same legal substance. That
is a sourcing problem, not an extraction one, and it is still open.

---

## Named next steps, in order

1. **Section-level commencement.** 452 `commenced` events exist, but the richest
   ones are unexploited: the Aadhaar Act s.1 footnote names *different
   commencement dates for different section RANGES* — "Section 1 to 10, 24 to
   47" on one date, "Section 11 to 20, 22 and 23, 48 to 59" on another. Parsing
   those ranges gives true per-provision commencement. **Not attempted here**;
   it needs its own hand-read sample of the ~452 notification notes.
2. **The 1,994 unresolved `ibid`.** Some are resolvable from the *preceding
   section's* footnote rather than the same one. Whether that is legitimate or
   a source-ordering coincidence is a question for a hand-read sample, not an
   assumption.
3. **A point-in-time API.** The data now supports "as this provision stood on
   date X" as a *change list*, not as text. What the client should render from
   that is a product question, not an extraction one — and the honest surface
   states it is a list of changes and not the historical wording.
4. **`statute_mappings` still needs a source.** Unchanged, and still the blocker
   on IPC→BNS.
