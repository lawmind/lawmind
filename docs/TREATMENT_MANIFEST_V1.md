# TREATMENT MANIFEST v1 — canonical work list, 33 collapsed to 32 + 1 rejected

NEW3, 19 Aug 2026. Supersedes counting "32 / 33 / 34" as interchangeable
across the bus and `TREATMENT_GRAPH_GAP.md`. **This is the one list to read
for "what does the treatment queue need done."** `TREATMENT_GRAPH_GAP.md`
stays as the narrative/investigation trail — do not duplicate its evidence
here, only its conclusions, versioned.

Live count today (`judgment_citations`, `relationship IN
('overruled','overruled_in_part','doubted') AND cited_judgment_id IS NULL
AND citation_text <> ''`): **33 rows.** One is not a real target — see
§0 REJECTED. **32 rows are the actual canonical work population.**

---

## 0 · REJECTED — audit record, excluded from every provider query queue

| target citation | citing judgment | reason rejected | disposition |
| --- | --- | --- | --- |
| `(2017) 14 SCC 533` | The Caritas Ayurvedic Hospital Trust v. State of Kerala — **High Court of Kerala**, 2024-02-20 (not Supreme Court) | Extraction misattribution. Source text: *"…doubted the correctness of certain observations contained in S.H.Medical Centre Hospital (supra)…"* — the `doubted` relationship belongs to the `(supra)` backreference (S.H. Medical Centre Hospital), not to `(2017) 14 SCC 533`, which is the citing bench's OWN reporter citation (Lisie Medical Institutions' SC citation, already held as the citing judgment on a separate row below). Running the concordance resolver on this citation as printed would link Lisie Medical Institutions to itself. | **Do not run through concordance resolver. Do not query any provider for it.** Flagged to LCC (owns `citations-cli.ts`) 18 Aug, bus 0718/0729 — not fixed by this lane, this lane does not touch extraction code. Full account: `TREATMENT_GRAPH_GAP.md` top section. |

This is the only misattribution found to date. Not evidence there are no
others — no row-by-row extraction audit has been run on the remaining 32.

---

## 1 · CANONICAL WORK POPULATION — 32 rows, by disposition bucket

Source for every row: `TREATMENT_GRAPH_GAP.md` §2 (original 34-row table),
§3b/§3e (external identification), cross-referenced against the two
already-applied fixes (§1c below). No target identified here from memory —
every identity below was independently external-sourced by a prior NEW3/LCC/
NEW2 pass, cited to its section.

### 1a · HELD_LINKED — already fixed, closed, needs nothing further (2 rows)

| target citation (as printed, may be wrong — see identity) | citing judgment | identity | fix applied |
| --- | --- | --- | --- |
| `(1977) 6 SCC 564` | Commissioner of Customs v. Dilip Kumar & Co. | Sun Export Corporation v. Collector of Customs — citing text prints the wrong year, real citation `(1997) 6 SCC 564` | `cited_judgment_id` set, `overruled --confirm` run, verified `overruled_status='set_aside'` — LCC, 14 Aug |
| `(2016) 12 SCC 125` | Adjudicating Officer SEBI v. Bhavesh Pabari | SEBI v. Roofit Industries — held only under its S.C.R. form `[2015] 12 S.C.R. 190` | `cited_judgment_id` set, `overruled --confirm` run, verified `overruled_status='set_aside'` — LCC, 14 Aug |

**No provider query needed.** Corpus-internal fix, done.

### 1b · HELD_UNALIASED — identified, confirmed held, LCC alias/link work only — NOT a provider target (5 rows)

| target citation | citing judgment | identity | evidence |
| --- | --- | --- | --- |
| `(1996) 5 SCC 670` | Mineral Area Development Authority v. SAIL | P. Kannadasan v. State of Tamil Nadu, `1996 INSC 800` | MADA's own text: *"P Kannadasan v. State of Tamil Nadu [1996] Supp. 4 SCR 92 : (1996) 5 SCC 670 – overruled."* `TREATMENT_GRAPH_GAP.md` §3b. **As of 13 Aug still `overruled_status='none'`, rendering as live good law — this is the one row in this bucket confirmed NOT yet fixed, unlike the two in §1a. Highest-priority row in this entire manifest for LCC, not for any provider.** |
| `AIR 1968 SC 662` | Aligarh Muslim University v. Naresh Agarwal | S. Azeez Basha and Anr. v. Union of India (1968 AIR 662) | Multiple independent external sources (BusinessToday, EPW, Supreme Court Observer, bnblegal). `TREATMENT_GRAPH_GAP.md` §3b |
| `(2005) 1 SCC 394` | State of Punjab v. Davinder Singh | E.V. Chinnaiah v. State of Andhra Pradesh | SCC Online's own blog, Wikipedia, two case-law sites. `TREATMENT_GRAPH_GAP.md` §3b |
| `(1990) 1 SCC 109` | State of U.P. v. M/S Lalta Prasad Vaish | Synthetics and Chemicals Ltd. v. State of U.P. | Confirmed via search. `TREATMENT_GRAPH_GAP.md` §3b |
| `AIR 1987 SC 2158` | State of Punjab v. Bhajan Kaur | M.K. Kunhimohammed v. P.A. Ahmedkutty (1 Sep 1987) | Held under a source-side typo'd party name ("AHMEDKUITY") and under its S.C.R. citation `[1987] 3 S.C.R. 1149`, not AIR. `id d314cd69-58de-4afd-9ce6-319a373791e2`. NEW2, bus 0340, 13 Aug |

**No provider query needed for any of these 5** — all already sitting in the
corpus. This bucket is pure alias-linking work, LCC's, not NEW3's, not a
Supreme Today spend.

### 1c · NOT_HELD_AT_SOURCE — confirmed absent from AWS Open Data, the only genuine provider-acquisition candidates in this manifest (8 rows, 7 distinct identities)

Checked against AWS's own per-year SC parquet metadata directly (NEW2, bus
0340, 13 Aug) — by exact decision date where known, by distinctive
party-name substring otherwise. Zero false-positive near-matches accepted
(Manav Dharam Trust surfaced a plausible but wrong 2025 Rajasthan HC match,
checked and ruled out by subject matter).

| target citation | citing judgment | identity | decision date checked |
| --- | --- | --- | --- |
| `(1983) 3 SCC 284` | State of HP v. Raj Kumar | Y.V. Rangaiah v. J. Sreenivasa Rao | 1983-03-24 |
| `(1999) 4 SCC 453` | Vasant Ganpat Padave v. Anant Mahadev Sawant | Appa Narsappa Magdum v. Akubai Ganapati Nimbalkar (independently reported as `(1999) 4 SCC 443`) | 1999-05-04 |
| `(2005) 2 SCC 479` | HUDA v. Vidya Chetal | HUDA v. Sunita | 2005-01-14 |
| `(2014) 11 SCC 381` | M/S. Lisie Medical Institutions v. State of Kerala | S.H. Medical Centre Hospital v. State of Kerala | not dated — name search only |
| `(2015) 4 SCC 325` | Indore Development Authority v. Shailendra | Velaxan Kumar v. Union of India | not dated — name search only |
| `[2017] 4 SCR 232` | Shiv Kumar v. Union of India | Government (NCT of Delhi) v. Manav Dharam Trust | 2017-05-04 |
| `(2017) 6 SCC 751` | Shiv Kumar v. Union of India | **same target as above — one identity, two citation-form rows** | 2017-05-04 |
| `(2020) 2 SCC 109` | Govt of Maharashtra v. Borse Brothers | N.V. International v. State of Assam | not dated — name search only |

**This is the actual Supreme Today (P0) target list once the account
exists** — 7 identified case names AWS does not hold, which is exactly the
gap a paid citator/full-text provider could close. **Do not query a
provider for anything in §1a, §1b, or §1d — those are either already fixed
or already held.** When Supreme Today access lands, priority order for the
first-use manifest: these 7 identities first (they are pre-identified,
zero discovery cost per query), ahead of generic treatment/currentness
sweeps.

### 1d · UNIDENTIFIED — no external check run yet, 19 rows

Not run through external verification by any lane to date. **Do not send
these to a provider query queue as-is** — spending a paid query to both
discover identity AND confirm holding status in one call is the wrong
order of operations per `P9` (provider → observation → primary
verification): identify first via free means (external search, the SCI
Equivalent Citation Table, the 656-judgment internal paired-citation
source), THEN check AWS holding, THEN — only if genuinely not held — query
a provider. Listed here so the population is visibly bounded, not to imply
work has started on them.

| target citation | citing judgment |
| --- | --- |
| `(1994) 4 SCC 142` | Vishnu Kumar Shukla v. State of U.P. |
| `(2021) 4 SCC 379` | N.N. Global Mercantile v. Indo Unique Flame |
| `(2007) 1 SCC 663` | Chairman-cum-MD, Mahanadi Coalfields v. Rabindranath Choubey |
| `(2004) 6 SCC 689` | State of MP v. Lafarge Dealers Association |
| `(2000) 9 SCC 63` | M/S. Vijay Industries v. Commissioner of Income Tax |
| `(1988) 2 SCC 72` | Joseph Shine v. Union of India |
| `(2018) 1 SCC 340` | Janabai v. Additional Commissioner |
| `(2014) 1 SCC 1` | Navtej Singh Johar v. Union of India |
| `[2013] 17 SCR 1019` | Navtej Singh Johar v. Union of India (dup target of row above, different citation form) |
| `(2015) 3 SCC 353` | Indore Development Authority v. Shailendra (second target row, same citing judgment as §1c's Velaxan Kumar row — not confirmed to be the same identity) |
| `(2009) 3 SCC 506` | Indian Oil Corporation v. Sunita Kumari |
| `(2005) 11 SCC 600` | Anvar P.V. v. P.K. Basheer |
| `(1996) 9 SCC 766` | Bharat Parikh v. C.B.I. |
| `2003 (6) SCC 675` | Radhey Shyam v. Chhabi Nath |
| `(2013) 8 SCC 781` | Surendran v. State of Kerala |
| `(2015) 13 SCC 713` | M/S Lion Engineering Consultants v. State of M.P. |
| `AIR 2015 SC 710` | M/S Lion Engineering Consultants v. State of M.P. (dup target of row above) |
| `(2017) 4 SCC 150` | Santhini v. Vijaya Venketesh |
| `2000 (4) SCC 130` | United India Insurance v. Shila Datta |

---

## 2 · COUNT RECONCILIATION

2 (§1a) + 5 (§1b) + 8 (§1c) + 19 (§1d) = **34 historical rows.** 34 − 2
(§1a, already fixed before this manifest) = **32 canonical current-work
rows**, matching `TREATMENT_GRAPH_GAP.md`'s "32, was 34" framing. Adding
back the §0 misattribution (excluded, not counted) explains the live SQL
count of 33. **Use 32 going forward as the work population; 33 only when
quoting the raw unfiltered SQL count; never 34 — that count included the
two now-fixed rows.**

---

## 3 · WHAT THIS UNBLOCKS

- **LCC**: §1b's 5 rows (1 of them — P. Kannadasan — still live-risk
  unfixed) are ready to alias/link today, no provider, no discovery cost.
- **P0 (Supreme Today, blocked on credential)**: when the account exists,
  §1c's 7 identities are the entire first-batch provider query list for
  this manifest — pre-identified, AWS-confirmed-absent, nothing else in
  this file should be queried.
- **Future identification pass (NEW3, next available cycle)**: §1d's 19
  rows are the actual remaining backlog. External-search identification
  first, AWS-holding check second, provider query only if still unheld.
