# TRIBUNAL ACQUISITION — MEASUREMENT, NOT ACQUISITION

**Owner: NEW2 (ingestion lane), Track C.** Written 17 August 2026, during the
post-migration write freeze, when no worker of any lane is permitted to write.

**Nothing in this document has been ingested.** Every figure below came from a
read-only HTTP request made by hand. The mission's rule for Track C is *measure
volume first, then ingest only if additive and authorized* — this file is the
first half of that sentence, and it deliberately stops there.

It exists because two of NEW3's source rows (bus 0567) were left at "search
mechanism proven, final document fetch still open", and the open half is
answerable in a few requests. Both are now closed. What is **not** closed is
authorization, and for CCI that is a genuine finding rather than a formality.

---

## 1. WHAT WAS ACTUALLY MEASURED

| source | listing reachable | bulk-enumerable | document fetch | volume |
| --- | --- | --- | --- | --- |
| **CCI** antitrust orders | yes | **yes** — one server-side paginated endpoint | **yes**, direct PDF | **1,231 orders** (exact, from the endpoint's own `recordsTotal`) |
| **CAT** final orders | yes | **yes** — bench × date range | **yes**, direct PDF | not a single number; see §3 |

Both were reached without a CAPTCHA, without an account, and without
circumventing any access control. NEW3's no-CAPTCHA finding reproduces.

---

## 2. CCI — THE JS DOWNLOAD HANDLER IS NOT A BARRIER

NEW3 reported the order link as `javascript:void(0)` with three failed download
attempts, and read that as the remaining blocker. It is not one. The listing
endpoint returns the file path as data, and the path resolves directly.

**Listing.** `POST https://www.cci.gov.in/antitrust/orders/list` — a DataTables
server-side endpoint. It requires the full DataTables payload (`draw`, `start`,
`length`, and a `columns[i][data]`/`columns[i][name]` pair for every one of the
seven columns) plus the page's `X-CSRF-TOKEN`. A partial payload returns
`{"message":"Server Error"}` with HTTP 500 — which is what a caller who assumed
a simple JSON API would see, and would misread as a block.

Columns: `DT_RowIndex`, `case_no`, `description`, `type`, `main_order_date`,
`order_date`, `files`.

**Measured response:** `recordsTotal: 1231`. That is the site's own count of
antitrust orders, not an estimate from paging.

**Document.** Each row carries `file_content`, an HTML-escaped JSON array:

```json
[{"title":"Order","file_name":"images/antitrustorder/en/order1786424060.pdf","file_size":"171.29"}]
```

Prefixing `https://www.cci.gov.in/` to `file_name` fetches the PDF directly:
**HTTP 200, 171,290 bytes, `application/pdf`** — and `file_size` in the row
("171.29" KB) matches the bytes returned, so the listing can be trusted to
predict the fetch. No JS handler, no session beyond the CSRF token, one request
per document.

**Scope note.** 1,231 is the *antitrust orders* collection only. `/combination/orders`,
`/orders` and `/antitrust/order` all return 404 — combination orders are not
published under a parallel path, and the site map exposes exactly one orders
listing. Do not assume a second tranche exists without finding its URL.

### 2b. CCI's copyright policy is the real open item

`https://www.cci.gov.in/contents/copyright`, quoted verbatim:

> "Material featured on Competition Commission of India (CCI) may be reproduced
> free of charge after taking proper permission by sending a mail to us."

Reproduction is free but **conditioned on prior written permission by email**,
plus accurate reproduction, no derogatory or misleading use, and prominent
acknowledgement of source.

There is a serious argument that this does not bind us for the orders
themselves: CCI is a quasi-judicial authority, its orders are orders of a
tribunal, and Copyright Act **s. 52(1)(q)(iv)** exempts "any judgment or order
of a court, tribunal or other judicial authority" — the same provision
`CLAUDE.md` §6 relies on for judgments, which does not distinguish commercial
use. On that reading the site policy governs CCI's *own* publications (market
studies, annual reports, page design) and not its adjudicatory output.

**That argument is not mine to accept.** `CLAUDE.md` §6a is explicit that
sources not among BharatLaw / Supreme AI / eCourts "remain subject to the normal
provenance/authorization process", and the difference between a site-wide policy
and a statutory exemption is exactly the kind of question this lane is forbidden
to settle alone. **Filed to `docs/FOUNDER_QUEUE.md` as FQ-CCI-PERMISSION.** The
permission it asks for costs one email, which is why it is worth asking rather
than reasoning around.

Until that returns: **measured, not harvested.**

---

## 3. CAT — DATE-ENUMERABLE, AND THAT IS THE WHOLE FINDING

NEW3 reached `case_status_advance.php` and stopped before a completed query,
noting the framework exposes no ARIA roles so `agent-browser` ref-clicks fail.
That is true of the *advanced search* page and it made the source look
case-at-a-time — a shape that would need a case-number sweep to enumerate and
would not be worth the requests.

It is not that shape. `final_order.php` carries four search panels — Case No.,
Diary No., Advocate Name, and **Datewise Order** — and the datewise panel is
backed by a plain GET, discovered in the page's own JavaScript:

```
GET https://cis.cgat.gov.in/catlive/fiorder_detail.php
      ?benchCode3=<bench>&from_date=DD/MM/YYYY&to_date=DD/MM/YYYY&id=partynamewise
```

No CSRF token, no POST, no CAPTCHA, no session requirement beyond an ordinary
cookie jar. **Bench × date range is a complete enumeration key.**

**Verified by execution.** `benchCode3=100` (Delhi), 01/07/2026–31/07/2026:
HTTP 200, **15 final orders**, each row carrying case number
(e.g. `O.A./1160/2017`), both party names, the order date, and a PDF link.

**Document.** The link is `./pdf/judge.php?file=<base64>`, where the base64
decodes to an internal path. Fetching it as given returns **HTTP 200, 340,312
bytes, `application/pdf`, 14 pages** — a real reasoned final order, not a stub.

**42 benches** are listed with numeric codes (Agartala 41, Delhi 100, Mumbai 210,
Chennai 310, …). `causelist.php` and `daily_order.php` take the same shape:
`causelist.php` posts `from_list_date` + bench, and both are date-driven rather
than case-driven.

**A caution on reading HTTP status here.** `final_order.php` and
`daily_order.php` both return **HTTP 500** while serving a complete, usable
page (38.7 KB and 39.3 KB respectively) — PHP notices reaching the response
without stopping it. A harvester that gates on `status === 200` will conclude
this source is down while it is serving. Gate on parsed row count, never on
status alone.

### 3b. What CAT is worth, and to which track

CAT is not a Track C footnote. Its three surfaces map onto Track B, the live
judicial state stream, more cleanly than onto the historical corpus:

- `causelist.php` → listings, by bench and date, forward-looking
- `daily_order.php` → interim orders, the freshness signal
- `fiorder_detail.php` → final orders, the citable documents

Service-law matters against the Union and its instrumentalities go to CAT and
not to a High Court writ bench at first instance, so this is a category the
corpus holds **zero** of today, and one that a large share of practising
advocates appear in weekly. Volume is deliberately not projected here: 15 orders
for one bench in one month is one observation, and multiplying it by 42 benches
and a decade would be a fabricated number wearing a measurement's clothes. The
enumeration key is proven; the count comes from running it.

### 3c. Authorization posture

The footer states: "This site is designed, developed & hosted by National
Informatics Centre, Government of India and Content owned by CENTRAL
ADMINISTRATIVE TRIBUNAL." No copyright policy, terms-of-use page, or reuse
restriction was found on the site; a Disclaimer link exists in the footer whose
text was not retrievable in this pass.

CAT is a tribunal and its final orders sit squarely inside s. 52(1)(q)(iv).
**The absence of a restriction is not the same as a grant, and the disclaimer
was not read.** Recorded here as unresolved and folded into the same founder
queue item. Read the disclaimer before any harvest.

---

## 3d. RERA MAHARASHTRA — CLOSED THE SAME WAY, 49,167 RECORDS IN ONE CALL

NEW3 (bus 0609) piloted `mahareat.maharashtra.gov.in` and left it at the same
place CCI was: listing proven, document link a JS button, no total count. Their
suggested next step was the right one — find the listing endpoint rather than
click more — and it is an Angular SPA, so the endpoint is in the bundle.

**Listing.** `main.<hash>.js` carries `apiUrl="https://mahareat.maharashtra.gov.in:8085"`
and the call `getJudgementBySubjectPublic`:

```
POST https://mahareat.maharashtra.gov.in:8085/api/Public/Getjudgment_orderBySubjectDate
Content-Type: application/json
{"_subject":"","_fromdate":null,"_todate":null}
```

No token, no CSRF, no session — `/api/authenticate` exists but this endpoint
does not need it. An empty subject with null dates returns **the entire corpus in
a single response: HTTP 200, 33,219,102 bytes, 49,167 records.** Not paginated,
not throttled, one request.

**Composition, and it is the whole story of this source:**

| `judgment_order_type` | records |
| --- | --- |
| Roznama (+ whitespace variants) | **41,791** |
| Order (+ variant) | 5,693 |
| Judgement (+ variant) | 1,482 |
| Operative Part in Appeal / Application | 201 |

**85% is Roznama** — the daily order sheet recording what happened on a date, not
a reasoned decision. **The reasoned population is ~7,376, 15% of the records.**
This is the judgment-share caveat measured directly rather than estimated, and
it is why "49,167 documents" must never be reported as the value of this source.

**RERA is, as it happens, the only source in this project where that ratio is
actually known.** For the AWS High Court corpus it is not: the one labelled
measurement (`docs/HC_ORDER_TYPES.json`) covers 6.3% of the corpus on a file
variant disjoint from the rest, and its own tool forbids quoting it corpus-wide.
The reason it is knowable here is that RERA publishes the document type as a
field, and the reason it is unknown there is that the plain High Court files do
not carry one. **That is an argument for ingesting a labelled source, not just a
caveat about this one.**

By year: 209 (2018), 587, 545, 1,253, 1,616, 5,760, 8,919, **19,856 (2025)**,
10,422 (2026 part-year). Live and current, as NEW3 found.

**Document fetch — a second service on a third port:**

```
POST https://mahareat.maharashtra.gov.in:8765/maha-rera-dms-service/batch-job/downloadDocumentV2
{"fileName":"<doc_name>","documentId":"<doc_path>"}
```

Verified: **HTTP 200, 519,212 bytes, `application/pdf`**, against a row declaring
`doc_size_kb: 507`. The listing predicts the fetch here too.

### 3d-i. A correction I made to myself before it left this file

The first document I fetched extracted **1 character** with `pdftotext` — a pure
scan, `/XObject /Subtype /Image`, 2551×3454, no text layer. I was about to record
"RERA requires OCR on every document", which would have set this source's cost
an order of magnitude too high.

**I sampled six more across all three types first, and it is false:**

| type | document | bytes | extracted chars |
| --- | --- | --- | --- |
| Judgement | `4119.pdf` | 207,223 | 4,743 |
| Judgement | `52632-753-776-803-807_order.pdf` | 10,275,828 | 49,346 |
| Order | `3918.pdf` | 591,047 | 2,395 |
| Order | `Image_130.pdf` | 1,209,140 | 6,311 |
| Roznama | `53198.pdf` | 480,564 | 1,255 |
| Roznama | `31669-31698.pdf` | 667,105 | 1,391 |

Six of seven carry a real text layer. **The corpus is mixed, and one scan in
seven is a sample of seven, not a rate** — it is enough to say OCR fallback is
required and not enough to say how often. The honest number needs a proper
sample, and the detector for deciding per-document already exists in
`services/ingest/src/text-corruption.ts`.

### 3d-ii. Authorization, unresolved

Not checked this pass, and therefore not claimed either way. RERA appellate
tribunals are tribunals, so the s. 52(1)(q)(iv) argument in §2b applies to them
in the same terms — and it is the same argument that is not mine to accept.
**Folded into FQ-CCI-PERMISSION**, which asks for one ruling covering tribunal
and regulator orders generally rather than one per source. That framing is now
carrying its third source, which is the point of framing it that way.

**Nothing ingested. 49,167 records were counted, seven documents were fetched to
test extraction, and they are in the scratchpad, not the database.**

---

## 4. WHAT DOES NOT FOLLOW FROM THIS

- **No schema decision is made here.** Both sources are regulator/tribunal-shaped,
  not court-judgment-shaped: CCI rows carry a section citation
  (`Anti-trust Section 19 (1) (a)`) and a category id where a judgment carries a
  bench and a neutral citation. Forcing them into `judgments` is the failure the
  mission names explicitly. The generic legal-document layer is a design task,
  and it is not started.
- **No harvester is written.** Two proven request shapes are recorded above so
  that whoever writes one does not rediscover them, and so the CCI 500 and the
  CAT 500 are not each misdiagnosed a second time.
- **Nothing is queued into the fleet.** The freeze is on; `STOP` is present;
  every figure above came from `curl`, and not one of them touched the database.

---

## 5. STATE

| | |
| --- | --- |
| CCI listing mechanism | **CLOSED** — proven, exact count 1,231 |
| CCI document fetch | **CLOSED** — direct PDF, NEW3's open item resolved |
| CCI authorization | **OPEN** — FQ-CCI-PERMISSION, one email |
| CAT listing mechanism | **CLOSED** — bench × date, proven by execution |
| CAT document fetch | **CLOSED** — direct PDF, 14 pages, NEW3's open item resolved |
| CAT authorization | **OPEN** — disclaimer unread, no restriction found |
| RERA Maharashtra listing | **CLOSED** — 49,167 records in one unauthenticated call |
| RERA Maharashtra document fetch | **CLOSED** — direct PDF via the DMS service |
| RERA text quality | **MEASURED, NOT SETTLED** — 6 of 7 sampled carry text; OCR fallback needed at an unknown rate |
| RERA authorization | **OPEN** — folded into FQ-CCI-PERMISSION |
| ingestion | **NOT STARTED**, and correctly so |

**Reasoned-decision counts, which are the numbers that matter:** CCI 1,231 ·
CAT unprojected (key proven, count comes from running it) · RERA Maharashtra
~7,376 of 49,167. RERA has 27+ sibling state tribunals with no central
repository, so the Maharashtra request shapes above are worth more than the
Maharashtra documents.
