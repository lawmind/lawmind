# AUTHORIZED_SOURCE_DELTA_PLAN_V1

**Lane:** NEW2 · **Round:** R7 §10 (P1) · **25 August 2026**
**Bounds observed:** no new paid subscriptions · no unauthorised tribunal ingestion · no permission broadened from memory.

---

## 0. The single fact that organises this plan

**All three §6a-authorised sources have contributed zero rows.**

| source | authorised | ingested | rows |
| --- | --- | --- | ---: |
| AWS Open Data (HC + SC) | s. 52(1)(q)(iv), CC-BY-4.0 | **yes** | 18,698,968 |
| India Code | government publication | **yes** | 846 acts / 35,395 sections |
| **BharatLaw** | §6a, to 13 Nov 2029 | **no** | **0** |
| **Supreme AI** | §6a, to 13 Nov 2029 | **no** | **0** |
| **eCourts India** | §6a + registrar's grant 7 Aug 2026 to Jan 2029 | **no** | **0** |

The corpus's shape — the gaps in §1 — is entirely the shape of one bulk dump of
court PDFs. Every gap below is a field that dump does not carry.

---

## 1. The gaps, and which authorised source could close each

| gap | measured | best authorised source | why |
| --- | --- | --- | --- |
| **currentness** — the corpus is a periodic dump; last real ingest 19 Aug 2026 | ingest stopped 6 days ago; `ecourts_observation` = 0 rows | **eCourts** | the only source that is a live feed; the grant already exists |
| **citation identity** — 6 High Courts holding 4,922,537 documents have ~0 neutral citations | Madras 258/1.7M · Patna 1/1.7M · MP 0/650k · Gujarat 0/422k · Telangana 3/1.04M · Orissa 3/794k | **eCourts** (case-status carries the citation) then **BharatLaw / Supreme AI** | AWS Open Data simply does not carry it for these courts |
| **citation aliases / parallel citations** | `judgment_citation_aliases` is tiny; 96.3% of real references are `TARGET_NOT_HELD` | **BharatLaw / Supreme AI** | reporter-to-reporter concordance is exactly what a commercial citator holds |
| **coram / bench** | 38,326 of 18,698,984 — Supreme Court only | **eCourts** | case-status pages print the coram; also recoverable from our own header text (`AUTHORITY_HIERARCHY_INPUT_LEDGER_V1` §5) |
| **structured metadata** — case type 24.46%, HC document class 26.02% | see the Data Moat Ledger | **eCourts** | registry metadata is the canonical version of both |
| **statutes: IPC / CrPC / IEA** | 391,484 references, 256,336 judgments, **0 text held** | **none of the three** — see §3 | India Code does not hold them; this is the plan's one genuine blocker |
| **treatment / currentness** | 15,982 edges, **5** court-verified | **BharatLaw / Supreme AI** | a citator's treatment table is its product |
| **source documents** | `storage_key` non-null on **0** of 18,698,984 | AWS Open Data (re-fetch) | not a new source — a retention decision, `R2_SOURCE_RETENTION_MATRIX.md` |

---

## 2. The plan, ranked by advocate value per unit of work

### D1 — Run the eCourts harvest. `AUTHORISED, BUILT, NEVER RUN.`

The largest single gap and the one requiring no new permission and no new code.
`docs/ECOURTS_AUTHORISATION.md` records the registrar's grant of 7 Aug 2026;
`services/api/src/court/*` holds the rate limiter, the fetch ledger and the
narrowly-scoped CAPTCHA bypass. `ecourts_observation`, `cause_list_syncs` and
`harvest_fetches` are **all zero rows**.

It closes, at once: currentness · citation identity for the six blind High
Courts · coram · case type · CNR-backed identity.

**Blocked on one thing, and it is not engineering:** the grant's specific numeric
conditions. `ECOURTS_AUTHORISATION.md` says `STATUS: AWAITING THE LETTER'S
NUMBERS`. CLAUDE.md §6 is unambiguous — *"If the authorisation's terms are not in
the repo, the switch stays off."* **The switch stays off.** In
`docs/FOUNDER_QUEUE.md`.

### D2 — Link the 323,524 statute references we can already satisfy. `NO SOURCE NEEDED.`

`judgment_statute_refs.statute_id` is **NULL on all 862,594 rows**, including for
the 824 Acts whose sections we hold. A deterministic `act_key` join lights up
**323,524** of them unambiguously — s. 138 NI Act, s. 34 CPC, NDPS, POCSO, Motor
Vehicles.

Measured, not derived: 267 of 10,483 distinct `act_key` values match a held Act
after normalisation, carrying 323,985 references of which 323,524 resolve to
exactly one Act. The other 10,216 keys are act-name variants the extractor emits
and nothing normalises — a second, previously unquantified gap.

No acquisition, no model, no permission. **Best value-per-unit-of-work in this
document.**

### D3 — Recover coram from our own header text. `NO SOURCE NEEDED. HYPOTHESIS.`

99.87% of documents are segmented into paragraphs, `CASE_HEADER` is 6.81% of the
passage pool, and those passages carry the `Hon'ble … , J.` pattern. If it holds,
it closes the bench gap for the High Courts without any external source.

**Untested.** Stated as a hypothesis, with the measurement it needs, not as a
plan item that has been costed.

### D4 — BharatLaw / Supreme AI: aliases and treatment. `AUTHORISED, BLOCKED ON A NON-ENGINEERING ITEM.`

These two close the alias and treatment gaps that no open source will.

- **BharatLaw** — `docs/BHARAT_LAW_OFFER.md` records a real tension: §6a says
  authorised; their own Evaluation/Platform Agreement prohibits building "a
  competing product" and "benchmark[ing] the Services" without prior written
  consent, and their `AUTHORISATION` object carries
  `extractionPermitted: false`. The consent email (FQ-BL1) is still owed.
  **This lane does not resolve a contract tension and has not treated §6a's
  blanket wording as overriding a specific written term.**
- **Supreme AI** — blocked on account/payment, `FOUNDER_QUEUE.md` §6.

### D5 — Source-document retention. `A DECISION, NOT AN ACQUISITION.`

0 of 18,698,984 documents retain their source. Consequences in
`DATA_MOAT_LEDGER_V1` §3.1. Re-fetching from AWS is permitted and costs storage;
`R2_SOURCE_RETENTION_MATRIX.md` describes the policy the corpus does not
implement. Cost and destination are LCC/founder, not this lane.

---

## 3. IPC / CrPC / IEA: no authorised source holds them

The largest statute gap in the corpus has no answer inside the authorised set:

- **India Code does not hold them.** It describes itself as holding *enforced*
  Acts; all three were repealed on 1 July 2024. Its "Acts Not Enforced" community
  returns the Whistle Blowers Protection Act and the Delhi Rent Act, not these.
  Measured, not assumed — `STATUTE_INTELLIGENCE_LEDGER_V1` §3.3.
- **The one IPC PDF that exists is a state record and is partial** — Chandigarh's
  Model Jail Department copy, 58 pages, sections 1–120B, with pre-2019 text.
- **The Evidence Act is obtainable** at 93.4% section recall today and could
  reach completeness with more parser work.
- **CrPC has no full text on India Code at all** — every exact-title item has
  zero bitstreams. It is the **most-cited statute in the entire corpus**
  (280,027 references, 186,382 judgments).

**This needs a founder decision on a source and is in `docs/FOUNDER_QUEUE.md`.**
Not proposed here: any unauthorised portal, any scraper-reseller, or any
commercial bare-act publisher. Worth checking first, and cheap: India Code's
own bulk/archive endpoints, and the Ministry of Law's e-Gazette — both
government, neither yet probed.

---

## 4. A naming contradiction, reported and NOT resolved by this lane

R7 §15 asks that contradictory historical source names be reconciled against the
canonical registry, and this one cannot be reconciled without the founder.

- **`CLAUDE.md` §6a (current, in-repo):** *"`Supreme AI` and `Supreme Today` are
  different sources. Older `Supreme Today` entries are historical unless
  separately marked current."*
- **`docs/AUTHORIZED_SOURCE_MAP.md` §2**, recording a direct founder statement of
  **16 Aug 2026**: *"Supreme Today AI and Supreme AI refer to the SAME
  provider/platform. From now on treat them as one competitor/provider
  identity."*

The founder statement post-dates §6a's wording, and NEW3's file already treats
the question as closed. **This lane will not pick a side**, because the two
readings differ in how many licences and how many authorisations exist, which is
precisely the kind of thing R7 §10 forbids broadening from memory. Raised in
`docs/FOUNDER_QUEUE.md` as a one-line confirmation, not as a research task.

Everything not named in §6a — IndianKanoon, SCC Online, Manupatra, CaseMine, the
Supreme Court's Equivalent Citation Table, tribunal sites, gazette mirrors, state
Act portals — remains `NOT_AUTHORIZED` and nothing in this plan touches any of
them.
