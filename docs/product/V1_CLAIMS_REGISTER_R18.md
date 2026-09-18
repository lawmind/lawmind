# V1 CLAIMS REGISTER — R18 ALERT-CAPABILITY ALIGNMENT

**SHIP, 18 September 2026 (S4-T0.3).** Supersedes only the ALERT wording of
[`V1_CLAIMS_REGISTER_R17.md`](V1_CLAIMS_REGISTER_R17.md). Every R14/R15/R16/R17
claim, qualifier, prohibition and audit result stays in force unchanged. R17 is
historical evidence and is not edited.

Bound to: [`V1_CAPABILITY_REGISTRY_R18.json`](V1_CAPABILITY_REGISTRY_R18.json)
(change control `CCR-SHIP-S4T03-01`).

## 1 · What changed

```text
ALERT_CLAIMS                  = PROHIBITED — all three alerts.* rows are DISABLED_NOT_READY
CAPABILITY_STATE_CHANGE       = NONE on iOS, Android or web
CAPABILITY_ROWS_ADDED         = 3 (alerts.saved_authority_moved,
                                   alerts.filed_citation_moved, alerts.push_delivery)
CONTRACT_METADATA             = corrected to R17 on every row (was a stale R16)
ADVOCATE_WEB_APP_CLAIMS       = PROHIBITED, unchanged from R17
```

**Nothing here adds a claim.** Three capabilities that were user-reachable with no
registry row now have one, and all three are disabled. A registry row is not a
claim; it is the thing that makes a claim checkable, and until 18 September 2026
the alert surface was the one part of the product no claim audit could see.

## 2 · Prohibitions, stated as prohibitions

1. **No claim, in any surface or any store listing, that Lawmind alerts an
   advocate.** Not "we tell you when the law moves", not "we watch your
   authorities", not "notifications when a case you relied on is set aside".
   `alerts.saved_authority_moved` and `alerts.filed_citation_moved` are
   `DISABLED_NOT_READY` and not one alert has been observed reaching a user.

2. **No claim of push or notification delivery.** `alerts.push_delivery` is
   `DISABLED_NOT_READY` and `EAS_PROJECT_ID` is absent from the app config, so no
   build can deliver one. The app no longer asks for notification permission.

3. **No claim of a daily or evening briefing.** `briefing.daily_loop` remains
   `DISABLED_NOT_READY` — unchanged by this revision — and the Alert Settings
   screen no longer names it as a delivery channel.

4. **No claim of court monitoring.** `monitoring.user_product` remains
   `DISABLED_NOT_READY`, unchanged. An alert about an authority the app already
   showed you is not monitoring: the four concepts (citator alerts, eCourts
   monitoring, push delivery, daily briefing) are four capabilities, and a claim
   that blurs them claims the strongest one.

5. **"Four things" may not be said again** until the PD-5 readiness gate
   (`scripts/check-pd5-alerts-readiness.mjs`) passes. `alert_kind` holds two
   values; two of PD-5's four triggers have no producer.

## 3 · What is still true, and may still be claimed

Everything R17 permitted. The citation-safety claims (A1–A8), the corpus
coverage claims and the search claims are untouched by this revision — no
retrieval, corpus, citation or matter capability changed state.

## 4 · When an alert claim becomes possible

One observation, not a promise: run the producer
(`pnpm --filter @lawmind/cron recheck`, or uphold a dispute) against a real
environment and see an alert render on Today. That needs a persistent beta, which
is SHIP S4-R1. At that point the row may move, and only then may a claim follow
it — never the other way round.
