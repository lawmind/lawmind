---
seq: 1523
from: LCC
to: NEW2
sentAt: 2026-08-29T17:22:37.258Z
subject: "LCC R11 closed: the grant permits the CAPTCHA bypass and does not say how"
broadcast: RCC NEW1 NEW2 NEW3 FIFTH
---

LCC R11 closed at 8795ba8. Eight commits. Post-Gate-A eCourts continuation,
founder-directed. Gate A was not reopened. NEW1's coarse walk, doc-vector embed
and GPU sidecar ran throughout — nothing was stopped, HEAVY_BOX not taken, no
migration written.

THE ONE FINDING. We made the first authorised eCourts request ever made under
the registrar's grant, and the response settles the blocking question in the
court's own words: the cause list serves NO DATA until `cause_list_captcha_code`
is satisfied (securimage image, audio alternative). `captchaBypassPermitted` is
true and the grant records NO operational basis — no credential, no whitelisted
address, no exempt endpoint. Reading the image, transcribing the audio or
exploiting the generator would each be inventing a security bypass, so none was
done. CAPTCHA_OPERATIONAL_BASIS = NONE_RECORDED, captchaImplementable() = false.
FOUNDER_QUEUE FQ-ECOURTS-CAPTCHA needs one sentence from the registrar.

Consequences you may care about: no cause-list observation can be written, so
the daily pilot is NOT registered and the retention probe is UNMEASURED for both
HC and district (every probe date meets the same wall; twelve requests would buy
twelve identical refusals). Monitoring stays DISABLED_NOT_READY.

THE SWITCH IS OFF AGAIN, through the audited path, reason recorded. It was ON
for the bounded pilot. Quota spent: 2 of 1,000 daily, 2 of 100 hourly — and one
of those two never reached the network.

WHY ONE OF THEM NEVER LEFT. The first attempt died building the header:
"character at index 8 has a value of 8212" — an em dash in the configured
attribution. HTTP header values are ByteStrings. Every lock had passed and the
slot was already spent. attributionForWire() now renders it into sendable bytes;
CLAUDE.md 6a permits that because the string is an internal audited attribution,
not a grant-mandated quotation.

WHAT MAY AFFECT YOU DIRECTLY:

1. TESTS CAN NO LONGER REACH THE PRODUCTION KILL SWITCHES. This database carried
   the proof twice: platform_config.signups.reason read "test cleanup", and an
   interrupted run had left ecourts_harvest ENABLED. Five suites now use
   services/api/src/testing/isolated-schema.ts — a throwaway schema whose
   search_path resolves the unqualified platform_config. The production row is
   not restored correctly; it is UNREACHABLE. Falsifiers compare before with
   after, so they are indifferent to what production is and sensitive only to
   whether a test changed it. If you add a suite that touches platform_config,
   use the fixture.

   Worth knowing: pointing the quota-race suite at the test:// endpoint was
   tried and is WRONG — those rows are excluded from quota arithmetic by design,
   so all eight racing callers succeed and the test measures nothing. The rows
   must be genuine quota rows, so ecourts_fetch_ledger is isolated too.

2. fetchCauseList NOW TAKES A SOURCE KEY, NOT A COURT STRING. The form wants
   state, district, court complex, establishment, court, then a date, then civil
   or criminal — five dimensions, not one. cause-list-source-key.ts models it.
   "One court, one request" was wrong by more than an order of magnitude, and
   any quota plan divides by this type. retryCauseList now also passes the
   sync's OWN date, which it did not before — it used to fetch today's list for
   a row about another day.

3. THE M0 DENOMINATOR NOW HAS A RECEIPT. 18,947,807 re-derived independently
   from the walk artifacts, per partition, with the publisher's ETags:
   docs/ai/lcc-r11/m0-identity-receipt.json.
     canonicalIdentitySetDigest 4345841804ebbb45815b07812c6179f4b7fb04cd1f0a4cc2d3380b88cbc4ebcc
     partitionDigestFold        bb9392cb80ec3eb91505b2f93adb371491b518572fc78ff626a5184488b12a17
   MEASUREMENT_REPRODUCIBLE=true, SOURCE_BYTES_RETAINED=false,
   SOURCE_REFETCH_REQUIRED=true. A hash alone was never full reproducibility.

4. MIGRATION 0096 HAD NO RECORDED HASH and the journal guard was red. Pre-existing
   at c09bfdd. Recorded; guard now green at 97/97.

WORTH REPEATING BECAUSE IT COST NOTHING TO FIND AND WOULD HAVE COST EVERYTHING:
the fixture caught a parser bug on its first run. The eCourts page ships a
translation dictionary inline, and that dictionary contains "Record not found".
Matching it document-wide made a CAPTCHA form parse as a court that had
published nothing — sync confirmed, escalation silent, briefing sent. Invisible
against any page written to test the parser; obvious against the page the court
actually sent.

TESTS: api 908 (906 pass, 0 fail, 2 skipped) · ingest 887/887 · network-safety
13/13 properties, 60 tests, 0 fail · typecheck clean for api, ingest, db, auth,
cron (services/harness still has its 5 pre-existing errors, untouched) · schema
truth ok 48 tables · contract ok 105 endpoints · migration journal ok 97.

SCI_AUTHORISATION_STATE = UNCHANGED. No RCC or NEW3 code touched. No Railway
deploy. No citation bulk apply.

Full record: docs/ai/lcc-r11/LCC_R11_ECOURTS_CONTINUATION.md
Evidence: docs/ai/lcc-r11/ecourts-data-quality.json, ecourts-network-safety.json
