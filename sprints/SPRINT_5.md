# SPRINT 5 — ACCOUNTS

**⚠️ OD-3** — confirm Play's current India billing terms before finalising.
**Enrol in the Apple Small Business Program on day one regardless** (15%, not 30%).

**Read first:** `PRODUCT_DECISIONS.md` PD-1, PD-2, PD-8 · `TRD.md` §Auth ·
`PRD.md` §Pricing.

---

## LCC

**OWN:** `services/api/**`, `packages/auth/**`, `packages/billing/**`

**BLOCK ON:** nothing. **OD-3 resolved 2 Aug 2026: standard store billing** —
Play 15%, Apple 15% via the Small Business Program (enrol day one), Firm and
Enterprise invoiced off-app through Razorpay at ~2%. Alternative billing is
deferred to OD-10. Auth and subscription
plumbing proceed.

**TASK**

1. **Auth endpoints.** better-auth self-hosted, JWT + rotating refresh, 30-day
   sliding window. Postmark magic link at launch; phone OTP is a phase-2 **channel
   swap, not a decision change** — `TRD.md` §Auth records why PD-1 and this file
   read differently and why neither should be "corrected" to match the other.
2. **PD-1 — the identifier is whatever the advocate enters.** It need not match
   the Bar Council roll. Rolls carry stale phone numbers, and gating signup on a
   roll match blocks legitimate users before they have seen any value.
3. **PD-2 — enrolment never gates.** Capture it, queue it for manual review, show
   "verification pending". **Rejection does not remove access.**
   **Prove it with a test** asserting a rejected enrolment still has full access —
   a comment is not enforcement.
4. **PD-8 — consent.** `GET /terms/current`, `POST /me/accept-terms { version }`.
   Writes `terms_accepted_at` and `terms_version` **together**, rejects a stale
   version, and is **never inferred** from another action. An account with no
   accepted terms **cannot generate a draft** — that is the one thing it gates.
   Store the **version**, not a boolean: when the terms change, who accepted which
   text is the only thing that matters.
5. **Subscriptions.** Tiers and prices from `PRD.md` (PD-13): Practice ₹799 · Chamber
   ₹1,999 · Expert ₹3,499, all **store IAP**. Firm and Enterprise are
   **contact-us with no buy button**, invoiced off-app via Razorpay and activated
   by redemption code — multi-seat organisational licensing sits outside the IAP
   requirement, which is what makes off-app invoicing permissible.
6. **IAP receipt validation**, both stores. Server-side. Never trust a client
   receipt.
7. **PD/§9.7 — the paywall never blocks on a hearing day.** On a day with a listed
   hearing the search limit becomes **advisory rather than hard**. The limit is
   still displayed. An advocate blocked mid-preparation churns and tells the bar.

**DONE**
- Signup → subscribe → use, **both platforms**
- A rejected enrolment still has full access — test, not comment
- Draft generation refuses without accepted terms, and **only** that
- Paywall goes advisory on a hearing day — test with a seeded listing

**NEVER**
- Compute money client-side. **Frontend displays API values**
- Gate anything on enrolment
- Infer consent

---

## RCC

**OWN:** `apps/mobile/**`

**TASK**

1. **Onboarding under two minutes** (canvas `1x`, `11a`): OTP entry — six tabular
   digits at 26px · identity + enrolment, reading as a **credential, never a
   gate** · language · optional first matter.
2. **The consent screen** — ❌ **NOT YET DESIGNED** (`design/SCREENS.md`).
   Must be **actively accepted**, covering AI assistance, the duty to verify
   before filing, and the terms of legal use. **Do not improvise it** — raise it
   as a design task. It is the legal basis for removing the AI mark from every
   exported document, so its wording is not a UI detail.
3. **Enrolment pending state** — a quiet **caution-amber band above the header**,
   nothing withheld. A band rather than a card so it never competes with the
   briefing, and it disappears the moment verification lands.
4. **Paywall / subscription** — canvas `10k`, `design/screens/renders/51-subscription@2x.png`.
   Four tiers, **no buy button on Firm and Enterprise**.
5. **Profile, settings** (canvas `1y`) — `SettingsRow` with the fixed-width
   control column so every control terminates on one right-hand axis.
6. **Privacy disclosure** — now lives in **onboarding and settings**, and **not
   during use** (`docs/PRIVACY_PII.md`). Substance unchanged: coverage is partial
   and described as partial. Never "fully private".

**DONE**
- Whole onboarding flow **under two minutes**, timed
- Consent recorded with timestamp and version, visible in settings afterwards
- Enrolment-pending band renders and withholds nothing
- Firm and Enterprise show no price and no buy button

**NEVER**
- Improvise the consent screen
- Show the privacy disclosure mid-task
- Block anything on enrolment

---

## GATE S5
Signup → subscribe → use, on **both platforms**.
