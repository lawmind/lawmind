# LAWMIND — MASTER ROADMAP v5
## Data Moat → Product Excellence → Remote Serving → Store Submission → Fundraising Readiness

**Prepared:** 28 August 2026
**Supersedes:** v4, v3, v2 and `LAWMIND_ROADMAP_TO_STORE_SUBMISSION.md`.
**Priorities, in order:** correct/current legal data → legal intelligence → beautiful product UX → premium website/brand → reliable serving → traction and fundraising readiness.

**Epistemic rules governing this document:**
- Latest live DB/code evidence beats any planning number here.
- Primary sources beat secondary. Gazette, official policy pages and the grant letter win over any blog, vendor page, or this document.
- Claims about other parties (competitors, their access, their capabilities) are UNKNOWN unless independently measured.
- Where retention, cadence or availability of an external source has not been measured, it is written `UNMEASURED`, not guessed.
- **Never alter legal truth for any operational purpose.** See §12.

---

# PART 0 — WHAT CHANGED IN v5

## 0.1 Urgent: a Play Billing deadline lands in two days

**Google requires that, by 31 August 2026, every new app and every update to an existing app builds against Play Billing Library 8 or later, with an extension available on request until 1 November 2026.** Play Billing Library 9.0.0 shipped 19 May 2026; Billing Choice features require 9.1 or higher.

LawMind has not submitted yet, so this is not a breach — but it fixes RCC's floor: **any billing integration targets Billing Library 8+ minimum, and 9.1 if user-choice billing is ever contemplated.** Verify the current requirement in Play Console before RCC writes billing code; deadlines of this kind move.

## 0.2 The biggest structural change: three moats, not one

**Accepted from review, and it reframes the whole company.** v4 had drifted from "data + intelligence platform" toward "monitoring business built on an eCourts grant." That makes an external institution the single point of failure for the valuation, and it is the first question a serious investor asks.

**Moat A — Grant-independent legal intelligence.** 18.75M judgments · statutes · citation graph · temporal statute graph · fresh SCI · identity normalisation · source provenance · search · embeddings. *Survives without eCourts entirely.*

**Moat B — Court-observation intelligence.** eCourts observations · cause lists · status changes · orders · longitudinal matter history. *Accelerated by the grant, and time-boxed by it.*

**Moat C — Workflow and data flywheel.** Matters · saved authorities · monitoring behaviour · corrections · search patterns · alerts. *Compounds from users, owned outright.*

**Governing principle, to be stated in the deck:**

> LawMind must remain a valuable legal research and matter platform even if eCourts monitoring were disabled tomorrow. Monitoring increases retention, frequency and willingness to pay. It is not existential.

**Reinforcing evidence for why this matters:** open-source tooling now exists that programmatically accesses eCourts across district courts, High Courts and the Supreme Court, with built-in CAPTCHA solving and packaged as an AI-agent skill. Whatever one thinks of that approach, it means **raw access is being commoditised**. LawMind's defensible position is not access — it is *licensed, auditable, compliant* access plus the intelligence layer plus the workflow. Moat A and Moat C are what a competitor cannot copy from a GitHub repository.

## 0.3 Corrections accepted

| # | Correction | Disposition |
|---|---|---|
| 2 | Cause-list batching unit is wrong; build an adaptive observation planner | **Accepted** — §3.4 |
| 3 | Cause-list historical retention is UNMEASURED, not "definitively lost" | **Accepted, my error** — §3.4 + a cheap probe |
| 4 | AWS registry cadence is Quarterly (HC) / Bi-monthly (SC), not "daily" | **Accepted, and extended** — the buckets are third-party maintained, which matters more than the cadence. §7.1 |
| 5 | Hetzner is no longer EU-only | **Accepted, with a material refinement** — §6 |
| 6 | Never watermark canonical legal intelligence | **Accepted absolutely. This was the worst idea in v4.** §12 |
| 7 | Over-dependence on eCourts as the company thesis | **Accepted — the strongest critique in the review.** §0.2 |
| 8 | Monitoring SLA, not just polling frequency | **Accepted** — §8.6 |
| 9 | Play government-information policy | **Accepted, and strengthened with verified specifics** — §14.1 |
| 10 | Apple 5.2.2 source-rights matrix | **Accepted** — §14.2 |
| 11 | Apple public-record personal information | **Accepted, and sharpened** — the live enforcement risk is 5.1.2, and the vector is party-name search. §14.3 |
| 12 | India alternative billing decision | **Accepted with two corrections** — §8.9 |
| 13 | Firm-ready domain model now | **Accepted** — §13 |
| 14 | Missing desktop research product | **Accepted — the best strategic addition in the review.** §15 |
| 15 | "Corrections accepted per week" is a perverse metric | **Accepted** — §9.7 |
| 16 | Derived Intelligence Coverage dashboard | **Accepted** — §10.4 |
| 17 | Broaden the competitor probe into a benchmark | **Accepted** — §10.6 |
| 18 | Pre-register the beta success gate | **Accepted** — §11 Sprint 5 |
| 19 | Sprint-0 latency does not shift everything | **Accepted, my inconsistency** — §17 |

## 0.4 New in v5 beyond the review

- **§0.1** Play Billing Library 8 floor, 31 Aug 2026 (extension to 1 Nov).
- **§7.1** The AWS buckets are **third-party maintained** (Dattam Labs / Pradeep Vanga), CC-BY-4.0, part of the AWS Open Data Sponsorship Program — a supply-chain dependency *and* an attribution obligation, not an official government feed.
- **§14.4** Apple's guideline requiring disclosure and explicit permission before sharing personal data with third-party AI — judgments contain personal data, so this constrains every future AI feature.
- **§14.1** Google Play operates a government badge programme and may require proof of authorisation — directly relevant to a product displaying court information under a registrar's grant.
- **§8.9** Google's Own Billing programme (announced March 2026) as a third commercial option with published economics.
- **§15** The desktop product also de-risks store rejection: a rejected app is not a dead company if the web product ships.

## 0.5 Retained from v4 — still the binding business constraint

**The transcribed eCourts limits cap the premium business.** `minIntervalMs: 2000 · 100/hour · 1,000/day`. Naïve per-matter-per-day polling yields fewer than ~1,000 monitored matters in total, across all users, forever. The repo records that these values were *"chosen conservatively by engineering, not stated by the letter itself."*

**Sprint 0 item 1 remains: read the letter.** This determines whether the premium model works, and it is upstream of all pricing work.

---

# PART 1 — POSITION AND THESIS

## 1. Executive decision

Two systems at different clock speeds. **Shipping product:** exact/structured/lexical research, reader, statutes, partial citation graph, matters, monitoring, freshness/provenance. **Continuously improving moat:** corpus deltas, citation graph, statute temporal graph, coarse embeddings, selective passages, semantic research, later treatment and generation.

Broad semantic search, AI answers, drafting, Hearing Pack and legal-status conclusions stay behind their own evidence gates. None blocks a safe, differentiated v1.

## 2. Current position

| Area | Working state |
|---|---|
| Corpus | ~18.75M judgments, 27 courts. HC frontier can match upstream; latest-month completeness must close against actual upstream unique records. |
| Statutes | ~849 Acts / ~36.6k sections. IPC, CrPC, IEA and 2023 successors from official sources. >80% references linked. Transition rules await advocate sign-off. |
| Citation graph | ~6.27M real reference strings; ~200k resolved distinct edges. Largest single moat opportunity. |
| Search | Exact, citation, CNR, case-number, title, structured, lexical — green, and the strongest user-facing paths. |
| Coarse embeddings | Millions in progress against versioned worklists. Not a v1 dependency. |
| Passage embeddings | Existing bounded tranche retained; Tranche V2 deferred. |
| Semantic/AI | Internal/disabled for public v1. |
| eCourts | Adapter, guard, ledger, append-only storage built and tested. Zero observations. Licence to Jan 2029. **Request budget is the binding business constraint.** |
| Backend | Strong local base; bounded restore verified; remote serving unbuilt. |
| Client | Code and tests exist; device, accessibility, push, billing, real-network proof outstanding. |
| Desktop web | **Does not exist. Now scoped — §15.** |
| Website | Must become a product/trust/fundraising surface. |
| Infrastructure | Local Windows workstation is the factory, never the public server. |
| Commercial | Pricing, entitlements, onboarding, claims register, investor narrative open. |

## 3. Product thesis

> Find the authority → verify the source → understand the relationships → save it to a matter → let LawMind watch the matter and tell you what changed.

**Differentiation:** data depth · correctness (ambiguity stays ambiguity; damaged text withheld; editorial attributed; chronology respected; UNKNOWN stays UNKNOWN) · workflow · product quality.

**Positioning, stated defensibly:** LawMind turns abstention and visible uncertainty into a product advantage rather than hiding them. Do not claim to be the only platform that does so.

## 4. Fundraising thesis

Jhana raised a $1.6M seed led by Together Fund — verified. Its product claims (16M+ archive, daily updates, proprietary verifier and graph models, 10,000+ users including judges) are **company-claimed and unaudited**. Jhana also sells to firms and in-house teams, not only individual advocates — which is part of why §13 matters.

**The access claim, worded for diligence:**

> LawMind holds written authorised access to eCourts under transcribed operating conditions, valid to January 2029 and renewable. We have not identified public evidence that major competitors disclose an equivalent arrangement. Competitor access is treated as UNKNOWN, not absent.

**The grant-risk answer, prepared in advance:** §0.2's three moats. An investor who asks "what if this access disappears?" gets Moat A and Moat C, with numbers.

---

# PART 2 — SCOPE AND ARCHITECTURE

## 5. V1 scope

**Ships:** research (exact citation, CNR, case number, title/party, structured filters, lexical, honest degraded states, stable pagination) · reader · statutes · matters · monitoring (after live eCourts proof) · trust surface · **thin authenticated desktop web (§15)**.

**Premium:** metered matter monitoring, with tiers derived from the eCourts request budget. Safety, source and currentness evidence is never paywalled.

**Does not ship:** broad semantic public search · AI legal answers · supporting/adverse conclusions · good-law guarantees · automatic old/new code applicability without sign-off · drafting · Hearing Pack · Hindi semantic · unverified district claims · "every citation verified."

## 6. Two-plane architecture and hosting

**Local factory (Windows + RTX 4060 Ti):** bulk ingest, reconciliation, OCR/recovery, backfills, embeddings, HNSW, heavy evaluation, release building.
**Remote product plane (Linux):** HTTPS API · auth · user/matter DB · production search/read · billing/entitlements · push · eCourts scheduler/worker · alerts · observability · backups.

> A paid monitoring product must not depend on the founder's Windows machine being awake.

**v1 serving footprint is small because v1 ships no dense search.** Order-of-magnitude 150–250 GB. **Measure the real export before selecting infrastructure.**

**Hosting — correction accepted, with a material refinement.** Hetzner is no longer EU-only; a Singapore location has been available since 2024, with the full cloud feature set. **But two facts change how to read that:** Singapore is **cloud-only — dedicated root servers cannot be ordered there** — and Hetzner uses colocation space in Singapore rather than its own data-centre park, with higher pricing than the EU zones. So Hetzner's headline appeal (very cheap dedicated boxes with large disks) **does not transfer to Singapore**; what transfers is competitively-priced cloud instances in the right region.

**Tier A — India:** AWS Mumbai · DigitalOcean Bangalore · Akamai/Linode Mumbai · Vultr Mumbai · Indian providers passing quality checks.
**Tier B — nearby APAC:** Hetzner Singapore (cloud instances), and other Singapore providers.

**Do not choose on geography alone. Run a Sprint 2 bakeoff:**

| provider | monthly cost | Postgres storage cost | backup cost | p50 India RTT | p95 India RTT | disk read/write | support | PITR | egress | ops complexity |
|---|---|---|---|---|---|---|---|---|---|---|

Infrastructure is recurring COGS and directly affects premium unit economics. This decision is worth measuring.

**DPDP note:** the Act uses a negative-list model for cross-border transfer rather than blanket localisation, so non-India hosting is not automatically non-compliant. Confirm with counsel; prefer India for advocate trust regardless.

## 7. Local → production releases

```text
LOCAL FACTORY → validated canonical delta → DATA_RELEASE_<version>
→ counts + checksums + provenance + freshness → remote staging import
→ exact/lexical/statute/citation smoke → production promotion
```

User/matter tables isolated from corpus release and rollback. Each release records: release ID · source manifests · newest upstream/local decisions · upstream completeness · counts · citation edges · provenance version · migrations/API compatibility · rollback target.

---

# PART 3 — THE DATA MOAT

## 3.1 Off-machine protection — measured, not assumed

**Do not back up the entire bulk corpus for disaster recovery. Do maintain a selective immutable source-evidence cache.**

**Likely re-fetchable (exclude, with the caveat below):** bulk HC/SC judgment text and PDFs · coarse and passage vectors · derived indexes.

**Caveat that must be measured:** the repo records that parquet growth is *assumed* append-only, with re-sorted republication flagged `NOT_MEASURED`. **Until upstream immutability is measured, "re-fetchable" is a hypothesis.** Cheap test: re-fetch a sample of historical objects, compare checksums to what was ingested. **Additional risk, new in v5:** the buckets are maintained by a third party (§7.1), so "the bulk source will still be there" is also an assumption.

**Retain immutable originals for:** gold/eval authorities · treatment, currentness and identity-adjudication evidence · rare or recent official deltas (SCI recent judgments, official PDFs) · statute artifacts · eCourts raw responses · any document whose upstream representation may change · anything a generation or legal-evidence decision rested on.

**Irreplaceable derived state (always):** eCourts observations and fetch ledger · citation resolution decisions and per-row state · statute link corrections, chronology repairs, UNRESOLVED_PREDECESSOR classifications · source manifests, provenance, ingest ledgers · migrations and schema · FIFTH evaluation sets, gold sets, blind labels, chronology test package · normalised canonical metadata and identity decisions · job/worklist versions and checkpoints.

**Size: measure it. The earlier 20–40 GB was an estimate.**

**Mechanism:** `pg_dump -Fd -j` over the included set, encrypted, `rclone` to object storage (Cloudflare R2 / Backblaze B2 / S3). **Verify pgBackRest/WAL-G Windows server-side support before considering them.** Restore into a scratch DB, checksum, drop, record timings. A backup never restored is a hypothesis.

## 3.2 High Court AWS
Acceptance: `current unique upstream = locally held + explicitly accounted source-unavailable/refused`. Report **held completeness separately from accounted completeness**. Clustered failures are pipeline or source defects, never terminalised. Durable changed-object worker: list → fingerprint → changed/new only → ingest → checkpoint → downstream queues.

## 3.3 Supreme Court
AWS for historical/bulk · official SCI for recent · editorial summaries stored separately, never promoted to judgment reasoning · raw artifact + checksum + provenance · canonical decision identity. Broaden only after a written SC permission is transcribed into an `authorisation.ts`-pattern module with its own guard and ledger.

## 3.4 eCourts — adaptive observation planning

### Correction accepted: retention is UNMEASURED

v4 stated that cause lists are "definitively lost" if not captured the same day. **That was not verified and is withdrawn.** The official interface exposes a cause-list date selector, which does not prove indefinite historical availability either.

```
HISTORICAL_CAUSE_LIST_RETENTION = UNMEASURED
```

**Cheap probe, Sprint 1, inside the grant's rate limits.** Across several district and High Court endpoints, attempt retrieval for `today · T−1 · T−7 · T−30 · T−90 · T−365`. Record availability per source and classify each as `EPHEMERAL · SHORT_RETENTION · HISTORICAL_RETRIEVABLE · SOURCE_DEPENDENT`. Until then, §3.4 says **high ephemerality risk; exact retention must be measured.**

**What remains genuinely unreconstructible, and is the real longitudinal asset:** LawMind's own observation timestamps and the state-transition history as LawMind saw it. No later fetch reconstructs *when we knew what*.

### Correction accepted: the batching unit was wrong

v4 modelled one cause-list request as covering an entire court's daily listings. The official interfaces are more granular — district-court cause lists require court complex, court name, date and civil/criminal selection; High Court services similarly require court/bench and date context. **The planning unit is approximately `(establishment or bench, cause-list date, list type)`, and what one request actually returns must be measured against the licensed interface.**

### The right design: an adaptive observation planner, not a hard-coded strategy

```
monitored matters
  → group by listing-source key (establishment/bench, list type)
  → estimate cost per strategy
  → if many monitored matters share one list: fetch the list once
    else: targeted case-status polling may be cheaper
  → schedule within remaining quota, prioritised by hearing proximity
```

**Every fetch-ledger row records its strategy:**
```
OBSERVATION_STRATEGY ∈ { CAUSE_LIST_BATCH, CASE_STATUS, ORDER_CHECK, USER_REFRESH }
```

This multiplies monitoring capacity without pretending every cause list has identical economics, and it makes quota utilisation analysable per strategy — which is what pricing needs.

**Operating rules unchanged:** minimum 2,000 ms between requests, 100/hour, 1,000/day (or what the letter states) · ledger every request *and refusal* · append-only raw observations · derived state separate · conflicts remain conflicts · `LISTED` never becomes `HEARING_OCCURRED` · a failed fetch is "could not observe," never "nothing changed."

## 3.5 Statutes
Maintain Acts, repealed Acts, commencement, savings, sections, verified amendments, predecessor/successor identities, reference graph. **Legal interpretation does not become engineering truth** — BNS §358, BNSS §531 and BSA §170 differ structurally, and choosing which applies is counsel's call.

## 3.6 Citation graph
Deterministic evidence first. Party/date/court similarity may corroborate or disambiguate an existing citation identity but **never by itself creates a resolved edge**. Scale only after bounded precision sampling with self-constructed positives and negatives.

## 3.7 Embeddings
Coarse: one vector per eligible judgment over versioned snapshots plus an incremental queue. Passages: retain the existing tranche; select future tranches by user value.

---

# PART 4 — RESEARCH, TOOLS AND SOURCES

## 7.1 Sources — with a correction that matters more than cadence

**Correction accepted on cadence.** The AWS Open Data registry publishes **Quarterly** update frequency for the High Court dataset and **Bi-monthly** for the Supreme Court dataset, with SC coverage described through 2025. LawMind's live-manifest observations in August 2026 found objects changing far more frequently. Both can be true: **published cadence ≠ observed object activity.**

**Roadmap wording:**
> AWS registry cadence: Quarterly (HC) / Bi-monthly (SC). LawMind's live-manifest observations in August 2026 found many objects changing much more frequently. Operational ingestion therefore follows the actual S3 object manifest and fingerprint, never the registry cadence. **We measure the source ourselves** — which is itself part of the moat story.

**The larger finding: these buckets are third-party maintained.** Both datasets are published by **Dattam Labs / Pradeep Vanga** under the **AWS Open Data Sponsorship Program**, licensed **CC-BY-4.0**, downloaded from the eCourts website. They are *not* an official government publication. Three consequences:

1. **Attribution is a licence obligation**, not a courtesy. CC-BY-4.0 requires it wherever the data or derivatives are redistributed — this belongs in the app, the website's Data/Trust page, and the App Review source-rights matrix (§14.2).
2. **Supply-chain dependency.** If the maintainer stops publishing, the bulk backbone stops. Mitigation: keep your own manifests (you do), and treat the officially-sourced paths (SCI direct, eCourts under grant, India Code) as the strategically durable ones.
3. **Provenance precision.** "Sourced from the Indian High Courts via the AWS Open Data mirror maintained by Dattam Labs" is the honest description. "Official government data feed" is not.

| Source | Gives | Status / licence |
|---|---|---|
| `indian-high-court-judgments` (AWS Open Data) | Bulk HC judgments, parquet + PDFs | **CC-BY-4.0, third-party maintained.** Registry cadence Quarterly; observed activity higher. |
| `indian-supreme-court-judgments` (AWS Open Data) | Bulk SC 1950–2025, English + regional | **CC-BY-4.0, third-party maintained.** Registry cadence Bi-monthly. |
| sci.gov.in | Recent judgments/orders, official artifacts | Official; discovery CAPTCHA-gated |
| e-SCR | Supreme Court Reports | **Content-use unresolved — counsel** |
| India Code | Central Acts | Official; some truncated derivatives — verify every artifact |
| eCourts | Status, history, orders, listings, cause lists | **Written grant to Jan 2029, incl. CAPTCHA bypass** |
| NJDG | Pendency/disposal statistics | Public portal; benchmarking and market sizing, not corpus |
| Development Data Lab | ~81M district-court **case records**, 2010–2018 | **Open Database License** — §7.8 |
| DAKSH | HC case and hearing records | By request |
| Licensed platforms | Editorial headnotes, tags, their citation links | Licensed, all uses, **licence term only** — §7.9 |

## 7.2 Indian legal NLP — open resources (all post-launch)

**OpenNyAI** (`Legal-NLP-EkStep`) — Legal-NER and rhetorical-role prediction as a spaCy pipeline; code Apache 2.0, BUILD dataset CC BY-SA 4.0. **Bounded auxiliary candidate for rhetorical segmentation only** — see §7.3. **InLegalBERT / InCaseLawBERT** (IIT Kharagpur) — post-launch candidates; **do not switch embedding models now** (7.65M documents would need re-embedding). **LegalSeg** — evidence base. **IL-TUR** — external benchmark for any future model claim. **ILDC** — research/non-commercial by request; check the licence.

**Honest gap:** no Indian equivalent of `eyecite`. The deterministic resolver is the right approach.

## 7.3 The reporter/editorial gate is a provenance problem

OpenNyAI's BUILD taxonomy (`PREAMBLE · FAC · RLC · ISSUE · ARG_PETITIONER · ARG_RESPONDENT · ANALYSIS · STA · PRE_RELIED · PRE_NOT_RELIED · RATIO · RPC · NONE`) places **headnotes inside `PREAMBLE`**. It therefore cannot establish reporter-versus-court authorship and cannot gate `GENERATION_EVIDENCE_ELIGIBLE`.

**The better solution is not a better classifier.** Authorship is knowable *structurally at ingest*: a headnote exists because it came from a reporter edition. Ingest reporter-edition artifacts as **separate, source-tagged artifacts with `source_edition` provenance**, and authorship is determined by origin rather than inferred from prose. A classifier is a lossy reconstruction of information you had and discarded.

**This makes the Sprint 1 provenance migration do triple duty:** the SCR counsel answer, licensed-content removal by `WHERE` clause, and this.

**Where OpenNyAI still earns a place (v1.3, bounded):** rhetorical segmentation. Evaluate against a **mapped subset** of FIFTH's 200 labels, mapping declared before running, reported per-label. Enrichment for navigation, never an evidence gate.

## 7.4 Retrieval tooling
PostgreSQL + pgvector — **keep**, no vector-DB migration. Postgres `tsvector`/GIN — retained, green. `pg_trgm` — in use. **ParadeDB `pg_search`** — only after §7.6 step 1, and only on isolated Linux. Meilisearch/Typesense/OpenSearch — **rejected**; no measured problem justifies a second search system plus a sync-correctness surface. `pgroll`/Atlas — consider at Sprint 3 for the remote plane only.

## 7.5 Observability — pre-launch minimum

```
provider DB/infra metrics + Sentry + PostHog (cloud, EU region) + UptimeRobot
+ provider/native logs + GitHub Actions
```

**Add later, each on a named trigger:** Prometheus/Grafana/postgres_exporter when provider metrics stop answering a real question · Metabase when a non-engineer needs recurring BI (likely at fundraise) · Loki when log volume exceeds native tooling · k6/Locust for the Sprint 5 load test only. **Do not build a monitoring company before building a legal company.**

## 7.6 The sparse-guard problem — cheapest fix first

**Measured problem:** "bail", "anticipatory bail", "quashing FIR" exceed `SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY = 0.05` and are refused.

**Step 1 — zero infrastructure.** The guard refuses because ranking an unbounded candidate set is unsafe; a bounded set is rankable today. Require a narrowing dimension (court, year range, statute section) for high-df terms and `ts_rank_cd` handles it with no new extension. Measure candidate-set size and latency for ~30 common queries under court filter, year filter and both. **If latency is acceptable, the problem is solved and step 2 never happens.**

**Step 2 — only if step 1 fails.** ParadeDB `pg_search` spike on **isolated Linux, never on the canonical Windows Gold DB** — it requires `shared_preload_libraries` (config change and restart), and prebuilt distributions target Linux/macOS.

```
fixed 1–5M judgment snapshot → temporary Linux PG18 → pg_search
→ the same query suite → relevance@k + latency + ingest/update cost → kill or continue
```

**Kill criteria declared before starting:** incremental-index update correctness · storage · migration and restore complexity · operational burden · licence implications · serving-host compatibility. **If it wins, it belongs on the Linux serving plane, not the factory.**

## 7.7 Mobile toolchain
Expo SDK 57 · EAS Build + Submit · **Maestro** on-device E2E · `@shopify/flash-list` and paragraph virtualisation · `react-native-mmkv` · `expo-notifications` → APNs/FCM · `@sentry/react-native` · native a11y with physical VoiceOver/TalkBack passes · `lawmind://` plus universal/app links, cold and warm start tested separately · **Play Billing Library 8+ (§0.1)**.

## 7.8 Development Data Lab — correctly scoped
~81M district-court **case records**, 2010–2018, under the Open Database License: filing/registration/hearing/decision dates, party names, judge position, acts and sections, disposition.

**These are case records, not judgment text.** Correct use: **historical district-court metadata and analytics coverage, 2010–2018** — matter identity and party matching, structural analytics, historical trends, court metadata.

**Ingest when it creates product value, never for a slide.** Own source-typed tables, full provenance, licence tag, ODbL attribution.

**Claims-register bans:** never place "81M district-court cases" beside "18.7M judgments" without unmistakable object-type labelling · never say "district-court coverage" without "case records, 2010–2018" · no competitor-comparison claim about district-court depth (not benchmarked).

## 7.9 Licensed platforms — instruments, not corpus
Permission is from the platforms, all uses, **licence term only**. **Provenance first** — otherwise expiry forces a choice between breach and rebuild. **Use them as teacher signal** for the citation resolver: their links become candidates into `safe/ambiguous/thin/no_candidate`, verified against your own primary text; only your verified edge is stored, and it survives expiry. Headnotes are **not** for display and **not** for training. Also use them as **measurement instruments** (§10.6), within each platform's terms.

## 7.10 Design and web toolchain
Figma → tokens → **Style Dictionary** → shared package for mobile, desktop web and marketing site · Storybook (+ Chromatic if budget) · reading typeface: an open long-form serif (**Source Serif 4**, **Literata**, **Newsreader**) tested at real judgment length · UI: **Inter** or **IBM Plex Sans** · **Noto Serif/Sans Devanagari** chosen now so Hindi is not a type-system rebuild · Next.js or Astro on Vercel/Cloudflare Pages · Plausible/Umami (cookieless) · Lighthouse CI with an enforced budget · restrained motion honouring `prefers-reduced-motion`.

---

# PART 5 — PRODUCT

## 8.1 Philosophy
**Authoritative, quiet, fast, precise, premium, information-dense without clutter.** No generic AI-chat home screens, card soup, fake AI language, cavernous empty space, hidden evidence, or animation that slows legal work.

## 8.2 Navigation (v1 mobile)
Today/Matters — Search — Library/Saved — Monitoring/Alerts — Account. AI later appears inside workflows, never as the only paradigm.

## 8.3 Search UX
Universal search · exact-citation recognition (a pasted citation is recognised, not searched) · filters · dense readable results · metadata · save/add-to-matter from results · **honest empty and degraded states** · predictable back behaviour · recent searches.

**The degraded state is a design problem.** Per §7.6, refusal for high-df terms becomes productive: "too broad to rank across 18.75M judgments — pick a court or a year," with tappable refinements that make the query succeed.

## 8.4 Judgment reader
Excellent typography and measure · within-judgment search · paragraph navigation and deep-linkable paragraphs · citation and statute highlights only where the backend marks them reliable · original-source action · save/add-to-matter · citations and cited-by panel labelled partial · source/currentness/date state · stability on very large judgments · text scaling.

## 8.5 Matter workspace
Case identity and status · next listing · monitored changes · saved authorities · notes · recent activity · alerts. Design the container so Hearing Pack is a later addition, not a rebuild.

## 8.6 Monitoring — an SLA, not a vague promise

Every alert shows what changed · source · observation time · old and new state where known · action required · uncertainty. `LISTED` never renders as "hearing happened"; a failed fetch renders "could not observe," never "nothing changed."

**Every matter carries server-side:**
```
monitoringPolicy
lastObservedAt
nextPlannedObservationAt
observationSource
lastObservationOutcome
monitoringDegradedReason
```

**Service tiers described in user language, not internal frequencies** — e.g. *Standard* (normal matter schedule), *Upcoming hearing* (increased frequency near listing), *Priority* (highest permitted frequency). **Do not publish specific tier promises until the capacity model is measured** (§0.5, §3.4).

This turns a quota constraint into transparent product behaviour rather than hidden operational complexity — and it is honest, which is the whole positioning.

## 8.7 Design system freeze
Typography · spacing · radius/border/elevation · iconography · motion · lists/tables · result cards and rows · **evidence and source states** · loading/empty/error/degraded · alert patterns · accessibility semantics · tablet behaviour · **desktop-web breakpoints (§15)**. Ship as tokens consumed by all three surfaces.

## 8.8 Real-device quality bar
Physical iPhone and representative low/mid Android: smooth scrolling · stable huge judgments · no clipped text · correct keyboard/search · understandable poor-network states · token-expiry recovery · VoiceOver/TalkBack · text scaling · touch targets · crash-free core loop. **No emulator result counts.**

## 8.9 Billing — decision, with two corrections

**Recommendation stands: ship with StoreKit/IAP on iOS and Play Billing on Android, unified through RevenueCat. Do not optimise store fees before product-market fit.**

**Correction 1 — verify RevenueCat's alternative-billing support at decision time rather than asserting it.** RevenueCat published engineering guidance on Google Play's Billing Choice in July 2026, so a flat "they don't support it" may be out of date. Check their current documentation when the decision is live.

**Correction 2 — there are now three commercial options, not two.**

| Option | Economics | Complexity |
|---|---|---|
| **A. Play Billing + IAP via RevenueCat** | Standard Play service fee | Lowest. Recommended for launch. |
| **B. User-choice billing (India)** | Standard fee **reduced by 4%** on transactions paid through the alternative system | Requires enrolment, PCI DSS certification, a fraud-reporting path, transaction reporting, Billing Library 9.1+, and separate renewal/dunning handling per system |
| **C. Own Billing (announced March 2026)** | 20% service fee on new installs; 10% on recurring subscriptions | Own billing stack, own compliance, own churn machinery |

For a subscription business the gap between A and B narrows once your own payment-processing cost is added, and C shifts materially more operational burden onto you. **None of this is worth doing pre-PMF.** Record `INDIA_ALTERNATIVE_BILLING_REASSESSMENT` as post-launch commercial work, triggered when MRR makes the difference material.

**Apple:** IAP remains required to unlock digital functionality and subscriptions in the ordinary case, so StoreKit is the clean iOS path.

**RevenueCat centralises; it does not eliminate.** You still own: store product configuration · store agreements · user ↔ customer identity mapping · webhook idempotency · **entitlement source of truth (yours)** · refunds · restore UX · anonymous→account migration · offline behaviour · deletion implications for entitlements · vendor register entry · store review answers. Sandbox-prove the full state table on both stores.

**If billing is not ready, do not block a free beta to force monetisation.**

---

# PART 6 — WEBSITE, COMPLIANCE, FUNDRAISING

## 9.1–9.3 Website
**IA:** Home · Research · Monitoring · Data/Trust · Pricing · Company · Legal.
**Visual standard:** premium editorial typography · real product visuals (never mock-ups as screenshots) · subtle motion · no generic SaaS illustration · mobile excellent · same tokens as the apps.
**Claims register:** every public sentence maps to a measured capability and a named evidence artifact. Banned without current evidence: "live" · "every case" · "every citation verified" · "good law guaranteed" · Hindi · court counts · broad AI claims · district coverage · unmeasured competitor comparisons · **any uniqueness claim about access, architecture or capability**. **The Data/Trust page publishes what LawMind does not claim** — and carries the CC-BY-4.0 attributions (§7.1).

## 9.4 BCI Rule 36

**Settled enough to act on:** Rule 36 prohibits advocates from soliciting work or advertising, directly or indirectly. Following the Madras High Court judgment in WP Nos. 31281 and 31428 of 2019, BCI's 8 July 2024 directions required action against advocates and complaints/notices against platforms facilitating prohibited advertising; the Court specifically objected to lawyer ratings and to platforms connecting lawyers with prospective clients. A Supreme Court matter on platform advertisement of lawyers is live. BCI's July 2026 social-media circular addresses testimonials, promotional conduct, and treats fabricated judgments and cause lists as aggravated breaches.

**Decided:** no lawyer marketplace · no ratings · no lead generation · no client–advocate matching · no fee sharing · no advocate profiles for public discovery.

**Open, for counsel:** named advocate testimonials present an unresolved professional-ethics question because the testimonial is commercial content involving an advocate. "LawMind saves me five hours a week" is not obviously the same act as "hire Advocate X for bail matters." **Obtain counsel advice before using named testimonials; default to role-based, unnamed attribution.**

**Positioning:** legal information and research tooling, not legal advice. State it plainly.

## 9.5 DPDP — phased commencement

The DPDP Act and Rules 2025 are notified under a **phased commencement**. Several institutional provisions are in force; Rule 4 and specified Act provisions commence at one year; **most substantive Data Fiduciary obligations and Rules commence at 18 months, on 13 May 2027**, including provisions in the sections 28–34 range.

**Corrections recorded rather than silently fixed:** v3 said the ₹250 crore penalty framework is "active" — drawn from secondary sources that conflicted with each other; the Gazette's phased commencement governs, and penalty/adjudication provisions are among those deferred. v3 said "soft enforcement expected" — removed, no primary-source basis.

**Build to future requirements now; re-check commencement notifications and amendments immediately before launch.** Expensive-to-retrofit work: purpose-limited collection with plain-language notice · consent records with timestamps · **in-app deletion and true erasure** · retention schedules per data class · breach-response runbook · processor/vendor register · matter data logically separated from the corpus.

## 9.7 Data-correction loop — with the metric fixed

```
in-product "report a problem" on any judgment, citation, statute link or alert
→ SUBMITTED → TRIAGED → PRIMARY_SOURCE_VERIFIED → APPROVED → RELEASED → REPORTER_NOTIFIED
```

**Hard rule: user evidence never directly mutates canonical legal data.** Attachments and user text are untrusted input; verification is always against primary source.

**Metric correction accepted — "corrections accepted per week" perversely rewards having more errors.** Use instead:

```
validated correction submissions per 1k active users
% of submissions backed by primary source
median verification time
median correction-to-release time
repeat error rate
corrections by source / parser class
accepted-correction recurrence
```

The goal is **fewer systematic errors over time**, not maximised accepted corrections. Corrections-by-parser-class is the one that actually improves the pipeline.

## 10.1 Data room
Incorporation · cap table · IP assignments · contractor/employee IP · **source and licence registry** · privacy posture · architecture · moat metrics · customer metrics · financial model · pricing/cost · roadmap · competitor matrix · risk register · counsel decisions.

For a data company, **provable access provenance is diligence-critical**: the grant, its transcribed conditions, a ledger of every request *and refusal*, and the ability to answer "did you stay inside the grant?" with a SQL query.

## 10.2 Narrative
1. Indian legal work is fragmented. 2. Generic LLMs cannot solve source trust and currentness — fabricated citations are now treated as misconduct. 3. LawMind owns the data and intelligence layer (Moat A), with written authorised court access (Moat B). 4. It converts that into a recurring advocate workflow (Moat C). 5. Matters and monitoring create retention. 6. Data, graph and observations compound. 7. Mobile, desktop and web expand distribution. 8. Advanced AI becomes safe later, on a proven evidence layer. 9. **The company is valuable without Moat B.**

## 10.3 Five-minute demo
Exact search → beautiful reader → citations and statutes → save to matter → **a real monitored update that arrived from a court** → source and freshness surface → private moat dashboard. **Demo on desktop web (§15) as well as phone** — investors watch on laptops.

## 10.4 Moat dashboard — Derived Intelligence Coverage

Corpus size alone flatters row-counting. Add coverage percentages, which show **owning intelligence** rather than owning rows:

```
judgments with canonical identity %
judgments with verified date %
judgments with outgoing citation edges %
judgments with incoming edges %
citation strings resolved %
statute references resolved %
judgments with statute graph %
judgments coarse-embedded %
judgments passage-indexed %
judgments with retained source evidence %
matters linked to canonical eCourts identity %
monitored matters with successful observation in SLA %
```

Plus operational: upstream-vs-local completeness per court/month · source lag per source · citation edge growth/week · eCourts observations/day and **request-budget utilisation by strategy** · refresh cost per 1,000 judgments · provenance completeness · licence registry status · correction metrics (§9.7).

**Publish the method beside every number.** A metric without its definition repeats the 27-vs-57-day lag conflict in front of an investor.

## 10.5 Product metrics
WAU/MAU advocates · activation · first-search success · searches/user · saves/search · matters/user · monitored matters · alert engagement · D7/D30 retention · conversion · ARPU · cost/user · support load.

## 10.6 LawMind Competitive Benchmark (quarterly)

Broadened from a freshness probe into the product-prioritisation instrument:

- **Data freshness** — presence, latency to appearance, full text vs stub.
- **Search** — the same 30–50 real advocate queries: exact, common concept, statute, recent authority.
- **Correctness** — wrong citation, wrong Act, missing authority, unsupported proposition.
- **UX** — taps and time to source, is the source visible, paragraph linking, save workflow.
- **Workflow** — matter support, monitoring, alerts.

**Use ordinary licensed or user access in compliance with each platform's terms. Do not build a competitor scraper** — it would contradict everything the provenance discipline stands for, and it is the one thing that would make your own access story indefensible.

Output: an internal prioritisation document *and* the most credible slide available in a market where nobody audits anything. Report as measured-by-us, with method stated.

## 10.7 Fundraise trigger
Integrated remote beta · excellent demo · real lawyer usage · repeat usage and retention · credible monitoring loop · measurable data advantage · complete source/licence documentation · clear use of funds.

---

# PART 7 — NEW STRUCTURAL DECISIONS

## 12. Defensive posture — and an absolute rule

**Never alter canonical legal intelligence for any operational purpose.** v4 proposed watermarkable identifiers in derived data including citation edges and statute links. **That is withdrawn entirely.** A system built on "a wrong citation edge is unacceptable" cannot deliberately introduce artificial legal objects to catch scrapers. Not subtly, not at low volume, not anywhere.

**Never alter:** judgment text · citations · statutes · section identities · treatment · dates · case status · source evidence.

**Use instead:** response-level trace IDs · per-account signed request IDs · export fingerprints · API response provenance headers · access-pattern anomaly detection · rate limits · pagination budgets · honey endpoints unreachable by ordinary product flows · non-legal metadata canaries.

**If a canary record is ever used, it must be structurally impossible for it to surface as legal authority** — separate table, excluded from every retrieval path by construction, asserted by test.

Also: authenticated API only, no anonymous bulk paths · no bulk export endpoint in the v1 contract · terms of service addressing automated extraction.

## 13. Firm-ready domain model — cheap now, expensive later

Accepted. Jhana sells to firms and in-house teams, not only individuals, and firm adoption is disproportionately valuable at seed stage. **Do not build enterprise admin before launch** — but make the model firm-ready in Sprint 2's domain freeze:

```
User
Workspace
WorkspaceMember (role)
Matter            → owned by Workspace, not User
SavedAuthority    → owned by Workspace
MonitoringEntitlement → held by Workspace
```

v1 auto-creates a **Personal Workspace** per account; the user never sees the concept. Later, a firm becomes a Workspace with partners, associates, shared matters and firm billing **without rewriting matter ownership** — which is otherwise a migration touching every row of user data.

## 14. Store-review risk — materially larger than earlier versions recognised

### 14.1 Google Play: apps that communicate government information

Google does not allow apps containing false or misleading claims, **including apps that falsely claim affiliation with a government entity or that offer or facilitate government services without proper authorisation**. For apps that are **not** affiliated with a government entity but communicate government information, Google requires two things: **include easy-to-see information sources in the app description and store listing**, and **make clear that the app does not represent a government or political entity**, with sources that let users verify the information. Google has also stated it asks developers to submit proof where they have permission to process government documents, and operates a government badge programme for genuinely official apps — a programme created partly in response to fake government apps in India.

LawMind displays eCourts information, Supreme Court information, case status and cause lists. **This is squarely in scope.**

**Build a `STORE_GOVERNMENT_INFORMATION_PACK` before submission:**
```
government information sources (named)
source URLs (official, verifiable)
explicit non-affiliation disclaimer
eCourts authorisation document (for Google, if requested)
scope of the authorisation
source-attribution screenshots from the app
data-freshness explanation
review credentials
review instructions
```

**Listing language:** *LawMind is an independent legal research product and is not an official government application. Court information is sourced from identified official systems.* Confirm exact wording with counsel, since the grant's terms may affect what may be said about it.

**This is a very avoidable rejection.** Prepare it in Sprint 4, not during review.

### 14.2 Apple 5.2.2 — rights to third-party content

Apple requires that a developer be specifically permitted to access, display or monetise content from a third-party service. This makes the source/licence registry a review artifact, not just a diligence artifact.

**Prepare a one-page `SOURCE_RIGHTS_MATRIX_FOR_REVIEW`** — not the whole data room:

| Source | What appears in the app | Basis |
|---|---|---|
| AWS HC dataset | High Court judgments | **CC-BY-4.0**, attribution shown in-app |
| AWS SC dataset | Historical SC judgments | **CC-BY-4.0**, attribution shown in-app |
| sci.gov.in | Recent official SC material | Official public source (+ written grant if held) |
| eCourts | Case status, listings, orders, cause lists | **Written authorisation, dated, scoped** |
| India Code | Statutory material | Official public source |
| Development Data Lab | District-court case-record analytics | **Open Database License**, attribution |
| SCR / reporter editions | Only what counsel has approved | Counsel decision |

If review asks, you answer in minutes.

### 14.3 Apple public-record personal information — sharpened

Apple's guideline 5.1.1(viii) states that **apps compiling personal information from any source not directly from the user, or without the user's explicit consent, even public databases, are not permitted.** In practice the live rejection pattern is **5.1.2** — *"your app collects information about the user's friends, contacts, or other third-party persons without the knowledge or consent of those parties"* — and the closest published analogue is an app that turned public vehicle records into owner lookups, rejected on exactly that basis.

**LawMind is not a people-search app, but judgments contain party names, advocate names and sometimes addresses.** The risk vector is specific: **party-name search presented as person lookup.**

**Product guardrails, and they are cheap:**
- Never position or market LawMind as "search anyone's court history."
- No person profile pages, no aggregation-by-individual views, no background-check UX, no personal-history dossier screens.
- Party search returns **cases**, not people. Results are case-first, never person-first.
- No "cases involving this person" aggregation surface built from party-name matching.
- Prepare a short App Review note explaining the legitimate legal-research context: the corpus is published judicial decisions, the user is a legal professional, and the app does not compile dossiers on individuals.

This is a more realistic store risk than generic rejection categories, and it is nearly free to design around **now** and expensive to retrofit after a rejection.

### 14.4 Apple and third-party AI (forward-looking)

Apple's updated guidelines require developers to **clearly disclose where personal data will be shared with third parties, including third-party AI, and to obtain explicit permission before doing so.**

Judgments contain personal data. **Therefore, when LawMind eventually adds AI features, sending judgment text or matter content to a third-party model is a disclosure-and-consent event.** This favours the architecture you already prefer — local and self-hosted inference — and it must be answered before any v1.1+ AI feature ships. Record it now so it is not discovered at submission.

## 15. Desktop web research product — the strategic gap

**Accepted, and I would go further than the review.** Legal research means long judgments, multiple tabs, copying citations, side-by-side comparison, drafting alongside. Mobile is an excellent wedge for monitoring, alerts, quick lookup and matters. **Desktop is where deep research actually happens**, and every serious competitor is web-first.

**Scope: a thin authenticated web product. Search · Reader · Saved · Matter · Monitoring.** Same API, same design tokens, no new backend, no AI or generation.

**Do not delay store submission for it — but ship it before or alongside fundraising**, because it does four jobs at once:

1. **Product** — the surface where advocates do sustained research.
2. **Fundraising** — investor demos happen on laptops; a phone demo of a research platform undersells it.
3. **Risk** — **a store rejection is no longer existential.** If Apple or Google delays you, the product is still live and still acquiring users. Given §14.1 and §14.3, that is real insurance.
4. **Distribution** — web is linkable, SEO-addressable and shareable in a way an app is not; a deep-linked judgment page is a marketing asset.

**Positioning across three surfaces:** mobile = always-on advocate companion · desktop = serious research workstation · marketing site = acquisition, trust, fundraising.

**Cost:** shared tokens, shared API, no new services. This is a front-end build, not a second product.

---

# PART 8 — EXECUTION

## 11.0 The `BLOCKED_EXTERNAL` pattern

No gate may be blocked indefinitely by a party no agent can compel. Any gate item depending on an external actor carries:

```
SATISFIED · BLOCKED_EXTERNAL (owner, date raised, expected resolution) · FAILED (ours, fix it)
```

`BLOCKED_EXTERNAL` **passes the gate for everything not downstream of it** and opens a **sub-gate** that must pass before the dependent capability can be enabled, marketed or monetised. The capability is registered `DISABLED_EXTERNAL_BLOCK`, which means the claims register cannot reference it and no surface can show it.

## Sprint 0 — founder and risk unblock
*Immediate; parallel with Sprint 1*

1. **Read the eCourts letter against the transcribed limits.** `2000 ms / 100 per hour / 1,000 per day` were chosen conservatively by engineering, not stated by the letter. **This determines whether the premium model works.** If the letter states more, transcribe it. If silent, keep the conservative values *and* open the ceiling conversation with the registrar now. Confirm `captchaBypassPermitted: true` matches the letter.
2. **eCourts activation:** real `users` row, verbatim `ECOURTS_GRANT_ATTRIBUTION` in the runtime env, audited kill-switch flip.
3. **Written SC permission** to NEW2 for transcription, if it exists separately.
4. **Counsel session** — criminal-code transition rules · SCR retain/index/display/train · Rule 36 named-testimonial question · store-listing language for government information (§14.1).
5. **Google Play account type — start today.** LawMind is a business; use an **organization** account. The published closed-testing requirement (12 testers opted in continuously for 14 days before applying for production access) is documented against **personal accounts created on or after 13 November 2023**. Obtain/verify the D-U-N-S immediately — **Google says issuance may take up to 30 days**. After verification, **inspect the actual production-access state in Play Console** rather than assuming prior obligations disappeared.
6. **Offsite backup destination and retention** (§3.1 — measure the set first).
7. **Physical devices** — one current iPhone, one representative low/mid Android.
8. Alert/on-call destination.
9. Pricing philosophy and day-one-premium decision — **requires item 1**.
10. Production infrastructure budget (informs the §6 bakeoff).
11. D: tablespace approval (measure throughput first).
12. Railway: archive or delete.
13. Signups kill-switch: real reason string.

**Engineering, parallel:** measure and protect the irreplaceable set off-machine (§3.1), restore-test it, run the upstream-immutability sample check.

**Exit:** items 1–5 supplied or explicitly `BLOCKED_EXTERNAL` with owner and date; irreplaceable state has a restore-tested off-machine copy.

## Sprint 1 — data factory closure
*Week 1 · NEW2 / NEW1 / LCC*

NEW2: HC parity under the strict rule · registered daily delta worker · SCI delta · eCourts canary when inputs land · **cause-list retention probe (§3.4)** · bounded citation tranche with precision sample · structured freshness object.
NEW1: coarse coverage to snapshot · no Tranche V2 · HNSW economics measured · incremental queue · **§7.6 step 1 measurement**.
LCC: factory handoffs · ANALYZE and root cause · worker registration · tranche wiring behind the internal gate · freshness API · **provenance migration (triple duty)** · dirty-work lifecycle decision.

### Gate A — FIFTH, short and targeted

**Always required:** (1) HC court×month parity closed where upstream objects exist, residuals with terminal states, **both `accounted_upstream %` and `actually_held %`**; (2) citation tranche precision sample attacked with self-constructed positives and negatives, per-class counts, background job registered; (3) freshness object identical from API and ledger; (4) provenance columns exist and populate for new ingest.

**Conditional on eCourts:** *if inputs available* — real successful fetches inside transcribed limits, ≥1 pilot source producing observations, `OBSERVATION_STRATEGY` recorded per ledger row, retention probe results published, zero unattributed requests. *If externally blocked* — Gate A **passes** with `monitoring = DISABLED_EXTERNAL_BLOCK`; NEW3 starts on research, reader, matters, saved authorities; **monitoring cannot be enabled, marketed or monetised until its sub-gate passes.**

**PASS → NEW3 authorised. HNSW is not a gate.**

## Sprint 2 — product definition, serving foundation, RCC start
*Week 2*

**NEW3:** ten-matter acceptance against the real backend. Freeze: v1 capability registry (with `DISABLED_EXTERNAL_BLOCK` states) · monitoring semantics and **SLA fields (§8.6)** · **pricing derived from the request budget** · onboarding · claims register v1 · analytics event schema · correction-loop spec (§9.7) · **firm-ready domain model (§13)** · RCC API requirements · **desktop web scope (§15)** · website positioning.
**LCC:** measure the real v1 export footprint; run the **hosting bakeoff (§6)**; HTTPS/API hostname, CI/deploy, staging, backups.
**RCC:** starts on API contract freeze. **Billing targets Play Billing Library 8+ (§0.1).**
**Design:** freeze the system including desktop breakpoints; ship tokens for all three surfaces.
**Website:** locate the canonical repository/deployment; IA, UX, visual direction, product-shot system.
**NEW1:** coarse/HNSW in parallel, off the critical path.

**Gate B:** capability registry and API contract frozen · product acceptance passed · claims register v1 · **hosting selected from the measured bakeoff** · domain model firm-ready · design direction approved.

## Sprint 3 — remote integrated alpha
*Week 3–4*

Remote: HTTPS API · production-like legal search DB · separate user/matter DB · auth · tenant isolation · deletion · rate limiting · observability · **defensive posture (§12)**.
Prove local→remote: initial import → incremental release → **corpus rollback without user/matter rollback**.
Move monitoring remote: scheduler · **adaptive observation planner (§3.4)** · observations · raw ledger · state derivation · push queue.
RCC connects to staging. **Desktop web shell begins against the same API.**
Prove offsite restore.

**Gate C:** a physical phone on mobile data completes the core loop against the remote API, workstation Postgres provably unreachable from the internet · offsite restore proven with timings and checksums · corpus rollback leaves user/matter data intact.

## Sprint 4 — product beauty, devices, commercial, store packs
*Week 4–5*

UI/UX polish; no scope growth. Physical devices per §8.8. Billing per §8.9 if day-one premium. Privacy: in-app deletion · Apple App Privacy · Play Data Safety · DPDP review with counsel.
**Store packs prepared now, not during review:** `STORE_GOVERNMENT_INFORMATION_PACK` (§14.1) · `SOURCE_RIGHTS_MATRIX_FOR_REVIEW` (§14.2) · the party-search positioning note (§14.3) · demo credentials.
**Play:** if the account is personal and post-13-Nov-2023, start closed testing as soon as a stable build exists — 12 testers, 14 continuous days, genuine usage assessed; recruit 18–20 for buffer. If organization-verified, confirm production-access state in Console.
**Recruit once:** the closed-beta advocates and the Play testers are the same cohort.

**Gate D:** device matrix green on physical hardware · deletion end to end · billing sandbox-proven on both stores · store packs complete · no design P0/P1.

## Sprint 5 — website, beta, fundraise readiness
*Week 5–6*

Website per Part 6. **Desktop web reaches usable quality.** Closed beta with 10–30 practising legal users.

**Pre-register the beta success gate — before inviting anyone.** NEW3 defines and freezes: activation definition · successful-search definition · core-loop definition · weekly-active definition · monitoring activation definition · retention measurement window · **critical qualitative failure criteria** · and the decision rule for pass/iterate/stop. **Do not invent percentages today** — let baseline research set thresholds. But freeze definitions and decision rules **before** data arrives, or weak metrics will be rationalised.

Fundraise prep: deck · data room · **Derived Intelligence Coverage dashboard (§10.4)** · architecture one-pager · testimonials cleared per §9.4 · demo (desktop and phone) · pricing/cost model · use of funds · **Competitive Benchmark (§10.6)**.
Remote load/reliability testing; FIFTH pre-submission audit.

**Gate E:** FIFTH pre-submission PASS · beta decision rule met · zero P0/P1 · website claims equal measured reality · load test passed.

## Sprint 6 — store submission
*Week 6–8, external review dependent*

Icons/screenshots/preview video · privacy policy · Apple App Privacy · Play Data Safety · support URL · account deletion · **demo credentials** · government-information pack · source-rights matrix · billing review items · full claims audit.
Apple: controlled/manual release after approval; phased release applies to later updates. Google: follow the production-access policy for your account type; staged rollout is an update tool.
Launch with monitoring, support, rollback and a kill-switch runbook. Budget one rejection cycle.

**Done:** both stores public · **desktop web live** · first external advocates active · no P0/P1.

## 16. Parallel workstreams

| Track | S1 | S2 | S3 | S4 | S5 | S6 |
|---|---|---|---|---|---|---|
| NEW2 | HC/SCI/eCourts/citations/retention probe | continuous | continuous | continuous | continuous | continuous |
| NEW1 | coarse + §7.6 step 1 | coarse/HNSW | incremental | incremental | semantic eval if capacity | incremental |
| LCC | factory/perf/provenance | serving foundation + bakeoff | remote serving | ops/billing | hardening | launch ops |
| NEW3 | — | **start** | acceptance | pricing/UX/store packs | beta/fundraise | launch |
| RCC | — | **start after contract** | integrated alpha | polish/devices/billing | beta/store | submission |
| Desktop web | — | scoped | shell | build | usable | live |
| Design/Website | — | freeze / IA | build | polish | launch-ready | public |
| Founder | S0 batch | counsel + infra | budget/backup | devices/testers | investors | review responses |

## 17. Calendar — corrected

**Aggressive target:** public store launch roughly **6–8 weeks from 28 August 2026**, if counsel, eCourts activation, D-U-N-S verification and store review do not extend the critical path.

**Correction accepted — v4 contradicted its own `BLOCKED_EXTERNAL` design.** The right statement:

> **External latency shifts only the downstream capability or platform whose sub-gate depends on it. The overall launch date moves only when the unresolved external item lies on the final public-release critical path.**

So: delayed eCourts inputs → monitoring stays `DISABLED_EXTERNAL_BLOCK`, everything else proceeds. Delayed counsel → transition rules and named testimonials stay gated. Delayed D-U-N-S → Android production access is affected, while iOS, desktop web and all product work continue. **Only items on the final release path move the launch date.**

## 18. Risk register

| Risk | Exposure | Mitigation |
|---|---|---|
| eCourts request budget caps the business | Premium ceiling | §0.5, §3.4 adaptive planner; Sprint 0 item 1 |
| **Over-dependence on the grant** | Valuation single point of failure | **§0.2 three moats; Moat A/C independent** |
| Workstation loss before offsite backup | Loss of irreplaceable derived state | §3.1, restore-tested |
| Grant misuse (unattributed/over-quota) | Permanent loss of the moat | Guard refuses; real actor identity; ledger audited each gate |
| Bulk source is third-party maintained | Backbone could stop | §7.1; own manifests; official paths are the durable ones |
| Cause-list retention unknown | Possibly irrecoverable data | §3.4 probe, Sprint 1 |
| Play government-information rejection | Avoidable rejection cycle | §14.1 pack, prepared Sprint 4 |
| Apple 5.1.1(viii)/5.1.2 personal-data rejection | Serious rejection risk | §14.3 guardrails designed in now |
| Apple 5.2.2 third-party rights | Review delay | §14.2 matrix |
| Play Billing Library floor | Build rejected | §0.1 — target 8+, verify in Console |
| D-U-N-S latency | Up to 30 days | Sprint 0 item 5 |
| Counsel latency | Gated capabilities | `BLOCKED_EXTERNAL` |
| Adverse SCR ruling | SC display/index restrictions | Provenance columns → `WHERE` clause |
| Licensed content without provenance | Cannot unwind at expiry | Sprint 1 precondition |
| Rule 36 testimonials | Unresolved question | Counsel; role-based default |
| Store rejection generally | +1–3 weeks | Claims register; **desktop web means rejection is not existential (§15)** |
| Serving cost surprise | Recurring COGS | §6 bakeoff |
| Upstream not immutable | "Re-fetchable" fails | §3.1 checksum test |
| Scraping after launch | Moat leakage | §12 — **never by altering legal truth** |
| Access commoditised by open source | Moat B erodes | §0.2 — compete on Moat A and C |
| Scope creep into research | Weeks lost | DO-NOT lists; capped gates |
| DPDP timeline compression | Earlier deadline | Monitor; build DPDP-ready |

## 19. Do not do before store submission

HNSW is not a launch dependency · no Tranche V2 because the GPU is free · no revival of the failed role regex · no new vector database · no HyDE/reranking detour · no generic AI-chat homepage · no drafting because competitors have it · no source-restriction workarounds · no marketing beyond the claims register · no waiting for a perfect citation graph, OCR, dates or coram · no lawyer directory, ratings, matching, lead-gen or fee-share · no uniqueness claims about access, architecture or capability · no 81M-row ingest for a pitch-deck number · **no watermarking or alteration of legal data, ever** · **no person-centric search surface** · no billing-fee optimisation before PMF.

## 20. Post-launch roadmap

**v1.1** semantic re-entry, only after broader coverage, credible evaluation and a *working* abstention signal. **v1.2** selective passage tranches from real usage. **v1.3** rhetorical-role enrichment via the bounded OpenNyAI evaluation against a mapped subset of FIFTH's labels — not an evidence gate. **v1.4** treatment and currentness on the provenance foundation. **v1.5** Hearing Pack. **v1.6** drafting, after generation safety is evidenced and the third-party-AI disclosure question (§14.4) is answered. **Later** Hindi · district-court analytics (DDL) · firm workspaces on the §13 model · collaboration · enterprise APIs · judiciary/administration products.

## 21. North star

**Data trust** — advocates can see source, freshness, uncertainty, and what LawMind knows and does not know.
**Product desire** — mobile, desktop and website feel category-defining.
**Compounding moat** — more judgments, more resolved citations, more statute links, more court observations, more monitored matters, more accepted corrections, every day.

**And the fourth, added in v5: independence.** The company is valuable on Moat A and Moat C alone. Moat B accelerates it. Nothing external can switch LawMind off.
