# The AJAX endpoint refuses us, and after eight hypotheses I am stopping

**LCC R12b, 30 August 2026.** This is a STOP report, written under the hard bound
in `~/.claude/CLAUDE.md` §6.5: three failed cycles on the same issue and the
fourth attempt is a blind guess. I ran eight. The bound is the finding.

    ECOURTS_AJAX_POST          = REFUSED — "Invalid Request", every attempt
    ECOURTS_GET_NAVIGATION     = WORKS — session recognised, token accepted
    CANARY                     = NOT PASS
    REAL_CAUSE_LIST_FIXTURE    = none (still 0 served cause lists ever seen)
    REAL_OBSERVATIONS          = 0
    RETENTION_PROBE            = UNMEASURED, and deliberately not attempted
    DAILY_PILOT                = DISABLED

---

## 1. WHAT ACTUALLY HAPPENS

```
GET  /ecourtindia_v6/?p=cause_list/index                      -> 200, full page,
                                                                 app_token, cookies
GET  /ecourtindia_v6/?p=cause_list/index&app_token=<token>    -> 200, session NOT
                                                                 rotated, fresh token
POST /ecourtindia_v6/?p=casestatus/fillDistrict               -> 200,
     {"errormsg":"…Invalid Request…!","app_token":""}
                                                                 + a NEW SERVICES_SESSID
```

The second line is the important one and it is new this round. **A navigation
carrying the session and the token is ACCEPTED** — the server does not rotate
`SERVICES_SESSID` and issues a fresh `app_token`, which is what acceptance looks
like. So our cookie jar, our token extraction and our session continuity are all
correct, and they are correct *as demonstrated by the server*, not by inspection.

The very next POST, on that same session, is refused and the session is
discarded. Whatever rejects us is specific to the AJAX POST route.

---

## 2. THE ROTATING HEADER PAIR — a real finding, and NOT the cause

`ajaxCall` (`components.js`) sends one value under two header names. Every
retained capture of that file, extracted mechanically:

| observed (UTC) | bytes | `delimeter` | second header |
| --- | --- | --- | --- |
| 2026-08-29 17:35:40 | 64,510 | `jkhfkjhkjert33` | `Kjweuru253` |
| 2026-08-29 22:27:20 | 64,507 | `764r6hry7ffds` | `G73hdfdsh` |
| 2026-08-29 22:54:33 | 64,507 | `764r6hry7ffds` | `G73hdfdsh` |
| 2026-08-29 22:59:42 | 64,509 | `uoituert36` | `Dturtywyutr34` |

**Three distinct pairs in 5.4 hours, one rotation inside five minutes.** The
files are otherwise byte-identical; `diff` reports exactly two changed lines.

This retires two rounds of misdiagnosis, and not in the direction R12b first
thought:

- **R11** read the pair, hardcoded it, got `Invalid Request`, and blamed the
  `User-Agent`.
- **R12** described the hardcoded pair as *"transcribed from the licensed
  client's own source"* and credited it with **fixing** that reply.
- **R12b, at first**, read fresh bytes, saw different values, and concluded the
  earlier transcription had been **wrong**. That conclusion is also incorrect,
  and it was published in commit `5cd71a6`, whose message says the transcription
  "was wrong in five places". **It was three places.** The header pair was
  *correct when written* and had gone stale.

The engineering consequence is the same either way and it is now implemented:
**no committed constant can track this.** `parseAjaxDelimeter` reads the pair out
of the live `components.js` once per session, exactly as the browser does by
re-fetching the script on every page load. Both captures are checked in and the
test parses both, asserting they disagree — so the rotation is a fact in the
repository rather than a story about one.

**And it did not fix the refusal.** A request carrying the genuinely current
pair, read live seconds earlier, is refused identically.

---

## 3. EVERY HYPOTHESIS, AND HOW IT DIED

| # | hypothesis | test | result |
| --- | --- | --- | --- |
| 1 | the `delimeter` pair was stale | corrected from retained bytes | **REFUTED** — still refused |
| 2 | `csrf-magic` adds a body field | retained `csrf-magic.js` | **REFUTED** — the page's `<script>` tag for it is inside an HTML comment |
| 3 | `User-Agent` must look like a browser (R11's standing theory) | sent `Mozilla/5.0 (compatible; LawMind/1.0; …)` | **REFUTED** — byte-identical refusal |
| 4 | missing browser headers | added `Origin`, `Accept-Language`, `Accept-Encoding` | **REFUTED** |
| 5 | both together | 3 + 4 | **REFUTED** |
| 6 | the session must NAVIGATE, not land cold | land, then `?p=…&app_token=…` carrying cookies | **REFUTED as a fix** — but proved the session IS accepted on GET |
| 7 | `myscript.js` / `home.js` redefine `ajaxCall` | retained both | **REFUTED** — neither mentions it; `ajaxCall` is defined once |
| 8 | the versioned URL serves a different build | fetched `components.js?v=1787920566` | **REFUTED** — byte-identical to the unversioned path at the same instant |

Also checked, at zero cost, from the retained bytes: no `$.ajaxSetup` `beforeSend`,
no `ajaxPrefilter`, no global `setRequestHeader` — nothing patches the transport.

---

## 4. WHAT WE KNOW IS RIGHT

Not assumed — each demonstrated:

- **Request body and field names** match the licensed client for all five
  endpoints, asserted by executing the client's own retained scripts offline
  (`official-client-recorder.test.ts`, 14 tests). This includes the three
  genuine defects R12b found and fixed: `est_code` on submit, `selprevdays`, and
  the `fillCauseList` reply key.
- **Cookies** — both `SERVICES_SESSID` and the `JSESSION` affinity cookie are
  captured and returned.
- **`app_token`** — extracted from the hidden input the client reads by id, and
  accepted by the server on GET navigation.
- **Headers** — content type, `X-Requested-With`, `Referer`, and the live
  rotating pair.

---

## 5. BEST REMAINING HYPOTHESIS, STATED AS UNVERIFIED

**The rejection is below the JavaScript layer.** Everything a browser's *scripts*
send, we send. What we cannot reproduce from reading scripts is what the browser's
*network stack* sends: TLS fingerprint (JA3/JA4), HTTP/2 settings and header
ordering, and the `sec-fetch-*` / `priority` headers Chrome adds automatically.
A WAF fingerprinting non-browser clients on POST while serving GET to anyone fits
every observation, including the one that a GET navigation on the same session
succeeds.

This is **GUESS**, explicitly. I have not tested it and cannot test it from here
without impersonating a browser at the TLS layer, which is a different act from
sending an honest header and is not one to take without the founder's direction.

---

## 6. WHAT WOULD BREAK THE TIE

**A HAR capture of a real browser doing this exact lookup.** Open
`services.ecourts.gov.in/ecourtindia_v6/?p=cause_list/index` in Chrome, DevTools →
Network → select a state → right-click the `fillDistrict` request → *Copy as
cURL* (or Save all as HAR). Thirty seconds of a human's time, and it settles it
completely: the complete request line, every header in order, and the exact body.

If that request differs from ours in nothing a script can see, hypothesis 5 is
confirmed and the decision becomes a founder question — whether an authorised
client may present a browser's network fingerprint — rather than an engineering
one. `docs/FOUNDER_QUEUE.md` carries it as **FQ-ECOURTS-HAR**.

---

## 7. WHAT WAS NOT DONE, AND WHY THAT IS NOT CAUTION

**The retention probe was not attempted, and would have been wrong to attempt.**
Two independent reasons:

1. Every probe date meets the same refused POST, so nothing could be measured.
2. `searchByCauselist.js` line 15 is `datePickerIcon('causelist_date','+1m','-7')`
   — **the licensed interface's own picker offers +1 month forward and only 7
   days back**, and `submit_causelist` refuses anything beyond a month ahead.
   R12's plan of T-30, T-90 and T-365 asks the interface for dates it never
   offers. That is a poor use of a bounded permission and a worse basis for a
   conclusion in either direction.

If the POST is ever accepted, probe **T, T-1 and T-7 only**, and record the
picker bound as the reason the rest were not attempted — never as evidence about
retention.

**`UNKNOWN` stays `UNKNOWN`.** No observation was written, no availability class
was inferred, `PARSER_STATE` is still `FIXTURE_BOUND`, and the pilot is still
disabled. A refused request is not an empty cause list.

---

## 8. REQUESTS SPENT

18 requests, every one HTTP 200, every one ledgered, attributed and inside the
rate limiter. Day total 56 of 1,000; hour peak 18 of 100.

| purpose | n |
| --- | --- |
| static assets retained (`searchByCauselist`, `components` ×2, `common_header`, `csrf-magic`, `myscript`, `home`) | 7 |
| session opens / navigations | 5 |
| `fillDistrict` attempts across eight hypotheses | 6 |

**Seven of those were avoidable, and the handoff is why.** It stated that
`searchByCauselist.js` *"was never retained"* and called it "THE ONE THING
BLOCKING §10–§14". The fetch ledger shows it was retained at **17:35:04Z on 29
August**, five hours before this session began, along with `components.js`,
`myscript.js`, `home.js` and `common_header.js` — all five sitting in
`official_source_artifact` the whole time. The claim was true of the repository's
`__fixtures__/` directory and false of the database.

The lesson is cheap and worth keeping: **before spending a request under a
bounded permission, query the artifact table.** A prose handoff is a claim about
the world; the ledger is the world.

That accident did pay for itself once — re-fetching `components.js` is the only
reason the rotation was ever visible, because it produced two captures five hours
apart to diff.
