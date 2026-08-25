# SUPPRESSION_REDACTION_CAPABILITY_AUDIT_V1

**Lane:** NEW2 · **Round:** R7 §10 (P1) · **25 August 2026**

> R7 §10: *"Do not change legal content from an unverified policy assumption…
> The engineering goal this sprint is capability/readiness, not inventing legal
> rules."*

This audit **invents no legal rule** and proposes no policy about victim or minor
identification, de-indexing, retention or takedown. It answers one engineering
question: **if we were required to suppress or redact a judgment tomorrow, could
we?**

---

## Verdict: NO. There is no mechanism, at any layer.

| capability | present? | evidence |
| --- | --- | --- |
| suppress a judgment from **search** | **NO** | no visibility/suppression column on `judgments`; `retrieve.ts` applies no row-level exclusion of any kind |
| suppress a judgment from **display** by id | **NO** | `GET /judgments/:id` selects by primary key with no gate |
| **redact** a rendered representation while keeping the source | **NO** | one `full_text` column, no rendered/derived variant, no redaction layer |
| suppress a judgment from **retrieval embeddings** | **NO** | removing it from `new1_doc_vector_stage` is a delete, not a suppression, and is not reversible or audited |
| **preserve source/audit provenance** across a suppression | **NO** | nothing to preserve, because nothing suppresses |
| erase a **user's** data | **YES** | `services/api/src/auth/erasure.ts`, `erasure_objects`, with external-object proof |

**The one erasure capability that exists is for user data and does not touch the
corpus.** `eraseUser` removes a person's account, matters and R2 objects. It has
no path to a judgment.

---

## 1. What was checked

- **Schema.** `judgments` has 39 columns. None matches `suppress%`, `visib%`,
  `redact%`, `hidden%` or `publish%`. Verified by
  `information_schema.columns` — zero rows.
- **Serving path.** `services/api/src/search/retrieve.ts` joins `judgments` only
  when a filter needs it, and the filters are court, date and document class.
  There is no exclusion predicate that a suppression flag could hang from.
- **Rendering.** `overruled_status` is read live on every render — the one
  live-read corpus signal that exists — but it *annotates*; it never withholds.
  The closest thing to withholding is `precedentialEffect` refusing
  add-to-matter, and even that returns and displays the judgment.
- **Storage.** `storage_key IS NOT NULL` is true for **0** of 18,698,984
  documents. There is no source object to redact, and equally no source object
  to prove a redaction against.

## 2. Why "just delete the row" is not the answer

A delete is not a suppression and would be actively worse:

- **It is not reversible.** A takedown that turns out to be mistaken, or that
  expires, cannot be undone.
- **It leaves no audit trail.** The requirement in R7 is *suppress while
  preserving source/audit provenance*. A delete destroys exactly what must be
  preserved.
- **It is not observable downstream.** `judgment_citations` rows would point at a
  missing target and silently become `TARGET_NOT_HELD`, which is
  indistinguishable from a coverage gap — a **silent drop**, which
  `docs/CITATION_HARNESS.md` forbids as a class.
- **It does not reach the derived stores.** Paragraphs, vectors, chunks and
  citation keys would retain the content or a fingerprint of it. LCC measured
  that deleting one judgment sequentially scanned 151 GB (bus 1070); the cost is
  not the problem, the incompleteness is.

## 3. The shape a capability would need — described, not built

Recorded so that if a requirement arrives it is not designed under time
pressure. **Not built this sprint**, because building a content-suppression
mechanism with no verified requirement is the "unverified policy assumption" R7
forbids.

1. **A reversible state on the judgment, not a delete.**
   `suppression_state ∈ (none, hidden_from_search, hidden_from_display, redacted)`
   plus `suppression_reason`, `suppressed_at`, `suppressed_by`,
   `suppression_authority` (the instrument requiring it). Append-only history.
2. **Enforced server-side in one place.** A single predicate in the retrieval and
   judgment-read paths, with a test that a suppressed id returns the suppressed
   state and never the content — the shape `deployed-judgment-safety.test.ts`
   already uses for other guarantees.
3. **Reaching the derived stores by construction.** Paragraphs, vectors and
   chunks filter through the same predicate rather than being separately purged;
   a suppression that has to be remembered in five places is one that will be
   forgotten in three.
4. **Visible, never silent.** A suppressed authority in a citation list renders
   as *withheld*, not as absent. The corpus knows the citation exists; hiding
   that it exists is the silent-drop failure again.
5. **Redaction as a derived layer.** Redacted spans stored beside the source text
   and applied at render, so the original is never mutated and the audit
   question — what was changed, when, and under what authority — stays
   answerable.

## 4. What this lane is NOT saying

- No claim that any judgment in this corpus **should** be suppressed.
- No claim about Indian law on victim or minor identification, on
  *Nipun Saxena v. Union of India*, on s. 228A IPC / s. 72 BNS, or on the right
  to be forgotten. **Those are legal questions with a verified-source
  requirement and they are not answered here.**
- No claim that a capability is required. Only that **none exists**, so the
  answer to "can we?" is currently no, and that is the fact a decision would
  need.

## 5. States

| question | state |
| --- | --- |
| suppression capability exists | `OBSERVED_BY_CODE` — **no**, at every layer |
| user-data erasure exists | `OBSERVED_BY_CODE` — yes, and unrelated to the corpus |
| source document retained for redaction proof | `OBSERVED_BY_LIVE_DB` — **no**, `storage_key` is 0/18,698,984 |
| legal requirement to suppress | **`NOT_ASSESSED`** — outside this lane; needs verified legal sources |
| cost of retrofitting | **`NOT_MEASURED`** |
