# LCC R11 — post-Gate-A eCourts continuation

**29 August 2026.** Founder-directed. Gate A had passed and was not reopened.
The instruction was to continue eCourts engineering inside the committed
written-authorisation controls, aiming at a durable, auditable longitudinal
court-observation pipeline rather than at request volume.

**HEAD before `c09bfdd` · HEAD after: see the round's final commit.**
NEW1's coarse walk, doc-vector embed and GPU sidecar ran throughout; nothing was
stopped. `HEAVY_BOX` was not taken. No migration was written, so `MIGRATION_SLOT`
was not taken either.

---

## The finding this round exists to hand over

**The licensed cause-list interface serves no data until a CAPTCHA is satisfied,
and the grant permits bypassing it without saying by what means.**

That is not a conclusion from reading about eCourts. It is what the court's own
response said, in a request we made under the grant and kept:

> *"4. Enter the Captcha (the 5 digit numbers shown on the screen) in the text
> box provided."*

Field `cause_list_captcha_code`, image from `vendor/securimage/securimage_show.php`,
audio alternative offered. `captchaBypassPermitted` is `true` and nothing in this
repository records a mechanism — no credential on the grant, no whitelisted
address, no exempt endpoint. The only techniques available without a stated basis
are to read the image, transcribe the audio, or exploit the generator, and each
of those is inventing a security bypass. **A permission to bypass is not a
specification of one**, so `CAPTCHA_OPERATIONAL_BASIS = NONE_RECORDED` and
`captchaImplementable()` is false.

`FOUNDER_QUEUE.md` **FQ-ECOURTS-CAPTCHA**. One sentence from the registrar ends
it.

---

## What was measured, not assumed

### The first authorised request, and the one before it that never left

Two attempts. **The first died at the header**: `Cannot convert argument to a
ByteString because the character at index 8 has a value of 8212` — an em dash in
the configured attribution. HTTP header values are ByteStrings; the guard can
check that an attribution exists and had no way to know it was unsendable. Every
lock had passed and the slot was already spent when `fetch` refused to build the
request. `attributionForWire()` renders it into bytes a header can carry, which
`CLAUDE.md` §6a permits because the string is an internal audited attribution and
not a phrase the grant requires verbatim.

**The second answered.** 200, 75,405 bytes, `text/html; charset=utf-8`, sha256
`4ae6bbe1c19824964ca3705c724561c1e8506b51e6fc42147832aef958566e94`, 557 ms.
Retained append-only in `official_source_artifact`, source key
`ecourts:interface_probe:cause_list_module_index:2026-08-29`, and committed
byte-for-byte as the parser's fixture.

### "Court" was never the request unit

The form asks for **state, district, court complex, establishment, court**, then
a date, then civil or criminal. Master Roadmap v5 §3.4 had already corrected v4's
"one request covers a court's day"; this is that correction read off the source.
`cause-list-source-key.ts` models it, with two tiers that are admissions rather
than descriptions — `interface_probe` for a request about the interface, which
may not become an observation, and `legacy_court_key` for the bench-less rows
`cause_list_syncs` already holds.

### The fixture caught a real parser bug on its first run

The page ships a translation dictionary inline, and that dictionary contains the
string `"Record not found"`. The first parser matched it anywhere in the document
and read the CAPTCHA form as **a court that had published nothing** — `empty`,
sync confirmed, escalation silent, briefing sent. Both the empty marker and the
row scan now read from the results container only, with scripts stripped.

It was invisible against any page written to test the parser and obvious against
the page the court actually sent. That is the whole argument for
fixture-first parsing, and it paid for itself within an hour.

### Test state could still reach the production kill switch

FIFTH found that suites had changed real `platform_config` state. This database
carried the proof twice over: `platform_config.signups.reason` read
`"test cleanup"`, and an interrupted run had left `ecourts_harvest` **ENABLED**.

Five suites borrowed the production row and promised to give it back, which is
correct on every path except the one that happened. `testing/isolated-schema.ts`
creates a throwaway schema holding its own `platform_config` and hands back
clients whose `search_path` resolves the unqualified name there. Every consumer —
`guard.killSwitchEnabled`, `admin/platform.ts`, the kill-switch CLI — follows the
path without knowing the fixture exists. **The production row is not restored
correctly; it is unreachable.**

Two things worth recording about that fix:

- Pointing the quota-race suite at the `test://` endpoint was tried and is
  **wrong**: those rows are excluded from the quota arithmetic by design, so all
  eight racing callers succeed and the test measures nothing. The rows have to be
  genuine quota rows, so `ecourts_fetch_ledger` is isolated alongside the switch.
- The falsifiers compare BEFORE with AFTER rather than asserting a value, so they
  are indifferent to what production happens to be and sensitive only to whether
  a test changed it. A test asserting "production is off" would now go red for
  the founder's decision to turn it on.

### The M0 denominator has a receipt that could contradict it

Gate A's High Court denominator, 18,947,807 distinct upstream object identities,
was produced by a walk whose output lives in gitignored bulk. What was in git was
the conclusion, with nothing able to disagree with it.

`docs/ai/lcc-r11/m0-identity-receipt.json` — 1.0 MB — records it per partition:
the publisher's ETag, size, lastModified, row count and a sha256 over that
partition's sorted distinct identities, folded into a canonical set digest. Groups
are disjoint because an identity string contains its own year, court and bench, so
ordering the groups gives the union a canonical serialisation.

Re-derived independently: **18,947,807**, from 1,438 non-fixture partitions,
20,295,796 rows, 1,346 groups, 92 with both metadata variants, 0 partition errors.

    canonicalIdentitySetDigest  4345841804ebbb45815b07812c6179f4b7fb04cd1f0a4cc2d3380b88cbc4ebcc
    partitionDigestFold         bb9392cb80ec3eb91505b2f93adb371491b518572fc78ff626a5184488b12a17
    manifest sha256             d5ae427c7f4a1786037e710969a178f33ea48611d105f9c8baa2d33c966dc0e5
    definition                  HC_PARITY_V2_2026-08-29 / 1e5bdd9060d527116b2ca0c9a013d30d3dfe7e687d2c503755bd7fd989dbc0e7
    freshness generation        2026-08-29T14:38:58.523Z#a47d446ffc51

Reproducibility is three fields, not one word:
`MEASUREMENT_REPRODUCIBLE = true`, `SOURCE_BYTES_RETAINED = false`,
`SOURCE_REFETCH_REQUIRED = true`. A partition whose ETag has moved cannot
reproduce its digest, and that is a change upstream rather than a defect here.

---

## Network safety, re-verified by running it

`scripts/lcc-ecourts-network-safety.mts` runs the suites and binds each property
to the NAME of the test that covers it, so a renamed or deleted check reports
`NOT_COVERED` instead of quietly passing. That caught one of my own bindings on
the first run.

**13 / 13 PASS, 60 tests, 0 fail.** `docs/ai/lcc-r11/ecourts-network-safety.json`.

One logical network owner · global atomic quota reservation · one budget, not one
per court · refusals never consume quota · reservation durable before
transmission · the lock cannot leak past its transaction · a refusal can never be
settled into a success · `test://` rows excluded from real quota · an unrecorded
fetch is never made · raw bytes retained before parsing is required · parser
failure cannot erase the source · replay cannot duplicate observations · tests
cannot reach the production kill switch.

---

## What did NOT pass, and why it is recorded as failure

| Step | Verdict | Why |
| --- | --- | --- |
| Canary | **NOT PASS** | 1 successful request, 1 raw artifact, **0 parsed observations**. The response was the form, not a list. |
| Retention probe | **UNMEASURED** (HC and district) | Every probe date meets the same CAPTCHA. Twelve requests would buy twelve identical refusals. A 404, an empty page or a failed CAPTCHA is not evidence a historical list does not exist, so no availability class may be inferred. |
| Daily pilot | **DISABLED** | Its precondition is a passing canary. Blockers: `pilot_disabled`, `captcha_implementation_blocked`, `source_key_unresolved`. |
| Kill switch | **OFF** | Turned back off through the audited path with the exact reason. Nothing is scheduled to use it, and an unused permission left on is risk without benefit. |

The pipeline downstream of the CAPTCHA is nonetheless proven end to end —
reservation → ledger → retained artifact → parse → `ecourts_observation`, in one
transaction, replay-safe — against a **synthetic** results page whose headers are
the labels the real response publishes. That test says what the code does and
nothing about what a served cause list looks like, and it says so in its own
comment. No served cause list has been seen.

---

## Quota spent

2 of 1,000 daily. 2 of 100 hourly. One of those two never reached the network.

`docs/ai/lcc-r11/ecourts-data-quality.json` holds the full accounting, including
the two populations excluded from every count and why: `test://` endpoints
(non-network by identity) and `ZZ_` courts (suite traffic). Both are stated rather
than silently dropped.

`MONITORING_PRODUCT_STATE = DISABLED_NOT_READY`. Nothing here is a product
metric.

---

## Deliberately not done

No bulk harvest. No adaptive planner. No user-facing monitoring. No inference
from `LISTED` to `HEARING_OCCURRED` — the strongest listing-derived state is
still `LISTED_OBSERVED` and migration 0061's CHECK makes minting the other one
impossible. No SCI authorization change (`SCI_AUTHORISATION_STATE = UNCHANGED`).
No Railway deploy. No RCC or NEW3 code touched. No citation bulk apply. No AI or
semantic feature.
