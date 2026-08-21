# R2 SOURCE RETENTION MATRIX — every acquisition source, classified by whether raw copies belong on R2

**NEW3, 15 Aug 2026, per the founder's Railway-exit / cost-aware acquisition
directive.** This is a different question from `docs/STORAGE_AUDIT.md` and
`docs/CORPUS_TIERING.md`, both LCC's, and does not duplicate either:

- `STORAGE_AUDIT.md` asks *what is already in Postgres and can it move* —
  table-level, existing rows.
- `CORPUS_TIERING.md` asks *how to serve 19.5M judgments without storing
  full-precision vectors for all of them* — the hot/warm/cold design for
  content LawMind has already decided to hold.
- **This file asks a question upstream of both: for each SOURCE this lane has
  found, does LawMind need to keep a raw copy of what it fetched from that
  source at all, and if so, where.** Get this wrong and NEW2 either pays R2
  storage for something re-fetchable for free forever, or has no fallback the
  day an official Indian government domain goes dark — which, in this
  corpus's own research history, is not a hypothetical.

**Nothing here is a new acquisition decision.** Classifying a source
`RETAIN` does not authorize fetching it — `CLAUDE.md` §6a and
`docs/AUTHORIZED_SOURCE_MAP.md` still govern that. This is retention policy
for sources that are either already authorized or become authorized later.

---

## 0 · The one correction to the mission's own stated default

The mission brief's default is: *"if an official source already reliably
stores the raw object, default assumption is PROCESS IN PLACE / RETAIN
DERIVED DATA."* **That default does not hold for Indian government sources,
measured against this lane's own fetch history, and treating it as reliable
would be an evidence-free assumption in a document whose whole job is to not
make those.**

Confirmed instances of official `.gov.in`-class domains being unreachable or
blocking this session's tooling, each independently found while researching
something else:

| domain | what happened | source |
| --- | --- | --- |
| `sci.gov.in` (main/www) | ECT's own PDF links are **dead** — the Court's own site does not serve them; recovered only via an Internet Archive mirror | `SOURCE_REGISTRY.md` §5a |
| `indiacode.nic.in` | **403 on both the handle page and the bitstream PDF**, three separate confirmed instances this session | `CORPUS_ACQUISITION_QUEUE.md` STATUTE_QUEUE |
| `data.gov.in` | 403 on direct fetch of the judiciary sector page | `SOURCE_REGISTRY.md` §5g |

**Three-for-three is a pattern, not noise.** The Constitution PDF was only
recoverable because a *different* official domain
(`cdnbbsr.s3waas.gov.in`) happened to mirror the same document. That is
luck, not a property of the source.

**Revised default for this corpus: a document fetched from an Indian
government domain that is not already a stable, mirrored, CDN-backed bucket
(AWS Open Data, archive.org) is retained on first successful fetch, not
re-fetched on demand.** The storage cost of a PDF or a parsed table is
trivial next to the cost of losing the only working copy to the next 403.
This reverses the mission's stated default but the reversal is evidenced,
not asserted — see §0's table.

**Where the default still holds, correctly:** AWS Open Data
(`s3://indian-high-court-judgments` + SC bucket) and archive.org mirrors are
themselves the reliability layer — a CDN and a purpose-built permanence
archive, not a single government webserver. Those genuinely do not need
duplication.

---

## 1 · THE MATRIX

| source | class | document count / size | why |
| --- | --- | --- | --- |
| **AWS Open Data** (`indian-high-court-judgments` + SC bucket) | **RE-FETCHABLE / DO NOT DUPLICATE** | 20.53M docs, updates daily | Already a CDN, already paid for by AWS Open Data Sponsorship, CC-BY-4.0. `CORPUS_TIERING.md` §3 already states the operating principle: *"we store a key, not a file."* Storing PDFs here would be paying to duplicate a bucket that is more durable than R2 |
| **archive.org gazette mirror** (`collection:gazetteofindia`) | **RE-FETCHABLE / DO NOT DUPLICATE** | 171,942 central + 805,433 incl. state, current to ~3 days | Internet Archive is itself built for permanence; its uptime record is better than the government portal it mirrors (`egazette.gov.in`). Fetch on demand once licence clears — no reason to pre-copy 805K PDFs onto R2 for a source that already outperforms R2's own durability class |
| **Digital Library of India colonial reports** (archive.org, `digitallibraryindia`) | **RE-FETCHABLE / DO NOT DUPLICATE** | 1,676 law-tagged items, 571 direct hits | Same reasoning — archive.org hosts the permanent copy. Blocked on OD-13 (raw-text-vs-reporter question), not a retention question |
| **Supreme Court Equivalent Citation Table** (fetched via Internet Archive, since `sci.gov.in`'s own links are dead) | **ARCHIVAL / RETAIN** | 4 PDFs, ~12 MB, 235,807 parsed pairs | The primary domain's own links are already dead — this is the §0 pattern realised, not hypothesized. The only reason this source is usable at all today is that a copy was taken before/outside the Court's own dead links. Re-fetching later risks the IA mirror itself changing or the item being removed. **Retain the 4 PDFs and the parsed table once the licence question clears** — currently held outside the repo tree deliberately (`SOURCE_REGISTRY.md` §5a), correctly, pending that clearance, but the retention *policy* should be decided now so NEW2 doesn't have to re-derive it under time pressure |
| **BPRD BNS/BNSS/BSA↔IPC/CrPC/IEA mapping PDFs** (`bprd.nic.in`) | **ARCHIVAL / RETAIN** | 3 PDFs, ~4KB–700KB each | Same government-domain fragility class as §0, trivial storage cost. LCC already has copies for parsing (`SOURCE_REGISTRY.md` §5f); the recommendation is simply: keep them, do not treat `bprd.nic.in` as a source to re-hit if the parser needs a second pass |
| **The Constitution of India** (`cdnbbsr.s3waas.gov.in`) | **ARCHIVAL / RETAIN** | 1 PDF, ~850KB | Only reachable because a second government CDN happened to mirror what the primary domain (`indiacode.nic.in`) 403'd. Retain the working copy — re-resolving "which government mirror works today" is not a task worth repeating for an 850KB file |
| **Supreme Today** (= Supreme AI, §6a-authorized, one canonical provider identity per the founder's 16 Aug ruling — `AUTHORIZED_SOURCE_MAP.md` §2-RESOLVED; blocked on account) | **LICENSED PROVIDER SNAPSHOT / RETAIN IF PERMITTED** | unknown volume, ₹50,000/mo | `SUPREME_TODAY_LICENCE.md` §"UPDATE" already confirms **retention after cancellation is PERPETUAL — granted** by the founder's own negotiation. This is the one source where "retain if permitted" is already answered: permitted, in writing, from the founder. R2 is the correct home for the editorial layer once harvested — it is licensed content, not re-derivable, and the whole economic case in that doc (*"buying an archive in instalments"*) depends on keeping what was bought. **One row, one provider, one `license_scope`** — "Supreme AI" is a historical alias for auditability, never a second row |
| **BharatLaw** (§6a-authorized, but `extractionPermitted: false` pending consent) | **LICENSED PROVIDER SNAPSHOT / RETAIN IF PERMITTED — currently NOT PERMITTED** | unknown, blocked on FQ-BL1 | Nothing to retain yet. Flagged only so the same "perpetual or not" question gets asked of BharatLaw's consent email before any extraction starts, rather than discovered after the fact the way MISSING_AUTHORITY had to discover eCourts' bypass scope after the fact |
| **eCourts — bulk cause-list harvest** (CAPTCHA-bypass grant, cause lists specifically) | **TEMPORARY / AUTO-EXPIRE** | daily cause lists, per court | A cause list is a schedule for a specific hearing date. Its value is almost entirely time-boxed — once the hearing date passes, the raw page has no further product use beyond what has already been extracted into `hearings`/briefing rows. Retaining the raw HTML/PDF indefinitely on R2 buys nothing the derived rows don't already carry, and the CAPTCHA-bypass grant itself is scoped to bulk *harvesting*, not archival (`CLAUDE.md` §6). Recommend a short TTL (30–90 days, enough to debug an extraction defect against the source) rather than permanent retention |
| **eCourts — Tier 3 per-citation confirmation** | **TEMPORARY / AUTO-EXPIRE (raw), PRIMARY UNIQUE SOURCE (derived fact)** | one CAPTCHA solve per citation | The *fact* produced (`verification_state = verified`, `verified_by_source = ecourts`) is permanent and lives in Postgres — that is the product. The raw eCourts page a human solved a CAPTCHA to see is not independently valuable once the verification fact is written; nothing reads it again. No raw retention needed |
| **DevDataLab district-court records** (ODbL 1.0, not yet cleared) | **TRAINING DATASET / RETAIN IF PERMITTED** | 81.2M records, 2010–2018, metadata not text | If the ODbL share-alike question resolves in LawMind's favour (`SOURCE_REGISTRY.md` §4a — internal use plausibly exempt under §4.5c, not yet confirmed by anyone with authority to say so), this is exactly the shape of dataset worth keeping permanently: static (2010-2018, will not update), not re-derivable from any other held source, and small relative to the corpus (metadata rows, not full text) |
| **Manupatra / SCC Online** | **N/A — no access exists** | — | `VERIFIED_BUT_RESTRICTED`, sales-negotiated seat licences only, no bulk/API path found. Nothing to classify until a licence exists |
| **IndianKanoon** | **N/A — DECLINED** | — | Settled against twice (`FOUNDER_QUEUE.md`, `AUTHORIZED_SOURCE_MAP.md` §4). Not a retention question because it is not an acquisition path |
| **NCLAT / TDSAT** (verified open, no CAPTCHA, not yet founder-cleared) | **ARCHIVAL / RETAIN, once cleared** | small — order-by-order, no bulk index found yet | First-party tribunal sites, not CDN-backed infrastructure. Same fragility class as any single government webserver — retain what is fetched rather than assume the page will still be there for a second pull. Not yet authorized; `CORPUS_ACQUISITION_QUEUE.md` DOCUMENT_QUEUE |
| **State gazette/Act portals** (indiacode state mirror + individual state sites) | **UNKNOWN — needs a per-portal reliability check before classifying** | not yet volume-measured | Structure and uptime not yet confirmed per state (`CORPUS_ACQUISITION_QUEUE.md` SOURCE_QUEUE #3). Given indiacode's own 403 pattern, the working assumption should be ARCHIVAL/RETAIN once any individual state portal is actually fetched — but this is a placeholder, not a measured row |

---

## 2 · THE RULE THIS MATRIX ADDS

> **A source's retention class is not about the source's licence — it is
> about the source's own infrastructure reliability.** A CC-BY-4.0 bucket on
> a CDN (AWS Open Data) and a Government-work PDF on a single `.gov.in`
> webserver (the ECT) can carry similar or better licence terms and still
> deserve opposite retention treatment, because one is built to stay up and
> the other has already gone down once, in this lane's own measured history.

Two failure directions this avoids:

1. **Paying to duplicate a bucket that is already more durable than R2** —
   the AWS Open Data / archive.org rows above.
2. **Assuming "official source" implies "always fetchable," which this
   corpus's own three 403s and one dead-link discovery already
   contradict** — every `.gov.in`-domain row above.

---

## 3 · WHAT THIS DOES NOT DECIDE

- Licence clearance for the ECT, the gazette mirror, tribunals, or DevDataLab
  — all still open in `FOUNDER_QUEUE.md`. Retention class is conditional on
  clearance, not a substitute for it.
- R2 bucket structure, lifecycle-policy syntax, or Cloudflare configuration —
  engineering detail for whoever builds the loader (NEW2/LCC), not this
  lane's territory.
- Anything about the judgment corpus itself already in Postgres —
  `CORPUS_TIERING.md` and `STORAGE_AUDIT.md` own that question and are not
  revisited here.
