# SPRINT 7 — LAUNCH

**🟡 OD-9 DEFERRED 2 Aug 2026 — S7 is not blocked.** Buy one month of AppTweak or
App Radar ($50–100) just before launch and cancel after. The competitor teardown
(`docs/ASO.md` §1) needs no tool and should already be done.

`docs/ASO.md` §3 stays `UNKNOWN` until the tool is bought. **Do not invent volume
figures to unblock it** — a confident wrong ranking is worse than an admitted gap.

**⚠️ OD-2 resolved on the founder's authority, but the paper is not on file.**
DPDP residency affects **public launch**, not build. Counsel's written view on
Singapore residency should exist before the store listing goes live — a residency
position with no written opinion is thin exactly when it gets challenged.

**Read first:** `docs/ASO.md` in full.

---

## LCC

**OWN:** production readiness, monitoring, `services/**`

**TASK**

1. **Production hardening.** Rate limits, backups verified by **restoring one**,
   error budgets, log retention.
2. **Beta cohort support** — 20 advocates. Instrument the activation metric that
   predicts retention: **two briefings opened in week one**.
3. **Cold start under 2s to Today** on a mid-range Android with cached data.
4. Standing zero-threshold metrics remain live in production, not just in the
   harness.

**DONE**
- A backup has been **restored**, not merely taken
- Activation metric instrumented and reporting
- Cold start measured on a real mid-range Android, not a simulator

**NEVER**
- Ship with a failing harness metric
- Launch publicly while OD-2 is open

---

## RCC

**OWN:** `apps/mobile/**`, store assets

**TASK**

1. **Competitor teardown** — `docs/ASO.md` §1. **Needs no tool and no product; it
   can be done now.** Law4u, Notify Court Case Status, Lawyyar, LegalKart Lawyer,
   SupremeToday. Exact title, subtitle, keyword field where visible, screenshot
   narrative order, review volume and rating, update cadence.
2. **Listing assets** — `docs/ASO.md` §2:
   - **Title**, 30 chars, must carry the primary keyword
   - **Subtitle**, 30 chars
   - **Keyword field**, 100 chars, iOS, comma-separated, **no spaces**, and
     **never repeat a word already in title or subtitle** — a repeat wastes
     characters and buys nothing
   - **Play long description** — keyword **density** matters on Play, not on iOS
3. **Screenshots.** **The first two carry ~90% of the conversion decision.**
   The strategic call: they must answer *does it know my courts* and *will it save
   me time tomorrow morning*. Daily cause list and hearing briefing are the
   strongest candidates. Verified-citation depth is the real moat but it is a
   **trust** claim, not a **speed** claim, and trust does not convert an install.
4. **Store submission**, both platforms.
   **Rejection risk is legal-advice framing** (`PID.md`): position as a research
   assistant for **licensed practitioners**, capture bar enrolment, **never claim
   to advise**. Never phrase output as advice to an end client.
5. **Hindi store listing** — a separate ASO surface with its own keyword set.

**DONE**
- Both apps **approved**
- **15 of 20** beta users open 3+ times in week one
- Listing assets within character limits, no repeated keywords

**NEVER**
- Invent keyword volume figures. Mark `UNKNOWN — requires tool` and raise OD-9
- Frame the product as giving legal advice

---

## GATE S7
Both apps approved · 15 of 20 beta users opening 3+ times in week one.

## Day-90 success
₹1L+ MRR · 10 paying advocates · **zero citation failures reaching a user**.
