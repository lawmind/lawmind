# SPRINT 3 — THE DAILY LOOP

**🟡 OD-1 OPEN — trial pending, but S3 IS NOT BLOCKED.** Build proceeds behind the
adapter interface; the manual path works fully with no vendor at all.

**This is the sprint that creates the habit.** `PRD.md` §Sequencing: Tier B ships
before Tier A, because an advocate does not open an app daily for a bare acts
library.

**Read first:** `PRODUCT_DECISIONS.md` PD-3, PD-4, PD-5, PD-6, PD-12 ·
`docs/API_CONTRACTS.md` · `DEPLOYMENT.md` §cron job order.

---

## LCC

**OWN:** `services/api/**`, `services/cron/**`, `packages/court-adapter/**`

**BLOCK ON:** nothing. OD-1 affects only live vendor data; `bharat-courts` (MIT)
is available as a second implementation, though it does **not** return
`next_hearing_date` — the field the briefing is built on. The adapter, the manual path, matter
CRUD, the sweep and briefing generation are all buildable now.

**TASK**

1. **Court adapter — vendor-agnostic.** `POST /court/lookup { cnrNumber }` returns
   matter fields or `{ available: false }`. The manual implementation returns
   `{ available: false }` and the client falls back to the manual form.
   **Nothing above this endpoint changes when OD-1 resolves.** Manual date entry
   is **first-class, never a fallback path** (PD-12) — next dates are given orally
   in open court and written on the file.
2. **Matter CRUD** + `matter_shares` (PD-3, per matter by invitation, **no
   chamber-wide switch**) + `note_visibility` (PD-4, private by default).
   Revoke sets `revoked_at`, **never deletes** — who had sight of a matter and
   when is what a conflicts challenge asks later.
3. **Cause list sync.** Per-court pull, `cause_list_syncs`. **A parser that
   silently returns an empty list is worse than an outage**, because briefings
   still go out with stale dates. Fixed escalation: retry once → mark affected
   briefings `dates_not_confirmed` → notify affected advocates.
   **Never present an unconfirmed listing as confirmed** — the same rule as
   citations.
4. **Cause list aggregation** — every matter listed today across all courts, one
   query, one screen (`PRD.md` Tier B).
5. **Nightly sweep + briefing generation.** Four numbered blocks. Cache **30
   days**; a briefing must open with the network off.
6. **Cron in the mandated order** — `DEPLOYMENT.md`:
   **22:15 cause list → 22:30 overruled re-check → 23:00 sweep.**
   The ordering is a requirement: the sweep needs confirmed dates, and briefings
   carry authorities.
7. **Citator alerts** (PD-5, PD-6). Four triggers, and only four. **Triggers 1 and
   2 are already produced by `applyOverruledChange` — do not build a second
   producer.** Trigger 2 (filed draft) **cannot be disabled**; the settings
   endpoint accepts no key for it. Batched into the evening briefing; **the app
   does not grow a notifications tab.** Two standing exceptions push immediately.

   > **CORRECTION, 7 Aug 2026 — `applyOverruledChange` DOES NOT EXIST.** Grepped
   > across `services/**` and `packages/**`: the only occurrence anywhere is a
   > *comment* in `packages/db/src/schema.ts` describing what it should do.
   > `citation_fanouts` is not created either.
   >
   > So the instruction above is not "reuse the existing producer" but **"build it,
   > once"** — and it is the shared operation that the **nightly overruled
   > re-check (22:30)** and the **dispute-uphold path in S6** must both call.
   > Whoever builds it first fixes that shape for both.
   >
   > **This is why only the 23:00 sweep exists.** The 22:30 job has nothing to
   > call, so the ordering in `DEPLOYMENT.md` is currently documentation rather
   > than something the system enforces.
8. **Push** via Expo push. **BUILT 7 Aug 2026** — `services/cron/src/deliver.ts`,
   one push per advocate per evening. Expo needs **no credential**: the push API
   accepts unauthenticated sends, and `EXPO_ACCESS_TOKEN` is optional.

**DONE**
- A briefing generates for a real matter and **opens with the network off**
- A cause list renders for a real advocate's matters
- Cron fires in order; the sweep does not start before the re-check finishes
- Revoking a share sets `revoked_at` and the row survives
- Aeroplane mode: matters, briefings and drafts open and stay editable; queued
  writes flush on reconnect

**NEVER**
- Present an unconfirmed listing as confirmed
- Build a second citation fan-out
- Let the briefing checklist write into the matter timeline (PD/§9.5 — the
  timeline records what the **court** did; polluting it makes the one
  authoritative surface untrustworthy)

---

## RCC

**OWN:** `apps/mobile/**`

**TASK**

1. **Today** — canvas `6a`, `design/screens/renders/31-today@2x.png`. Hearings in the next 7
   days, tonight's briefing if ready, quick search.
2. **Daily cause list** — ❌ **NOT YET DESIGNED** (`design/SCREENS.md` row 88).
   **Do not improvise the screen.** If it is still undrawn when this sprint
   starts, build the data layer and raise it — designing it is a Claude Design
   task.
3. **Matters + matter detail** — timeline, next date pinned, `matter_shares` UI
   (names, not roles), per-note private/shared toggle.
4. **Briefing view** — canvas `8b`, `design/screens/renders/45-briefing@2x.png`. Paper masthead,
   oxblood rule, **gilt seal ring** (one of only two gilt placements), four
   numbered blocks. The seal press: 620ms, **one haptic at contact**.
   A **shared** briefing names whose matter it is, surfaces the shared instruction
   **above** the court record, and carries **no private notes** — a junior may be
   appearing on it at a morning's notice.
5. **Adjournment capture** — ❌ NOT YET DESIGNED (row 90). Three taps, standing in
   the courtroom. Same rule: do not improvise.
6. **Client update share** — ❌ NOT YET DESIGNED (row 89). One tap → clean matter
   summary over WhatsApp. **This is the viral loop.** Every share carries our name
   to a client and to opposing counsel, so the summary's typography and citation
   handling are marketing surface, not just UI.

**DONE**
- Today → briefing → matter navigates on real data
- A briefing opens offline with its as-of date shown
- Adjournment capture completes in **three taps**, measured
- The share output is legible and correctly typeset in WhatsApp

**NEVER**
- Improvise a screen marked NOT YET DESIGNED
- Show private notes on a shared matter
- A verified badge

---

## GATE S3
A briefing lands on a **real device 24h before a real listing** · a cause list
renders for a real advocate's matters.
