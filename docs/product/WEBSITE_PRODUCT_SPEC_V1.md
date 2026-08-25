# LAUNCH WEBSITE — product specification V1

**NEW3, 25 August 2026.** Sprint plan V2 §10 NEW3-4 and §11.
**NEW3 owns strategy, IA, copy, claims. RCC owns implementation.** This file
contains no code and makes no implementation decision that is RCC's.

**Binding companion:** `WEBSITE_CLAIM_EVIDENCE_MATRIX.md`. No sentence ships
unless it is in that file's ALLOWED COPY column. Where copy appears below, its
claim row is cited inline as `[A1]`, `[B2]` and so on.

---

## 0 · The finding that comes first: there is no website

`apps/` contains `mobile` and `admin`. Nothing else. There is no marketing site,
no landing page, no public surface of any kind. `lawmind.co` is verified with DNS
written through the Spaceship API, and it points at nothing a visitor can read.

So RCC-7's first instruction — *"locate the real current web/public site"* —
resolves to: **it does not exist, and this is greenfield.**

**Product recommendation, implementation call remains RCC's:** it belongs at
`apps/site`, Next.js, static export. Next 14 App Router is already in this
repository for `apps/admin`, so that adds no vendor, no framework and no build
system. A launch site needs no backend: every claim below is static, and the only
dynamic thing on the page is a link to two app stores. Building it against the
API would create the "parallel website backend" §6 LCC-9 forbids.

---

## 1 · Positioning

### 1.1 The market's actual weak point

Three months before this launch the Supreme Court decided
***Pooja Ramesh Singh v. Jammu and Kashmir Bank Ltd. & Anr.***, **2026 INSC 668**
(2 July 2026, Narasimha and Aradhe, JJ.). A tribunal had relied on judgments that
did not exist. The Court's own words, paragraph 17:

> *"A decision of a Court or an adjudicating authority based on material which is
> fake and hallucinated is no decision at all, and it amounts to subversion of
> the rule of law."*

**Verified from the judgment's own text, in our own corpus, 25 Aug 2026** — not
from a summary, not from a blog. `[D1]`

**Quote paragraph 17. Never the SCR headnote.** The headnote's "zero-tolerance"
and "professional misconduct" phrasing is a law reporter's editorial apparatus,
and quoting a headnote as the court's words is the exact error `[B3]` forbids us
in the product. Applying our own rule to our own marketing is not fastidiousness
— it is the only way the rule survives contact with a marketing deadline.

### 1.2 The position, in one line

> **Everyone else sells you an answer. LawMind shows you where the answer came from — and tells you when it stops being true.**

### 1.3 What we do NOT say

Every competitor is selling reach and intelligence. Jhana's own homepage:
*"16M+ judgments"*, *"brute-forces research and reads citations till correct"*,
*"auto detects contradictions or outdated citations"*. Supreme Today leads with
*"Endorsed by Various High Court and Judicial Officers"*. **None publishes a
measured accuracy figure.**

The temptation is to answer reach with reach. We must not, for a reason that is
measured and not modest: our concept search is hidden, our dense index covers
40,161 judgments of 18.7 million, and posed-advocate-question s@5 is 2.2%
(NEW1 bus 1089). A reach claim from us would be the least defensible sentence on
the internet.

**We compete on disclosure, and we never accuse.** We have not tested a
competitor's accuracy and `COMPETITIVE_TEARDOWN.md` §7 says so. We say what we
measure and what we will not claim. `[D2]`, `[D3]`

---

## 2 · Information architecture

Seven pages. Not more — every extra page is another surface where an unchecked
sentence can appear.

| # | Page | Job | Primary CTA |
| --- | --- | --- | --- |
| 1 | **Home** `/` | The whole story in one scroll | Download |
| 2 | **Research** `/research` | What search actually does, and what it does not | Download |
| 3 | **When the law moves** `/currentness` | The differentiator, explained honestly | Download |
| 4 | **Matters** `/matters` | The workflow — the retention story | Download |
| 5 | **Trust** `/trust` | Verification, privacy, data sources, what we refuse | Contact |
| 6 | **Support** `/support` | Store requirement, and a real one | Email |
| 7 | **Terms** `/terms` · **Privacy** `/privacy` | Store requirement, legally binding | — |

**Deliberately absent, each for a reason:**

- **No Pricing page.** No model is selected (`PREMIUM_COMMERCIAL_DECISION_PACKAGE_V3.md`) and a placeholder price is a promise. Launch free.
- **No Blog.** Nothing to say yet, and an empty blog dates the site the day it ships.
- **No public judgment pages.** Plan §9 RCC-7 makes them optional and conditional on a metadata contract nobody has written. Not launch scope.
- **No "Coming soon" / roadmap.** A roadmap on a launch page is read as a capability.
- **No About / team page** until the founder decides what is public.

---

## 3 · Home — section by section

### 3.1 Hero

> # Research you can hand to a judge.
>
> LawMind searches 18.7 million Indian judgments, shows you the source of every
> line, and marks the authorities that have been overruled, set aside or doubted
> — every time you look at them.
>
> **[Download for iPhone] [Download for Android]**

`[A8]` governs "18.7 million": it appears here as **corpus scale** and is
separated by a full clause from anything about search reach. It may never be
written as "18.7 million searchable authorities" and may never sit beside AI or
semantic language.

`[B2]` governs the second clause. "Every time you look at them" is literally
true and is the technical differentiator: `overruled_status` is never cached and
is read live at render on every surface.

**No sub-headline with a statistic. No "AI-powered". No superlative** `[D3]`.

### 3.2 The proof, immediately after the hero

The court quotation from §1.1, set as a pull quote with its citation and date,
followed by one sentence:

> That is why LawMind never writes a citation from memory. Every case we show you
> is a document we hold. `[B5]`

This is the strongest 60 seconds on the site and it goes second, not in a Trust
page nobody opens.

### 3.3 Three capability blocks — what it does

Each block: one heading, one sentence, one screenshot. Every claim carries its
matrix row.

**1 · Find the case you already know**
> Type a citation, a case name or a case number. LawMind takes you to that
> judgment. When a name or a number matches more than one case, you get all of
> them — LawMind does not pick one for you. `[A1] [A2] [A4]`

The second sentence is the one to lead the screenshot with. `2023:AHC:169979`
names two Allahabad judgments decided the same day, and the product returns both
with an ambiguity flag — measured, 25 Aug. This is a **genuine differentiator**
and the safest strong claim we own `[A2]`.

**2 · Know when the law has moved**
> If an authority you saved has been overruled, set aside or doubted, LawMind
> marks it — read fresh every time, not cached from when we last checked. `[B2]`

**3 · Keep the case together**
> Authorities, hearing dates, notes and orders for one matter in one place. If an
> authority has been set aside, LawMind will not let you file it by accident.
> `[C1] [C2]`

### 3.4 What LawMind will not do — a real section, above the fold on mobile

This is the section competitors do not have, and it is the most persuasive thing
on the page for the audience that matters.

> **What LawMind will not do**
>
> - **We will not answer a question we cannot source.** If no authority in our corpus supports an answer, LawMind says so rather than showing you the closest thing it found.
> - **We will not tell you a case is good law.** We tell you what the record says and where it came from. The judgment is yours.
> - **We will not hide a problem behind a paywall.** If an authority you saved has moved, you see it — on every plan, including free.
> - **We will not claim to have removed every name from your documents.** Pseudonymisation is partial and we say so. `[C7]`

Bullet 1 is a promise about behaviour we have **partly** measured: the product
does abstain by emptiness when nothing matches (M07, M08 — both returned zero
authorities), but `/arguments/counter` has no explicit abstention field and
returned a wrong-domain authority for a lexically-adjacent position (M06).

**Therefore bullet 1 ships only after `[C4]`'s abstention state lands.** Until
then the section runs with bullets 2–4. This is exactly the kind of sentence that
is true of the product we want and not yet of the product we have, and the
matrix is the mechanism that stops it shipping early.

### 3.5 Download, closing

Two store badges. **`[E8]`: badges must not link anywhere before the listings are
live** — a dead store link on a launch site is the cheapest possible way to look
unfinished. Before listings exist: an email capture that says exactly what it is.

> LawMind is an iPhone and Android app. Enter your email and we will send you the
> link when it is live — nothing else, ever.

---

## 4 · The other pages

### 4.1 `/research`

Expands §3.3 block 1, and it is the page where scope honesty lives.

**Says:** citation, case name, case number, CNR (after `[A3]` clears), statutes,
the judgment reader, ambiguity handling.

**Does not say, and must not imply:** describing your facts `[A5]`, concept or
semantic search `[A6]`, finding adverse authority automatically `[A7]`.

**One explicit paragraph, because a visitor will ask:**

> **What LawMind does not do yet.** LawMind finds judgments you can name — by
> citation, case name, case number or CNR. It does not yet search by describing
> the facts of your case, and we would rather say that than let you find out in
> front of a judge.

Naming a limitation in our own words is worth more than the feature would be, and
it inoculates against the comparison a visitor is about to make against a
competitor who does claim it.

### 4.2 `/currentness` — the page nobody else can write

The three states, in the product's own vocabulary, with the honest provenance
story.

**This page is `[B3]`-blocked in its strong form.** 131 of the 137 edges behind
every LAW MOVED mark are a law reporter's headnote; only 5 are the court's own
words (NEW2, hand-read). And `treatment_provenance` does not yet reach any
surface — measured 25 Aug, `treatmentProvenanceOnWire: false` on all ten regression
matters, so today a reporter's annotation and a Constitution Bench's own holding
render identically.

**So the page ships in the qualified form only:**

> When a later judgment records that an authority has been overruled, set aside
> or doubted, LawMind marks it. We show you the case that did it and the words
> that record it, so you can read the source and decide for yourself. Where that
> record is a law reporter's annotation rather than the court's own reasoning, we
> will say so.

The last sentence is future tense **on purpose** and may only become present
tense when `[B4]` opens. RCC should build the page so that one sentence is the
only edit.

### 4.3 `/matters`

The retention story, and the page that carries the workflow screenshots:
search → open → save → matter → hearing date. `[C1] [C2]`

**No briefing screenshot, no briefing name, no Hearing Pack** `[C3] [E1]`.

**No monitoring promise** `[C5]` — the path exists but no alert has been observed
firing, and "we will tell you" is a promise about a delivery nobody has watched
work.

### 4.4 `/trust` — five headings, in this order

1. **Where the law comes from.** AWS Open Data, court sources, eCourts under written authorisation. No reporter's copy-edited edition — raw court text only, and the reason (s. 52(1)(q)(iv); *EBC v. D.B. Modak*).
2. **How a citation is checked.** Three-tier verification, in plain words. `[B1]`
3. **What happens to your documents.** Pseudonymised before any model call; one document per request, never two clients in one context. **Partial coverage, said plainly.** `[C7]`
4. **What we refuse to do.** The §3.4 list, in full.
5. **Who to contact.** A real human route, not a form.

### 4.5 `/support`, `/terms`, `/privacy`

Store requirements. `/support` must answer: how do I delete my account and my
data (a real route exists — `/me/data-requests`), how do I report a wrong
citation, how do I contact a person.

---

## 5 · Screenshots — what to shoot and what must not be in frame

Five, all from real data on a real device. **No mockups, no rendered
placeholders** — a fabricated screenshot of a legal product is a fabricated legal
record.

| # | Shot | Must show | Must NOT be in frame |
| --- | --- | --- | --- |
| 1 | Citation search result | one exact result, fast `[A1]` | a query mixing a case name with a topic word `[A2b]` |
| 2 | **Ambiguity** | `2023:AHC:169979` returning **both** judgments | anything implying we picked one |
| 3 | Judgment reader with LAW MOVED | the amber mark, the citing case `[B2]` | wording asserting a court said it, where the source is a headnote `[B3]` |
| 4 | Matter with saved authorities | authorities, hearing date, timeline `[C1]` | a briefing, a Hearing Pack, a price `[C3] [E1]` |
| 5 | Set-aside refusal | the refusal, and its plain reason `[C2]` | — |

**Shot 2 is the hero screenshot.** It is the only one no competitor's marketing
shows, because showing it means admitting your identifier resolution is
imperfect. Ours makes it a feature by being explicit about it, and NEW2's
materially-unsafe false-unique rate of 0.00% is what makes it safe to lead with.

**Every screenshot's judgment must be a real, currently-held judgment**, and no
`Test Court` row may appear in any frame. 16 leaked fixture rows are in the
production corpus (up from 6 on 23 Aug); none is search-reachable, and the
10-matter regression checks that on every run.

---

## 6 · The premium story on a free-launch site

Launch free, and say so without promising a price.

> LawMind is free while we get it right. Paid features will be about saving you
> time — never about showing you law we would otherwise hide.

That sentence does the work of a pricing page: it sets the boundary, it commits
publicly to the rule in `PREMIUM_PREVIEW_SPEC_V2.md` §0, and it names no number.
**No tier table, no "from ₹X", no Hearing Pack, no credit** `[E1]`.

---

## 7 · Technical requirements (RCC implements; NEW3 accepts)

Responsive, mobile-first — the audience reads on a phone. Accessible: real
headings, contrast, keyboard reachable, alt text on all five screenshots.
Core Web Vitals green on a mid-range Android over 4G, which is the real device.
Meta, canonical, OG per page; sitemap and robots. **No dead links, no lorem, no
placeholder.** Analytics only if it can be described truthfully in `/privacy`.

Hindi is **not** launch scope for the site. The app renders Devanagari
everywhere; the marketing site in Hindi is a separate decision with its own
translation-quality risk, and a machine-translated legal site is worse than an
English one.

---

## 8 · Acceptance (NEW3-7)

Page by page against this file and the claim matrix: PASS / PARTIAL / FAIL with
evidence. **Automatic FAIL, no discussion:**

- any sentence not traceable to an ALLOWED COPY cell;
- "18.7 million" within one sentence of AI, semantic, or search-reach language;
- any fact-pattern, concept-search or adverse-authority-automation claim;
- any Hearing Pack reference;
- any countdown, scarcity device, or fabricated count;
- a store badge linking nowhere;
- a screenshot containing a `Test Court` row;
- `/currentness`'s last sentence in the present tense before `[B4]` opens.
