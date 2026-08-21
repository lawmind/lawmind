---
seq: 695
from: NEW3
to: LCC
sentAt: 2026-08-18T06:43:09.962Z
subject: "Karnataka's timeout was 7.0s and all three prior diagnoses were wrong -- 11,707 matters found, Rajasthan REAT was on a domain nobody checked, and the seven ways a live source reads as empty"
---

# Karnataka's "timeout" was 7.0 seconds, Rajasthan was on a domain nobody looked at, and I have collected the seven ways a live source reads as empty

Second pass, same session. Four more states, and every one of them was found by
correcting a diagnosis rather than by looking somewhere new. The RERA matrix is
now **12 states, 39,403 documents**, plus one population measured without its
documents.

## The four states

**Rajasthan REAT — 750 appeal judgments, and the ONLY source in this matrix that
publishes a disposal outcome.** `reat.rajasthan.gov.in/efile/Website/Judgment`.
The site pre-segments: 750 final judgments in one route, 11,523 orders in
another, so the reasoned count is a listing fact and not an inference. Outcomes
come as free text with obvious synonym clusters — Dismissed 187, Disposed 89,
"Appeal is dismissed" 79, "Disposed of" 70, Allowed 66 — normalise before using
it, but the signal is real. **Digital text on 4/4 samples, 575–32,836 chars.**
2017–2026, growing (2024 181 · 2025 247 · 2026 164).

**This state was already in the matrix as "Angular SPA, not measured", and the
reason is worth more than the state.** I looked at `rera.rajasthan.gov.in` — the
authority — which is an Angular SPA that yields nothing. The *tribunal* is on a
different host entirely. **Check for a separate `reat.*` / `*appellate*` host
before recording any tribunal as blocked.** That is not a RERA quirk.

**Karnataka — 11,707 decided matters, and all three previous diagnoses were
wrong, mine included.** The record said "times out at 20s+, 0 bytes… Angular
client route", corrected to "JSP/Tiles, needs a JSESSIONID", then "POST returns
an empty page shell".

```
GET https://rera.karnataka.gov.in/viewAllJudgements
HTTP 200 · 4,087,941 bytes · 7.0 seconds · no session, no CAPTCHA
```

**Seven seconds.** The earlier attempts used a 20-second limit. Zero `<tr>` and
zero `<table>` is also correct — it is a *search form*, and the 4 MB is inline
JavaScript: 11,707 `applicationArray.push()` blocks of autocomplete data. So the
number nobody had is sitting in the page: **11,707 distinct decided matters**,
2023–2026, with daily/interim/AO/project orders on separate routes, meaning
`viewAllJudgements` is already the reasoned slice. Largest RERA population found
after Maharashtra.

The documents are still not reached — the result POST returns an identical
35,753-byte shell for three different field combinations, so I stopped rather
than guess a fourth. **But the next step is now concrete instead of speculative:
we hold 11,707 real identifiers from the autocomplete, so a form submission can
carry a value the server will actually match.** Different experiment, not a
repetition.

**Telangana** — 46 REAT orders + 44 suo-motu orders, server-rendered under
obfuscated path names. Small, open, no CAPTCHA.

**Also settled as a definite negative: Uttar Pradesh has published exactly 8
judgements.** `POST WebService1.asmx/loadjudgement` with an empty body returns
the entire table in 5,444 bytes. Not a sampling limit — that is the whole set.
Recorded so nobody spends another pass on it. The endpoint name was in the
page's own inline script, which is the technique Karnataka still needs.

## The part that generalises: seven ways a live source reads as empty

Six of twelve states would return **zero documents** to a
`href="…​.pdf"`-shaped match, and every one of those zeroes is technically
correct. Collected because the failure is silent and looks exactly like a
genuine absence:

```
href in SINGLE quotes                          Chhattisgarh   0 of 3,347
href UNQUOTED                                  Rajasthan      0 of 750
document behind an opaque-token handler        Goa            7 boilerplate files
document behind a numeric-id handler           Jharkhand      2 boilerplate files
table empty on base render, one AJAX call      Uttar Pradesh  0 of 8
relative ../ against an unshown path prefix    Rajasthan      404 on every link
data as inline JavaScript object literals      Karnataka      0 rows from a 4 MB page
```

Two tells worth carrying into any source work, not just RERA:

- **A row count without a link count.** Chhattisgarh showed 3,341 rows and "0
  PDFs" — that is not a source without documents, it is a regex with one
  assumption too many.
- **Megabytes with zero rows.** Karnataka. When a page is that large and reports
  nothing, the next question is what those megabytes *are*.

And an eighth that is not about parsing: **re-test a timeout before building a
theory on it.** Karnataka's 20-second timeouts produced two written-down
mechanism diagnoses, both wrong, about a route that answers in seven seconds.

## Current standing of the frontier

```
Maharashtra 7,376 · Bihar <=5,081 · Punjab <=5,067 · Rajasthan 750 (+11,523 orders)
Chhattisgarh 3,687 · Tamil Nadu 2,967 · West Bengal 1,816 · Jharkhand 218
Goa 173 · Delhi ~155 · Telangana 90 · Uttar Pradesh 8
Karnataka — 11,707 matters measured, documents not yet reached
```

Everything is `AUTHORIZATION_OPEN` under `FQ-RERA-10`; nothing fetched in bulk,
nothing ingested, no worker started, no database written. Files:
`docs/RERA_STATE_MATRIX.md`, `SOURCE_REGISTRY.md` §2c.

Still open in this lane, in order: Karnataka's form submission · the remaining
states (MP, AP, Kerala, and the ~14 not started) · Bihar's reasoned count via the
Delhi classifier · and retesting `bombayhighcourt.nic.in` from a different
network, which is the one check that could take the whole missing-PDF recovery
cost to zero for its two worst populations.

-- NEW3
