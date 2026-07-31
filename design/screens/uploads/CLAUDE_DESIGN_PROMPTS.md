# CLAUDE DESIGN — PROMPTS

Paste `DESIGN_SYSTEM.md` first as your opening message in Claude Design. Then run
these in order. Each is self-contained; do not paraphrase them into one big ask —
screens designed in a batch lose specificity.

Work in this sequence: system → wireframes for the whole set → high-fidelity for
the four screens that matter most → states and edge cases → admin.

---

## PROMPT 0 — Establish the system

> I'm designing Lawmind, a mobile app for practising advocates in India. Before
> any screens, build me a design system canvas showing the palette, type scale,
> spacing scale, button variants, input states, badge variants, and card
> anatomy — using exactly the tokens I'm about to give you.
>
> [paste DESIGN_SYSTEM.md]
>
> Important context that should shape every choice: this app is used in Indian
> court corridors, in daylight, on cheap Android phones, often one-handed while
> the user is carrying physical case files. Many users are over 50. Roughly half
> will use it in Hindi, which needs looser line-height than Latin type.
>
> It must read as a serious legal instrument, not a startup dashboard. Our main
> Indian competitor looks like 1996 software and advocates still trust it — I
> need to look modern without looking unserious.
>
> Show me the system as a single reference canvas I can point back to.

---

## PROMPT 1 — Wireframe the full set

> Using that system, wireframe all 28 screens from this inventory. Low fidelity —
> greyscale, real layout, real content hierarchy, no colour or polish yet. I want
> to see structure and flow before we make anything pretty.
>
> [paste SCREENS.md]
>
> For each screen show: what the user came here to do, the primary action, and
> where it sits on the screen. Primary actions belong in the bottom third for
> one-handed reach.
>
> Flag anywhere you think the flow is wrong. I would rather find it now than
> after it's built.

---

## PROMPT 2 — Today screen, high fidelity

> High fidelity on the Today screen. This is the first thing an advocate sees
> every morning and it decides whether they open the app again tomorrow.
>
> Content, in priority order:
> - Tonight's briefing, if one is ready — the single most valuable object in the
>   product. It should feel like something arrived, not like a list item.
> - Hearings in the next 7 days, grouped by day, showing case title, court, time
> - A search entry point
>
> States to show me: briefing ready · briefing generating · no hearings this week
> (with a clear next action, never a shrug) · first-run empty with no matters yet.
>
> The emotional target: an advocate glances at this on the way into court and
> feels prepared. Not "here is your data" — "you are ready."

---

## PROMPT 3 — Search and results

> Design the search input and results screens.
>
> Search input: a plain-language question box, not keyword fields. Example query
> an advocate would actually type: "bail in dowry harassment where accused is the
> husband's brother". Language toggle English/Hindi. Collapsible filters for
> court, date range, criminal or civil.
>
> Results: five judgment cards. Each shows case title, citation, court, date, a
> two-sentence holding, and — critically — a verification badge confirming the
> citation was checked against our database. That badge is our entire value
> proposition made visible; design it so it reads as reassurance, not decoration.
>
> Some results are overruled judgments. Those need a caution badge that is
> impossible to miss without being alarming. An advocate citing overruled law is
> nearly as damaged as one citing a fake case.
>
> Show me: loading as skeleton cards that hold the screen's shape, not a spinner ·
> no results · search in Hindi with Devanagari rendering at proper line-height.

---

## PROMPT 4 — Judgment detail

> The judgment detail screen. An advocate lands here from a search result and
> needs to decide fast whether this case helps them.
>
> Hierarchy: case title and citation · overruled banner if applicable, at the top,
> unmissable · the holding in two sentences · the operative paragraph, pulled out
> and visually distinct · then full text, collapsed by default.
>
> Body text in the serif. This should feel like reading a well-set printed
> judgment, not a web article.
>
> Actions: add to a matter, copy citation, share.
>
> Show the overruled variant as a separate frame — I want to see exactly how loud
> that banner is.

---

## PROMPT 5 — The briefing (the most important screen)

> This is our differentiating feature and no competitor in India has it. Design it
> as the flagship.
>
> The night before a listed hearing, the advocate receives a briefing containing:
> what happened at the last hearing · applications currently pending · case law
> relevant to the live issues, each with a verification badge · a preparation
> checklist they can tick.
>
> Design constraints: it must be skimmable in ninety seconds standing in a
> corridor, and it must be fully readable offline because court buildings have
> terrible signal.
>
> Show me the push notification that opens it, and the screen itself.
>
> The feeling I want: an advocate reads this on the way in and walks into court
> more prepared than they would have been after an hour of their own preparation.
> That is the product in one screen.

---

## PROMPT 6 — Drafting flow, three screens

> The drafting flow: type picker → input form → generated draft.
>
> **Type picker:** ten document types grouped criminal and civil — bail
> application, anticipatory bail, plaint, written statement, legal notice, reply
> to notice, affidavit, vakalatnama, writ petition, RTI application.
>
> **Input form:** structured fields that change per document type. Keep it short —
> an advocate filling a long form on a phone will abandon it. Language toggle
> English/Hindi.
>
> **Draft output:** the generated document in serif, inline citations each showing
> verification state, inline editing, export to PDF or Word.
>
> One non-negotiable: every draft carries a visible "AI-assisted draft — verify
> before filing" mark that only the advocate can remove, with a deliberate action.
> Design that mark so it is honest and prominent without making the document look
> unusable — it will appear on something that goes to court.
>
> Show the Hindi variant of the output screen. Devanagari at proper line-height,
> serif for body.

---

## PROMPT 7 — Matters

> Matters list and matter detail.
>
> **List:** active cases, each showing case title, court, next hearing date,
> client. Sorted by next hearing. This is the advocate's working set.
>
> **Detail:** a hearing timeline running down the screen — what happened at each
> date, orders passed, notes. Plus documents drafted for this matter, past
> briefings, and the next hearing date prominent.
>
> This screen is our retention moat: six months of an advocate's work lives here
> and that is what stops them leaving. Design it to feel like it accumulates
> value — an object that gets richer over time, not a form.
>
> Also show: add matter, with two paths — look up by CNR number, or enter
> manually. The manual path must feel first-class, not like a fallback, because
> at launch it may be the only one that works.

---

## PROMPT 8 — Onboarding

> Five onboarding screens: sign-in by email magic link · link-sent state ·
> identity including bar council enrolment number · language choice · optional
> first matter.
>
> The enrolment number is captured but never blocks access — there is no public
> API to verify it, so it goes into a manual review queue. Design it so it feels
> like establishing professional credibility, not like a gate. Something like a
> "verification pending" state the advocate is happy to have.
>
> Keep the whole flow under two minutes. Advocates will abandon anything longer.

---

## PROMPT 9 — States and edges

> Design the states that decide whether this feels solid or flimsy.
>
> - Empty: no matters, no search results, no drafts. Each states clearly what to
>   do next. Never just "nothing here".
> - Offline: court buildings have poor signal. Cached matters and briefings stay
>   readable; the app says plainly what is stale.
> - AI unavailable: honest and plain. Never a stale cached answer presented as
>   fresh.
> - Citation verification failed: what the advocate sees when we could not verify
>   something. This should build trust, not hide a problem.
> - Subscription paywall and tier comparison: Starter Rs.799, Professional
>   Rs.1,999, Expert Rs.3,499. Firm plans are sold off-app, so do not show a buy
>   button for those — show "contact us".
>
> Offline is a real requirement here, not an edge case. Treat it that way.

---

## PROMPT 10 — Admin web

> Three admin screens for web, desktop layout, same design system.
>
> - **LLM spend dashboard:** cost by day, by feature, by model. I need to spot a
>   runaway cost the same day it happens.
> - **Citation monitor:** verification failure rate over time, with the failing
>   queries listed. This is our most important health metric — if it climbs,
>   something is badly wrong.
> - **Enrolment queue:** advocates awaiting bar council verification, approve or
>   reject.
>
> Dense and functional. This is an internal tool — clarity beats beauty, but it
> should still look like it belongs to the same product.

---

## AFTER THE DESIGN WORK

Export screens and hand them to CX1 before S1 starts. The reason we are designing
first is that the last project designed screens at the end and implementation
fought the design the whole way. Design decisions made now are cheap; the same
decisions made in S4 cost a rebuild.

Anything Claude Design flags as a flow problem in Prompt 1 goes into
`docs/OPEN_DECISIONS.md` before any code is written.
