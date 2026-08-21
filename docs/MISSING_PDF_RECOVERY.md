# MISSING-PDF SOURCE RECOVERY — where a document exists when AWS does not have it

**NEW3, 18 Aug 2026.** Opened in response to NEW2's bus 0669: the
`hc_ingest_ledger` is live and has recorded **23,592 failure rows**, of which
**22,983 are `pdf_missing`** — metadata exists in the parquet, the PDF is not in
the bucket. Worst single population: **Bombay 2023, 15,845 documents**, then
Bombay 2024 (4,548) and Allahabad 2024 (2,578).

NEW2 owns "is it really absent" — `scripts/migration/new2-ledger-absence-probe.mjs`
already answers that with a HEAD per row, splitting `pdf_absent` (404/403/410)
from `pdf_unavailable` (everything else). **This file answers the next question
and only that one: when a document is genuinely absent from AWS, which authorized
source holds it, and what does getting it back cost.**

The standing rule this exists to enforce: **missing from one object store is not
evidence the judgment does not exist.**

---

## 0 · THE ANSWER, MEASURED

**Indian Kanoon holds 325,674 Bombay High Court 2023 documents.** Verified 18 Aug
by direct query against the live index:

```
GET https://indiankanoon.org/search/?formInput=doctypes:bombay fromdate:1-1-2023 todate:31-12-2023
HTTP 200 · "1 - 10 of 325674"
```

Against 15,845 missing, that is a **20.6× superset**. The recovery source exists,
is already authorized (founder-confirmed written authorization, separate paid
licence, permitted extraction/RAG/training use — `FOUNDER_QUEUE.md`
FQ-IK-RESOLVED), and has a documented endpoint for exactly this act:
**`/origdoc/<id>` returns the court's own copy** (`docs/DATA_SOURCES.md` §2).

**This is the one case where paying Indian Kanoon for a full document is
correct**, and it is a deliberate, narrow exception to the rule
`INDIANKANOON_WORK_QUEUE.md` opens with:

> *"No full-document fetch from IndianKanoon is queued below, and none should be
> — it would duplicate a free source for money."*

That rule is right and it stays. It does not apply here for a factual reason:
**for these 22,983 documents AWS is not a free source, because the document is
not there.** There is nothing to duplicate. Every other row in that queue remains
metadata-class.

---

## 1 · THE RECOVERY HIERARCHY, AND WHERE EACH RUNG ACTUALLY STANDS TODAY

| rung | source | status, 18 Aug 2026 | usable for this act? |
| --- | --- | --- | --- |
| 1 | **Same-court official archive** — `bombayhighcourt.nic.in` | **UNREACHABLE from this network.** `164.100.229.168:443` and `:80` both time out at 21s, three attempts. Not "down" and not "blocked" — undetermined, and not resolvable from here. | **UNKNOWN** — retest from a different network before concluding anything |
| 2 | **eCourts** — `judgments.ecourts.gov.in/pdfsearch/index.php` | Live, HTTP 200, and **CAPTCHA-gated** (`app_token` + `captcha` fields confirmed in the form markup this session) | **NO — and this is a boundary, not an obstacle.** See §2 |
| 3 | **Indian Kanoon API** — `/search`, `/doc/<id>`, `/origdoc/<id>` | Authorized, paid, priced, and the index is confirmed to hold the population | **YES — the recommended path** |
| 4 | Supreme Today AI | access imminent, not yet held | later, and only if IK misses |
| 5 | Bharat.Law / NyaI | licensed for hard-case teacher structures, not bulk document recovery | **no** — wrong instrument |

---

## 2 · WHY eCOURTS IS NOT THE ANSWER HERE, EVEN THOUGH WE HOLD A GRANT

This needs stating precisely, because the surface reading points the other way:
we have a written registrar authorisation, it expressly permits CAPTCHA bypass,
and eCourts obviously has Bombay HC judgments.

**The grant's permission to bypass is scoped to bulk cause-list harvesting**, in
one named module (`services/api/src/court/ecourts.ts`), and `CLAUDE.md` §6 says
why in terms that apply directly to this proposal:

> *"Tier 3 per-citation confirmation and bulk cause-list harvesting are different
> acts under different parts of the grant, and collapsing them is how a bounded
> permission becomes an unbounded one."*

Recovering 22,983 missing judgment PDFs is a third act, and it is neither of
those two. It is not per-citation confirmation and it is not a cause list.
**Reading the grant as covering it would be exactly the collapse the rule
forbids** — and it would put the most valuable authorisation this project holds
at risk to save roughly $130.

**So: eCourts is ruled out for missing-PDF recovery on the current grant text.**
If the founder wants it, the honest route is to ask the registrar whether the
grant extends to retrieving judgment copies already published as open data —
**not** to reinterpret the existing wording. Queued as such, not decided here.

---

## 3 · THE COST, AND THE DESIGN THAT MAKES IT SMALL

Naive pricing, from `docs/DATA_SOURCES.md` §2 (search ₹0.50 · document ₹0.20 ·
fragment ₹0.05):

| population | naive cost (search + document per row) |
| --- | --- |
| Bombay 2023 (15,845) | ₹11,092 ≈ **$133** |
| whole `pdf_missing` ledger (22,983) | ₹16,088 ≈ **$193** |

Affordable — and still the wrong thing to do, for the reason `DATASETS.md`
already measured about this corpus: **most High Court documents are procedural
orders**, text averaging 2,223 characters, *"found and never cited"*. Paying to
recover 22,983 documents most of which nobody will ever cite is buying the
procedural chaff back at a price, having got it free the first time.

**The cheap triage, and it falls out of the search response itself.** Indian
Kanoon's search results carry `cites` and `citedby` per hit — verified in the
live response this session:

```json
{"title": "Phonographic Performance Ltd vs Tata Starbucks And 2 Ors on 4 August, 2023",
 "court": "Bombay High Court", "author": "R I Chagla", "cites": 3, "citedby": 353}
```

Ten results per search at ₹0.50 is **₹0.05 per document triaged** — the same
price as a fragment, for a field that answers "will anyone ever cite this".

```
triage the entire Bombay 2023 population   15,845 ÷ 10 × ₹0.50  =    ₹792  ≈ $9.50
triage the entire pdf_missing ledger       22,983 ÷ 10 × ₹0.50  =  ₹1,150  ≈ $14
then fetch ONLY citedby > 0, at ₹0.20 each                          (unknown until triaged)
```

**Recommendation: triage first, recover selectively, and never bulk-recover.**
$14 buys the decision for the whole ledger. The recovery spend after that is
sized by evidence rather than by row count, and the rows that lose are exactly
the rows the corpus was never going to use.

**Second recommendation, and it costs nothing: make recovery demand-triggered as
well.** A `pdf_missing` row that an advocate's query actually reaches is worth
₹0.70 on the spot, whatever its `citedby`. That is the same economics as Tier 2
verification — pay once, cache forever — and it needs no budget decision, only a
code path.

---

## 4 · WHAT WOULD CHANGE THIS ANSWER, AND WHO OWNS EACH CHECK

- **NEW2 — how many of the 22,983 are genuinely absent?** The absence probe is
  written and is theirs. Every `pdf_unavailable` row that resolves on retry
  leaves this program entirely and costs nothing. The recovery population is
  `pdf_absent`, not `pdf_missing`, and today only 1 row has been promoted
  permanent. **No spend should be authorized against 22,983 — it is the wrong
  denominator and it will shrink.**
- **NEW2 — can the mobile variant classify them for free?** `metadata-mobile.parquet`
  carries `order_type` and `is_final`, which is the triage field IK would be paid
  for. **Caveat measured, not assumed:** plain and mobile share **zero** CNRs and
  zero `pdf_link`s (`COVERAGE_FRONTIER_17AUG.md` §0a, corroborating
  `hc-ordertype-cli.ts`), so this works only if the missing rows are themselves
  mobile-variant rows. Worth one query before paying anyone: if they are, the
  ₹1,150 triage becomes ₹0.
- **Rung 1 — retest `bombayhighcourt.nic.in` from a different network.** If the
  court's own archive is reachable and serves by case number, the entire cost
  above goes to zero for Bombay, which is 87% of the ledger's worst two rows.
  This is the single highest-leverage unknown in this file and it is a five-minute
  check from anywhere else.
- **Whether an AWS metadata row can be mapped to an IK document without a
  search.** If a title+date match is reliable enough to skip the ₹0.50, per-row
  cost falls from ₹0.70 to ₹0.20. Untested — it needs the API token, which is not
  configured (`INDIANKANOON_API_TOKEN` / `INDIANKANOON_BUDGET_PAISE`;
  `services/ingest/src/harvest/indiankanoon.ts` refuses honestly without them).

---

## 5 · WHAT THIS FILE DOES NOT CLAIM

- **It does not claim the 15,845 are recoverable.** It claims Indian Kanoon's
  index holds 325,674 Bombay HC 2023 documents, which is a superset by count.
  Whether any *specific* missing document is among them is unverified, and the
  first thing a triage run measures is the hit rate — not the price.
- **It authorises no spend.** Scope and budget ceiling for the Indian Kanoon
  licence are still GUESS, not KNOW (`FQ-IK-RESOLVED`), and this queue inherits
  that.
- **It did not use the public site as a data source.** The two queries above were
  reachability and volume checks. The founder's authorization is for the API;
  routing bulk work around it through the public site would be using the source
  outside the agreement, and the licence is worth more than the saving.
- **It does not re-open the eCourts grant.** §2 records the boundary as it is
  written today and routes the question to the founder rather than resolving it.
