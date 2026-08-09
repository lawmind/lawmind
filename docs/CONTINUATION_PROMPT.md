# LAWMIND — LCC SERVER LANE · CONTINUATION PROMPT

**Written 10 August 2026.** Paste this whole file into a new agent session.

It exists because the previous agent drifted badly over several weeks and the
founder had to stop the work. **§1 is the most important section in this file.**

---

## 0 · WHO YOU ARE AND WHAT YOU MAY TOUCH

You are **LCC, the server lane**. You write **only** `services/**`,
`packages/**`, `packages/db/drizzle/*.sql` migrations, root config, CI, scripts,
`docs/**`.

**RCC owns `apps/**`. Never write a single file there.** They work the same tree
in a separate session.

**Read before any work, in this order:** `PRODUCT_BRIEF.md` → `.ai/README.md` →
`docs/OPEN_DECISIONS.md` → `PRODUCT_DECISIONS.md` → **`docs/CURRENT_PLAN.md` §A
(supersedes §2)** → `docs/SCHEMA_TRUTH.md` → `docs/CITATION_HARNESS.md`.

**Work continuously.** Emitting prose ends your turn — a status update *is* a
stop. Keep calling tools. A key, an account, money, or a founder-only decision
goes into `docs/FOUNDER_QUEUE.md` and the lane **keeps going**.

---

## 1 · READ THIS FIRST: HOW THE PREVIOUS AGENT DRIFTED

The founder stopped work on 9 Aug with: *"You are hallucinating against your own
work… over-engineering and building something that is not really useful."*
**He was right.** The failure mode, so you can avoid it:

The lane spent **weeks** trying to move `success@5` from 17% toward a gate of
**0.70**. When the number would not move, the agent started improving the
*instrument that measured it* — pins, empty passages, eval fixtures, statistical
rigs. All competent. All on the wrong problem. Nine hours of one session moved
the product **zero**.

**The thing nobody checked for weeks:** our eval set uses the **CLERC** method
(arXiv 2406.17186). CLERC's own published ceiling is **48.3% recall@1000**
zero-shot, **41–43%** for dense retrievers *including the BGE we run*, and
**68.5% recall@1K** for a **fine-tuned** LegalBERT DPR. The paper states existing
models *"struggle significantly"*. **`success@5 ≥ 0.70` is a number nobody in the
published literature reaches on this task, at any k.**

### Concrete anti-drift rules, learned the hard way

- Before optimising a metric, **check whether the target is achievable at all.**
  One web search would have saved weeks.
- **Measure the opportunity before building the fix.** Padding-optimisation
  looked promising; five minutes of measurement showed a **1.1% ceiling** and
  killed it.
- **Read the real data before writing a regex.** Every extractor in this repo was
  designed against sampled corpus text, and every one had bugs the samples
  exposed.
- **Your own samples will catch your bugs — look at them.** A concordance
  measurement paired `AIR 1955 SC 807` with `[1998] 3 SCR 280`. Impossible. That
  single glance produced the year guard that made the whole feature safe.
- **Do not scale a total by a row count and call it analysis.** A 274 GB estimate
  was **7× too high** because it scaled Supreme Court judgment length (35 kB)
  when High Court judgments are 6.8 kB.
- **A metric that cannot fail is not a metric.**
  `hallucinationRate: generationReady ? 0 : null` once reported a PASS with no
  model anywhere in the package.

---

## 2 · THE COMPETITOR ANGLE — WHO WE ARE ACTUALLY AGAINST

**The founder has said repeatedly: the main competitor is Supreme Today
("Supreme AI"). They pinpoint citations smoothly.** Everyone else is better in
only a few respects.

| Competitor | What they sell | What it means for us |
| --- | --- | --- |
| **Supreme Today** | High Court + tribunal **headnotes** and **Authority Check treatment** (which case overruled which). ₹50,000/month | **The editorial layer nobody gives away.** Their "pinpointing" is two capabilities: *having* the judgment, and *finding the exact one*. Buy **one month and measure it** — never twelve |
| **Manupatra / SCC Online** | **Boolean, field, citation and faceted search** — party, judge, act, section, court, period, with nesting | **This is what advocates are trained on and what they type.** We had semantic search and four filters. This was the strategic error |
| **Bharat.Law** | AI legal research, Pro ₹1,099/mo | Licence held (see §7). Their treatment data is the only thing of interest |
| **Indian Kanoon** | Free search + metered API | **SETTLED: accounts only, no API.** The budget goes to Supreme Today |

**The market has violently validated the founder's original thesis.** The public
AI-hallucination sanctions tracker records **1,598 court cases** involving
fabricated citations by June 2026, up from ~200 a year earlier — **~8 new cases
per day**, penalties to **$110,204**, two-year suspensions, a Ninth Circuit
six-month suspension, four Mississippi lawyers barred.

**Verified citations are the product. Semantic ranking is not.**

---

## 3 · THE DATA ANGLE — FOUR SOURCES, ONLY ONE IS A CORPUS

| Source | What it is FOR | What it is NOT |
| --- | --- | --- |
| **AWS Open Data** `s3://indian-supreme-court-judgments`, `s3://indian-high-court-judgments` | **The bulk corpus.** ~17.8M judgments, CC-BY-4.0, **free, no account** (`--no-sign-request`), permanent. ~15.9M HC PDFs. Ships **Parquet metadata** | Not live data — a back catalogue |
| **eCourts grant** (7 Aug 2026 → **1 Jan 2029**) | **The daily loop.** Cause lists, case status, court orders, caveat search — *tomorrow's listings*, the wedge feature | **NOT a bulk corpus.** Capped at **1,000 requests/day** — the whole grant yields ~876,000 requests. Harvesting 15.9M judgments this way takes **43 years** |
| **Supreme Today** | Headnotes + treatment for HC and tribunals | **Not raw judgments** (free at 17.8M scale) and **not SC headnotes** (e-SCR gives ~34,000 official ones free) |
| **Bharat.Law** | Competitive research; treatment data | Not a bulk corpus |

### Corpus state, verified against the live database on 10 Aug 2026

```
judgments        38,341   (1950-03-14 .. 2026-07-09)   100% SUPREME COURT
chunks           616,197
citation edges   192,197   resolved 44,785 (23.3%)
aliases          4,097
judge rows       44,360    distinct 277
statute refs     97,806    across 25,466 judgments (66.4%)
statutes         845 acts, 34,928 sections, 0 MAPPINGS
database size    11 GB
overruled_status  none=38,260  set_aside=57  doubted=16  partly_set_aside=8
relationship      cites=178,808 followed=11,723 distinguished=1,517
                  overruled=108 doubted=21 overruled_in_part=20
```

**The coverage fact that matters:** every judgment is Supreme Court. **An
advocate practising in a High Court cannot use us at all.** And 77% of what the
Supreme Court cites does not resolve, because it points at High Court cases we
do not hold.

---

## 4 · RAILWAY AND CLOUDFLARE — THE STORAGE ARCHITECTURE

**Railway bills USED space, not provisioned** — verified in their docs: *"You are
only charged for the amount of storage used by your volumes."* Per GB per
minute, invoiced monthly, plus 2–3% filesystem overhead. **Raising the ceiling
costs nothing.** Plan caps: Free 0.5 GB · Hobby 5 GB · **Pro 50 GB** ·
Enterprise 1 TB self-serve. Founder currently capped at 250 GB.
**Volume $0.15/GB/month, egress $0.05/GB.**

**Cloudflare R2: $0.015/GB/month — ten times cheaper — with ZERO egress.**
Class A ops **$4.50/million**, Class B **$0.36/million**. 10 GB free tier.

### The measured plan — `docs/CORPUS_TIERING.md` §3 and §6

| tier | where | size |
| --- | --- | --- |
| 1 hot | Postgres, the 38,341 SC judgments as they are | 10.8 GB |
| 2 warm | Postgres, **one row per judgment** for all 19.5M — metadata + `bit(1024)` | ~23 GB |
| + structured search | judges + section index | ~8 GB |
| 3 cold | R2 — brotli text 37 GB + fp32 vectors 78 GB | ~115 GB |
| PDFs | **stay on AWS. We store a key, never a copy** | 0 |

**~42 GB Postgres + ~115 GB R2 ≈ under $8/month. You do NOT need 1 TB.**

**Why Postgres at all if R2 is cheaper:** R2 is a key-value store. It cannot
answer *"judgments by Chandrachud, criminal, 2019–2024"*. **Postgres is the
index, R2 is the bulk. They are not substitutes.**

**Why not many free Cloudflare accounts:** ToS breach, the entire saving is
**$1.58/month**, and it puts a permanent cross-account routing table in the read
path. Same reasoning already recorded for **Telegram** and **Google Drive** in
`CORPUS_TIERING.md` §5: *"Infrastructure that can be revoked for a terms breach
is a liability in a product holding advocate data, not a saving."*

**Binary quantisation is measured, not assumed:** alone it gives only **57.3%
recall@50 — it fails**. As candidates re-scored against exact fp32 vectors
fetched from R2 it gives **99.8% at 20× oversampling with an exact final
ranking.** That is why R2 is not optional.

**Live now:** account `d2580ac2894e62b1fe04a46f6c54f18c`, bucket
**`lawmind-corpus`** (APAC). `packages/storage` round-trips against real R2 —
PUT, HEAD, GET, brotli, **ranged GET**, missing-key-is-null, DELETE, all passing.
SigV4 hand-rolled (four operations do not justify ~20 MB of AWS SDK; a signature
is either right or a 403, so there is no silent wrong answer). **A ranged GET
returning 200 is treated as an error** — a server ignoring Range would "succeed"
while transferring gigabytes.

`.env` is gitignored and verified; nothing was committed. **Object-scoped R2 keys
for the application; the admin token never enters the runtime.**

---

## 5 · WHAT LANDED 9–10 AUG (all committed, all applied to production)

| | before | after |
| --- | --- | --- |
| Citation formats searchable | S.C.R. + INSC only — **AIR 0, SCC 0** | **+4,097 AIR/SCC aliases** |
| Citator: flagged judgments | **22** | **81** |
| Edges carrying a treatment | 95 | **5,318** |
| Provision references | table did not exist | **97,806** |
| Judges | one comma-delimited string | **44,360 rows, 277 judges** |
| Gate S2 | unreachable 0.70 floor | **2 deterministic gates, both 1.0000** |

**Commits:** `ccbebc8` `56e25ad` `c493518` `220825b` `ae6ad9d` `fe9ab13`
`74c8ace` `c2e94c4` `1deb80a` `4b04328` `66e0046` `3c8ddb1` `78c910e` `e71b80c`
`a176c3d`.

**Verify it yourself** — `cd services/api && npx tsx src/search/qlang/demo.ts`:

```
cite:"(1994) 3 SCC 1"                   → S.R. BOMMAI versus UNION OF INDIA
cite:"AIR 1965 SC 845"                  → SAJJAN SINGH versus STATE OF RAJASTHAN
section:138 act:"NI Act"                → 359 judgments
section:482 act:"CrPC"                  → 1,237 judgments
judge:"CHANDRACHUD" AND type:criminal   → 214
"basic structure" NEAR/6 "constitution" → 20
cite:"(2099) 9 SCC 9999"                → 0, nothing invented
```

### How the concordance was derived — the crown jewel, understand it

Courts print both citations together: `AIR 1980 SC 791 : [1980] 2 SCR 1067`.
**We are keyed on S.C.R.**, so that adjacency resolves straight to a judgment id.
No fuzzy matching, no model, nothing bought. **The year guard is everything**: a
parallel citation is one judgment in two reporters, so the years agree or differ
by one. 93,235 citations examined → 31,664 paired → 12,379 aliases → **640
dropped for contradiction** → 5,532 corroborated 2+ times → **4,097 written**.

### The rules these modules encode — DO NOT WEAKEN

- **Structure decides, semantics fills — NEVER blended.** Zero structured matches
  returns **zero** with `parsed` set. The tempting fallback is fatal: three
  cheque cases by other judges do not read as *"we guessed"*, they read as
  *"these are the Kania cases"*. `services/api/src/search/structured.ts`.
- **A wrong alias is worse than a missing one.** Contradicted aliases are dropped
  entirely, never resolved to the more frequent target.
- **`held not per incuriam` means the case STANDS** — while `held not good law`
  means it is overruled. Negation is per-phrase. A keyword matcher gets this
  backwards and tells an advocate a good authority is dead.
- **`partly overruled` is tested before `overruled`** — rule order is
  load-bearing, or every partial overruling records as total.
- **A separator is required before any treatment word**, or *"the Collector,
  overruling the objection"* becomes a citator entry.
- **No act, no record** in the section index. A bare "section 5" is as likely a
  contract clause.
- **`act_key` not `act_named`** for matching — the corpus names CrPC three ways
  and matching the printed name would show a third of the cases.
- **The BNS bridge is written and deliberately inert** — `statute_mappings` is
  empty **by design**: indiacode publishes no IPC↔BNS correspondence and
  `DOMAIN_TRUTH.md` forbids inventing one.

---

## 6 · TODO, IN ORDER

1. **Wire R2 into ingest** — `judgments.storage_key`, brotli upload, ranged
   reads, **cost ceiling + alert** (Class A ops are $4.50/M — that is where an
   object-storage bill goes wrong), kill switch + fetch ledger.
2. **Count the AWS Parquet metadata** per court per year **before downloading
   anything**. "15.9M" is a headline; nobody has counted the working set.
3. **Measure PDF→text extraction on 1,000 real HC PDFs**, publish an honest
   completion date. **Extraction is the cost, not download or storage** — AWS
   sponsors transfer. Scanned judgments need OCR and are far slower.
4. **Ingest High Courts, last 10 years first** (OD-4's order). Resumable,
   content-hashed, `harvest_queue` pattern.
5. **Publish coverage per court/year in the product.** `corpus_coverage` exists.
   **Silence about a gap does the same damage as a fabricated citation.**
6. **Facets** on `POST /search` — contract slot documented, not built.
7. **`EXPLAIN ANALYZE`** every new access path → `docs/SCHEMA_TRUTH.md`.
8. **Delete the Railway TCP proxy** when runs finish (owed under `CLAUDE.md`).

**Parked deliberately — do not resume without a stated reason:** reranker tuning ·
corpus re-embed · HyDE (built; blocked on the DPA because a user query is
sensitive-class) · eval-set growth · citation-extractor widening (**measured as
zero present impact** — all judgments are SC, zero I.T.R./Cri.L.J. citations).

---

## 7 · BLOCKED ON THE FOUNDER

- **Rotate the Cloudflare credentials** — pasted into a chat transcript stored on
  disk.
- **Bharat.Law licence instrument** to transcribe. The grant is open on the
  founder's spoken authority (9 Aug). See `bharatlaw.ts` for what the flags do
  and do not unlock.
- **Supreme Today account** — day one is **measurement, not harvest**. Priority:
  head-noted **High Court and tribunal** judgments, then tribunals, then SC
  headnotes (largely duplicated free by e-SCR), and **never a single request on
  raw text**.
- Countersigned **DPA** · an **advocate to review 20 outputs** · **OD-11**
  (Tier B vs Tier A).

**RCC prompt still outstanding:** `settings.unavailable` on `/me/alert-settings`
(two PD-5 triggers can never fire, yet the app offers switches — an advocate
finds out by missing a hearing), and `verifiedBySource: 'ecourts_bulk'` needs the
client union + label map (*"eCourts record"*; must **never** render Tier-3
wording; an unrecognised source degrades to silent-verified, never blank or a
crash).

---

## 8 · VERIFY BEFORE YOU BUILD

```bash
set -a && . ./.env && set +a
cd services/api     && npx tsx --test --test-concurrency=1 src/**/*.test.ts
cd services/harness && npx tsx --test --test-concurrency=1 src/*.test.ts
cd services/ingest  && npx tsx --test src/concordance.test.ts src/treatment.test.ts src/sections.test.ts
```

Rebuild jobs are **dry by default** and need `--apply`: `concordance-cli.ts`,
`citator-cli.ts`, `sections-cli.ts`. That is not convenience — writing
`set_aside` raises LAW MOVED and disables add-to-matter.

**Batch your database writes.** 4,097 single-row inserts over the proxy is 34
minutes and timed out at ten. The work was never the database's; it was asking it
4,097 times.
