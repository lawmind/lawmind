# eCOURTS — BOUNDED STOP REPORT, 30 AUGUST 2026

**Lane:** LCC · **Round:** Sprint-2 Gate-B · **Session:** `181cacca-e499-4a57-a1ab-0bf71847a88f`
**Authority:** `LAWMIND_MASTER_ROADMAP_V7_1.md` §5.3, and the Sprint-2 prompt §5–§5C.
**Gate-B rule this satisfies:** *"`ecourts_observation = 0` passes only alongside a
completed bounded stop report."*

Every number below came from a query or a command run in this session. Where a
project document disagrees with what the database holds, both appear and the row
is labelled `CONFLICT`.

---

## 0. THE HEADLINE, AND IT CONTRADICTS THE ROADMAP

`ECOURTS_OBSERVATION_COUNT = 0`, unchanged. **Everything else in the roadmap's
eCourts position is now stale**, and it was stale before this round began.

| roadmap v7.1 §1 states | what HEAD and the database hold |
|---|---|
| `fillDistrict` → `Invalid Request` | **SOLVED 2026-08-29T22:58:44Z.** Two retained responses carry a full district list. |
| `parser FIXTURE_BOUND` | the lookup parser was silently returning ZERO from a populated response — a real defect, fixed offline this round |
| `current live hypothesis: request fingerprint / User-Agent` | **REFUTED by retained evidence.** The UA/attribution split was live for the requests that still failed; the cause was a rotating header pair. |
| CAPTCHA is the open question | **CAPTCHA now ACCEPTED, 3 of 3 submits.** |

The roadmap was written from R11 evidence on the morning of 30 August. The
fillDistrict success landed at 22:58Z on 29 August — after that evidence was
gathered and before the roadmap was published. Nobody relabelled anything; the
document simply describes a state the source had already left.

---

## 1. HYPOTHESIS LEDGER — CLASSIFIED FROM HEAD AND FROM THE LEDGER

The prompt requires each hypothesis to be classified from durable evidence, not
from a previous round's summary. Method: `git log` timestamps against
`ecourts_fetch_ledger.requested_at`, and the retained bodies in
`official_source_artifact`.

| hypothesis | state | evidence |
|---|---|---|
| cookies / session identity | `TESTED_REFUTED` (R11) | not re-tested |
| rotating `app_token` | `TESTED_REFUTED` (R11) | `postAjax` carries the rotated token; requests still failed |
| `ajax_req` field | `TESTED_REFUTED` (R11) | not re-tested |
| known custom ajax headers, **hardcoded** | `TESTED_REFUTED` | a constant cannot track a value that rotates hourly |
| request ordering | `TESTED_REFUTED` (R11) | not re-tested |
| **User-Agent / attribution transport** | **`TESTED_REFUTED`** | `daffb51` (2026-08-29T21:18Z) moved attribution off `User-Agent` onto `x-lawmind-attribution` and set a conventional client identity. `fillDistrict` requests at **22:47Z–22:53Z** ran under that code and still returned `Invalid Request`. The UA was never the cause. |
| **`ajaxCall` header pair read LIVE** | **`TESTED_SUPPORTED`** | `components.js` fetched 22:54:33Z; the next `fillDistrict`, 22:58:44Z, returned eleven districts. Committed as `67d303f`. |
| option-value parsing | **`TESTED_REFUTED` as correct** | see §2 |
| cookie jar updated per response | **`TESTED_SUPPORTED`** | see §3 |
| source backend availability | **`TESTED_SUPPORTED` as the current blocker** | see §4 |

> **The roadmap's one bounded User-Agent experiment must NOT be run.** It is
> already refuted by retained bytes, and `attribution-transport.test.ts` now
> asserts the client never impersonates a browser — claiming to be Chrome would
> be a misrepresentation to the party that authorised us.

---

## 2. THE PARSER WAS RETURNING ZERO FROM A POPULATED RESPONSE

The canary reported `no district (0 offered)`. The retained response
(`official_source_artifact`, 2026-08-30T08:36:28Z, 541 bytes) held eleven:

```json
{"dist_list":"<option value='' >Select district</option><option value=8  >Central</option>
<option value=3  >East</option><option value=7  >New Delhi</option> … ","status":1}
```

`optionsOf` required `value=['"]…['"]`. **The interface does not write quotes.**
The only quoted entry is the `value=''` placeholder, which the function filters
out by design — so a populated document parsed to nothing.

This is the failure class this codebase already has a rule about:
**`PARSE_EMPTY != NO_CASES`**. A parser that returns nothing from a populated
document is worse than one that throws, because the caller records an absence.

Fixed offline, from the retained bytes, **spending zero live requests**. The
response is checked in as
`services/api/src/court/__fixtures__/ecourts-fill-district-delhi-2026-08-30.json`
and `ecourts-option-parse.test.ts` asserts eleven districts, the three quoting
forms, and — deliberately — that a genuinely empty list still reads as empty.

---

## 3. THE CAPTCHA WAS NEVER THE SOLVER, AND THE COOKIE JAR WAS THE DEFECT

Three submits were rejected with `{"errormsg":"Invalid Captcha... "}`. The
obvious reading is OCR failure. It was wrong, and the evidence that settles it
cost nothing:

**The retained CAPTCHA images were read by eye against the OCR output.**

| attempt | OCR read | image actually shows | artifact |
|---|---|---|---|
| 1 | `y86h6r` | `y86h6r` | `766b608f…` |
| 2 | `ktveGT` → `ktvegt` | `ktveGT` | `a2f3d350…` |
| 3 | `29mgst` | `29mgst` | `61118246…` |

All three correct. `scripts/lcc-captcha-engine-bench.py`, re-run this session
against the fifteen labelled samples: **paddle exact 11/12 = 91.7%, char 98.6%,
1.72 s/image.** Three correct codes rejected consecutively is not an OCR outcome
— at 91.7% it is roughly one run in seventeen hundred.

**The defect:** `openCauseListSession` captured cookies once and nothing
afterwards read `Set-Cookie` again. A browser's jar updates on every response,
and PHP regenerates a session id on state transitions as a matter of routine. So
the CAPTCHA image GET stored the expected code against one session and the
submit arrived in another, carrying no stored code — which the interface reports
as `Invalid Captcha`.

The update now lives in `guardedRequest`, for the same reason the attribution
header does: **there must be no request shape that can skip it.**

**Result: the CAPTCHA has been accepted on every submit since — 3 of 3.**

---

## 4. WHERE IT STOPS, AND WHY THAT IS THE SOURCE AND NOT US

Three bounded submits after the cookie fix, all with the CAPTCHA accepted:

| run | date | side | court | result |
|---|---|---|---|---|
| B | 30-08-2026 (Sunday) | civil | Rouse Avenue, D&SJ / Special Judge PC Act CBI | `Connection to server failed try after some time....` |
| C | 28-08-2026 (Friday, working day) | civil | same | identical |
| D | 28-08-2026 (Friday) | criminal | same | identical |

```json
{"errormsg":"Connection to server failed try after some time....","app_token":"…"}
```

That string is the **national portal's own message for a failure between it and
the district court's server**. It is not our request shape, not our credentials,
and not the CAPTCHA. The weekday control rules out "Sunday has no list", and the
`cicri` control rules out "this bench publishes no civil list".

**`STOP`.** Three attempts, one unchanged source-side answer, and the remaining
hypothesis is below the layer we are permitted to work at. Per the prompt §5B:
*"If the browser-visible request is equivalent and the remaining hypothesis is
below the JavaScript/HTTP field layer: report the blocker. Do not independently
implement TLS/JA3/network-fingerprint impersonation."* None was implemented and
none will be.

### What this does NOT license anyone to say

- **`FAILED_FETCH != NOTHING_CHANGED`.** No observation was written. Nothing here
  is evidence about what any court listed on any date.
- **`HTTP_200 != SUCCESSFUL_OBSERVATION`.** Every response above was HTTP 200.
- **`PARSE_EMPTY != NO_CASES`.** §2 is the live proof of why that rule exists.
- `REAL_CAUSE_LIST_FIXTURE = NOT_OBTAINED`. A district list, a session page and a
  CAPTCHA image are **not** cause-list fixtures (§5C).

---

## 5. QUOTA AND COMPLIANCE

Every request in this round was reserved before the socket opened, ledgered,
attributed and rate-limited. Nothing bypassed `guard.decide`.

```
requests this hour     ~30   (encoded ceiling 100)
requests this day      ~140  (encoded ceiling 1000)
ecourts_fetch_ledger   215 rows total
unattributed requests  0
```

CAPTCHA bypass was exercised under `CLAUDE.md` §6a's three mechanical conditions
— grant live and unexpired, code only in `services/api/src/court/ecourts.ts`,
every request ledgered and rate-limited. `captchaBypassRefusal()` was checked
before anything was sent.

`CAPTCHA_OPERATIONAL_BASIS = RETRACTED_AS_INVENTED_REQUIREMENT` is unchanged and
was not reopened. `SCI_AUTHORISATION_STATE = UNCHANGED`.

---

## 6. THE NEXT EVIDENCE NEEDED

Not another request of the same shape. One of:

1. **The same court/date through a real browser**, to establish whether a human
   using the licensed interface sees the same
   `Connection to server failed try after some time....`. If they do, the blocker
   is the source and the only question left is *when*. If they do not, the
   difference is below the HTTP field layer and belongs in a founder/registrar
   conversation, not in an impersonation attempt.
2. **A different state/district/establishment.** The canary always takes the
   first option at every level, which is a CBI special court in one Delhi
   complex. One court is not a source.
3. **Retry across a day.** "try after some time" is the interface asking for
   exactly that, and a bounded scheduled retry is cheap under the quota.

`(2)` and `(3)` are Sprint-3 shaped and both are cheap. `(1)` is the one that
settles it.

---

## 7. STATE AFTER THIS ROUND

```
ECOURTS_HEAD_EVIDENCE_REVIEW   COMPLETE — 9 hypotheses classified from HEAD and the ledger
ECOURTS_BROWSER_REQUEST_EVIDENCE  retained JS + retained page; field parity verified offline
ECOURTS_BROWSER_DIFF           submitCauseList fields match $("#frm_causelist").serialize()
                               plus the appended fields, in the official order
UA_EXPERIMENT_STATE            TESTED_REFUTED — do not re-run the roadmap's experiment
FILLDISTRICT_STATE             SOLVED
CAPTCHA_SUBMIT_STATE           ACCEPTED 3/3
REAL_CAUSE_LIST_FIXTURE        NOT_OBTAINED
ECOURTS_OBSERVATION_COUNT      0
ECOURTS_BOUNDED_STOP_REPORT    THIS FILE
RETENTION                      NOT_STARTED — depends on a canary that has not landed
DAILY_PILOT                    NOT_STARTED — same
USER_MONITORING                DISABLED_NOT_READY
```
