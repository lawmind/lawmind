# eCourts request blueprint v2 — every row is now BYTES

**LCC R12b, 30 August 2026.** Supersedes
`docs/ai/lcc-r12/ECOURTS_OFFLINE_REQUEST_DIFF.md`, which is preserved unchanged:
it was honest about its own limits, and the record of what a careful
transcription got wrong is worth more than a tidy history.

Three diagnostic requests were spent, all of them GETs of static assets inside
the licensed interface, all through `guardedRequest` — reserved, ledgered before
the socket opened, attributed, rate-limited, retained before anything read them.

| # | asset | http | bytes | sha256 | artifact | ledger |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `/ecourtindia_v6/js/searchByCauselist.js` | 200 | 4,541 | `f3b20ab137696e74237f20ab1e4db43ddbec06c96988b41f8165448f3bebff46` | `1671a5be-7242-42ee-bade-507ee46d5672` | `c57b887f-ad87-4af8-bc41-18b0673c3d99` |
| 2 | `/ecourtindia_v6/js/components.js` | 200 | 64,507 | `749fa62ff7d9eab79eb1755aac199e7b716bff42a0160ef3ebfa15962617a086` | `a1efeb50-1cb9-4b77-a035-306350280b06` | `ae8cbc1b-c035-47c6-9b6b-e340ea94f315` |
| 3 | `/ecourtindia_v6/js/common_header.js` | 200 | 32,731 | `bbe7ec73af1a1977e1f7c6295d5a409337887cb3a97b72b60e329c4101e81dbb` | `eee60d23-a596-4791-a4c1-b27f891668b3` | `b985f456-fe00-4c75-bc76-f9499e7cfa2c` |

Each is committed as a fixture beside the module, and the CLI printed the SHA-256
of the response and of the file on disk separately so the fixture is provably the
retained bytes rather than something edited afterwards. Both matched.

---

## THE HEADLINE: FIVE OF THE TRANSCRIBED ROWS WERE WRONG

R12 marked most of its table `TRANSCRIBED` — read from the licensed client's
source at some point, not held here — and said plainly that such a row *"is one
where a future agent cannot re-derive the claim from this repository alone."*
That caveat was correct and it was load-bearing. Once the bytes arrived, five of
those rows turned out to be false.

| # | what stood in the repository | what the retained bytes say | consequence had we sent it |
| --- | --- | --- | --- |
| 1 | `delimeter: jkhfkjhkjert33` | `delimeter: 764r6hry7ffds` | `{"errormsg":"…Invalid Request…!"}` |
| 2 | second header named `Kjweuru253` | named `G73hdfdsh` | same |
| 3 | submit `est_code` = complex value's 2nd `@` segment | the establishment SELECT — **empty** unless the complex flag is `Y` | a request naming an establishment the client never names |
| 4 | `selprevdays` hardcoded `'0'` | derived: `1` iff the list date precedes today | every historical probe malformed; any retention conclusion would have measured our bug |
| 5 | `fillCauseList` reply read from `court_list \| causelist_court \| court_no \| data` | the reply field is **`cause_list`** | we would have thrown `EcourtsSessionRefused` on a perfectly good reply and reported it as an interface change |

Rows 1 and 2 are the sharpest. R12's document states that this pair *"fixed the
`Invalid Request`"* and R11 credited it as the explanation for a failed
`fillDistrict`. **The bytes falsify that.** `components.js` declares
`var delimeter = "764r6hry7ffds"` and sets it on `delimeter` and `G73hdfdsh`.
Both halves of the pair we held were wrong, so the reply that was said to be
fixed cannot have been fixed by them. They are evidently rotating
anti-automation tokens and will drift again — which is why the assertion below
now runs the client rather than quoting it.

Row 3 is the subtlest and the most dangerous, because it is a value that exists
and is plausible. Two different fields called `est_code` are sent in the same
session with different values:

```js
// common_header.js, fillCauseList — the COURT LIST request
if (flag == 'Y') var est_code = $("#court_est_code").val();
else             var est_code = court_est;            // the complex's 2nd @ segment

// searchByCauselist.js, submit_causelist — the CAUSE LIST request
var est_code = $('#court_est_code').val();            // unconditionally the SELECT
```

and `common_header.js` sets `$('#court_est_code').val('')` whenever the complex's
`differ_mast_est` flag is not `Y`. So on submit the establishment is **empty**
for a complex without separate establishments, while the court-list call in the
same session sends the segment. Sending the segment on submit — which is what
this repository did — is a request the licensed client never makes.

---

## THE FORM: A SECOND CORRECTION TO R12

R12 concluded the official client *"cannot be posting the form … it reads the
values by id and builds a body with its own parameter names."* Half right, and
the wrong half matters.

`submit_causelist` does `$("#frm_causelist").serialize()` **and then** appends
by-id values. The reason the serialised part is nearly empty is not that the
controls are unnamed — it is that they are **outside the form**:

- `<form id="frm_causelist">` opens at line 289 of the retained page and closes
  at line 361.
- Every cascading select and every hidden field — `sess_state_code`,
  `sess_dist_code`, `court_complex_code`, `court_est_code`, `app_token`,
  `base_url`, `active_tab`, the `sees_*` family — sits at lines 253–281,
  i.e. **before the form opens**.

So `serialize()` yields exactly three fields: `CL_court_no`, `causelist_date`,
`cause_list_captcha_code`. R12 additionally recorded `sess_state_code` and
`sess_dist_code` as having no `name`; in the retained bytes they do
(`name='sess_state_code'`, and `name='sees_dist_code'` on the element whose id is
`sess_dist_code`). It makes no difference to the wire — they are outside the form
either way — but a future reader should not have to rediscover it.

---

## `FIELD | OFFICIAL CLIENT | LAWMIND | VERDICT` — every row EVIDENCE = BYTES

Recorded by executing the retained scripts offline (§ below). No row is
`TRANSCRIBED` any more.

| FIELD | OFFICIAL CLIENT | LAWMIND (`ecourts.ts`) | VERDICT |
| --- | --- | --- | --- |
| method | POST | `POST` | **MATCH** |
| URL shape | `base_url + '/?p=' + url` | `${ECOURTS_BASE}/?p=${path}` | **MATCH** |
| district action | `casestatus/fillDistrict` | same | **MATCH** |
| complex action | `casestatus/fillcomplex` | same | **MATCH** |
| establishment action | `casestatus/fillCourtEstablishment` | same (`listCourtEstablishments`, new) | **MATCH** |
| court-list action | `cause_list/fillCauseList` | same | **MATCH** |
| submit action | `cause_list/submitCauseList` | same | **MATCH** |
| content type | `application/x-www-form-urlencoded; charset=UTF-8` | same | **MATCH** |
| `ajax_req` | `+'&ajax_req='+true` appended | appended, same position | **MATCH** |
| `app_token` | `+'&app_token='+token`, last | last | **MATCH** |
| token rotation | re-read from every reply | `session.appToken` updated per reply | **MATCH** |
| `delimeter` header | `764r6hry7ffds` | `764r6hry7ffds` | **MATCH (fixed)** |
| 2nd header | `G73hdfdsh: 764r6hry7ffds` | same | **MATCH (fixed)** |
| `X-Requested-With` | jQuery default `XMLHttpRequest` | set explicitly | **MATCH** |
| `Referer` | the cause-list module page | `${ECOURTS_BASE}/?p=cause_list/index` | **MATCH** |
| `fillDistrict` body | `state_code` | identical | **MATCH** |
| `fillcomplex` body | `state_code, dist_code` | identical | **MATCH** |
| `fillCourtEstablishment` body | `state_code, dist_code, court_complex_code` | identical | **MATCH** |
| `fillCauseList` body | `state_code, dist_code, court_complex_code, est_code, search_act` | identical | **MATCH (fixed)** |
| `fillCauseList` reply key | `obj.cause_list` | `cause_list` first | **MATCH (fixed)** |
| `search_act` value | the literal string `undefined` | the literal string `undefined` | **MATCH — see below** |
| submit body, fields 1–3 | `serialize()`: `CL_court_no, causelist_date, cause_list_captcha_code` | identical, same order | **MATCH (order fixed)** |
| submit body, appended | `court_name_txt, state_code, dist_code, court_complex_code, est_code, cicri, selprevdays` | identical, same order | **MATCH (`court_name_txt` added)** |
| submit `est_code` | the establishment SELECT | `establishmentSelectValue(parts, chosen)` | **MATCH (fixed)** |
| `selprevdays` | `ceil((today-seldate)/86400000 - 1) >= 1 ? 1 : 0` | `selPrevDays()`, same arithmetic | **MATCH (fixed)** |
| `cicri` | `0` civil / `1` criminal | same | **MATCH** |
| CAPTCHA field | `cause_list_captcha_code` | same | **MATCH** |
| cookies | session cookies on every request | `session.cookieHeader` | **MATCH** |
| `Origin` | browser-generated | not sent | **DIFFERS — not a defect** |
| `User-Agent` | a browser | `LawMind/1.0 (+authorised eCourts access; legal research)` | **DELIBERATE** |
| attribution | not required by the site | `x-lawmind-attribution` every request | **LAWMIND-ONLY, BY DESIGN** |
| value encoding | raw concatenation | percent-encoded (`+` for space) | **DELIBERATE — decodes identically** |

### `search_act=undefined`, sent on purpose

`fillCauseList` builds `"&search_act=" + $("#search_act").val()`, and the
cause-list page has no `#search_act` element, so jQuery answers `undefined` and
the client puts the six letters `undefined` on the wire. We send the same.

Tidying this to an empty value or omitting the field would make our request
differ from the licensed one in a way that reads, in the registrar's logs, as an
unfamiliar client. Matching the client — including where the client is ugly — is
the conservative choice under a bounded permission.

### The two remaining differences, neither of them a cause

- **`Origin` absent.** Browser-generated; a server requiring it would reject
  every non-browser client. Listed because it differs, not because it is
  suspected.
- **Encoding.** The client concatenates appended values without encoding, so a
  judge's name goes out with raw spaces and commas; we percent-encode with the
  same rules jQuery's own `serialize()` uses. Both decode to identical values
  under standard form parsing, and a literal space in a urlencoded body is the
  malformed one of the two. The test therefore compares **decoded pairs**, which
  is what keeps this deliberate difference from concealing a real one.

---

## HOW IT WAS EXECUTED OFFLINE — and why it is a test, not a script

`services/api/src/court/official-client-recorder.ts` runs the three retained
scripts, **unmodified**, in a `node:vm` sandbox whose `$` and `$.ajax` are shims
and which has no `fetch`, no `XMLHttpRequest` and no transport but a recorder.
**No socket can be opened from it**, which is what makes it safe to run in CI on
every commit rather than once by hand.

Four substitutions, each named because an unnamed substitution is a lie:

1. **The DOM is a map of id → value**, seeded from the retained page.
2. **`setTimeout` runs immediately.** `ajaxCall` wraps its send in 50 ms and
   `fillCauseList` in 1,500 ms. That changes *when* a request is built, never
   what is in it.
3. **Unknown globals answer permissively.** The client's validators live in
   assets we have not retained; they decide *whether* to send, never *what*.
   Exactly two names fell through — `alerts_array` and `bootstrap` — and the test
   asserts that set, so a third would fail rather than quietly widen the fiction.
   The stand-in converts to `1` and not `''`, because the client writes
   `if (retValNxtMon == false)` and `'' == false` is `true` in JavaScript, which
   would have taken the early-return branch and recorded nothing.
4. **`Date` is pinned**, because `selprevdays` is derived from the clock and a
   fixture that changed at midnight would be worthless.

`official-client-recorder.test.ts` then asserts our builders emit what the client
emits — 12 tests, all passing — and two properties are bound into the
network-safety matrix (`REQUEST_SHAPE_MATCHES_LICENSED_CLIENT`,
`AJAX_HEADERS_READ_FROM_RETAINED_BYTES`) so deleting the test reports
`NOT_COVERED` instead of passing quietly. That is precisely how the wrong
`delimeter` pair survived two rounds.

---

## A RETENTION FACT THAT FELL OUT OF THE BYTES

`searchByCauselist.js` line 15:

```js
datePickerIcon('causelist_date','+1m','-7');
```

**The licensed interface's own date picker offers +1 month forward and 7 days
back**, and `submit_causelist` additionally refuses anything more than a month
ahead (`"Selection only upto 1 month allowed."`).

This is a statement about the *interface*, not proof about the *server*: a date
the picker does not offer is not thereby a date the endpoint refuses. But it does
mean that probing T-30, T-90 and T-365 asks for something the licensed interface
never asks for, which is a poor use of a bounded permission and a poor basis for
a conclusion either way. R12's retention plan is amended accordingly in
`docs/ai/lcc-r12b/LCC_R12B_TODO.md` §14: probe only within the offered window,
and record the picker bound as the reason the rest were not attempted rather
than as evidence about retention.

---

## VERDICT

    ECOURTS_OFFLINE_REQUEST_DIFF = RECONCILED, EVIDENCE = BYTES FOR EVERY ROW
    BLUEPRINT_PARTIAL            = no longer applies
    TRANSCRIBED_ROWS_REMAINING   = 0
    TRANSCRIPTIONS_FOUND_WRONG   = 5
    DIAGNOSTIC_REQUESTS_SPENT    = 3 (all static assets, all HTTP 200)
    SOCKETS_OPENED_BY_THE_RECORDER = 0
    COURT_SUITE                  = 98/98
    NETWORK_SAFETY               = 17 properties, 76 tests, PASS
