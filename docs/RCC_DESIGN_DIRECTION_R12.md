# RCC DESIGN DIRECTION — FROZEN FOR GATE B

**Status:** `RCC_DESIGN_DIRECTION = FROZEN`, 30 August 2026.
**Scope:** the direction Gate B is asked to approve. **Not** finished Sprint-4 polish.
**Against:** `docs/product/RCC_V1_API_CONTRACT_R12.md` (frozen) and
`docs/product/V1_CAPABILITY_REGISTRY_R12.json`.
**Surface:** native iOS + Android (Expo). Web is admin only — PD-15 reversed 12 Aug 2026.

This file freezes the *decisions*. The tokens are already code
(`apps/mobile/src/theme/tokens.ts`) and code is the authority on values; this file is the
authority on **what a state means and when it may appear**. Where a screen and this file
disagree, this file is the bug report.

---

## 1. WHAT THIS ROUND DELIBERATELY DID NOT SPEND ON

No animation work, no new illustration, no motion polish. Gate B needs an approved
direction. The round was spent instead on the four things that are load-bearing and were
missing: **a state vocabulary that distinguishes our uncertainty from the law's**, **a
capability gate**, **the trust surface on a judgment**, and **a search screen that cannot
say "nothing matched" when nobody looked**.

---

## 2. THE COLOUR RULE — one sentence, and it decides most arguments

**Amber `#B4690E` means THE LAW HAS MOVED, and nothing else. Our own uncertainty is
neutral ink with a dashed edge.**

| what is uncertain | who it is about | how it renders |
|---|---|---|
| the law moved (`set_aside`, `partly_set_aside`, `doubted`) | the JUDGMENT | amber `state.caution`, `state.cautionText` on paper, `state.cautionWash` behind a card |
| the search did not complete | US | `color.ink` on the page ground, no wash |
| the graph is partial | US | `color.ink`, left rule `color.rule`, `borderStyle: 'dashed'` |
| the body text is damaged | US | `color.ink`, top rule, no wash |
| the date was never checked | US | `color.inkMuted`, plain line |
| the date is contradicted | the RECORD | `color.ink`, dashed left rule — **still not amber**: a suspect date is our doubt about our copy, not a bench moving the law |
| a destructive confirmation | the ACTION | `state.danger` |

`state.verified` exists in the palette and **renders on no citation**. Verified is silent.

---

## 3. THE NINE STATES EVERY DATA SURFACE MUST HAVE AN ANSWER FOR

Frozen as a checklist. A new screen is not done until each row is either drawn or
explicitly ruled out in a comment.

| # | state | the rule | reference implementation |
|---|---|---|---|
| 1 | **loading** | a skeleton that keeps the screen's shape, never a bare spinner | `SkeletonCard` |
| 2 | **empty (honest)** | we looked, and there is nothing. A trusted answer, offered as one | `SearchScreen` "No judgments matched" |
| 3 | **partial / degraded** | an arm timed out. Results are incomplete, NOT proven empty. Shown whatever `results.length` is. Never auto-retried | `SearchScreen` degraded banner |
| 4 | **refused** | we never looked. Renders the server's reason and remedy. **Never "no results"** | `SearchScreen` "This search was too broad to run" |
| 5 | **coverage unknown** | not a statement about the corpus | `SearchScreen` "We could not search everything" |
| 6 | **offline / network error** | separated from a validation failure: `network`/`timeout` from the client mean no request reached the server; anything else is a real answer FROM it | `SearchScreen` `failureOffline` |
| 7 | **disabled capability** | **ABSENT, never greyed and never teased.** A disabled control an advocate can see is a promise | `state/capabilities.ts` |
| 8 | **evidence withheld** | empty by REFUSAL, not by absence. Never an empty page | `BodyTextWithheld` |
| 9 | **partial coverage declared** | absence of an edge is never absence of a citation | `PrecedentSpine` coverage block |

**State 7 is the one this round added and the one most likely to be argued about.** A
greyed "Drafts" tab with a padlock is a promise about a feature blocked on a countersigned
DPA. An absent tab is not.

---

## 4. LAYOUT AND BREAKPOINTS

**Phone is the product.** Four tabs, never a hamburger; primary actions in the bottom
third, because the advocate is holding a physical file with the other hand.

- **Tabs are capability-derived, not hardcoded.** `TABS` is the full set;
  `app/(tabs)/_layout.tsx` filters it. v1 ships **Today · Search · Matters**; Drafts is
  filtered out while drafting is held.
- **One breakpoint exists and it is frozen, not extended:** `size.researchTwoPane = 900`.
  PD-15 is reversed; `ResearchWorkspace`, `MatterWorkspace` and `DraftWorkspace` stay in
  place, inert, per the founder's explicit call. **Nothing new is built against it.**
- **The future web shell inherits the token file, not the layouts.** `theme/tokens.ts`
  already exports CSS custom properties (`--ink`, `--ink-muted`, `--rule`, …), which is the
  compatibility surface. A web admin shell consumes those. It does not consume a React
  Native screen.

---

## 5. TYPOGRAPHY AND LANGUAGE

Five variants and no more: `ui` · `uiStrong` · `legal` · `record` · `eyebrow`. Minimum body
size is enforced in `Text.tsx`, not per screen — `ui`, `uiStrong` and `legal` throw in
development below 16px.

**Hindi renders in Noto Sans Devanagari everywhere, including PDF export.** `language: 'hi'`
is an accepted input value and **not** a supported capability (`language.hindi` is DISABLED);
the font decision is frozen anyway, because the day it ships is not the day to choose a face.

---

## 6. COPY IS LICENCE PROTECTION

Frozen phrasings. These are not style preferences.

| never write | write instead |
|---|---|
| "we verified this" | "Safe to file" |
| "verification failed" | "We could not confirm this exists" |
| "no results" for a refusal | "This search was too broad to run" |
| "monitoring is on" | "you are keeping this date yourself" |
| "verified from the retained official PDF" | "Source: &lt;court&gt;, &lt;url&gt;" |
| "coming soon" on a held surface | *nothing at all* |
| any polling frequency or SLA | *nothing at all* |

`failed` renders **exactly** as `unverified`: the advocate cannot act on the difference, and
an outage must not read as a corpus gap.

---

## 7. WHAT GATE B IS BEING ASKED TO APPROVE

1. The colour rule in §2, and specifically that **our uncertainty never borrows amber**.
2. The nine states in §3 as a completeness checklist for every future screen.
3. **Absent, not disabled**, for every held capability (§3 row 7).
4. Phone-only, four-tab, capability-derived navigation (§4).
5. The frozen copy in §6.

Not being asked for, and deliberately not delivered: motion design, illustration, the
splash moment, or the empty-state art. Those are Sprint-4.
