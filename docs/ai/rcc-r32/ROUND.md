# RCC R32 — Gate C product flow against the DigitalOcean alpha

**The whole advocate loop works.** Sign-in through the emailed link, Search,
Reader, Save, Matter and persistence across a relaunch all ran on the physical
S24 against `https://alpha-api.lawmind.co`, with no Metro, no ADB route and no
localhost. LCC's R33 fix is confirmed from the client side: the Custom Tab does
hand the 302 to the app, which was the one question only a phone could answer.

**The gate row is still HOLD, for one reason and it is not the product.** The SIM
has no cellular data service, so this ran on Wi-Fi at the founder's direction.
`REMOTE_MOBILE_DATA` is not claimed.

## Start state

| | |
| --- | --- |
| `HEAD_START` = `origin/main` | `fae456c84a336ab026c60aacd10a4ca85bbc14c3` |
| `apps/**` porcelain at start | 0 |
| `CLIENT_SHA` | `fae456c8…`. `git diff --name-only 9fc20c0d..fae456c8 -- apps/` is empty, so the binary installed at R31 is still exactly HEAD's client code — nothing was rebuilt and nothing needed to be |
| `REMOTE_API_SHA` | `a09d7ee54aa6bc8d8d1dc12aeeb98371be3b336a`, read live from `GET /version` |
| expected by the handoff | `a09d7ee5` (bus 1801). **Match** — the run was not started against a different build |
| device | `SM-S921B`, Android 16, serial `RZCX90X1BNF`, USB |

## Prerequisites, checked before anything was tested

**1. `LCC_GATE_C_AUTH = PASS`** — bus 1801, with `DEPLOYED_SHA a09d7ee5` confirmed
live. Satisfied.

**2. Cellular — NOT satisfied.** Wi-Fi off, mobile data on, waited for attach:

```
Transports: CELLULAR Capabilities: SUPL&INTERNET&NOT_RESTRICTED&TRUSTED&NOT_VPN&
            NOT_ROAMING&FOREGROUND&NOT_CONGESTED&NOT_SUSPENDED&NOT_VCN_MANAGED&
            NOT_BANDWIDTH_CONSTRAINED
```

`INTERNET` is declared, **`VALIDATED` is absent** — Android's own connectivity
probe never succeeded on it. The only CELLULAR agent that does carry `VALIDATED`
is the IMS one, which the brief explicitly excludes. This is the same reading as
R31, a day later, on a second attempt.

The founder then directed the run to Wi-Fi ("cellular wont work, use wifi only
its the same thing"). For everything except the bearer it is the same thing — the
app speaks HTTPS to a public origin either way — so the product rows below were
run and are reported, and the bearer row is reported separately as HOLD rather
than quietly folded into a PASS.

`CELLULAR_NETWORK_VALIDATED = false`.

## Network proof for the run

[`device/network-proof.txt`](device/network-proof.txt)

| | |
| --- | --- |
| `WIFI_OFF` | **false** — this is the Wi-Fi run, stated plainly |
| `ADB_REVERSE_EMPTY` | **true** — `adb reverse --list` empty |
| `ADB_FORWARD_EMPTY` | **true** — `adb forward --list` empty |
| no localhost API | the origin is compiled into the binary's Hermes bundle (R31 provenance) |
| no VPN | `always_on_vpn_app` null, no `tun`/`tap`/`ppp`, Wi-Fi agent `NOT_VPN` |
| no private DNS | `private_dns_mode` null |
| mobile data | off (`mobile_data 0`), so there is no ambiguity about which bearer carried the traffic |

ADB over USB carried install, screenshots and `uiautomator` only.

## A note on every number below

**They are upper bounds, not measurements.** Each one wraps a fixed `sleep` or a
`uiautomator dump` poll whose own round trip is roughly 0.6 s. The real latencies
are lower, by an unknown amount. They are recorded because the brief asks for
visible timings, and they are labelled so nobody later quotes them as a
measurement or compares them against the frozen contract. **No new latency gate is
proposed and none of these is treated as a failure criterion.**

## AUTH_MAGIC_LINK — PASS, and it answers LCC's open question

A fresh identity on a fresh address, as LCC asked: `sof9tk+r32@gmail.com`. App
data was cleared (`pm clear`) first, so nothing carried over from R31.

| step | observed |
| --- | --- |
| app requests the link | "We sent a link to sof9tk+r32@gmail.com" |
| email | arrived in well under a minute, from Lawmind, *Your Lawmind sign-in link* |
| the URL in it | `https://alpha-api.lawmind.co/auth/magic-link/open?token=…` — **the mounted route**, not the old `/api/auth/...` one |
| tapped on the phone | Custom Tab opened and **handed the redirect to the app**: focus became `co.lawmind.app/.MainActivity` |
| where it landed | onboarding — correct, this identity had no profile |
| after onboarding | Today, greeting **"RCC GateC Advocate"** — the right identity |
| tap → app | ~10 s upper bound, including the browser round trip |

**This is the specific thing LCC could not see from the server.** A browser
refusing a custom-scheme redirect would have been invisible remotely; Brave
followed it. Evidence:
[`device/01-auth-landed-onboarding.png`](device/01-auth-landed-onboarding.png),
[`device/02-signed-in-today.png`](device/02-signed-in-today.png).

No token was extracted, transcribed or committed. The link was tapped on the
device, which is what an advocate does.

## SEARCH_EXACT — PASS

Query `2022 INSC 690`. Result: **1 judgment**, *SATENDER KUMAR ANTIL versus
CENTRAL BUREAU OF INVESTIGATION & ANR.*, Supreme Court of India · 2022, with the
parse line *Judgments reported as "2022 INSC 690"*. Actions offered: Copy
citation, Add to a matter.

**No badge.** Correct: the citation is `verified`/`corpus`, and verified is
silent. Upper bound ≈ 7.5 s, of which 5 s was a fixed wait.
[`device/03-search-exact.png`](device/03-search-exact.png)

## SEARCH_LEXICAL — PASS

Query `bail conditions undertrial delay`. Result: **5 judgments**, top hit
*PENDYALA HEMALATHA Vs THE STATE OF MAHARASHTRA AND ORS.*, Bombay High Court ·
2021, with `OPERATIVE PARAGRAPH · 31` and *Read ¶ 31 in full*.

The truthful state rendered exactly as it should: **"No citation on file — cannot
be referenced in a filing"**, and the action degraded from *Copy citation* to
*Copy case name*. That is the product refusing to let an uncitable authority look
citable. Upper bound ≈ 3.6 s to first result.
[`device/04-search-lexical.png`](device/04-search-lexical.png)

No `degraded` banner was surfaced to the user on either query.

## READER — PASS

Opened *2022 INSC 690* from Search — the evidence-rich fixture the brief prefers.

The judgment screen renders provenance honestly rather than asserting more than
is held:

- `WHERE THIS CAME FROM` · `Source · Supreme Court of India` · *Open the court's copy*
- **"From a law reporter's edition — the text may include editorial matter"**
- **"The date has not been checked against the court's record."**
- `RELIED ON`, listing real authorities with their neutral citations and dates —
  *63 Moons Technologies*, *P. Chidambaram v. Directorate of Enforcement*,
  *Nikesh Tarachand Shah*, *Gurbaksh Singh Sibbia*, *Maneka Gandhi*.

Then *Read the judgment* opened the reading view with **real paragraph text,
"1 of 76"** — the S.C.R. head, the coram, the BNSS-era-predecessor section list,
and the held passage. On a freshly cleared install against a remote API, so this
cannot be a cache-only success.
[`device/05-reader-provenance.png`](device/05-reader-provenance.png),
[`device/06-reader-paragraphs.png`](device/06-reader-paragraphs.png)

## SAVE — PASS

*Add to a matter* → **"SAVE TO WHICH MATTER?"** → the practice was empty, so the
sheet offered *Create a matter* rather than a dead end, and **carried the
authority through the creation**. One flow, one intended write: the new matter
came back with the authority already on it, so the thing being saved was never
dropped on the way to the form. Upper bound ≈ 5.3 s.

**Duplicate behaviour — PASS.** The same authority was then saved a second time
into the same matter through the picker. After a relaunch and a remote refetch the
`AUTHORITIES` list holds **exactly one** *SATENDER KUMAR ANTIL* row. No duplicate,
and no false optimistic state at any point.

## MATTER — PASS

Matter created: **"RCC Gate C v Alpha API"**, `SUPREME COURT OF INDIA`, *Antil v
CBI · for the accused*. The screen renders the real remote state:

- `NEXT HEARING` → *No next date recorded* / *Record it when the court gives it.*
- `AUTHORITIES` → the saved judgment with `2022 INSC 690` and *Remove from this matter*
- `TIMELINE` → *Nothing recorded yet. The timeline holds what the court did.*

Empty states that say what is absent and why, rather than looking broken.
[`device/07-matter-with-authority.png`](device/07-matter-with-authority.png)

## RELAUNCH_PERSISTENCE — PASS

`am force-stop` then relaunch, still on the same network.

- **No re-authentication was required** — the session survived, which is the real
  product behaviour, so none was forced.
- Today rendered the right identity again: *Good morning, RCC GateC Advocate*.
- Matters → the matter is there → opening it refetched and showed the authority.
- No cold-store false absence anywhere — the R30 `caseloadView`/`ensureLive` rule
  held on a genuinely cold store.

Upper bounds: relaunch → home ≈ 4.4 s; matter open → loaded ≈ 2.7 s.
[`device/08-relaunch-persisted.png`](device/08-relaunch-persisted.png)

## HTTP_ERRORS · CRASHES · ANR · OOM

| | |
| --- | --- |
| product 4xx/5xx | **none observed** in any screen of the run |
| crashes | **0** — `logcat -b crash` holds no `lawmind` line across the whole run |
| ANR | **0** |
| OOM | **0** — no `OutOfMemory`, no lowmemorykiller line for the package |
| app alive at the end | pid 5608 |
| wrong empty / corpus-unavailable states | **none**. Every empty state seen was true: no matters yet, no next date, empty timeline, and *No citation on file* on a judgment that genuinely has none |
| wrong stale/offline state | none |
| retry / duplicate anomalies | none — see SAVE |

## CORRECTIONS

Three, all mine, recorded because each could otherwise be misread later.

1. **`reader_open_ms=100122` in my own trace is an instrumentation artifact, not
   a latency.** The poll loop was waiting for text (*Read the judgment*) that sits
   far below the fold on that screen, so it never matched and simply exhausted its
   40 iterations at ~2.5 s each. The screen had in fact rendered long before. It
   is struck here rather than left to be quoted as a 100-second reader.
2. **"Add matter" refused twice and that was correct.** I read it as a failed
   submit; the form was showing **"Who is the client?"** because I had left CLIENT
   NAME empty. My gap, not a defect — the validation is working and it names the
   missing field.
3. **A minor accessibility observation, not chased.** The Case type and Our side
   chips report `selected="false"` / `checked="false"` in the accessibility tree
   even when visually selected (confirmed by screenshot: *Criminal* renders
   filled). Nothing in this gate depends on it and the brief forbids opportunistic
   UI work, so it is recorded and left. It would matter to a screen-reader user.

## NOT_DONE

- **The mobile-data bearer.** Not attempted beyond confirming it is unavailable.
- `WIFI_OFF` is false by design this round, so the row it belongs to is not
  claimed.
- No `apps/**` change was made or needed. No rebuild: the installed binary is
  already HEAD's client code.

## BLOCKERS

**`CELLULAR_BEARER_UNAVAILABLE`** — the SIM provides no validated data service.
This is a phone-account matter, not a product one, and nothing in LawMind can fix
it. Everything else this gate asks for has now been observed.

## Not RCC's, and not touched

`services/**`, migrations, DigitalOcean configuration, DNS, remote databases, SSH,
deployments, HNSW and semantic search, citation and statute work, latency
thresholds and server timeouts. No DigitalOcean resource was created, changed or
destroyed; the `2026-09-19T17:57:04Z` deadline stands.
