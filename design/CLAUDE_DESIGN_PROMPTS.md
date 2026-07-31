# CLAUDE DESIGN — PROMPTS

Paste `DESIGN_SYSTEM.md` first. Then run these in order. Each is self-contained;
do not merge them into one ask — screens designed in a batch lose specificity.

Sequence: system → wireframes → high-fidelity for the four screens that matter →
states and edges → admin.

---

## PROMPT 0 — Establish the system

> I'm designing Lawmind, a mobile app for practising advocates in India. Before
> any screens, build me a design system canvas showing palette, type scale,
> spacing, button variants, input states, badge variants and card anatomy — using
> exactly the tokens below.
>
> [paste DESIGN_SYSTEM.md]
>
> Context that should shape every choice: used in Indian court corridors, in
> daylight, on cheap Android phones, often one-handed while carrying case files.
> Many users are over 50. About half will use it in Hindi, which needs looser
> line-height than Latin.
>
> It must read as a serious legal instrument, not a startup dashboard. Our main
> Indian competitor looks like 1996 software and advocates still trust it — I
> need to look modern without looking unserious.
>
> One component needs special care: the citation verification badge. It has five
> states — verified internally, verified by external cross-reference, confirmed by
> the advocate, unverified, and overruled. That badge is our entire value
> proposition made visible. Design all five.

---

## PROMPT 1 — Wireframe the full set

> Using that system, wireframe all 34 screens from this inventory. Low fidelity —
> greyscale, real layout and hierarchy, no polish. Structure before beauty.
>
> [paste SCREENS.md]
>
> For each: what the user came here to do, the primary action, where it sits.
> Primary actions in the bottom third for one-handed reach.
>
> Flag any flow you think is wrong. Better now than after it's built.

---

## PROMPT 2 — Today screen, high fidelity

> High fidelity on Today. First thing an advocate sees each morning; it decides
> whether they open the app tomorrow.
>
> Priority: tonight's briefing if ready — the most valuable object in the product,
> it should feel like something *arrived* · hearings next 7 days grouped by day ·
> a search entry point.
>
> States: briefing ready · briefing generating · no hearings this week (with a
> clear next action, never a shrug) · first-run with no matters.
>
> Emotional target: an advocate glances at this walking into court and feels
> prepared. Not "here is your data" — "you are ready."

---

## PROMPT 3 — Search and results

> Search input and results.
>
> Input: plain-language question box, not keyword fields. Real example an advocate
> would type: "bail in dowry harassment where accused is the husband's brother".
> Language toggle. Collapsible filters for court, date, criminal/civil.
>
> Results: five judgment cards. Title, citation, court, date, two-sentence holding,
> and the verification badge. That badge reads as reassurance, not decoration.
>
> Critically: some results carry citations we could NOT verify. Design that state
> honestly — we found this reference but could not confirm it exists, here's how
> to check via eCourts. It must not look like a failure or an error. It should
> build trust: we tell you what we don't know.
>
> Overruled judgments need a caution badge impossible to miss without being
> alarming.
>
> Show: skeleton loading that holds the screen's shape · no results · Hindi search
> with Devanagari at proper line-height.

---

## PROMPT 4 — Judgment detail and unverified detail

> Two screens.
>
> **Judgment detail:** title and citation · overruled banner at top if applicable,
> unmissable · holding in two sentences · operative paragraph pulled out and
> visually distinct · full text collapsed by default. Body in serif — it should
> feel like a well-set printed judgment. Actions: add to matter, copy citation,
> share.
>
> **Unverified citation detail:** the model referenced something we could not
> confirm through our corpus or external cross-reference. Show what it claimed,
> which sources we checked, and offer confirmation via eCourts — which opens a
> pre-filled government search where the advocate solves a CAPTCHA themselves.
> Explain why they're solving it: we don't bypass government systems.
>
> This screen is where trust is either built or lost. Design it accordingly.

---

## PROMPT 5 — The briefing (most important screen)

> Our differentiating feature. No competitor in India has it. Design it as the
> flagship.
>
> Night before a listed hearing: what happened last hearing · pending applications
> · relevant case law each with verification state · a preparation checklist they
> can tick.
>
> Constraints: skimmable in ninety seconds standing in a corridor, fully readable
> offline because court buildings have terrible signal.
>
> Show the push notification and the screen.
>
> The feeling: an advocate reads this walking in and is more prepared than an hour
> of their own preparation would have made them. That's the product in one screen.

---

## PROMPT 6 — Drafting flow

> Three screens: type picker → input form → generated draft.
>
> **Type picker:** ten types grouped criminal and civil — bail, anticipatory bail,
> plaint, written statement, legal notice, notice reply, affidavit, vakalatnama,
> writ petition, RTI.
>
> **Input form:** structured fields per type. Short — a long form on a phone gets
> abandoned. Language toggle.
>
> **Draft output:** document in serif, inline citations each showing verification
> state, inline editing, export to PDF or Word.
>
> Non-negotiable: every draft carries a visible "AI-assisted draft — verify before
> filing" mark, removable only by deliberate action. Design it honest and
> prominent without making the document look unusable — it goes to court.
>
> Show the Hindi variant. Devanagari at proper line-height, serif body.

---

## PROMPT 7 — Matters

> **List:** active cases — title, court, next hearing, client. Sorted by next
> hearing. The advocate's working set.
>
> **Detail:** hearing timeline down the screen — what happened each date, orders,
> notes. Plus documents drafted, past briefings, next hearing prominent.
>
> This is our retention moat: six months of an advocate's work lives here and
> that's what stops them leaving. Design it to feel like it *accumulates* — an
> object that gets richer, not a form.
>
> Also: add matter, two paths — CNR lookup or manual entry. Manual must feel
> first-class, not a fallback, because at launch it may be the only one working.

---

## PROMPT 8 — OCR intake

> Three screens for photographing a court order.
>
> **Capture:** camera with edge guidance, or file picker. Court orders are A4
> portrait, often photographed at an angle in bad light.
>
> **Processing:** async, honest about it. A ten-page order takes time. Never a
> blank spinner — show what stage it's at.
>
> **Field confirmation — the important one:** extracted court, case number,
> parties, date, order body. Low-confidence fields visibly flagged. The advocate
> corrects and confirms. **Nothing saves until they confirm.**
>
> Design the confirmation step so it feels quick rather than like homework —
> most fields will be right, and the advocate is checking, not typing. But a
> silently wrong hearing date is a missed hearing, so confirmation cannot be
> skippable.

---

## PROMPT 9 — Onboarding

> Five screens: sign-in by magic link · link sent · identity including bar council
> enrolment · language choice · optional first matter.
>
> The enrolment number is captured but never blocks access — no public API exists
> to verify it, so it goes to manual review. Design it as establishing
> professional credibility, not a gate. A "verification pending" state the
> advocate is happy to have.
>
> Whole flow under two minutes.

---

## PROMPT 10 — States, edges and privacy

> The states that decide whether this feels solid or flimsy.
>
> - Empty: no matters, no results, no drafts. Each says what to do next.
> - Offline: court buildings have poor signal. Cached matters and briefings stay
>   readable; say plainly what's stale.
> - AI unavailable: honest and plain. Never a stale answer as fresh.
> - **Privacy disclosure:** what leaves the device, what is pseudonymised before
>   any AI call, and what we cannot guarantee. We will not claim complete
>   anonymity — advocates are trained to distrust overclaims, and an honest
>   limitation builds more confidence than a false absolute. Design this so it
>   reads as competence, not as a warning label.
> - Paywall and tiers: Starter Rs.799, Professional Rs.1,999, Expert Rs.3,499.
>   Firm plans sell off-app — show "contact us", not a buy button.

---

## PROMPT 11 — Admin web

> Four admin screens, desktop, same system.
>
> - **LLM spend:** cost by day, feature, model, and data class (public vs
>   sensitive). Spot a runaway cost the same day.
> - **Citation monitor:** verification states over time, failure rate and
>   silent-drop rate, with failing queries listed. Our most important health
>   metric.
> - **OCR review queue:** low-confidence jobs awaiting attention.
> - **Enrolment queue:** advocates awaiting bar council verification.
>
> Dense and functional. Internal tool — clarity beats beauty, but it should still
> belong to the same product.

---

## AFTER

Export and hand to CX1 before S1 starts. We design first because the last project
designed at the end and implementation fought the design the whole way. Decisions
made now are cheap; the same decisions in S4 cost a rebuild.

Anything Claude Design flags as a flow problem in Prompt 1 goes into
`docs/OPEN_DECISIONS.md` before any code is written.
