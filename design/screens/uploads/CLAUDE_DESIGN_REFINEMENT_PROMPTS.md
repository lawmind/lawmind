# LAWMIND — DESIGN REFINEMENT PROMPTS v2

Run these in order in Claude Design. Attach the existing renders where indicated
so it can see what is being rejected and why — the drift toward dark-and-gold
happened once and will happen again unless it is named explicitly.

Do not merge these into one ask. The badge in particular needs its own session.

---

## PROMPT A — Kill one direction, commit to the other

Attach: `renders/22-palette-oxblood.png`, `renders/23-paper-system.png`,
`renders/04-today-briefing-ready.png`, `renders/25-paper-today.png`

> You produced two design directions for Lawmind and I need to close that.
> Attached are both: a dark direction with oxblood and gold, and a lighter paper
> direction.
>
> **I am killing the dark direction. Do not propose it again in any form.** Here
> is the reasoning so you can apply it to every decision from here:
>
> This app is used by practising advocates standing in Indian court corridors and
> open courtyards, in daylight, mostly on mid-range Android phones with mediocre
> outdoor brightness. Dark surfaces invert the contrast advantage outdoors — the
> screen becomes a mirror. Gold on dark is the worst combination available for
> sunlight legibility, and it was being used for rules and accents throughout.
>
> It is also the wrong register of premium. Dark plus deep red plus gold reads as
> luxury consumer — whisky, members' clubs, crypto tiers. Legal premium is a
> senior advocate's chamber: paper, wood, bound reporters, restraint. My buyer is
> a 45-year-old litigator deciding whether this is a serious professional
> instrument or a startup toy. Metallic gradients push toward toy.
>
> And it fights the content. Judgments and generated drafts are long-form serif
> reading — the thing an advocate stares at longest before filing something in
> court. Long-form reading on dark is worse for sustained comprehension.
>
> **What survives from the dark direction:** the oxblood itself, as an accent on
> light. `#5E1A2B` on a warm paper ground is a strong, serious pairing. Keep it.
>
> **What dies:** all dark surfaces, all gold — as text, as rules, as accents, as
> anything. The gilt `#C9A227` is gone entirely.
>
> Show me one render confirming the decision: the same screen (Today) rendered
> only in the surviving system, with a short written note on what changed and
> what carried over. I want to be certain we are aligned before you touch
> anything else.

---

## PROMPT B — The craft pass: make paper feel premium

> The paper direction is correct and currently underbuilt. It reads *plain*
> rather than *premium* — closer to a default white app than to a well-printed
> legal document. That is the whole problem to solve in this pass.
>
> Premium here does not come from darkness, metallics, gradients, glass, or
> glow. It comes from four harder things. Work each one deliberately:
>
> **1. Typography that a typographer would defend.**
> Lora is soft and slightly calligraphic. For sustained on-screen legal reading I
> want you to evaluate and recommend between Source Serif 4, Literata, Newsreader
> and Spectral — Literata and Source Serif 4 were both drawn for screen reading,
> which Lora was not. Show me the same paragraph of judgment text set in your top
> two so I can choose by eye.
>
> Specifics I want held: body measure 60–72 characters, never wider. Serif body
> leading 1.6–1.7. Minimum body size 16px, not 15 — many users are over fifty and
> reading in bad light. Devanagari at 1.65 minimum leading, and set the same
> paragraph in Hindi so I can see the two scripts sitting together at the same
> optical weight.
>
> **2. Material — paper with tooth, not flat white.**
> `#FBFAF7` flat is what makes it feel unfinished. Give the ground actual
> presence: a very subtle grain or fibre at low opacity, or a barely perceptible
> warm gradient. The test is that a screenshot should feel like it was *printed*
> rather than *rendered*. This should be felt and not noticed — if a user can
> describe the texture, it is too strong.
>
> **3. Rules and edges instead of shadows.**
> Hairline rules in the ink family carry the structure. Shadows almost entirely
> gone — at most one very soft shadow on a genuinely floating sheet. Depth comes
> from the rule and from spacing, the way it does on a printed page.
>
> **4. Restraint as the premium signal.**
> The oxblood accent appears at most twice per screen. Not on every heading, not
> on every timestamp, not as a decorative rule. Once for the primary action, once
> where genuine emphasis is earned. Everything else is ink, ink-muted, and rule.
> If a screen has three or more accent moments, it is wrong.
>
> Deliver an updated system canvas: palette, the chosen serif with the full type
> scale in both Latin and Devanagari, spacing rhythm, rule weights, card anatomy,
> button variants, input states.
>
> Then show me one paragraph of judgment text set properly, full width, on the
> new ground. That single paragraph is the test of whether this pass worked.

---

## PROMPT C — The verification badge (its own session, most important component)

> This is the most important component in the entire product and it is currently
> being treated as decoration. In the existing renders it is a generic status
> chip — the kind of component that appears in any dashboard.
>
> Here is what it actually carries. Lawmind's whole thesis is that an advocate
> can trust a citation enough to put it in a document they file in court. An
> advocate who files a case that does not exist is humiliated in open court and
> never comes back. This badge is that promise made visible. It deserves more
> design attention than any screen.
>
> **Five states, each needing a distinct read:**
>
> - `verified_internal` — confirmed against our own corpus of judgments
> - `verified_external` — confirmed by cross-referencing two independent public
>   sources
> - `verified_human` — the advocate personally confirmed it via the government
>   eCourts system
> - `unverified` — we found this reference and could not confirm it exists
> - `overruled` — real and confirmed, but the law has moved
>
> **Hard requirements:**
>
> It must be legible at a glance in direct Indian sunlight on a mid-range Android
> screen. Assume poor contrast and a dirty screen.
>
> It must not require a legend. An advocate seeing it for the first time should
> understand the distinction without being taught.
>
> `unverified` is the hardest and the most important. It must read as *honest*,
> not as *broken*. We are telling a professional something we do not know — that
> should build trust, not look like a failure state. Get this one wrong and the
> feature backfires: advocates will read it as the product being unreliable
> rather than the product being careful.
>
> `overruled` must be impossible to miss without being alarming. An advocate
> citing overruled law is nearly as damaged as one citing a fake case.
>
> The three verified states must be clearly one family — an advocate should not
> have to think about which flavour of verified they are looking at unless they
> want to.
>
> **Direction to explore:** this is a legal instrument, so the register of a seal,
> a stamp, or an authentication mark is more appropriate than a UI chip. Think
> notarial rather than dashboard. But do not make it decorative — it must still
> read instantly at 16px in a list of five results.
>
> Show me three genuinely different approaches to the whole family, not three
> variations of one idea. For each, show all five states, at real size, in
> context inside a result card, and one rendered at reduced brightness to
> simulate sunlight washout.
>
> Then tell me which you would ship and why.

---

## PROMPT D — Rebuild the four screens that matter

> Using the refined system and the badge family I chose, rebuild these four at
> high fidelity. These four decide the product.
>
> **Today** — first thing an advocate sees each morning. Tonight's briefing if
> ready, hearings for the week, a way into search. The briefing should feel like
> something *arrived*, not like a list item. Target feeling: they glance at this
> walking into court and feel prepared.
>
> **Search results** — five judgment cards, each carrying its verification state.
> Include at least one `unverified` and one `overruled` in the render so I can
> see the full range sitting together in one list. That mixed list is the real
> test of the badge system.
>
> **Hearing briefing** — our differentiating feature; no Indian competitor has it.
> Skimmable in ninety seconds standing in a corridor. Fully readable offline.
> Sections: where the matter stands, what is pending, authorities on the live
> issue, preparation checklist.
>
> **Draft output** — a generated bail application. Long-form serif, inline
> citations each showing verification state, and the "AI-assisted draft — verify
> before filing" mark that only the advocate can remove. That mark appears on
> something that goes to court: make it honest and prominent without making the
> document look unusable or unprofessional.
>
> Hold the restraint rule throughout: at most two accent moments per screen.

---

## PROMPT E — Hindi, states and stress tests

> Three things that decide whether this feels solid or flimsy in practice.
>
> **Hindi parity.** Render Today, search results and a draft output entirely in
> Hindi. Devanagari at proper leading, serif body for document text. The two
> language versions should feel like the same product at the same quality — not
> like English is the real one and Hindi is a translation. Show them side by
> side.
>
> **The honest states.** Offline with cached briefings still readable and clearly
> marked stale. AI unavailable — plain and honest, never a stale answer dressed
> as fresh. Empty states for no matters, no results, no drafts, each saying what
> to do next rather than shrugging. And the privacy disclosure: what leaves the
> device, what is pseudonymised before any AI call, and what we cannot guarantee.
> We will not claim complete anonymity — design that limitation so it reads as
> competence rather than as a warning label.
>
> **Stress tests.** Render Today and search results at reduced brightness to
> simulate direct sunlight. Then render search results with a very long case
> title, a case with six reporter citations, and a holding that runs four lines —
> real Indian case data is messier than design placeholder text and the layout
> needs to survive it.

---

## PROMPT F — Admin, same system

> Four admin screens for web, desktop, on the same refined system. Internal tool
> — dense and functional, clarity over beauty, but it should still belong to the
> same product.
>
> **LLM spend** — cost by day, feature, model, and data class (public versus
> sensitive). I need to spot a runaway cost the same day it happens.
>
> **Citation monitor** — verification states over time, failure rate, and
> silent-drop rate, with failing queries listed. This is our most important
> health metric; if the failure rate climbs, something is badly wrong.
>
> **OCR review queue** — scanned court orders where extraction confidence was low
> and a human needs to look.
>
> **Enrolment queue** — advocates awaiting bar council verification, approve or
> reject.
>
> Note: I changed the admin screens myself in the previous round. Ask me what
> changed before assuming the earlier admin renders are current.

---

## PROMPT G — Handoff

> Package everything for engineering.
>
> Export every screen at 2x and 3x. Produce a final system document with tokens
> as named values ready to become code — colours, type scale for both scripts,
> spacing, rule weights, radii, motion timings.
>
> Include the badge component specified precisely enough to build without
> guessing: all five states, sizes, contrast ratios, behaviour at small size.
>
> Flag every screen where you made a decision I did not explicitly approve, so I
> can review those before they become code.

---

## AFTER

Re-zip and hand back. The reconciliation step in the Claude Code kickoff prompt
will diff the new screens against `design/SCREENS.md` and update the docs to
match — your screens stay authority, the docs get corrected to them.

Two things to watch for as it works:

**Gold creeping back.** It will try. Metallic accents are the default move when
an agent is asked for premium. Reject on sight.

**The badge becoming decorative.** If it starts looking beautiful at the cost of
reading instantly at 16px in a list, it has failed — pull it back.
