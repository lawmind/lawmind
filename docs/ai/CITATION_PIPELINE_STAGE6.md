# CITATION EXTRACTION + RESOLUTION — Stage 6, measured against production

**11 August 2026, LCC, Stage 6 of the DATA → RETRIEVAL EXECUTION PROGRAM.**
Unlike Stages 2–5, this stage found the pipeline **already substantially
built** across earlier sessions this same day (`docs/CURRENT_PLAN.md` §A2,
§A3c, §A3d, Q1.0b, Q1.0c). This document is the fresh, live re-verification
the founder's instruction asked for — "do not trust old task summaries if the
repository contradicts them" — plus the one concrete gap that verification
found.

## 1 · MEASURED FRESH, matches the documented state exactly

| | measured live, this session |
| --- | --- |
| `judgment_citations` total | 227,478 |
| — real edges (non-sentinel) | 216,238 |
| — sentinels (judgment cites nothing found) | 11,240 |
| — resolved to a held judgment | 97,876 (45.3% of real edges) |
| `judgment_citation_aliases` (AIR/SCC ↔ SCR concordance) | 4,097 |
| distinct unresolved `normalised_citation` forms | 57,600 |
| relationship breakdown | `cites` 211,555 · `followed` 14,028 · `distinguished` 1,734 · `overruled` 117 · `overruled_in_part` 23 · `doubted` 21 |

**No drift found.** Every number matches `docs/ai/DEDUPLICATION.md` and
`docs/CURRENT_PLAN.md`'s own record exactly — the pipeline's state has not
moved since it was last measured, and this session's independent re-query
confirms rather than assumes it.

## 2 · THE PIPELINE, checked against Stage 6's own spec

```
RAW TEXT → DETECT → NORMALIZE → RESOLVE → EXACT MATCH → AMBIGUOUS → UNRESOLVED
```

- **DETECT**: `services/ingest/src/citations.ts`, `PATTERNS` — checked
  directly, not recalled: neutral SC (`2024 INSC 123`), High Court neutral
  (`2023:DHC:2720`, `2023:KHC-D:1`, `-DB`/`-FB` suffixes), SCC (both
  citation-first and year-first house styles), AIR, SCR (both orderings),
  SCALE. **Covers "neutral citations", "SCC", "AIR", "court-specific
  formats" from Stage 6's own list.**
- **NORMALIZE**: `normaliseCitation` — upper-cases, strips reporter
  punctuation, folds the year-first/citation-first SCR and SCC variants to
  one comparable key. Load-bearing, not cosmetic — `judgment_citations`'s
  unique index is keyed on the normalised form.
- **RESOLVE / EXACT MATCH / AMBIGUOUS / UNRESOLVED**: `resolve-cli.ts` +
  `judgment_citation_aliases`. **Never fuzzy-matched** — `cited_judgment_id`
  stays null rather than guessing (`docs/SCHEMA_TRUTH.md` §judgment_citations).
  The **ambiguous** case is refused, not resolved: `docs/CURRENT_PLAN.md`
  Q1.0b's exactly-one-candidate rule found and refused **11 ambiguous keys**
  during the resolver's own concordance pass, and at query time
  `StructuredOutcome` carries a distinct `ambiguous` kind — verified live in
  production, `cite:"2020 INSC 189"` matches three real Supreme Court
  judgments and returns `ambiguous`, never a silent pick
  (`docs/CURRENT_PLAN.md` Q1.14 item 1). **Both extraction-time and
  search-time refuse an ambiguous match rather than choosing one** — the
  safety property Stage 6 asks for is already enforced twice, independently.

**The one rule Stage 6 states as an absolute — "citation → semantic search →
plausible case: NEVER" — is `docs/CURRENT_PLAN.md` §A2.7, already verified
landed in production**: *"structure decides, semantics fills, never blended.
Zero structured matches returns zero, with semantic suggestions in a
SEPARATE field."* Not re-implemented here because it already exists and is
already tested.

## 3 · THE GAP THIS VERIFICATION FOUND: CNR was not searchable

Stage 6's own field list names **CNR** alongside SCC/AIR/neutral citations.
CNR (`docs/ai/CANONICAL_IDENTITY.md`'s canonical cross-source identity key,
100% populated since task 007) was **storable and resolvable at the identity
layer, but had no search entry point** — `services/api/src/search/qlang/
parse.ts`'s `FIELDS` carried `cite` (reporter citation) and `caseno` (printed
case number) but nothing for CNR. An advocate holding a CNR from an eCourts
printout or a court notice had no way to search LawMind by it.

**Fixed**: `cnr` added as a query-language field —
`services/api/src/search/qlang/{parse,compile,explain}.ts`. **Exact match,
never a substring or wildcard** — `j.cnr = value.trim().toUpperCase()` — a
CNR is a system identifier, not a search term, and an advocate typing one
wants that exact case or nothing. `docs/API_CONTRACTS.md` §Structured search
updated additively (contract-frozen sprint discipline — a new field, not a
changed one). `explain.ts`'s `PHRASING` is a `Record<Field, …>`, so omitting
`cnr` would have been a compile error, not a silent gap — the type system
caught what a missed test might not have.

**Verified against production, not just the type system**: fetched a real
row (`cnr = 'ESCR010001891997'`), ran the exact SQL `compile.ts`'s new case
produces, got back exactly one match — the correct judgment — including with
lower-cased input. 2 new tests
(`services/api/src/search/qlang/parse.test.ts`), full qlang suite **40/40**,
`services/api` full suite unaffected (see commit for the regression run).

## 4 · WHAT THIS DOCUMENT DOES NOT DO

- Does not add a stored `resolution_state` enum distinguishing
  "ambiguous-and-refused" from "genuinely absent from the corpus" at the row
  level — both currently read as `cited_judgment_id IS NULL`. **Not a safety
  gap**: the property Stage 6 actually requires (never surface a guessed
  match) is already enforced at both extraction time (the resolver refuses)
  and query time (`ambiguous` is a distinct, surfaced kind). Adding the
  column would be schema complexity for a cosmetic distinction, not a
  correctness fix — deferred rather than built speculatively.
- Does not widen citation DETECT patterns — zero present impact was already
  measured (`docs/CURRENT_PLAN.md` §Q3: every judgment is Supreme Court or
  ingested High Court, and the corpus holds 0 I.T.R./Cri.L.J. citations to
  find).
- Does not build Supreme Court "diary number" as a distinct citation-search
  field — checked directly: no separate structured diary-number column
  exists in source metadata (`docs/ai/CANONICAL_IDENTITY.md` §2 already
  recorded this as GUESS-not-KNOW), and where a diary number is the printed
  case number it is already searchable via `caseno:`.
- Does not touch `apps/**` or any RCC-owned surface.
