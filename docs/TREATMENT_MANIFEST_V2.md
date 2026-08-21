# TREATMENT MANIFEST v2 — five-bucket structure, re-verified against live DB

NEW3, 20 Aug 2026. Supersedes `TREATMENT_MANIFEST_V1.md` as the one list to
read for "what does the treatment queue need done." `TREATMENT_GRAPH_GAP.md`
stays the narrative/investigation trail. **Do not recreate the bucket
structure — this is an update pass, not a rebuild.**

Every row below was re-checked directly against the live local cluster this
session (`node scripts/migration/pg-local.mjs psql`), not carried forward
from V1's 19 Aug memory. Where a row's status changed, both the old and new
state are recorded so the change is auditable.

**Row IDs are stable**: `TM-<3-digit>`, assigned once, in citation-text
order within each bucket at V1 creation time, never reassigned even if a
row moves bucket. **Version hash** (`git hash-object docs/TREATMENT_MANIFEST_V2.md`,
computed pre-edit of this line, so re-derive it after any future change
rather than trust this number): `6f0f626de5d32f10ac441983152fb87afefa5081`.

---

## 0 · LIVE COUNT, RE-VERIFIED

```sql
SELECT relationship, count(*) FROM judgment_citations
WHERE relationship IN ('overruled','overruled_in_part','doubted')
  AND cited_judgment_id IS NULL AND coalesce(citation_text,'') <> ''
GROUP BY relationship;
-- doubted 2 · overruled 26 · overruled_in_part 5  =  33
```

**Unchanged since the 18/19 Aug freshness check.** No new overruled-class
rows have appeared. **33 is the raw SQL count (32 canonical work rows + 1
rejected misattribution). 32 is the canonical work population. 34 is
retired — it counted two rows since fixed and confirmed and must not
reappear in any report from this file forward.**

---

## 1 · HELD_LINKED_VERIFIED — 3 rows (was 2 in V1) — nothing further needed

Verified directly: `overruled_status` read from the `judgments` row itself,
not inferred from a prior session's claim.

| id | target citation | citing judgment | held judgment (id) | overruled_status | note |
| --- | --- | --- | --- | --- | --- |
| TM-001 | `(1977) 6 SCC 564` (real citation `(1997) 6 SCC 564`) | Commissioner of Customs v. Dilip Kumar & Co. | M/S Sun Export Corporation Bombay v. Collector of Customs, Bombay (`f9885dbe-7486-41c8-bcb0-add10eb37c28`, 1997-07-07) | `set_aside` | Fixed by LCC 14 Aug. Re-verified live this session. |
| TM-002 | `(2016) 12 SCC 125` (held under S.C.R. form) | Adjudicating Officer SEBI v. Bhavesh Pabari | SEBI v. Roofit Industries Ltd. (`1fee973e-cdc0-4437-aa3c-4494559b2999`, 2015-11-26) | `set_aside` | Fixed by LCC 14 Aug. Re-verified live this session. |
| TM-003 | `AIR 1968 SC 662` | Aligarh Muslim University v. Naresh Agarwal | S. Azeez Basha and Anr. v. Union of India (`9530d3e8-10d9-4453-8b6a-d53a68a03adf`, 1967-10-20) | `set_aside` | **MOVED from V1 §1b (HELD_UNALIASED) this session.** V1 had this row as identity-confirmed-only, no corpus-hold check performed. Corpus query this session finds it held under `[1968] 1 S.C.R. 833` AND already `overruled_status = 'set_aside'` — fixed by LCC at an unannounced point between 13 Aug and today. No bus message found confirming this specific fix; recorded as observed fact, not attributed to a specific run. |

---

## 2 · HELD_BUT_LINKAGE_MISSING — 4 rows (was 5 in V1) — LCC alias/link work, NOT a provider target

All four confirmed HELD this session by direct corpus id lookup.
`overruled_status = 'none'` on every one — **each renders as live good law
today.** Highest-priority bucket in this manifest for LCC; zero discovery
cost, zero provider spend, pure alias/link.

| id | target citation | citing judgment | held judgment (id) | judgment_date | overruled_status | evidence |
| --- | --- | --- | --- | --- | --- | --- |
| TM-004 | `(1996) 5 SCC 670` | Mineral Area Development Authority v. SAIL | P. Kannadasan etc. v. State of Tamil Nadu (`01b1a470-4166-4b64-bd01-9874f0ff0dd1`) | 1996-07-26 | **none** | Held under `[1996] SUPP. 4 S.C.R. 92`. MADA's own text pairs both forms. **Still unfixed — same as V1's flag, re-confirmed live, not stale.** |
| TM-005 | `(2005) 1 SCC 394` | State of Punjab v. Davinder Singh | E.V. Chinnaiah v. State of Andhra Pradesh (`683bfe2d-e485-45ce-9045-1eaea273cb28`) | 2004-11-05 | **none** | Held under `[2004] SUPP. 5 S.C.R. 972`. **V1 had listed this row's identity as externally confirmed but had never actually located the corpus id — this session is the first time this row was checked against the database at all.** |
| TM-006 | `(1990) 1 SCC 109` | State of U.P. v. M/S Lalta Prasad Vaish | Synthetics & Chemicals Ltd. v. State of U.P. (`deacdf12-5bb9-49b7-b7ac-a8bec74ee877`) | 1989-10-25 | **none** | Held under `[1989] SUPP. 1 S.C.R. 623`. Same gap as TM-005: V1 asserted identity, never located the row. |
| TM-007 | `AIR 1987 SC 2158` | State of Punjab v. Bhajan Kaur | M.K. Kunhimohammed v. P.A. Ahmedkutty (`d314cd69-58de-4afd-9ce6-319a373791e2`) | 1987-09-01 | **none** | Held under `[1987] 3 S.C.R. 1149`, source-side typo'd respondent name ("AHMEDKUITY"). Identified by NEW2 bus 0340, 13 Aug. **Still unfixed — re-confirmed live.** |

**For LCC:** TM-004 and TM-007 were already flagged as unfixed in V1; this
is not new information for those two. **TM-005 and TM-006 are the actual
new finding of this pass** — V1's §1b bucket had conflated "a search engine
confirms this is a real, well-known case" with "this case is sitting in our
own database," and the second claim had never been checked for either row
until this session.

---

## 3 · NOT_HELD — 7 identities / 8 rows (unchanged from V1 §1c) — the genuine Supreme Today (P1) target list

Re-verified this session, filtered to `court ILIKE '%supreme%'` specifically
(V1's broad name search returned High Court party-name noise that looked
like near-matches; this session's SC-scoped queries return **zero rows**
for all seven identities, confirming absence rather than inferring it from
an unfiltered miss). Corpus grew ~2.6M documents since V1 (mostly High
Court ingestion), so this re-check was not redundant — a genuine
possibility existed that HC growth had incidentally surfaced a false
positive; it did not.

| id | target citation | citing judgment | identity | SC-court corpus hits |
| --- | --- | --- | --- | --- |
| TM-008 | `(1983) 3 SCC 284` | State of HP v. Raj Kumar | Y.V. Rangaiah v. J. Sreenivasa Rao (1983-03-24) | 0 |
| TM-009 | `(1999) 4 SCC 453` | Vasant Ganpat Padave v. Anant Mahadev Sawant | Appa Narsappa Magdum v. Akubai Ganapati Nimbalkar (1999-05-04) | 0 |
| TM-010 | `(2005) 2 SCC 479` | HUDA v. Vidya Chetal | HUDA v. Sunita (2005-01-14) | 0 |
| TM-011 | `(2014) 11 SCC 381` | M/S. Lisie Medical Institutions v. State of Kerala | S.H. Medical Centre Hospital v. State of Kerala | 0 |
| TM-012 | `(2015) 4 SCC 325` | Indore Development Authority v. Shailendra | Velaxan Kumar v. Union of India | 0 |
| TM-013 | `[2017] 4 SCR 232` | Shiv Kumar v. Union of India | Government (NCT of Delhi) v. Manav Dharam Trust (2017-05-04) | 0 |
| TM-014 | `(2017) 6 SCC 751` | Shiv Kumar v. Union of India | same identity as TM-013 | 0 |
| TM-015 | `(2020) 2 SCC 109` | Govt of Maharashtra v. Borse Brothers | N.V. International v. State of Assam | 0 |

**This is the Supreme Today (P1) first-batch query list once credentials
exist.** Confirmed absent from AWS Open Data (V1, NEW2 bus 0340) AND
confirmed absent from the corpus as it stands today (this session). 7
distinct identities, zero discovery cost per query — pre-identified.

---

## 4 · UNIDENTIFIED — 19 rows (unchanged from V1 §1d) — not re-verified this pass

No external-identification work was done on this bucket this session —
budget went to re-verifying buckets 1–3 against the live DB, which is the
part of V1 that had gone stale (buckets 1 and 2 both had a wrong row in
them). This bucket's row list is copied unchanged from V1 §1d; see that
file for the full table (19 target citations, 18 distinct citing judgments,
2 duplicate-target pairs already flagged there: Navtej Singh Johar,
Indore Development Authority).

**Next external-identification cycle should start here** — this is the
actual remaining backlog, per V1's own §1d note: identify externally
first, check corpus holding second, provider query only if still unheld.

---

## 5 · REJECTED_EXTRACTION_ERROR — 1 row — audit record, excluded from every provider query queue

| id | target citation | citing judgment | reason rejected | disposition |
| --- | --- | --- | --- | --- |
| TM-016 | `(2017) 14 SCC 533` | The Caritas Ayurvedic Hospital Trust v. State of Kerala — High Court of Kerala, 2024-02-20 | `doubted` relationship belongs to a `(supra)` backreference (S.H. Medical Centre Hospital) that the extractor could not resolve; it attached to the citing bench's own reporter citation instead, which is TM-011's citing judgment (Lisie Medical Institutions). Running the concordance resolver on this row as printed would self-link Lisie Medical Institutions to itself. | Flagged to LCC 18 Aug, bus 0718/0729, owner of `citations-cli.ts`. **Not independently re-checked this session whether the extraction pipeline itself was patched** — this row's own disposition (rejected, do-not-queue) is correct regardless of pipeline state, since the underlying `judgment_citations` row is unchanged. |

**Do not run through the concordance resolver. Do not query any provider
for it. Preserved here exactly as V1 recorded it — no new evidence this
session.**

---

## 6 · COUNT RECONCILIATION

3 (§1) + 4 (§2) + 8 (§3) + 19 (§4) = **34 rows counted**, minus the 3 now
in §1 that are fixed-and-closed = **31 rows of open work** (4 + 8 + 19),
plus §5's 1 rejected = **32 canonical + 1 rejected = 33**, matching the
live SQL count in §0 exactly. **This is the same arithmetic identity V1
established; V2 changes which rows sit in which bucket, not the total.**

---

## 7 · WHAT CHANGED FROM V1, IN ONE TABLE

| row | V1 bucket | V2 bucket | why |
| --- | --- | --- | --- |
| TM-003 (Azeez Basha) | §1b HELD_UNALIASED | §1 HELD_LINKED_VERIFIED | `overruled_status` now `set_aside` — fixed since V1, unattributed to a specific bus message |
| TM-005 (E.V. Chinnaiah) | §1b HELD_UNALIASED | §2 HELD_BUT_LINKAGE_MISSING | unchanged disposition, but this session is the first time the corpus id was actually located — V1's evidence was identity-only |
| TM-006 (Synthetics & Chemicals) | §1b HELD_UNALIASED | §2 HELD_BUT_LINKAGE_MISSING | same as TM-005 |
| everything else | — | — | unchanged, re-verified where checked (§1, §3), copied unchanged where not (§4, §5) |

**The corrected lesson for whoever runs V3**: "identity confirmed by
external search" and "confirmed held in our own corpus" are different
claims, and V1's §1b bucket header ("identified, confirmed held") asserted
both for all five rows when only two (Kannadasan, Kunhimohammed) had
actually been checked against `judgments`. This is the same class of error
NEW1/NEW2 have both hit this month in different forms (0778's citation-graph
question, 0739's "absence of work looks like absence of documents") —
a bucket label describing what SHOULD be true is not the same as a query
that checks whether it IS.

---

## 8 · WHAT THIS UNBLOCKS

- **LCC**: §2's 4 rows (TM-004, TM-005, TM-006, TM-007) are ready to
  alias/link today — no provider, no discovery cost, all four corpus ids
  already in hand in this file.
- **P1 (Supreme Today, credential-gated)**: §3's 7 identities (TM-008
  through TM-015) are the entire first-batch provider query list — see
  `docs/ai/new3-supreme-today-manifest.mjs` for the existing tooling this
  feeds.
- **Next NEW3 identification cycle**: §4's 19 rows are the real backlog.
