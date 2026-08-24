# NEW3 NEXT ROUND TODO — 23-24 Aug 2026

Bound to §9 of `LAWMIND_NEXT_ROUND_MASTER_ORCHESTRATION_PLAN_2026-08-23.md`.

`[x]` OBSERVED done · `[~]` partial, evidence attached · `[ ]` not started ·
`[!]` deferred, with the reason recorded.

**Lane lease:** bound cleanly via `.agents/bus/.lane-*`, confirmed against
`ListAgents` — 4 concurrent sessions this round (LCC, NEW1, NEW2, NEW3), no
collision, no duplicate NEW3. No RCC session active concurrently.

---

## NEW3-0 — Lane lease · [x]

Bound, verified against 3 peer sessions' own `.lane-*` timestamps within the
same 2-minute window. No stale-owner recovery needed.

## NEW3-1 — 10 synthetic matters end-to-end · [x]

`docs/product/PREMIUM_10_MATTER_WALKTHROUGH_V1.md`. Ran against the real
local API, 10 throwaway accounts, real magic-link auth, real briefing sweep
(`pnpm --filter @lawmind/cron sweep`, not simulated). All synthetic data
deleted afterward.

Free-tier mechanics (search, save, treatment, timeline, hearing state) score
WORKS across all 10. Premium preview correctly refuses to fabricate a
stance split; `POST /premium/jobs` correctly 402s a free user on every
matter. Found a P0 (briefing authorities/checklist read the wrong table) —
reported to LCC (bus 1075), closed same-round with three sibling surfaces
LCC found (bus 1078). Found one counterargument relevance miss in 10,
reported to NEW1 (bus 1076) as a data point, not a claim.

## NEW3-2 — Activation funnel · [~]

`docs/product/ACTIVATION_FUNNEL_V1.md`. The design (server-recorded,
first-occurrence-per-step, two denominators) is sound and already built by
LCC. **Found it is fully unwired** — `recordStep` and `ACTIVATION_STEPS`
appear nowhere but their own definition, repo-wide grep confirmed; same for
`experiments.ts`'s assignment/exposure functions. Reported to LCC (bus
1077) with a recommendation for the one undecided step
(`experienced_matter_value` → `AUTHORITY_SAVED_TO_MATTER`, a second save on
an existing matter, over "two briefings opened"). Not `[x]` because the
funnel records zero events until LCC wires the six call sites — this
lane's file ownership does not extend to `services/api`.

## NEW3-3 — Truthful premium previews · [~]

The server contract (`GET /matters/:id/premium-preview`) already does
everything this task asks — real counts, `stanceNotComputed: true` rather
than a fabricated split, `costClass: 'cheap'` enforced by a test that
asserts zero `llm_calls` rows — built by LCC, verified live against 10 real
matters in NEW3-1. **What's missing is the client**: grepped
`apps/mobile/src` for `premium-preview`/`premiumPreview` — zero hits. No
mobile screen calls it yet. Not started this session; queued next. The
existing `SubscriptionScreen.tsx` predates the entitlement spine and shows
only PD-13's settled tier names/prices with a stub purchase action — it
does not call `/me/entitlements` and cannot imply capability it does not
have, so the plan's "fail closed" requirement is satisfied by absence
rather than by a built and tested off-state.

## NEW3-4 — Mobile pagination + disambiguation · [x]

Found the server has supported real pagination (`page`/`pageSize` request,
`page: {page, pageSize, hasMore}` response, `hasMore` observed not
inferred) since NEW1's P3/P5 work, and the mobile contract never declared
the fields — confirmed by grep, zero occurrences. `RESULT_LIMIT` (5) was a
hard ceiling on the app regardless of server capability. **Fixed**:
`SearchScreen.tsx` now shows "Show more results" when `hasMore` is true,
appends further pages, re-applies the same client-side reliability filters
to each page. Documented in `API_CONTRACTS.md` §Search. tsc clean, 3 new
tests, full suite green.

## NEW3-5 — Premium commercial decision package · [x]

`docs/product/PREMIUM_COMMERCIAL_DECISION_PACKAGE_V2.md`. Compares Model A
(subscription only) vs B (subscription + Hearing Pack credit) vs C
(one-off only), incorporating India-specific data the prior research pass
didn't have — fetched directly this session: RevenueCat's D35 IN/SEA vs NA
conversion (1.4% vs 2.6%), UPI Autopay's 8-15% failure rate vs 2-3% for
cards, confirmation India's Google Play fee stays 15%/30% until Sep 2027.
Does not select a model or set a price. Reports that the round's evidence
supports the plan's existing subscription-first hypothesis rather than
revising it.

## NEW3-6 — Billing preparation · [!]

Not touched this session beyond what NEW3-5 covers. The commerce spine
(entitlements, credit ledger, idempotent job starts) is LCC's build, already
proven under concurrency (bus 1053). No billing provider selected; no
purchasable screen exposed; nothing to prepare further without a founder
model decision to prepare against.

## NEW3-7 — Push device proof · [!]

Blocked on `FQ-PUSH-PROJECT` (EAS account/project), queued by the prior
session, unchanged. Not touched — the plan is explicit not to spend a
session rewriting registration code that already exists and is correct;
only a real device + EAS project can move this.

## NEW3-8 — Mobile release-quality pass · [~]

`docs/product/MOBILE_RELEASE_AUDIT_V1.md`. **No device, simulator, or Expo
Go session available this environment** — this is a code audit, not the
device pass the plan asks for, and says so on every row rather than
inferring device behavior from source. Strongest area: offline/degraded-
network handling (reachability-vs-server-error distinction, degraded search
never reads as "no law found", `outbox.ts`'s local-first write queue) —
well-built and test-verified. Weakest: accessibility labels cover 28 of 71
screen/component files, no screen-reader run performed. Token refresh-on-401
and account deletion (client + now server, per LCC's 1078 fix) both
verified in code. Not `[x]` because the plan's actual device/condition list
— low/mid Android, VoiceOver, TalkBack, poor network on a real connection,
huge judgment performance — needs hardware this session does not have.

## NEW3-9 — No referral/review manipulation · [x]

Grepped for countdown/scarcity/referral-incentive patterns: none exist in
the codebase. Nothing built this session that would introduce one.

## NEW3-10 — Do-not-do list · [x]

No public Hearing Pack claim made or implied. No legal safety paywalled —
`adverse_treatment_visibility`'s `SAFETY_CRITICAL` refusal is LCC's, verified
live in NEW3-1 (`adverseAuthorities` in the preview, free always, correctly
0 on all 10 synthetic matters that happened to have none overruled — not
independently exercised against an overruled authority this session).
Nothing fabricated in a premium preview count — verified live. No pricing
set — `PREMIUM_COMMERCIAL_DECISION_PACKAGE_V2.md` explicitly does not.
Cloud infrastructure untouched — all work local against the existing
Postgres instance.

---

## What actually shipped this session (code, not just docs)

Committed in 5 commits (`331d1e6`, `77556a3`, `4d8b1c5`, `4fcd44c`,
`8ffe01a`, `b932098`):

1. Mobile pagination (`SearchScreen.tsx`, `contract.ts`, `client.ts`,
   `API_CONTRACTS.md`) — new capability, tested.
2. `arguments/counter.ts`'s `review_required` case consumed client-side
   (`contract.ts`, `CounterArguments.tsx`) — closes the client half of
   LCC's 1078 fix, tested.
3. The prior NEW3 session's uncommitted work (deletion client, push wiring,
   analytics contract, premium research/spec, staging proposal) — reviewed
   (tsc clean, full suite green before committing), not re-authored.
4. Five docs: the walkthrough, the activation funnel gap, the commercial
   decision package, the release audit, this file — three of them updated
   again mid-session as LCC's fixes landed, rather than left to read stale.

## Founder queue

Nothing new filed this session. `FQ-PUSH-PROJECT` and the staging
region/pricing conflict (`FQ-HOSTING`) remain open from the prior session,
untouched.

## Not done, and not claimed

- No premium-preview UI built on the client (NEW3-3) — queued, server side
  ready, client side zero lines written.
- No device-level accessibility, low-end-Android, or poor-network testing
  (NEW3-8) — no hardware available; the code audit is not a substitute and
  says so throughout.
- No billing provider or price selected (NEW3-5/6) — not this lane's call,
  not attempted.
- The counterargument relevance miss (NEW3-1 finding, bus 1076) is one data
  point, not validated against a larger sample this session.
