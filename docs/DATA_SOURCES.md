# DATA SOURCES — where the law comes from

Researched 7 Aug 2026, against the sources themselves rather than against
summaries of them. Every URL here was fetched; every claim about terms is quoted
from the terms page, not inferred from what a competitor does.

The goal this serves is the founder's, stated plainly: **an advocate should be
able to leave the software they use now.** That needs breadth *and* the ability
to say honestly which parts of it we can stand behind. A source we cannot cite
from is not breadth; it is noise with a search box.

---

## 0 · A correction to `docs/DATASETS.md`

`DATASETS.md` §3b says of IndianKanoon: *"their terms indicate the API is **not**
intended as raw extraction for building a competing database."*

**That is wrong, and it was never checked against the terms page.** The actual
terms contain no such prohibition. What they require is attribution, and they
explicitly contemplate the two uses we care about:

> you must provide clear and conspicuous attribution … when using search results,
> documents, or any of our document classifiers … This applies to direct display,
> **RAG systems, and fine-tuning language models.** The "powered by IKanoon" logo
> must be displayed prominently and never altered, resized or partially covered.

So RAG and fine-tuning are permitted **with attribution**. There is no explicit
ban on caching, storage, redistribution or commercial use. The service is `AS IS`
with no warranty of accuracy — which matters for a verification tier and is
addressed below.

This correction matters because the wrong version was steering us away from the
single largest source of Indian case law on a misreading.

---

## 1 · What we hold today

| | count | source | licence |
|---|---|---|---|
| Supreme Court judgments | 38,341 | AWS Open Data | CC-BY-4.0 |
| Central Acts | 548 → 845 in flight | indiacode.nic.in | Government |
| Statute sections | 24,480 | indiacode.nic.in | Government |
| Citation edges | 192,197 | derived from our own corpus | ours |

---

## 2 · IndianKanoon API — buy it, for verification and for the graph

**Recommendation: yes, purchase. It is the highest-value paid source available,
and it is priced per call rather than per seat.**

Published pricing:

| call | price |
|---|---|
| search | **₹0.50** |
| document | **₹0.20** |
| document fragment | **₹0.05** |

₹500 free on signup. ₹10,000/month free for non-commercial use, which we are not.

Endpoints: `/search`, `/doc/<id>`, `/origdoc/<id>` (the court's own copy),
`/docfragment/<id>`, `/docmeta/<id>`. Search filters include `doctypes`,
`fromdate`/`todate`, `title`, `cite`, `author`, `bench`.

**The reason to buy it is not volume. It is two specific things:**

**a. Tier 2 verification.** `CITATION_HARNESS.md` step 5 needs an independent
cross-reference, and this is it. A citation check costs ₹0.50 + ₹0.20 = **₹0.70**,
and Tier 2 results cache permanently, so each distinct authority is paid for once.
At 5,000 distinct authorities verified in a year that is ₹3,500 — about $42.

**b. `citeList` and `citedbyList`.** `/doc/<id>` returns the documents a judgment
cites and the documents that cite it, up to 50 each via `maxcites` /`maxcitedby`.
**That is a citation graph we currently derive ourselves from text**, and ours
resolves only 44,785 of 192,197 extracted citations because the rest do not match
a judgment we hold. Theirs is drawn from 30M documents.

**Do NOT buy it to bulk-download the corpus.** 30M documents at ₹0.20 is ₹6
crore — about $720,000 — and there is no bulk endpoint, only paginated search. It
is a lookup service, not a dump.

**Two conditions on using it:**

- **Attribution is mandatory and specific.** The "powered by IKanoon" logo,
  prominent, unaltered. That has a design consequence and needs a place in the UI
  before we ship anything drawing on it.
- **`TRAINING_STRATEGY.md` §3b stands: keep anything derived from IndianKanoon
  separable from anything we intend to license.** Permitted-with-attribution for
  our own product is not the same as clean title to resell. The separation costs
  nothing if built in now and is impossible to retrofit.

---

## 3 · Judgments beyond the Supreme Court

### AWS Open Data — High Courts. Free, CC-BY-4.0, and measured.

`s3://indian-high-court-judgments`, 25 courts, **~1.95M documents/year**. Layout
mirrors the Supreme Court bucket except partitioned `year=/court=/bench=`.

Already measured in `DATASETS.md`: **0 of 9,604 metadata rows carry a citation,
and 0 of 30 sampled PDFs carry a neutral citation.** Text averages 2,223
characters for Punjab & Haryana. Most of it is procedural orders.

**Storage is no longer the objection** — `CORPUS_TIERING.md` puts 19.5M judgments
at ~$18/month. **Citability is.** These can be found and never cited.

### The gap that actually matters: neutral citations

The Supreme Court adopted neutral citations (`2024 INSC 123`) and our corpus has
them. High Courts adopted their own (`2024:DHC:1234`) — but **they are not in the
open-data PDFs we sampled**, and not in the metadata at all.

**This is what IndianKanoon fixes.** Their `cite` filter and `docmeta` carry
citations for High Court judgments. So the honest architecture is:

> Ingest High Court text from AWS Open Data (free, bulk, CC-BY).
> Resolve its citation through IndianKanoon (₹0.70 once, cached forever).

Free breadth, paid citability, and only for judgments an advocate actually opens.

### eCourts — free, and already in the harness as Tier 3

`judgments.ecourts.gov.in/pdfsearch/index.php`. Verified 7 Aug: a POST form with
`app_token` and a **CAPTCHA**. No API, no query-string pre-fill. Third-party
scrapers exist; **we do not use them** — `CLAUDE.md` §6 forbids bypassing the
CAPTCHA and that is not negotiable. Our Tier 3 hands the advocate the door.

---

## 4 · IPC ↔ BNS — the mapping, and how to make it safe

`statute_mappings` is **0 rows**, and it is a Sprint 1 DONE criterion. It has been
stuck because indiacode publishes the Acts but **no correspondence table**, and a
wrong section mapping is a wrong answer about which law applies to a client.

**Searching found no Gazette or MHA table.** Everything on the first page of
results is a law blog, a coaching site or an AI tool — precisely the class
`DATASETS.md` forbids: *"never another model's commentary about law."*

**Two government artefacts do exist, and both were fetched and opened:**

| source | what it is | verdict |
|---|---|---|
| [UP Police](https://uppolice.gov.in/site/writereaddata/siteContent/Three%20New%20Major%20Acts/202406281710564823BNS_IPC_Comparative.pdf) | 23-page two-column BNS ↔ IPC table, chapter by chapter, section by section | **the usable one** |
| [BPRD / MHA](https://bprd.nic.in/uploads/pdf/BNS_English_30-04-2024.pdf) | 28-page handbook "highlighting key provisions vis-a-vis IPC" | narrative, not a full mapping |

The UP Police document is a state police force publication, **not the Gazette**.
That is a real caveat and it must not be laundered into "official".

### So do not trust it — check it

The mapping becomes safe because **we can verify every row against primary text we
already hold**:

1. Parse the UP Police table into *candidate* pairs.
2. For each pair, compare the offence text of the BNS section (ours, 358 sections
   from indiacode) against the IPC section (ingestable from indiacode — repealed
   but still published).
3. **Store only pairs whose text corresponds. Flag the rest; never store a guess.**
4. Hand-check 20, as `SPRINT_1.md` requires.

That turns a secondary artefact into something checkable against two primary
sources, and it means every stored mapping has evidence behind it — the same
discipline as the citation graph, where a relationship is only recorded when the
court's own printed annotation justifies it.

---

## 5 · Still missing, in the order an advocate would notice

| gap | source | status |
|---|---|---|
| State Acts | indiacode has state repositories | not investigated |
| Rules, notifications, circulars | ministry sites, no central index | no clean source found |
| Tribunal decisions (NCLT, NCLAT, ITAT, CESTAT) | own portals | not investigated |
| Cause lists | eCourts / NJDG | S3, the daily-loop wedge |
| District court judgments | eCourts | sparse even on IndianKanoon |

**Tribunals are the notable one.** An advocate doing company or tax work lives in
NCLT and ITAT, and neither is in the Supreme Court corpus at all.

---

## 6 · Recommendation

1. **Buy the IndianKanoon API.** Small, usage-priced, and it solves Tier 2 and
   High Court citability at once. Budget ₹5,000 to start; it is not a subscription.
2. **Build the IPC↔BNS mapping** from the UP Police table, verified against both
   bare acts, flagged where it does not check out.
3. **Do not bulk-ingest High Courts yet.** Ingest on demand, cite through
   IndianKanoon, and let usage decide what is worth holding.
4. **Add the attribution surface before anything ships on IndianKanoon data.**
5. **Investigate tribunals next** — the largest gap for a whole class of practice.
