# TREATMENT MANIFEST v3 — LCC's 0861 closure folded in, one new row surfaced

NEW3, 20 Aug 2026. Supersedes `TREATMENT_MANIFEST_V2.md` as the one list to
read for "what does the treatment queue need done." `TREATMENT_GRAPH_GAP.md`
stays the narrative/investigation trail. **Do not recreate the bucket
structure — this is an update pass, not a rebuild**, same discipline V2
established.

This is the reconciliation P0 asked for after an LCC signal. The signal is
bus 0861 (`TREATMENT_HELD_UNALIASED_CLOSED`, 2026-08-20T03:30) plus the
resolver artefact `docs/ai/treatment-held-unaliased.json`
(generated 2026-08-20T03:24:19Z, `applied: true`). Every row below was
re-checked directly against the live local cluster this session
(`node scripts/migration/pg-local.mjs psql`), not carried forward from
either of those as an unverified claim — per `CLAUDE.md`'s "render from the
DB row, never from a report" discipline applied to this lane's own work.

---

## 0 · LIVE COUNT, RE-VERIFIED — and it moved, in both directions

```sql
SELECT relationship, count(*) FROM judgment_citations
WHERE relationship IN ('overruled','overruled_in_part','doubted')
  AND cited_judgment_id IS NULL AND coalesce(citation_text,'') <> ''
GROUP BY relationship;
-- doubted 3 · overruled 20 · overruled_in_part 4  =  27
```

V2's figure was 33 (doubted 2 · overruled 26 · overruled_in_part 5). **Down
6 net, not down 7** — 7 rows resolved this session (§1 below) but **one
genuinely new unresolved row appeared**, as a duplicate pair, which is why
`doubted` went *up* by one despite a doubted-class row (Vishnu Kumar Shukla)
being among the 7 resolved. See §4a. This is the same shape of drift
`TREATMENT_GRAPH_GAP.md` already documented once (33-not-32, 18 Aug) —
non-Supreme-Court citing judgments continuing to add rows to a query this
file has always run without a court filter.

**Arithmetic does not close to the row.** 5 of the 7 resolutions this
session came from the `overruled` relationship (§1 below), which should
read 26 − 5 = 21, but the live count shows 20. One row's relationship
classification does not match what this reconciliation expected — **not
re-derived from memory, flagged as unreconciled** rather than forced to
balance. Whoever runs V4 should re-run §0's query fresh and diff row-by-row
against §1–§5 here before trusting either total.

---

## 1 · HELD_LINKED_VERIFIED — 10 rows (was 3 in V2) — nothing further needed

Verified directly: `overruled_status` and `cited_judgment_id` both read from
the live row, not from the resolver artefact's own self-report.

| id | target citation | citing judgment | held judgment | overruled_status | note |
| --- | --- | --- | --- | --- | --- |
| TM-001 | `(1977) 6 SCC 564` (real `(1997) 6 SCC 564`) | Dilip Kumar & Co. | Sun Export Corporation | `set_aside` | Unchanged since V2. |
| TM-002 | `(2016) 12 SCC 125` | Bhavesh Pabari | SEBI v. Roofit Industries | `set_aside` | Unchanged since V2. |
| TM-003 | `AIR 1968 SC 662` | Aligarh Muslim University v. Naresh Agarwal | S. Azeez Basha | `set_aside` | Unchanged since V2. |
| TM-004 | `(1996) 5 SCC 670` | Mineral Area Development Authority v. SAIL | P. Kannadasan etc. v. State of Tamil Nadu (`01b1a470-4166-4b64-bd01-9874f0ff0dd1`) | `set_aside` | **MOVED from V2 §2 this session.** Live-linked and confirmed. |
| TM-005 | `(2005) 1 SCC 394` | State of Punjab v. Davinder Singh | E.V. Chinnaiah v. State of Andhra Pradesh (`683bfe2d-e485-45ce-9045-1eaea273cb28`) | `set_aside` | **MOVED from V2 §2 this session.** |
| TM-006 | `(1990) 1 SCC 109` | State of U.P. v. M/S Lalta Prasad Vaish | Synthetics & Chemicals Ltd. v. State of U.P. (`deacdf12-5bb9-49b7-b7ac-a8bec74ee877`) | `set_aside` | **MOVED from V2 §2 this session.** |
| TM-017 | `(1988) 2 SCC 72` | Joseph Shine v. Union of India | V. Revathi v. Union of India & Ors. (`92c741da-9c48-4126-b75b-a5e081669d55`) | `set_aside` | **NEW row id — was an unnumbered row in V2's §4 UNIDENTIFIED bucket (V1 §1d).** Resolved via the internal `X : Y` printed-pairing method (`[1988] 3 SCR 73 : (1988) 2 SCC 72`), the same mechanism `TREATMENT_GRAPH_GAP.md` §3c/§3d describes — this is the resolver's one genuine link in `treatment-held-unaliased.json` (`linked: true`, `jaccard: 1`). |
| TM-018 | `(2013) 8 SCC 781` | Surendran v. State of Kerala | not independently re-identified this session — held per live query | `partly_set_aside` | **NEW row id — was unnumbered in V2's §4.** Note the relationship on this edge is `overruled_in_part`, so the status is `partly_set_aside`, not `set_aside` — checked, not assumed from the bucket name. |
| TM-019 | `(2015) 3 SCC 353` | Indore Development Authority v. Shailendra | not independently re-identified this session — held per live query | `set_aside` | **NEW row id — V1 §1d explicitly flagged this as "not confirmed to be the same identity" as the §3/TM-012 Velaxan Kumar row for the same citing judgment. It is a distinct target citation and now independently resolved regardless of that open question.** |
| TM-020 | `(1994) 4 SCC 142` | Vishnu Kumar Shukla v. State of U.P. | not independently re-identified this session — held per live query | `doubted` | **NEW row id — was unnumbered in V2's §4.** |

**For LCC:** TM-018/019/020's held-judgment identities were not
independently re-confirmed by this lane this session (no external search
run) — the live query confirms `cited_judgment_id` is set and
`overruled_status` matches the edge's own relationship, which is the
correctness bar `CLAUDE.md` sets for rendering. Full case identity for
these three is a nice-to-have for this file's own record-keeping, not a
blocker to anything downstream.

**Discrepancy with bus 0861:** LCC's message states *"8 edges linked...
P. Kannadasan and 5 more now carry set_aside."* This session's direct query
finds **7** targets newly linked (TM-004, TM-005, TM-006, TM-017 through
TM-020), of which one (TM-018) carries `partly_set_aside` and one (TM-020)
carries `doubted`, not `set_aside` — so "5 more... set_aside" underclaims by
one `set_aside` row (TM-006, Synthetics) and overclaims by including
non-`set_aside` outcomes in a `set_aside`-labelled count, unless LCC's "8"
and "5 more" refer to an edge-count that includes a duplicate
`judgment_citations` row this session's query collapsed. **Not resolved
further** — recorded as a live discrepancy between two independently-run
counts rather than silently adopting either one.

---

## 2 · HELD_BUT_LINKAGE_MISSING — 1 row (was 4 in V2) — LCC alias/link work, NOT a provider target

| id | target citation | citing judgment | held judgment (id) | judgment_date | overruled_status | evidence |
| --- | --- | --- | --- | --- | --- | --- |
| TM-007 | `AIR 1987 SC 2158` | State of Punjab v. Bhajan Kaur | M.K. Kunhimohammed v. P.A. Ahmedkutty (`d314cd69-58de-4afd-9ce6-319a373791e2`) | 1987-09-01 | **none** | **Still unfixed — LCC's own resolver confirms the refusal reason directly** (`treatment-held-unaliased.json`: `"refusal": "no printed SCR pairing for this citation in the citing judgment"`). Held under `[1987] 3 S.C.R. 1149`; the citing judgment cites the AIR form only, with no `X : Y` printed pair for the automated method to use. **Requires a manual alias, not another resolver run.** |

---

## 3 · NOT_HELD — 7 identities / 8 rows — unchanged from V2

No new evidence this session; not re-verified against the DB again since
V2's 20 Aug check already re-confirmed absence with `court ILIKE
'%supreme%'` scoping. See `TREATMENT_MANIFEST_V2.md` §3 for TM-008 through
TM-015, unchanged.

---

## 4 · UNIDENTIFIED — 15 rows (was 19 in V2/V1) — 4 moved to §1 this session

The 4 that moved: TM-017 (Joseph Shine target), TM-018 (Surendran target),
TM-019 (Indore Development Authority second target), TM-020 (Vishnu Kumar
Shukla target) — see §1.

Remaining 15, copied unchanged from V1 §1d / V2 §4, **not re-verified this
session** (no external-identification work done — same budget note V2
recorded):

| target citation | citing judgment |
| --- | --- |
| `(2021) 4 SCC 379` | N.N. Global Mercantile v. Indo Unique Flame |
| `(2007) 1 SCC 663` | Chairman-cum-MD, Mahanadi Coalfields v. Rabindranath Choubey |
| `(2004) 6 SCC 689` | State of MP v. Lafarge Dealers Association |
| `(2000) 9 SCC 63` | M/S. Vijay Industries v. Commissioner of Income Tax |
| `(2018) 1 SCC 340` | Janabai v. Additional Commissioner |
| `(2014) 1 SCC 1` | Navtej Singh Johar v. Union of India |
| `[2013] 17 SCR 1019` | Navtej Singh Johar v. Union of India (dup target, different citation form) |
| `(2009) 3 SCC 506` | Indian Oil Corporation v. Sunita Kumari |
| `(2005) 11 SCC 600` | Anvar P.V. v. P.K. Basheer |
| `(1996) 9 SCC 766` | Bharat Parikh v. C.B.I. |
| `2003 (6) SCC 675` | Radhey Shyam v. Chhabi Nath |
| `(2015) 13 SCC 713` | M/S Lion Engineering Consultants v. State of M.P. |
| `AIR 2015 SC 710` | M/S Lion Engineering Consultants v. State of M.P. (dup target) |
| `(2017) 4 SCC 150` | Santhini v. Vijaya Venketesh |
| `2000 (4) SCC 130` | United India Insurance v. Shila Datta |

**Next external-identification cycle should start here** — same
recommendation V2 made, still true.

---

## 4a · NEW THIS SESSION — a genuinely new unresolved `doubted` pair, not in any prior version

```
citation_text: (2003) 2 S.C.C. 3   relationship: doubted   ×2 (duplicate rows)
citing: SHRI PANDIT KESHAV CHIPADE Vs SHRI ATMARAM BALKRISHNA THAKAR AND ANR.
court: Bombay High Court   judgment_date: 2010-03-19
```

**Not in V1, not in V2, not in `TREATMENT_GRAPH_GAP.md`'s 34/33-row table.**
This is why §0's `doubted` count went *up* despite a doubted-class row
resolving this session. Two duplicate `judgment_citations` rows, same
citation text, same citing judgment — the same duplicate-edge shape
`TREATMENT_GRAPH_GAP.md` §2 already flagged for other citations
(e.g. `(2011) 14 SCC 66`).

**Same risk shape as TM-016 (the Caritas/Kerala HC rejected row):** citing
court is a **High Court**, not the Supreme Court, so this is not "an SC
judgment declaring another SC judgment overruled" — the exact pattern that
turned out to be a likely misextraction for TM-016. **Not triaged this
session** — no text-window read was done to determine whether this is a
genuine `doubted` relationship, a `(supra)` backreference misattribution
like TM-016, or something else. Flagged here rather than run through any
resolver or concordance tool unreviewed, per the same discipline TM-016
established. **Next NEW3 identification cycle's first item**, ahead of the
15-row §4 backlog — a HC-sourced `doubted` edge that has never been read is
higher-uncertainty than an already-triaged SC-sourced unidentified target.

---

## 5 · REJECTED_EXTRACTION_ERROR — 1 row — unchanged from V2

TM-016, `(2017) 14 SCC 533` / Caritas Ayurvedic Hospital Trust. No new
evidence. See V2 §5.

---

## 6 · COUNT RECONCILIATION

10 (§1) + 1 (§2) + 8 (§3) + 15 (§4) + 2 (§4a, new) + 1 (§5) = **37 rows
tracked**, against a live raw SQL count of 27 unresolved
(§2's 1 + §3's 8 + §4's 15 + §4a's 2 + §5's 1 = 27 — **this closes exactly**,
matching §0's live count). §1's 10 are resolved-and-closed, correctly
excluded from the unresolved total. **The discrepancy flagged in §0 is
therefore not a row-count problem** — every row is accounted for between
§1 (closed) and §2–§5 (open, 27, matching SQL exactly) — **it is specifically
that this session cannot independently verify LCC's "8 edges" / "5 more"
phrasing against its own "7 targets, 3 non-`set_aside`" count.** Recorded as
open, not force-reconciled.

---

## 7 · WHAT CHANGED FROM V2, IN ONE TABLE

| row | V2 bucket | V3 bucket | why |
| --- | --- | --- | --- |
| TM-004 (Kannadasan) | §2 | §1 | live-linked, `set_aside` — LCC's 0861 closure |
| TM-005 (Chinnaiah) | §2 | §1 | live-linked, `set_aside` — LCC's 0861 closure |
| TM-006 (Synthetics) | §2 | §1 | live-linked, `set_aside` — LCC's 0861 closure |
| TM-017 (Joseph Shine target = V. Revathi) | §4, unnumbered | §1 | live-linked, `set_aside` — the one `linked: true` row in `treatment-held-unaliased.json` |
| TM-018 (Surendran target) | §4, unnumbered | §1 | live-linked, `partly_set_aside` |
| TM-019 (Indore Development Authority 2nd target) | §4, unnumbered | §1 | live-linked, `set_aside` |
| TM-020 (Vishnu Kumar Shukla target) | §4, unnumbered | §1 | live-linked, `doubted` |
| TM-007 (Kunhimohammed) | §2 | §2 (unchanged) | resolver explicitly refuses — no printed pairing; needs a manual alias |
| `(2003) 2 S.C.C. 3` ×2 (Chipade, Bombay HC) | did not exist in V2 | §4a, new, untriaged | genuinely new row, same risk shape as TM-016 |
| everything else | — | — | unchanged |

---

## 8 · WHAT THIS UNBLOCKS

- **LCC**: §2's 1 row (TM-007, Kunhimohammed) needs a manual alias — the
  automated printed-pairing method has already refused it explicitly, so
  another resolver run will not help.
- **NEW3 next cycle**: §4a's new HC-sourced `doubted` pair is the highest-
  priority triage item — untriaged, same risk class as a row already found
  to be a misextraction once. §4's 15-row backlog is next after that.
- **P1 (Supreme Today)**: §3's 7 identities are unchanged and still the
  first-batch provider query list once credentials exist — see V2 §8.
