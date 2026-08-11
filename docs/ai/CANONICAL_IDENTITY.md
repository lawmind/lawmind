# CANONICAL DOCUMENT IDENTITY — the model, not citation

**11 August 2026, LCC, per the DATA MOAT / RETRIEVAL EXECUTION PROGRAM, Stage 2.**
Builds directly on `docs/ai/DATA_MOAT_PROGRAM.md` §5 (freshness pipeline, names
this stage's gap explicitly: *"the actual canonical cross-source key is
present in schema but not yet the resolution key any code uses"*) and
`docs/ai/tasks/003-corpus-inventory.md` (found 937 exact-text duplicate
groups, explicitly deferred deciding what to do about them — *"resolving it
changes what `judgments` rows exist and needs its own task"*). This is that
task's identity half; Stage 3 is the dedup-relationship half.

**Citation is explicitly NOT the identity key**, per the directive. A
judgment can carry zero, one, or several reporter citations, and citations
are themselves resolved *against* a held judgment (`judgment_citations`) —
using them as identity would make identity depend on the citator, which
depends on identity. Circular, and citations are additionally sparse: only
`neutralCitation`/`reporterCitations`, both nullable, both absent for most
of the HC bucket pre-2023 (`docs/CORPUS_GAP_PLAN.md`).

---

## 1 · FOUR CONCEPTS, kept distinct because the corpus already needs all four

| concept | question it answers | today's key |
| --- | --- | --- |
| **SOURCE_ARTIFACT** | "which specific fetch produced this row?" | `source_url` (unique-indexed, `judgments_source_url_key`) |
| **DOCUMENT** | "which rows carry byte-identical judgment text?" | `content_hash` (sha256 of `full_text`, migration `0031`) |
| **CASE** | "which legal proceeding does this row belong to?" | `cnr` where present, else `(court, case_number)`, else `UNKNOWN` |
| **VERSION** | "has this exact case/document been corrected or superseded at source?" | not modelled — no source in `docs/ai/DATA_MOAT_PROGRAM.md` §1 republishes a corrected judgment under a stable key today |

**Why four and not one.** The corpus already contains a real example of each
distinction collapsing if identity is treated as one key:

- **One DOCUMENT, many CASEs.** `docs/ai/tasks/003-corpus-inventory.md`'s two
  sampled duplicate groups: a Gujarat 1993 batch judgment disposing of 327
  tagged-along criminal revisions in one 168,002+-character text, and a Patna
  2025 Letters Patent Appeal batch with 56 distinct appellants. Each case
  number is genuinely a different **CASE** (different parties, different
  `case_number`, in the Patna example different appellants entirely) sharing
  one **DOCUMENT** (the court wrote one text for all of them). Collapsing to
  one row per content_hash would delete 326 real case identities; collapsing
  to one canonical case would hide that the text is shared. **Both facts must
  survive**, which is exactly why DOCUMENT and CASE are tracked separately
  rather than as one merged "identity."
- **One CASE, many SOURCE_ARTIFACTs.** `sci.ts`'s own `sourceUrlFor` comment
  (services/ingest/src/sci.ts:96-104, KNOW, read directly): the Supreme Court
  bucket serves the same judgment PDF under two different year-partition
  URLs when a case spans a year boundary — confirmed at scale in
  `docs/ai/AWS_CORPUS_INVENTORY.md` §3, which is *why* the true SC source
  count (38,351) is lower than the naive per-partition footer sum
  (43,532): 5,181 rows are the same document counted under two partitions.
  Two SOURCE_ARTIFACTs (two URLs), one DOCUMENT, one CASE.
- **One DOCUMENT, many SOURCE_ARTIFACTs is not yet distinguished from
  cross-court text reuse** (a High Court order quoting a Supreme Court
  judgment at length would also produce two rows with related but non-
  identical `content_hash`) — flagged as a **known limitation of exact
  content_hash matching**, not solved by this design; Stage 3's NEAR-DUPLICATE
  layer is where that gets addressed, deliberately not here.

## 2 · IDENTITY KEYS, BY COURT CLASS

### High Court / District (where CNR is present)

Per the founder's ordering: **CNR first**, then `(document type, date,
content hash, source identity)` as corroborating/fallback fields — never as
the primary key when CNR exists, because CNR is the eCourts-assigned,
cross-source-stable identifier (`docs/DATA_ADVANTAGE.md`, restated in
`schema.ts`'s own comment on `judgments.cnr`, KNOW).

```
CaseIdentity  = cnr                                  (KNOW: 100% populated,
                                                        both court classes,
                                                        tasks 003 + 007)
DocumentType  = sourceDocumentType                    (KNOW: verbatim from
                                                        source, 0.0% populated
                                                        corpus-wide today —
                                                        DATA_MOAT_PROGRAM.md §6,
                                                        not yet root-caused)
DocumentDate  = judgmentDate
ContentHash   = contentHash                           (KNOW: 100% populated)
SourceIdentity = sourceUrl                            (KNOW: unique per row)
```

**CNR is necessary, not sufficient, for CASE identity.** §8–9 of
`docs/ai/HC_CORPUS_CHARACTERIZATION.md` measured the mobile-variant AWS
bucket at 72.3% average within-file distinct-CNR (range 34.7%–99.8%) — one
CNR legitimately carries many rows, because eCourts assigns one CNR per case
and a case generates many orders. **A shared CNR does not mean a duplicate
DOCUMENT** — it means multiple documents belong to the same CASE, which is
exactly the relationship this model is built to keep visible rather than
collapse.

### Supreme Court

```
CaseIdentity  = cnr, where populated (KNOW: 100%, same backfill as HC)
              ⊕ caseNumber, else       (KNOW: parseCaseNumber reads the
                                         printed "Case No:" field, sci.ts:126 —
                                         for SC this is frequently a bare
                                         diary number, e.g. "MISCELLANEOUS
                                         APPLICATION No. ... " or a plain
                                         diary number with no case-type token,
                                         per sci.ts:142's own comment. There is
                                         no SEPARATE diaryNumber column —
                                         KNOW, checked directly: grep for
                                         diary/diaryNumber across
                                         services/ingest/src finds no such
                                         field. Where the source's "Case No"
                                         is itself a diary number, caseNumber
                                         IS the diary-number identity; this
                                         is not a gap, it is what the source
                                         prints.)
DocumentIdentity = contentHash
SourceIdentity   = sourceUrl
```

**GUESS, stated as such, not built on**: whether the SC bucket's raw metadata
carries a *separate* machine-readable diary-number field distinct from the
printed case number is not verified against `SciMetadataRow`'s actual column
list this session — `sci.ts`'s `parseCaseNumber` reads it out of scraped
HTML (`raw_html`), which argues against a separate structured column, but
the metadata schema itself was not re-read line by line to confirm. If a
future task needs a diary number distinct from the printed case number, this
is the exact question to resolve first — not one to assume answered by this
document.

### Documents without any of the above identifiers

**Handled by design, not by exception.** Every judgment already carries a
non-null `judgmentDate` and `court` (both `NOT NULL` in `schema.ts`), so a
degraded CASE identity always exists: `(court, judgmentDate, contentHash)`.
It is deliberately **weaker** than CNR or case-number identity — it cannot
distinguish two unrelated cases decided by the same court on the same day
with textually distinct judgments that happen to hash differently, which is
the common case, so it degrades gracefully rather than falsely merging.
`identityTier()` (§3) names this explicitly as `'weak'` so nothing downstream
treats it as equivalent to a real CNR match.

## 3 · THE MODULE — `services/ingest/src/identity.ts`

Pure functions only, no I/O, no model calls — deterministic by construction,
matching this repo's existing pattern (`text.ts`'s `isNativeText`,
`sci.ts`'s `toCaseType`) rather than inventing a new one.

```ts
type IdentityTier = 'cnr' | 'case_number' | 'weak';

documentKey(row): string            // = contentHash, or a placeholder that
                                     // never collides with a real hash when
                                     // contentHash is null (full_text has
                                     // never been null on a real row, but the
                                     // type allows it and the function must
                                     // not throw on a not-yet-hashed row)

caseIdentity(row): { key: string; tier: IdentityTier }
                                     // cnr → tier 'cnr'
                                     // (court, caseNumber) → tier 'case_number'
                                     // (court, judgmentDate, contentHash) → tier 'weak'

sourceArtifactKey(row): string      // = sourceUrl, verbatim

isSameDocument(a, b): boolean       // contentHash equality, both non-null
isSameCase(a, b): boolean           // caseIdentity(a).key === caseIdentity(b).key,
                                     // AND same tier (a 'weak' match against a
                                     // 'cnr' match is not evidence of anything —
                                     // stated explicitly, tested explicitly)
```

**Never destructive.** Nothing in this module deletes a row, merges a row,
or writes to `judgments`. It only classifies. Stage 3 (deduplication) is
where a classification becomes a stored relationship, and even there the
instruction is explicit: *"do not destroy provenance when deduplicating."*

## 4 · DETERMINISTIC TESTS

`services/ingest/src/identity.test.ts`, `node:test` + `node:assert`, the same
convention as `text.test.ts`/`sci.test.ts` (no database, no network):

- `documentKey` is stable for identical `contentHash`, distinct for distinct
  hashes, and does not throw on `contentHash: null`.
- `caseIdentity` returns tier `'cnr'` when `cnr` is present, regardless of
  what `caseNumber` says — CNR always wins.
- `caseIdentity` falls back to tier `'case_number'` when `cnr` is null and
  `caseNumber` is present.
- `caseIdentity` falls back to tier `'weak'` when both are null.
- **The Gujarat/Patna case, encoded as a fixture**: two rows sharing one
  `contentHash` but distinct `caseNumber`/`cnr` are `isSameDocument() ===
  true` and `isSameCase() === false` — the exact one-document-many-cases
  shape §1 names, asserted rather than only described.
- **The SC year-boundary case, encoded as a fixture**: two rows sharing one
  `contentHash` and one `cnr` but distinct `sourceUrl` are `isSameDocument()
  === true`, `isSameCase() === true`, `sourceArtifactKey` distinct — the
  one-case-many-source-artifacts shape from `AWS_CORPUS_INVENTORY.md` §3.
- `isSameCase` returns `false`, not a false positive, when both rows are tier
  `'weak'` and coincidentally share `(court, judgmentDate)` but not
  `contentHash` — a negative control, because two unrelated same-day
  same-court judgments are common and must never present as one case.

## 5 · WHAT THIS DOCUMENT DOES NOT DO

- Does not compute or store a `canonical_document_id` against the live
  corpus — that is a materialised relationship, Stage 3's job, not a pure
  function's.
- Does not implement near-duplicate (MinHash/LSH) matching — Stage 3, and
  only after this exact-match layer is landed and tested.
- Does not resolve `docs/ai/DATA_MOAT_PROGRAM.md` §6's open
  `source_document_type` 0.0%-coverage finding — noted here as a field this
  model would use if populated, not re-investigated.
- Does not change any existing loader, migration, or `judgments` row.
