# RERA STATE MATRIX — per-state sizing, ranked by reasoned decisions

**NEW3. Opened 17 Aug 2026, extended 18 Aug 2026.** RERA Appellate Tribunals and
Authorities, 28+ states/UTs, no central repository
(`CORPUS_ACQUISITION_QUEUE.md` row 6). Per the founder's acceleration addendum:
**rank by reasoned decisions, not raw record count** — Maharashtra's own numbers
are why that rule exists (49,167 raw records, 85% Roznama, 7,376 real).

Fields tracked per state: mechanism · CAPTCHA · raw count · reasoned count ·
procedural/order-sheet count · PDF text-layer shape · date range · update
mechanism · authorization status.

Nothing ingested. Every entry below is a read-only `curl` measurement, freeze
untouched. **Sampled PDF downloads are counted and stated per state**; no state
was bulk-downloaded.

---

## RANKED — by reasoned decisions actually measured

| # | state | reasoned decisions | raw documents | procedural share | mechanism | CAPTCHA | text layer | dates | licence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Maharashtra** | **7,376** | 49,167 | 85% Roznama (41,791) | SPA bundle → `apiUrl` → public POST + separate DMS download service | none | not measured | 2018–2026 | OPEN `FQ-CCI-PERMISSION` |
| 2 | **Punjab** | **≤5,067 distinct PDFs** (union arithmetic in §PUNJAB) | 5,067 | not separable from the listing | same `erera.co.in` platform as Delhi, server-rendered, 7 routes | present, gates the **filter form only** | **NO — 0 chars, two independent extractors** | 2019–2026 | OPEN |
| 3 | **Chhattisgarh** | **3,687** (3,347 final + 340 AO) | 4,154 | 467 interim, **pre-segmented by the site itself** | plain ASP.NET, one page per order class, single-quoted hrefs | none | **PRESENT AND UNUSABLE — legacy font-encoded Hindi, §CHHATTISGARH** | 2018–2026 | OPEN |
| 4 | **Tamil Nadu** | **2,967 distinct** across 3 benches | 2,967 | no procedural category published | plain server render, **year-scoped URLs** `/complaints/{bench}/judgements/{year}` | none | **NO — 0 chars on 6/6 samples, two independent extractors** | 2017–2026 | OPEN |
| 5 | **Bihar** | **~2,956 estimated** (21 of 31 measured — see §BIHAR) | **4,367** order PDFs + 571 AO | 4 of 31 sampled are under 1,000 chars | plain ASP.NET server render, one page, direct `Order/*.pdf` hrefs | **YES — 30 of 31 samples carry digital text** | 2018–2026 | OPEN |
| 6 | **West Bengal** | **1,816 distinct complaints** (derivable from the listing alone) | 4,884 orders | ~63% non-final (`Order No. 01` = 1,611 of 4,884) | plain PHP server render, PDFs on `doc.repository.semtwb.in` | none | **MIXED and untrustworthy — one sample 1,069 chars but OCR-garbled, one 3 MB sample = 2 chars** | to 2026 | OPEN |
| 7 | **Rajasthan REAT** | **750 appeal judgments — and the only source publishing a DISPOSAL OUTCOME** | 750 judgments + **11,523 orders**, pre-segmented into two routes | 11,523 in the separate `OrderList` route | `reat.rajasthan.gov.in/efile/Website/Judgment`, server-rendered; hrefs are **unquoted** | none | **YES — digital, 575–32,836 chars on 4/4** | 2017–2026 | OPEN |
| 8 | **Jharkhand** | **218 `Judgement` + 10 `Order`** — the site labels every row | 228 | site-labelled, 0 procedural published | server-rendered table, docs at `/FirstLevel/ViewDocument/<id>` | none | **YES — digital, 10,222 chars / 9 pages** | to 2026 | OPEN |
| 9 | **Goa** | **173** adjudicating-matter orders | 173 | not separated | server-rendered, docs at `/ComplaintOrder?IMG_PATH=<opaque>` — the token is in the listing, nothing to decrypt | none | **NO — 7 chars over 7 pages** | 2020–2022+ | OPEN |
| 10 | **Delhi** | **~155 estimated** (11 of 176 measured in a 7.1% sample) | 481 documents ≈ **2,491 appeal-order units** | **93.8% procedural — MEASURED, §DELHI** | plain server-rendered HTML, direct `.pdf` hrefs | gates the filter form only | **YES — clean digital text** | 2021–2026 | OPEN |
| 11 | **Telangana** | **46 REAT orders + 44 suo-motu orders** | 90 | not separated | server-rendered under obfuscated path names | none | not measured | to 2026 | OPEN |
| 12 | **Uttar Pradesh** | **8** | 8 | — | `POST WebService1.asmx/loadjudgement`, empty JSON body, whole table in one response | none | **NO — 55 chars over 20 pages** | to 2026 | OPEN |
| — | **Karnataka** | **11,707 decided matters exist** — see §KARNATAKA; the document listing is still not reached | — | — | **NOT an SPA and NOT slow** — `/viewAllJudgements` is a **search form**, and its 4 MB payload is the autocomplete data, in inline JavaScript | none | unknown | 2023–2026 (from the appeal numbers) | — |
| — | Gujarat | **blocked, 4 approaches, diagnosis now definite** | — | — | **Angular SPA with client-side-only routing and NO server fallback** — every deep path returns HTTP 404/196 bytes, including invented ones, so a deep link can never work and the listing is reachable only by in-page navigation from the root. The 16 MB bundle names the routes (`/judgements/rera-judgement`, `/judgements/appellate-tribunal`, `/judgements/high-court`, `/judgements/supreme-court`) and an API host (`gujrerar1.gujarat.gov.in`), but the only judgement calls in it are per-complaint (`getJdgnobyAckno`) and dashboard-side | unknown | unknown | unknown | — |
| — | Haryana (Panchkula) | **gated** | — | — | every functional route is under `/login/` | — | — | — | — |
| — | Assam | **gated** | — | — | the single route found is `/login/order_view_all` | — | — | — | — |
| — | Kerala | **unreachable this pass** | — | — | HTTP 503 | — | — | — | — |
| — | Andhra Pradesh | **routes moved** | — | — | `ComplaintOrders.aspx` / `Judgement.aspx` / `APREATComplaintOrders.aspx` all 404 — site restructured since its own homepage links were written | — | — | — | — |
| — | Madhya Pradesh | not measured | — | — | homepage returns 159 bytes — a JS bootstrap, nothing server-rendered | — | — | — | — |
| — | ~14 more states/UTs | not started | — | — | — | — | — | — | — |

**Measured so far: 38,689 raw documents across 12 states**, plus Karnataka's
11,707 decided matters whose documents are not yet reached. The reasoned column
is **ranked, never summed** — the twelve numbers were produced by six different
methods with six different confidences, and the per-state sections say which.

**A reasoned-vs-procedural discriminator is a property of the SOURCE, not of the
category, and this is the file's most reusable finding.** Delhi needs numbered
paragraphs plus length; applying that same test to Bihar undercounts it by a
factor of three, because the Bihar authority does not number paragraphs.
Chhattisgarh and Rajasthan need no test at all — their sites pre-segment.
West Bengal's discriminator is a column in the listing. Five states, five
different right answers. **Deriving one classifier and applying it across the
matrix produces confidently wrong counts in both directions.**

**The RERA authority for a state is often not on the state's RERA domain.**
Rajasthan's appellate tribunal is at `reat.rajasthan.gov.in`, a plain
server-rendered site — while `rera.rajasthan.gov.in`, the obvious address, is an
Angular SPA that yields nothing to a page fetch. **Rajasthan was recorded as
"Angular SPA, not measured" for exactly one reason: I looked at the authority's
domain and never at the tribunal's.** Check for a separate `reat.*` or
`*appellatetribunal*` host before recording any state as blocked.

**Three mechanism families account for all twelve**, and naming them is what
makes the next state cheap rather than a fresh investigation:

1. **Server-rendered, whole listing in one response** — Delhi, Punjab, Bihar,
   Chhattisgarh, Tamil Nadu, West Bengal, Jharkhand, Goa, Rajasthan, Telangana.
   One `curl`, one regex.
2. **One unparameterised AJAX endpoint behind an empty table** — Uttar Pradesh
   (`WebService1.asmx/loadjudgement`), and this is the shape Karnataka most likely
   is too. The endpoint name is in the page's own inline script; the fix is to read
   it, not to guess DataTables field names.
3. **Angular SPA with the data behind a private API** — Gujarat and Maharashtra
   (solved there by finding `apiUrl` in the bundle). Gujarat resisted the same
   technique; see its row.

**Gujarat also demonstrates a mechanism worth naming separately, because it makes
a whole class of tooling useless: client-side-only routing with no server
fallback.** Every deep path returns 404 — `/judgements/rera-judgement` and
`/zzz-not-a-route` produce byte-identical 196-byte responses. So `curl` on a deep
link fails, and **`agent-browser open <deep-url>` fails for the same reason**,
which is easy to misread as the browser tool being unable to render the site. It
renders fine; the server simply never serves that path. Such a source can only be
reached by loading the root and navigating in-page. Test for it in one command:
request an invented deep path and see whether it 404s identically to the real one.

### The link-extraction traps, collected — every one of these returns ZERO from a careless regex

Six of the twelve states would read as "empty page, no documents" to a
`href="..."`-shaped `.pdf` match. This is the single most reusable finding in the
file, because the failure is silent and looks exactly like a genuine absence:

| trap | state | what a naive match returns |
| --- | --- | --- |
| `href` in **single** quotes | Chhattisgarh | 0 of 3,347 |
| `href` **unquoted** | Rajasthan | 0 of 750 |
| document behind an **opaque-token handler**, not a `.pdf` URL | Goa | 7 boilerplate files |
| document behind a **numeric-id handler** | Jharkhand | 2 boilerplate files |
| **table empty on base render**, filled by one AJAX call | Uttar Pradesh | 0 of 8 |
| relative `../` resolving against a **path prefix** the listing does not show | Rajasthan | HTTP 404 on every link |
| data present only as **inline JavaScript object literals** | Karnataka | 0 rows, 0 tables, 0 links — from a 4 MB page |

**Before recording any source as empty or absent, run a quote-agnostic link match
and count `<tr>`.** A row count with no link count is the tell: Chhattisgarh
showed 3,341 rows and "0 PDFs", which is not a source with no documents — it is a
regex with one assumption too many. And Karnataka is the reverse tell —
**4 MB with zero rows is not an empty page**, it is data in a shape the check
does not look at.

**A seventh trap that is not about parsing at all: the timeout.** Karnataka was
recorded as "times out at 20s+, 0 bytes" across two tools and three attempts. It
returns in **7.0 seconds**. Whatever produced the original timeouts, the
conclusion drawn from them — SPA, then session-gated — was wrong twice, and both
wrong diagnoses were written down as mechanism. **Re-test a timeout before
building a theory on it.**

---

## DELHI — my own earlier characterisation was WRONG, and this is the correction

This file, as written on 17 Aug, said Delhi had *"no Roznama-style
daily-order-sheet category… structurally like Maharashtra's already-filtered
`Judgement` + `Order` bucket"*, and flagged it as unconfirmed. **It is now
confirmed false.** NEW2 declined to promote Delhi on exactly that doubt
(bus 0640) and was right to.

**The document unit is a hearing DATE, not a decision.** Every filename is a date
— `13.02.2026.pdf`, `05-04-2023-1-7.pdf` — and each file bundles every appeal the
tribunal heard that day.

Measured on a **34-document sample, 7.1% of 481**, all fetched and text-extracted:

```
documents sampled                        34
distinct appeal numbers inside them     180   (mean 5.29 appeals per document)
appeal-order units after splitting       176
  reasoned  (>=1500 chars AND >=3 numbered paragraphs)    11    6.2%
  procedural / short                                     165   93.8%
median chars per appeal-order unit      644     p90 1,651     max 5,097
```

A typical unit, in full:

> REAL ESTATE APPELLATE TRIBUNAL FOR NCT OF DELHI & UT OF CHANDIGARH …
> (Appeal No.109/REAT/2023) · 09.10.2023 ORDER
> **Bench could not assemble today. Put up for same purpose on 03.11.2023.**
> Section Officer (REAT)

That is Roznama. Delhi has no *category* for it because Delhi has no category
column at all — which is the point NEW2 made and I under-weighted: **a source
that cannot label its procedural orders is worse than one that labels 85% of
them, because the error becomes undetectable rather than merely large.**

**The discriminator NEW2 asked for exists, and it is not a header.** The header
is byte-identical on both kinds. Two fields separate them, and both live in the
extracted text rather than the listing:

1. **numbered reasoning paragraphs** — `^\d{1,2}\.` at line start, ≥3 of them;
2. **length ≥ 1,500 characters** per appeal-order unit.

All 11 reasoned units have both; none of the 165 procedural ones has either. It
is a post-extraction test, so **Delhi can only ever be classified per document**
— which is precisely the "then 481 is the correct denominator for pricing it"
outcome NEW2 named as the alternative finding.

**~155 reasoned decisions estimated** (`481 × 5.18 units/doc × 6.2%`). That is an
estimate from a 7.1% sample and must not be quoted as measured. What is measured
is **11 reasoned units out of 176**.

**Delhi's tribunal also covers Chandigarh** — the letterhead reads *"FOR NCT OF
DELHI & UT OF CHANDIGARH"*. Chandigarh needs no separate acquisition.

---

## PUNJAB — the structural finding: Delhi's platform is a MULTI-STATE platform

`rera.punjab.gov.in/reraindex/…` runs the **same application as Delhi's
`erera.co.in/reradelhiindex/…`** — identical route names, identical
server-rendered listing, identical CAPTCHA-on-the-filter-only behaviour. Punjab
exposes more of it:

| route | HTTP | bytes | distinct PDFs |
| --- | --- | --- | --- |
| `CourtView/OrderJudgementsInfo` | 200 | 4,656,227 | 4,456 |
| `courtview/OrderJudgementsAuthorityInfo` | 200 | 3,070,368 | 3,022 |
| `courtview/OrderJudgementsAOInfo` | 200 | 1,615,830 | 1,438 |
| `courtREAT/REATcourtOrderJudgementsAppellateTribunalInfo` | 200 | 756,696 | 402 |
| `courtview/ExecutionInOrderJudgementsAuthorityInfo` | 200 | 192,471 | 145 |
| `courtview/ExecutionInOrderJudgementsAOInfo` | 200 | 108,978 | 65 |
| `courtREAT/REATcourtOrderJudgementsExecutionInAppellateTribunalInfo` | 200 | 59,114 | 15 |
| | | **distinct across all seven** | **5,067** |

**The union arithmetic was checked, not assumed** — the same discipline NEW2
applied to plain-vs-mobile parquet. `OrderJudgementsInfo` is the *exact* union of
Authority + AO: 3,022 + 1,438 = 4,460 raw, 4,456 distinct, and **zero** PDFs
appear in `OrderJudgementsInfo` that are absent from the other two. Summing the
three routes would have over-counted by 4,456. REAT overlaps the union by 4.

Year spread from the PDF paths (`rwdataOrdersJudgements/<year>/`):
2019 522 · 2020 392 · 2021 779 · 2022 957 · 2023 437 · 2024 331 · 2025 527 ·
2026 507.

**No text layer.** One sample, 104,326 bytes, returns 0 characters under Poppler
**and** 0 under unpdf. Punjab is an OCR population.

**The transferable action:** every other state on this platform is a known
quantity before it is fetched. Routes to probe on any suspected sibling:
`/reraindex/courtview/OrderJudgementsAuthorityInfo`,
`/reraindex/courtview/OrderJudgementsAOInfo`,
`/reraindex/courtREAT/REATcourtOrderJudgementsAppellateTribunalInfo`. Chandigarh,
Haryana and the smaller UTs are the first candidates — and Chandigarh is already
covered by Delhi's tribunal, so it may be the same documents twice.

---

## CHHATTISGARH — a THIRD extraction failure mode, and it scores zero defects

Best-structured listing found in any state. The table publishes complaint number,
complainant, respondent, project, **the sections of the Act invoked**, decision
date and the PDF — and the site itself separates final, AO and interim orders
into different pages:

```
ComplaintDocs_final_order.aspx              3,339 distinct PDFs
ComplaintDocs_final_order_section_all.aspx  3,347   (superset of the above)
ComplaintDocs_final_order_ao.aspx             340
ComplaintDocs_interim_order.aspx              467   (the procedural bucket, already separated)
```

Sections invoked, from the listing alone: s.31 (318) · s.11 (170) · ss.17+18+19
(131) · s.18 (128) · s.19 (119) · ss.17+18 (102) · s.17 (68) · s.61 (60). Date
spread 2018–2026, heaviest 2024–2026. `href` uses **single quotes**, which is why
a double-quote-only link regex returns 0 on this state — worth knowing before
anyone concludes the page is empty.

**And then the extraction.** Three samples: 4 chars, 12,733 chars, 923 chars. The
12,733-character one extracts as this:

```
NRrhlx<++ Hkw&ww laia nk fofu;ked izzkf/kdj.k , jk;iqqj
izdj.k ekad&M-PRO-2021-01359
& le{k & Jh lat; 'kqDyk] v/;{k] Jh /kuat; nsokaxu] lnL;]
```

That is **Hindi in a legacy ASCII-mapped font** (Kruti Dev / DevLys family), not
Unicode Devanagari. The PDF carries six subsetted `CIDFont+F*` fonts with
`Identity` encoding and six `/ToUnicode` CMaps — so the extractor is behaving
*correctly per the file's own map* and still produces semantic garbage.

**This extends NEW2's rule from bus 0640, and it is worse than the case that rule
was written for.** Poppler deleting Devanagari at least produced a *shorter*
output. This produces a **long, clean, pure-ASCII, defect-free** output: it scores
zero on every defect metric, passes any length check, passes any is-it-ASCII
check, and is unreadable. Three failure modes now, not two:

> **1** no text layer (image PDF) — detectable by length.
> **2** extractor deletes the script (Poppler/Devanagari, CX1's bake-off) —
> detectable only by counting script retention.
> **3** legacy font-encoded script — **detectable by neither.** The only test is
> script plausibility: a Hindi-jurisdiction document whose text is 100% ASCII
> with high consonant-cluster entropy is font-mangled, not English.

Kruti Dev → Unicode is a deterministic remap and solved OSS territory, so this is
a routing decision rather than a blocker. But it must be **detected**, and nothing
in the current pipeline detects it.

---

## TAMIL NADU — cleanest mechanism found, scanned documents

Year-scoped server-rendered URLs, the easiest harvest shape in any state:
`/complaints/{form-mbench1|form-mbench2|form-n}/judgements/{2018..2026}`.

| bench | route | distinct PDFs |
| --- | --- | --- |
| Authority bench 1 | `form-mbench1` | 712 |
| Authority bench 2 | `form-mbench2` | 878 |
| Adjudicating Officer | `form-n` | 1,377 |
| | **distinct across all** | **2,967** |

Zero overlap between benches — the three sums add exactly to the distinct total.
PDF paths carry their own year and reach **2017**, one year earlier than the
listing's own dropdown admits.

`form-mbench2` returns `View [publicView.smb_judgements.2018] not found.` for
2018–2021. That is a **real absence** — bench 2 was constituted later — not a
fetch failure; the four responses are a server-side view error, identical in size
to within 4 bytes.

**No text layer on 6/6 samples** across all three buckets, confirmed on two
independent extractors. 2,967 documents of OCR work.

---

## BIHAR — the largest digital-text population found, and TWO corrections to my own numbers

`publicorder.aspx` renders one 4.9 MB page with no CAPTCHA and no session;
`PublicOrderAO.aspx` adds 571 AO orders. Direct `Order/*.pdf` hrefs.

**Correction 1 — the raw count was 5,081 and it is 4,367.** My first pass counted
every distinct `.pdf` href on the page. The page also links its photo gallery,
its cause lists and its user manual:

```
Order/          4,367   <- the actual order population
Cause_List/       545   <- procedural, and a separate publication
Photo_Gallery/     98
images/            46
other              25
                -----
                5,081   <- what I reported
```

**714 of the 5,081 I reported were not orders**, and 545 of those were cause
lists — the exact procedural class this matrix exists to exclude. Caught only
because a random sample of "order PDFs" came back with `Cause_List/` in the path.
**The lesson generalises: count by directory, not by extension.** Every other
state in this matrix was counted the same way and the same check should be run
against each before any of these figures is used for pricing.

**Correction 2 — the Delhi discriminator does not transfer, and I nearly quoted a
number three times too low.** Running Delhi's test (≥1,500 chars **and** ≥3
numbered paragraphs) over 31 sampled order PDFs scores **22.6% reasoned**. That
is wrong, and reading a boundary case shows why:

> REAL ESTATE REGULATORY AUTHORITY (RERA), BIHAR · Before the Single Bench of
> Mrs. Nupur Banerjee, Member · Case No: RERA/CC/1216/2021 … **ORDER** … *"the
> complainant booked a flat bearing Flat No.207 Block-L … for a consideration of
> Rs.13 lakh and a Memorandum of Understanding was executed between the
> part[ies]"*

That is a reasoned order. It recites the facts and disposes of the matter. It
simply **does not number its paragraphs**, because numbering is a convention of
the Delhi tribunal and not of the Bihar authority. A 24,781-character document in
the same sample also carries zero numbered paragraphs.

A content test fits Bihar: does the text contain a disposition phrase (*hereby
directed*, *is allowed/dismissed/disposed*, *refund*, *compensation*, *interest
at*, *directed to pay*, *penalty*)?

```
sample                                  31 order PDFs (0.71% of 4,367)
carry a substantive disposition phrase  21   67.7%
under 1,000 characters                   4
no text layer at all                     1
chars: median 1,924 · p10 1,032 · p90 7,856 · max 24,781
```

**~2,956 reasoned, estimated** (`4,367 × 67.7%`) — from a 0.71% sample, so the
bounds are wide and it must not be quoted as measured. What is measured is
**21 of 31**.

**The methodological point outranks the number: a reasoned-vs-procedural
discriminator is a property of the SOURCE, not of the category.** Delhi's test is
correct for Delhi and wrong for Bihar by a factor of three. Chhattisgarh needs no
test at all because its site pre-segments; West Bengal's discriminator is a column
in the listing; Rajasthan publishes the outcome outright. Five states, five
different right answers. Deriving one classifier and applying it across the
matrix would produce confidently wrong counts in both directions.

Description-column self-labelling on the listing, for whoever refines this:
`ORDER :` 1,323 · `Case No.` 964 · `ORDER: CASE` 402 · `INTERIM ORDER` **158** ·
`RERA/Execution Case` 119 · `PROCEEDING :` **66**. Year spread 2018–2026, peak
2022 (1,750).

**Text layer present and genuine — 30 of 31 samples.** Bihar remains the largest
population needing essentially no OCR.

---

## WEST BENGAL — 4,884 orders over 1,816 complaints, classifiable without downloading

`authority_order.php` renders 4,884 distinct PDFs, hosted off-site on
`doc.repository.semtwb.in`. Rows read `Order No. 01 dated 15.07.2026 for Complaint
No. WBRERA/COM 001668`.

**The order number is the discriminator, and it is in the listing** — no
extraction needed. `Order No. 01` accounts for 1,611 rows, `02` 842, `03` 659;
1,816 distinct complaint identifiers across 4,884 orders, ~2.7 orders per
complaint. The final order per complaint is the reasoned one and the rest are the
procedural trail, so **1,816 is the reasoned estimate and it costs nothing to
derive.**

Complaint identifiers appear in at least eight punctuation variants
(`WBRERA / COM`, `WBRERA/COM`, `WBRERA COM (physical)`, `WBRERA / COM …-CP`, …).
A naive exact-match key undercounts them by a factor of 3.7 — 496 against the
correct 1,816. Normalise before keying, or the reasoned count is wrong by 73%.

Text layer is mixed and poor: one sample extracted 1,069 characters but visibly
OCR-corrupted (`Complainalt`, `coM oo1304`, `lO5O12`); another 3 MB sample
returned 2. Treat WB as an OCR population whose existing text layer must be
**distrusted rather than used** — which is a fourth variant of the extraction
problem: text that is present, Unicode, and silently wrong.

---

## KARNATAKA — every previous diagnosis of this state was wrong, including mine

The 17 Aug entry said `/viewAllJudgements` "times out at 20s+, 0 bytes… looks
like an Angular client route needing JS execution", then corrected itself to
"JSP/Tiles, most likely needs a `JSESSIONID`". **Both readings are wrong, and so
was the third — that the POST returned an empty page shell.**

```
GET https://rera.karnataka.gov.in/viewAllJudgements
HTTP 200 · 4,087,941 bytes · 7.0 seconds
```

**Seven seconds, not a timeout.** The earlier attempts used a 20-second limit and
concluded absence from what was almost certainly a slow first byte; the route is
not slow enough to justify that conclusion now, and no session cookie was needed.

**The page contains zero `<tr>` and zero `<table>` — and that is correct**,
because it is a **search form**, not a listing. The 4 MB is JavaScript: 11,707
`applicationArray.push()` blocks carrying the autocomplete data for the search
box.

**So the real finding is a number nobody had: 11,707 distinct decided matters.**
Extracted from the page's own data, not inferred:

```
appNo shapes    CMP/NNNNNN/NNNNNNN      6,426
                NNNNN/NNNN              4,129
                CMP/UR/NNNNNN/NNNNNNN   1,147
                other                       5
                                       ------
                distinct                11,707
years present in the NNNNN/NNNN form   2023 1,774 · 2024 1,230 · 2025 1,010 · 2026 115
```

That makes Karnataka the **largest single RERA population found after
Maharashtra**, and it has separate routes for daily orders, interim orders, AO
orders and project orders — so `viewAllJudgements` is already the reasoned slice.

**What is still not reached: the documents.** The result POST
(`viewJudgementDetails`, fields `project` / `firm` / `orderDate` / `btn1`) returns
an identical 35,753-byte shell for an empty search and for a date search in two
formats — three attempts, all the same byte count, so the search is not being
satisfied by the field combination I am sending. **Stopping there rather than
guessing more field values**, which is the same threshold this file applied to
Karnataka before and to CCI's three timeouts.

**The next step is now concrete rather than speculative**, and it was not
available before: we hold 11,707 real project/firm identifiers from the
autocomplete, so a session-aware browser can submit the form with a value the
server will actually match, instead of an empty or invented one. That is a
different experiment from the three that have failed, not a fourth repetition.

**A sixth extraction trap, and the reason three passes missed this state:** the
data was in the page the whole time as **inline JavaScript object literals**. No
`<tr>`, no `<table>`, no `.pdf` href — every HTML-shaped check returns zero and
every one of them is technically correct. When a page is megabytes large and
reports no rows, the next question is what those megabytes *are*.

---

## RAJASTHAN REAT — the only source in this matrix that publishes a disposal outcome

Found by checking the *tribunal's* host rather than the authority's, after
`rera.rajasthan.gov.in` had already been written off as an unreachable SPA.

```
reat.rajasthan.gov.in/efile/Website/Judgment    HTTP 200  1,201,018 bytes    750 judgments
reat.rajasthan.gov.in/efile/Website/OrderList   HTTP 200 16,104,086 bytes  11,523 orders
```

**The site pre-segments reasoned from procedural**, the way Chhattisgarh does and
Delhi does not: `Judgment` is 750 final appeal decisions, `OrderList` is 11,523
orders over the same appeals. The reasoned count is therefore a listing fact, not
an inference.

Columns: serial, appeal number, appellant, respondent, decision date, **outcome**,
document. No other state in this matrix publishes the outcome. Distribution:
Dismissed 187 · Disposed 89 · "Appeal is dismissed" 79 · "Disposed of" 70 ·
Allowed 66 · Closed 42 · Final Disposal 17 · "Appeal has been allowed" 13 ·
"disposed of as withdrawn" 13 · "Dismissed as Withdrawn" 11. The values are free
text with obvious synonym clusters — normalise before using it as a field, but
the signal is genuinely there.

Years: 2017 1 · 2018 1 · 2021 28 · 2022 67 · 2023 61 · 2024 181 · 2025 247 ·
2026 164 — growing, and current.

**Digital text on 4/4 samples**: 575, 32,836, 11,167 and 23,946 characters. The
575-character one is a three-appeal bundle header page; the rest are full
reasoned judgments. No OCR needed.

**Two traps, both of which return zero from a careless regex.** The `href` is
**unquoted** (`href=../Upload/Proceeding/Orders/adb5ae3.pdf`) — a
`href="..."`-shaped match finds nothing. And `../` resolves against
`/efile/Website/`, so the document lives at `/efile/Upload/…`; stripping the
`../` naively gives a 404 that looks like a dead link.

---

## JHARKHAND, GOA, UTTAR PRADESH — three small states, and one of them is the best-quality source found

**Jharkhand is the highest-quality-per-document source in this matrix.**
`/Home/judgement_order` renders 228 rows and **the site classifies every one of
them**: 218 `Judgement`, 10 `Order`, with the forum named too — Chairman 145,
Authority 33, Adjudicating Officer 32, Member 18. No procedural bucket is
published at all. Documents come from `/FirstLevel/ViewDocument/<numeric-id>`,
and the sampled one is a **9-page, 10,222-character digital-text reasoned
judgment** opening *"Before Adjudicating Officer … Complaint Case No.- 15/2018"*.
Small, but 100% reasoned, 100% digital, and pre-labelled — the opposite profile
to Punjab's 5,067 scanned unclassified documents. **Ranked by useful reasoned
decisions per unit of work, Jharkhand beats several states with twenty times its
volume.**

**Goa** publishes 173 adjudicating-matter orders at `/ComplaintOrderDetails`,
each linked as `/ComplaintOrder?IMG_PATH=<opaque token>`. The token is supplied
in the listing, so there is nothing to decrypt and no session to hold — but a
link regex looking for `.pdf` finds seven boilerplate files and concludes the
page is empty, which is how this state would be missed. The sampled document is
**scanned: 7 characters over 7 pages.** A separate
`/OrdersOfHighCourtOfBombayAtGoa` route exists and was not measured.

**Uttar Pradesh has published exactly 8 judgements**, and that is the whole
answer rather than a sampling limit. `JudgementView` renders an empty
`tbljudgementlist`; its own inline script names the endpoint —

```
POST https://up-rera.in/WebService1.asmx/loadjudgement
Content-Type: application/json    body: {}
→ HTTP 200, 5,444 bytes, the entire table
```

Eight rows, richly described (complaint number, complainant, promoter, project,
bench, date) and documents at `ViewDocument?Param=<file>.pdf`. **The sampled PDF
is 4.6 MB over 20 pages and yields 55 characters** — scanned. Recorded as a
definite negative so nobody spends another pass on it: UP is not a hidden large
source, it is a genuinely tiny published set.

The general lesson from all three: **an empty-looking table is usually one
unparameterised AJAX call away**, and the call is named in the page's own script.
That is the check Karnataka still needs and has not had — three approaches were
tried there and reading `site.js`/inline handlers for the endpoint name was not
one of them.

---

## ONE SOURCE REJECTED — `hprera.in` IS NOT HIMACHAL PRADESH RERA

`hprera.in` returns HTTP 200 and reads like an authority site. It is a WordPress
blog: its own link graph contains `/category/home-loans/`, `/hello-world/`,
`/editorial-policy/` and a comments feed. It is an affiliate/SEO site occupying a
plausible domain, and **it must not enter the registry as an official source.**

Recorded because the failure is reusable: for a government source, a 200 and a
convincing name are not identity. The check that caught it took one command —
list the site's own internal links and look for a route no regulator would have.

---

## WHAT THIS MATRIX STILL DOES NOT DO

- **No projection across untested states.** Seven measured, 20+ unmeasured.
  Multiplying is the fabricated-number pattern `TRIBUNAL_ACQUISITION_MEASUREMENT.md`
  §3b already named for CAT.
- **No harvester and no schema decision.** All of these are regulator/tribunal-
  shaped, not court-judgment-shaped: they route to `legal_document`, never to
  `judgments`, per NEW2's `services/ingest/src/tribunal-routing.ts` (bus 0637).
- **No licence resolution.** Every state above is OPEN under `FQ-CCI-PERMISSION`.
  Measuring a public listing with `curl` is not acquisition, and nothing here
  authorises a fetch.
- **No update-mechanism characterisation** for any state except Maharashtra. No
  re-fetch-and-diff has been run, so "how fresh does this stay" is unanswered
  everywhere else — and after NEW2's AWS finding (5 documents in 4 days), that is
  the field that decides whether a source is worth a recurring job or a one-off.
