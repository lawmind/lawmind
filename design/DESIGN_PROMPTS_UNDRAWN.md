# DESIGN PROMPTS — the screens that are genuinely undrawn

Verified 8 Aug 2026 by listing `design/screens/renders/`, not by reading a status
table. `DESIGN_PROMPTS_S3.md` is retracted in part; **these are the real gaps.**

All are **Tier A — library parity**. None blocks the daily loop, which is why they
come after it.

**Do these two first**, in this order, because everything else depends on the
answers:

---

## TASK 0 — settle the two ambiguities before drawing anything

Two questions a human must answer by looking, which no amount of prompting can
resolve:

**1. What is `renders/71-limitation@2x.png`?** `SCREENS.md` has two limitation
screens: **row 91** (limitation and deadline alerts, which fold into the evening
briefing) and **row 98** (the limitation calculator, a Tier A tool). The filename
does not say which. If it is the alert block, the calculator is undrawn. If it is
the calculator, the alert block is.

**2. Does the bare act reading view need its own design at all?** Row 94 says it
"likely shares structure with the judgment reading view (`11e`) — confirm before
drawing twice." `renders/62-judgment-reading@2x.png` exists. **Look at it and
decide**; drawing a second reader that differs by accident is worse than reusing
one deliberately.

Answer both, update `SCREENS.md`, and only then commission from the list below.

---

## THE HOUSE RULES — repeat verbatim in every brief

**Typography.** Source Serif 4 for all legal content — section text, headings,
definitions. Inter for app chrome. **JetBrains Mono for citations and metadata at
11–12px.** Hindi is **Noto Sans Devanagari** everywhere including PDF export, drawn
at full parity and never as a smaller afterthought.

**Amber `#B4690E` is reserved.** It means **the law has moved** and nothing else.
Never a draft state, never a calculation caveat, never our own uncertainty — that
renders as **neutral ink with a dashed edge**. A designer reaching for amber to
mean "attention" has broken the one colour rule in the product.

**Verified is silent.** No badge, tick or chip on a verified citation. Only
`unverified` and `overruled` draw. Do not design a green tick.

**Sunlight is the real environment.** Mid-range Android, daylight, standing
outside a courtroom. Every text/background pair passes **WCAG AA at contrast 0.5 /
brightness 1.3**. Thin grey-on-white metadata fails this and is the commonest
mistake.

**Skeletons, never spinners.** **No notifications tab.**

---

## PROMPT A — Bare act reading view · row 94 *(only if Task 0 says it is needed)*

> Design the **bare act reading view** for Lawmind.
>
> **First, the constraint that shapes it:** it may share structure with the
> judgment reading view (`renders/62-judgment-reading@2x.png`). Look at that
> first. **If the structures can be one component, say so and stop** — two readers
> that differ by accident is a worse outcome than one used twice.
>
> If it genuinely differs, the reasons will be these: a statute is navigated by
> **section number**, not read start-to-finish; sections are short and dense
> rather than long and narrative; and **amendment history matters** — an advocate
> needs to know which version of a section applied on a given date.
>
> **The hard part.** BNS, BNSS and BSA replaced the IPC, CrPC and Evidence Act on
> **1 July 2024**, and the regime that applies turns on the **date of the
> offence**, not today's date. A reader that shows only the current text will
> mislead an advocate working a 2023 matter. Design how a section shows its
> counterpart in the other regime — and note that mappings are **not always 1:1**:
> one IPC section can split across several BNS sections, and some have no
> equivalent at all. **A missing mapping must render as absent, never as "none".**
>
> **Deliver:** the reading view at 2x, section navigation, the cross-regime
> mapping component in all three states (exact, split, no equivalent), and a Hindi
> version at full parity.

---

## PROMPT B — Draft template library · row 95

> Design the **draft template library** for Lawmind.
>
> **What it is.** Static standard formats — the forms an advocate already uses —
> sitting alongside the ten AI-generated document types.
>
> **The distinction that must be legible at a glance:** a **template** is a blank
> form the advocate fills in; a **generated draft** is composed for a specific
> matter and carries verified citations. Confusing the two is how somebody files a
> template thinking it was drafted for them.
>
> **Deliver:** the library screen at 2x, a template preview, and the moment where
> an advocate chooses between "start from a template" and "draft this for me".

---

## PROMPT C — Legal dictionary · row 96

> Design the **legal dictionary** for Lawmind: terms, Latin maxims, procedural
> vocabulary.
>
> **Design for the real use:** it is reached mid-task, from a judgment or a draft,
> to check one term — not browsed. So the **entry point matters more than the
> screen**: design how a term is looked up without losing the advocate's place.
>
> **Sources are primary only.** Definitions come from statutes and judgments, never
> from a model's commentary about law. Where a definition has a statutory source,
> **name it** — a definition without a source is an opinion.
>
> **Deliver:** the inline lookup (the primary surface), the full entry, and the
> browse view at 2x.

---

## PROMPT D — Court rules and practice directions · row 97

> Design **court rules and practice directions** for Lawmind — Supreme Court and
> per-High-Court.
>
> **The structural problem to solve.** Twenty-five High Courts each publish their
> own rules, in their own format, updated on their own schedule. The screen must
> make **which court's rules these are** unmissable, and must state **when they
> were last updated**, because a practice direction an advocate relies on may have
> been superseded.
>
> **Where we do not hold a court's rules, say so.** An absent court must never
> render as an empty result that looks like "no such rule" — that is the same
> failure as a silently dropped citation.
>
> **Deliver:** court selection, the rules view, and the not-held state at 2x.

---

## PROMPT E — Court fee calculator · row 99

> Design the **court fee calculator** for Lawmind — per state, per suit value.
>
> **It states its basis or it does not ship.** Which state's schedule, which
> entry, which suit value. A bare figure the advocate cannot check is worse than
> no calculator — the same rule as the limitation calculator.
>
> **Court fees vary by state and change.** Show the schedule version and its date.
> Where we do not hold a state's schedule, say so plainly rather than computing
> something plausible.
>
> **Money is displayed, never computed on the device** — the server owns every
> figure.
>
> **Deliver:** input, result with its stated basis, and the state-not-held case,
> at 2x.

---

## PROMPT F — Limitation calculator · row 98 *(only if Task 0 says 71 is the alert block)*

> Design the **limitation calculator** for Lawmind.
>
> **This is the highest-anxiety calculation an advocate makes.** Missing a
> limitation period is malpractice.
>
> **It produces a computation with stated inputs, never a deadline.** It must name
> the Act, the article, and the starting event it assumed — and it must say
> plainly what it has **not** computed: **exclusions and condonation under ss. 5,
> 12 and 14 are fact questions the app cannot see**. Special limitation periods in
> the Commercial Courts Act, the Consumer Protection Act and s. 34 of the
> Arbitration Act **override the Schedule**, and a calculator that only knows the
> Schedule is confidently wrong exactly where the stakes are highest.
>
> Design the uncertainty as **neutral ink with a dashed edge** — never amber.
>
> **Deliver:** input, the result with its basis and its stated exclusions, and the
> case where a special Act may apply, at 2x.
