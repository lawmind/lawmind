# DESIGN PROMPTS — RETRACTED IN PART, 8 Aug 2026

> **READ THIS FIRST. Most of what follows was unnecessary.**
>
> These prompts were written on the strength of `design/SCREENS.md` saying "None
> is drawn" for rows 88–99. **That line was stale.** Listing
> `design/screens/renders/` showed seven of those screens already had renders:
> the cause list, client share, adjournment, limitation, fee log, bare acts and
> the consent screen.
>
> **Do not commission these six.** They exist. SCREENS.md is corrected.
>
> **What is genuinely still undrawn**, verified against the renders directory:
> - row 94 · bare act reading view (may share structure with the judgment reading
>   view `11e` — confirm before drawing twice, as the row itself says)
> - row 95 · draft template library
> - row 96 · legal dictionary
> - row 97 · court rules and practice directions
> - row 99 · court fee calculator
> - row 98 · limitation **calculator** — *unless* `71-limitation@2x.png` is it
>   rather than the row 91 alert block. Somebody has to look.
>
> The house rules below are still correct and worth giving to any designer. The
> six briefs are kept as a record of the mistake, and because their content
> transfers if any of these screens is ever redrawn.

---

## THE HOUSE RULES — true in all six

Give these to the designer verbatim; they are not preferences.

**Typography.** Source Serif 4 carries all legal content — case names, holdings,
drafts, section text. Inter for app chrome. **JetBrains Mono for citations and
metadata at 11–12px.** Hindi is **Noto Sans Devanagari** everywhere, including PDF
export, and Hindi is drawn at full parity, never as a smaller afterthought.

**Amber `#B4690E` is reserved.** It means **the law has moved** and nothing else —
never a draft state, never OCR confidence, never our own uncertainty. Our
uncertainty renders as **neutral ink with a dashed edge**. A designer who reaches
for amber to mean "attention" has broken the one colour rule in the product.

**Verified is silent.** A verified citation gets **no badge, tick or chip**. Only
two citation states draw at all: `unverified` (an unmissable mark plus the eCourts
path) and `overruled` (LAW MOVED, three sub-states). Silence means "verified, not
decorated" — it never means "dropped". Do not design a green tick. Do not design a
"100% verified" banner.

**Sunlight is the real environment.** An advocate reads this standing outside a
courtroom on a mid-range Android in daylight. Every text/background pair must pass
**WCAG AA at contrast 0.5 / brightness 1.3**. Thin light-grey-on-white metadata
fails this and is the most common mistake.

**Thumb reach on a 6.1" phone, one-handed, often standing.** Primary actions sit
in the lower third. Nothing critical in the top corners.

**Skeletons, never spinners.**

**No notifications tab.** Alerts batch into the evening briefing (PD-6).

---

## PROMPT 1 — Daily cause list · `SCREENS.md` row 88

> Design the **Daily cause list** screen for Lawmind, an iOS/Android app for
> practising Indian advocates.
>
> **What it is.** Every matter this advocate has listed **today**, across all
> courts, on one screen. It is **the first thing they check each morning**, often
> in a car or a corridor, one-handed, in daylight.
>
> **The content, per row:** case title (Source Serif 4), court and court number,
> the item number if known, the client's name, and which side we are on. Grouped
> by court, because an advocate physically travels between courts and the grouping
> is the plan for the day.
>
> **The hard part, and the reason this screen exists.** A listing is one of three
> states and they must be **visually distinct without alarm**:
> - **confirmed** — we checked a cause list and it agrees. Renders plainly.
> - **not confirmed** — we checked and could not confirm. Needs a visible,
>   readable caution: *"We could not confirm this listing. Check with the court."*
> - **never checked** — no cause list was consulted. This is the **normal state**
>   for a date the advocate typed themselves, which is a first-class source
>   (dates are given orally in open court). It must read as ordinary, **not** as a
>   warning. Design this one first; if it looks like a problem, the whole screen
>   cries wolf and gets ignored.
>
> Do not use amber for any of these — amber means the law has moved.
>
> **Also design:** the empty state (no listings today — a real and pleasant
> outcome, not a failure), and the state where the cause list sync itself is
> stale, which is a property of a *court*, not of a matter.
>
> **Deliver:** a full-bleed mobile screen at 2x, plus the three listing states as
> isolated components, plus the empty state. Light theme. Annotate type sizes and
> the exact tokens used.

---

## PROMPT 2 — Client update share · `SCREENS.md` row 89

> Design the **Client update share** for Lawmind.
>
> **What it is.** One tap turns a matter into a clean summary the advocate sends
> to their client over WhatsApp.
>
> **Why it matters more than it looks.** This is **the viral loop**. Every share
> carries our name to a client and, often, to opposing counsel. It is marketing
> surface disguised as a utility, and it will be screenshotted.
>
> **What it contains:** case title, court, what happened at the last hearing (the
> court record, verbatim — never our summary of it), and the next date. Written
> for a **non-lawyer**: the client is an ordinary person who wants to know what
> happened and when they are needed.
>
> **What it must never contain:** the advocate's private notes. Notes are private
> by default and travel only when explicitly marked shared. A note about fees or a
> client's circumstances leaking into a share is the failure this rule exists to
> prevent.
>
> **Citations, if any appear:** rendered exactly as in the app. If an authority
> has been set aside, that must be visible here too — a share is a surface like
> any other.
>
> **Design both:** the in-app preview-and-confirm step (the advocate must see
> exactly what will be sent before it goes), and the rendered artefact itself —
> assume it is a WhatsApp text message or an image. If an image, it must be
> legible as a thumbnail.
>
> **Attribution:** tasteful, small, unmistakable. This is where the product gets
> discovered.
>
> **Deliver:** the preview screen at 2x, the rendered share artefact, and a
> version of the artefact in **Hindi at full parity**. Annotate the typography.

---

## PROMPT 3 — Adjournment capture · `SCREENS.md` row 90

> Design **Adjournment capture** for Lawmind.
>
> **The situation, exactly.** The advocate is **standing in a courtroom**. The
> judge has just given the next date orally. They have seconds, one hand, and
> possibly no signal. If this takes more than three taps they will write it on
> paper instead and the app loses the matter.
>
> **Three taps, hard budget:** open the matter → enter the date → confirm.
>
> **Design decisions that need care:**
> - Date entry that is fast standing up. A full calendar picker is probably wrong.
>   Consider common relative offsets (2 weeks, 4 weeks, 6 weeks) alongside an
>   exact entry, because adjournments cluster.
> - It must work **fully offline** and say so without anxiety — the write queues
>   and syncs later. Do not design a failure state for being offline; this is the
>   expected condition inside a courtroom.
> - A one-line note is optional and must not slow the primary path.
>
> **Also design:** the confirmation. It must be unmistakable in peripheral vision
> — the advocate is looking at the bench, not the phone — and it must state the
> date back in words, because a mistyped date is a missed hearing.
>
> **Deliver:** the three-step flow at 2x, the offline-queued state, and the
> confirmation. Annotate the tap targets in points; assume a gloved or hurried
> thumb.

---

## PROMPT 4 — Limitation and deadline alerts · `SCREENS.md` row 91

> Design **limitation and deadline alerts** for Lawmind.
>
> **Critical constraint: this is NOT a new notification surface.** It folds into
> the existing evening briefing rhythm. The app does not grow a notifications tab.
> A wrong cadence trains advocates to disable notifications permanently and they
> do not come back.
>
> **What it shows.** A limitation period approaching on a matter. Missing one is
> malpractice, so this is the highest-anxiety information in the product — and the
> design must be **calm and precise rather than alarming**. Panic is not
> actionable.
>
> **It must always state its basis:** which Act, which article, and the starting
> event assumed. It presents a **computation with stated inputs, never a
> deadline**. It must also say plainly what it has *not* computed — exclusions and
> condonation are fact questions the app cannot see. A bare date the advocate
> cannot check is worse than no calculator at all.
>
> **Deliver:** the block as it appears inside the evening briefing, plus the
> expanded detail showing the basis. Include a state where the computation is
> uncertain — rendered as neutral ink with a dashed edge, never amber.

---

## PROMPT 5 — Fee and appearance log · `SCREENS.md` row 92

> Design the **fee and appearance log** for Lawmind.
>
> **What it replaces.** Advocates keep this on paper today: which hearings they
> appeared at, and what was billed against them. The paper version works, so the
> digital one must be faster than paper or it will not be used.
>
> **Two facts per matter, kept apart:** *appeared* and *billed*. The gap between
> them is the entire point — it is what an advocate reconciles at month end.
>
> **Design for entry speed**, one-handed, immediately after a hearing while it is
> fresh. And design the monthly view, which is the reconciliation moment.
>
> **Money is displayed, never computed on the device** — the server owns every
> figure. Design as though every number arrives formatted.
>
> **Privacy:** this is the most commercially sensitive data in the app. It must
> never appear in a share, a briefing, or an export.
>
> **Deliver:** the quick-entry component, the per-matter log, and the monthly
> reconciliation view, at 2x.

---

## PROMPT 6 — The consent screen · PD-8, blocking

> Design the **consent screen** for Lawmind, shown once during onboarding.
>
> **This is a legal instrument, not a UI detail.** It is the basis on which every
> exported document carries **no AI-assisted watermark**. If this screen is weak,
> the mark has to go back onto every document the advocate files.
>
> **It must be ACTIVELY accepted** — a deliberate action, never a pre-ticked box,
> never inferred from continuing. Acceptance is recorded with a timestamp and the
> terms version.
>
> **It covers three things, and the advocate must plausibly have read them:**
> 1. that the product provides **AI assistance**, not legal advice;
> 2. the **duty to verify before filing**, which remains theirs and is not
>    delegable;
> 3. the terms of legal use.
>
> **The design tension to solve.** Long legal text gets scrolled past; short text
> is not consent. Find the form where an advocate — a professional reader of dense
> text, who will be sceptical of a consent wall — actually takes the three points
> in. Consider what genuinely earns attention rather than a scroll-to-bottom gate.
>
> **Tone:** peer to peer. The reader is a professional whose competence is not in
> question. Not a warning, not a disclaimer wall, not a cheerful onboarding card.
>
> **Also design:** the state where an advocate declines. They keep full access to
> search and reading; only **draft generation** is unavailable, and the path back
> must be obvious and unpunishing.
>
> **Deliver:** the screen at 2x in English and **Hindi at full parity**, plus the
> declined state and the re-entry point. Annotate typography and the accept
> affordance.
