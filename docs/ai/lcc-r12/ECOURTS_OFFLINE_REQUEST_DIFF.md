# eCourts request blueprint — reconciled OFFLINE, no socket opened

**LCC R12, 30 August 2026.** Zero live requests were made to produce this
document. Everything below is read from the response bytes already retained
(`services/api/src/court/__fixtures__/ecourts-cause-list-module-index-2026-08-29.html`,
75,405 bytes, sha256 `4ae6bbe1…566e94`) and from `services/api/src/court/ecourts.ts`.

---

## THE LIMITATION, STATED FIRST

**The functions the round names cannot be executed offline, because they were
never retained.**

`fillDistrict`, `fillcomplex`, `fillCauseList`, `submitCauseList` and the token
rotation are defined in **`/ecourtindia_v6/js/searchByCauselist.js`**, an
external asset. The retained page references it and does not contain it. Only
three functions are inlined in the page — `callbackLang`, `fillLangState`,
`funselectLang` — and none of them builds a cause-list request.

So the round's plan of *"replace the AJAX transport with a recorder and feed
representative DOM values into the original code"* is **not executable against
what we hold**. Retaining that asset would itself be a request to eCourts.

What this document is therefore able to do:

- extract the **form as the court served it** — every field, id, name, hidden
  value and the `app_token` as delivered;
- diff that, and the AJAX conventions already transcribed into `ecourts.ts` from
  the licensed client's own source, against what we send;
- name precisely which rows are **evidenced by retained bytes** and which are
  **transcribed from a script we have read but not retained**.

That distinction is the point. A row marked `TRANSCRIBED` is one where a future
agent cannot re-derive the claim from this repository alone.

---

## 1. THE FORM, AS SERVED

`<form name="frm_causelist" id="frm_causelist" action="" method="post">` — the
empty `action` is why every request is an AJAX call to `?p=<path>` rather than a
form post.

| field | id | type | delivered value |
| --- | --- | --- | --- |
| `base_url` | — | hidden | `/ecourtindia_v6` |
| `hidSelLang` | `hidSelLang` | hidden | `english` |
| `lang_choice` | `lang_choice` | hidden | `english` |
| `hidSelLang` | `hidSelLang1` | hidden | *(empty)* |
| `lang_choice` | `lang_choice1` | hidden | *(empty)* |
| `location_checked` | `location_checked` | hidden | `N` |
| `s_type` | `s_type` | hidden | *(empty)* |
| `sees_complex_code` | `sees_complex_code` | hidden | `0` |
| `sees_district_code` | `sees_district_code` | hidden | `0` |
| `sees_est_code` | `sees_est_code` | hidden | *(empty)* |
| `active_tab` | `active_tab` | hidden | `party` |
| `sees_court_est_code` | `sees_court_est_code` | hidden | `0` |
| `session_differ_mast_est` | `session_differ_mast_est` | hidden | `N` |
| `hdn_lang` | `hdn_lang` | hidden | *(empty)* |
| `causelist_date` | `causelist_date` | text | *(empty)* |
| **`cause_list_captcha_code`** | `cause_list_captcha_code` | text | *(empty)* |
| `app_token` | — | hidden | 64 hex chars, delivered per session |
| `sessionlangid` | — | hidden | `1` |
| `p_order` | — | hidden | *(empty)* |
| `hdn_process_id` | `hdn_process_id` | hidden | *(empty)* |
| — | `sess_dist_code` | select | **no `name` attribute** |
| — | `court_complex_code` | select | **no `name` attribute** |
| — | `court_est_code` | select | **no `name` attribute** |
| `CL_court_no` | `CL_court_no` | select | — |

### The detail a form serialiser would get wrong

**The three cascading selects carry an `id` and NO `name`.** `sess_dist_code`,
`court_complex_code` and `court_est_code` are the state/district/complex/
establishment chain, and a naive `serialize()` over `frm_causelist` **omits all
three**, because an unnamed control is not successful and is not submitted.

The official client therefore cannot be posting the form. It reads the values by
id (`$('#sess_dist_code').val()`) and builds a body with its own parameter names
— which is exactly what `ecourts.ts` does, and why it does it.

---

## 2. `FIELD | OFFICIAL JS | LAWMIND | MATCH/MISMATCH`

`EVIDENCE` says where the "official" column comes from:
**`BYTES`** = the retained response · **`TRANSCRIBED`** = read from the licensed
client's own source (`components.js`, `searchByCauselist.js`) and cited in
`ecourts.ts`, but not retained here.

| FIELD | OFFICIAL JS | LAWMIND (`ecourts.ts`) | VERDICT | EVIDENCE |
| --- | --- | --- | --- | --- |
| method | POST for every AJAX call | `method: 'POST'` | **MATCH** | BYTES (form) |
| URL shape | `?p=<module>/<action>` off `/ecourtindia_v6` | `${ECOURTS_BASE}/?p=${path}` | **MATCH** | TRANSCRIBED |
| district action | `casestatus/fillDistrict` | `casestatus/fillDistrict` | **MATCH** | TRANSCRIBED |
| complex action | `casestatus/fillcomplex` | `casestatus/fillcomplex` | **MATCH** | TRANSCRIBED |
| content type | `application/x-www-form-urlencoded; charset=UTF-8` | identical | **MATCH** | TRANSCRIBED |
| form field order | jQuery `$.param` order | `URLSearchParams` insertion order, then `ajax_req`, then `app_token` | **MATCH (not load-bearing)** | TRANSCRIBED |
| `ajax_req` | `ajax_req=true` on every AJAX body | appended to every body | **MATCH** | TRANSCRIBED |
| `app_token` | in the body, rotated from each reply | in the body; `session.appToken` updated from `json.app_token` | **MATCH** | BYTES + TRANSCRIBED |
| token rotation | every reply carries a fresh token | carried forward on the session object | **MATCH** | TRANSCRIBED |
| `X-Requested-With` | `XMLHttpRequest` (jQuery default) | set explicitly | **MATCH** | TRANSCRIBED |
| `delimeter` header | `jkhfkjhkjert33` (`components.js` `ajaxCall`) | same constant | **MATCH** | TRANSCRIBED |
| `Kjweuru253` header | same constant | same constant | **MATCH** | TRANSCRIBED |
| `Referer` | the cause-list module page | `${ECOURTS_BASE}/?p=cause_list/index` | **MATCH** | TRANSCRIBED |
| `Origin` | browser-generated | **not sent** | **MISMATCH — believed irrelevant** | — |
| cookies | `SERVICES_SESSID` and friends | `session.cookieHeader` on every request | **MATCH** | BYTES (Set-Cookie) |
| `User-Agent` | a browser | `LawMind/1.0 (+authorised eCourts access; legal research)` | **DELIBERATE MISMATCH** | — |
| attribution | not required by the site | `x-lawmind-attribution` on every request | **LAWMIND-ONLY, BY DESIGN** | — |
| state/district/complex/establishment | read by **id**, posted under the client's own names | `state_code`, `dist_code`, complex `value@establishment@flag` split by `splitComplexValue` | **MATCH** | BYTES (ids) + TRANSCRIBED (names) |
| civil/criminal | not a field on this form | not sent | **MATCH** | BYTES |
| CAPTCHA field | `cause_list_captcha_code` | same name | **MATCH** | BYTES |

### On the two mismatches, neither of which is called a cause

**`Origin` is absent.** It is a browser-generated header; a server that required
it would be rejecting every non-browser client, and nothing in the retained
response asks for it. Listed because it differs, not because it is suspected —
the round is explicit that a difference is not a cause.

**`User-Agent` is deliberately not a browser.** Claiming to be Chrome would be a
misrepresentation to the party that authorised us. See §3.

### The `Invalid Request` response was already explained, and not by User-Agent

R11's `fillDistrict` attempt returned `{"errormsg":"...Invalid Request...!"}`
with an empty `app_token`. **The cause was the two `ajaxCall` headers**
(`delimeter` / `Kjweuru253`), transcribed from the licensed client's source and
now sent. The "User-Agent is probably the cause" hypothesis from R11 is
**unconfirmed and is not the basis of any change made this round** — the
User-Agent change was made from the binding record, not from an HTTP error.

---

## 3. `ATTRIBUTION_TRANSPORT` — separated, on the record, not on the error

Read literally: `CLAUDE.md` §6a says `ECOURTS_GRANT_ATTRIBUTION` is *"an internal
audited attribution string ... **not** a phrase the grant requires us to quote
verbatim (the written authorization prescribes no mandatory attribution wording
that is recorded in this repository)"*. **No record in this repository mandates
an HTTP header, and none mandates `User-Agent`.** What is required is that
attribution be present on every request.

So the two concepts are separated:

- **`User-Agent`** — `LawMind/1.0 (+authorised eCourts access; legal research)`.
  A conventional, interoperable client identity. Deliberately not a browser
  string.
- **`x-lawmind-attribution`** — the audited attribution, ASCII-rendered by
  `attributionForWire()`, on **every** permitted request.

**Why this is an improvement and not a lateral move.** `User-Agent` is the
most-logged header on the internet — proxies, CDNs and analytics retain it by
default. A compliance value identifying our authorised access does not belong in
the field most likely to be written to somebody else's disk.

**Attribution is not removed, not weakened, and never printed.** It is still read
live from the environment, still rendered into header-legal bytes, and
`guard.decide` still refuses every network request while it is unset. The test
compares **digests**, never values, so a failing assertion cannot dump the grant
string into CI output.

### The defect this change surfaced

`guardedRequest` documents itself as *"The ONE network path ... Everything below
goes through here rather than calling `fetch` itself."* The load-bearing word is
**below**. `fetchCauseList` predates it and calls `fetch` directly.

The first version of the change updated only `guardedRequest`. That left
`fetchCauseList` sending a `User-Agent` and **no attribution at all** — the one
property the grant actually requires — and **nothing errored**. It was caught
only because `attribution-transport.test.ts` asserts on the bytes the transport
sent rather than on the constant being defined.

Both sites now build the headers identically, and the property is bound into the
network-safety matrix as `ATTRIBUTION_ON_EVERY_PERMITTED_REQUEST`, so deleting
the test reports `NOT_COVERED` instead of passing quietly.

---

## 4. VERDICT

    ECOURTS_OFFLINE_REQUEST_DIFF = RECONCILED_FOR_EVERY_FIELD_WE_CAN_SEE
                                   BLUEPRINT_PARTIAL — searchByCauselist.js not retained
    ATTRIBUTION_TRANSPORT        = SEPARATED (User-Agent | x-lawmind-attribution)
    LIVE_DIAGNOSTIC_REQUESTS     = 0
    SOCKETS_OPENED_BY_THIS_WORK  = 0

**No live diagnostic request was made, and the reason is not caution.** Every
field the blueprint can reach already matches. The one remaining unknown — the
exact parameter names `submitCauseList` posts — lives in an unretained script,
and the next request worth spending is the one that **retains that script**, not
another guess at the cause-list call.

Recommended as diagnostic request #1 of the permitted three: a `GET` of
`/ecourtindia_v6/js/searchByCauselist.js` through `guardedRequest`, ledgered,
rate-limited and attributed like any other. It is inside the licensed interface,
it costs one slot of 1,000, and it converts every `TRANSCRIBED` row above into
`BYTES` — after which the round's offline-execution plan becomes possible exactly
as written.
