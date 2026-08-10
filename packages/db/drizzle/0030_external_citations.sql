-- Citations found in documents we do NOT hold — the High Court citation graph.
--
-- `docs/CITATION_STRATEGY.md`. The AWS High Court bucket is **not ingested as a
-- corpus**: no citation column, a 0.75%–18.64% judgment share, ~3,956 GPU-hours
-- and 96.4 GB of text. It is read as EVIDENCE and the text is thrown away.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY NOT `judgment_citations`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- That table's `citing_judgment_id` is a FK into `judgments`. A High Court
-- document is not in `judgments` and, under this strategy, never will be — so
-- every row here would need a fake parent. Worse, it would silently mix *"a
-- judgment we hold cites X"* with *"a document we have merely read cites X"*.
-- **Those carry different evidential weight** and collapsing them would put an
-- unauditable claim inside the table the citator trusts.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THE ROWS ARE FOR — three uses, one shape
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Measured on 400 real High Court PDFs, 11 Aug 2026: **13.8% carry at least one
-- citation**, **1.05 citations per document**, and **33.7% of those resolve to a
-- Supreme Court judgment we already hold.**
--
-- 1. **Authority weight.** How often the High Courts actually cite a given
--    Supreme Court judgment — something a Supreme-Court-only corpus cannot see.
-- 2. **The concordance.** `citation_text` beside a case name corroborates an
--    AIR/SCC alias. `A3d.3`: agreement across many citing documents is strong
--    evidence; one sighting is not.
-- 3. **Existence.** A citation printed by many independent courts demonstrably
--    exists, even where we hold no judgment. **That is a PROPOSAL, not a
--    verification tier** — `CITATION_HARNESS.md` is spec and only the founder
--    changes it.
CREATE TABLE IF NOT EXISTS external_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which feed this came from, e.g. `aws_high_court`.
  source text NOT NULL,
  -- The document that PRINTED the citation — the bucket key. Not a judgment id,
  -- deliberately: we hold no row for it and inventing one would be a fiction.
  source_key text NOT NULL,
  court_name text NOT NULL,
  source_year integer,
  -- Exactly as printed, for provenance. An alias whose evidence cannot be read
  -- is an assertion, and this table does not make assertions.
  citation_text text NOT NULL,
  -- Alphanumeric-only comparison form. The SAME rule the resolver uses.
  citation_key text NOT NULL,
  -- Set when the citation names a judgment we hold. NULL is the common case and
  -- is not a failure: most citations name courts outside our corpus.
  cited_judgment_id uuid REFERENCES judgments(id) ON DELETE SET NULL,
  char_offset integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- One sighting per citation per document. A judgment repeating an authority
  -- five times is ONE court relying on it, not five, and counting it five times
  -- would inflate exactly the corroboration signal this table exists to provide.
  CONSTRAINT external_citations_one_per_doc UNIQUE (source, source_key, citation_key),
  CONSTRAINT external_citations_offset_non_negative CHECK (char_offset >= 0)
);

-- "How many High Court documents cite this judgment" — the authority-weight and
-- corroboration query, and the only one on the hot path.
CREATE INDEX IF NOT EXISTS external_citations_cited_idx
  ON external_citations (cited_judgment_id)
  WHERE cited_judgment_id IS NOT NULL;

-- "Who printed this citation string" — concordance corroboration, and the
-- provenance answer for a citation we do not hold.
CREATE INDEX IF NOT EXISTS external_citations_key_idx
  ON external_citations (citation_key);

-- Per-document progress for the run. Resumable by construction: a document
-- already recorded here is never fetched again, so the pass survives a restart,
-- a crash, or a laptop lid.
CREATE TABLE IF NOT EXISTS external_citation_documents (
  source text NOT NULL,
  source_key text NOT NULL,
  court_name text NOT NULL,
  source_year integer,
  -- How many citations this document yielded. ZERO IS A RESULT, not a gap:
  -- 86.2% of High Court documents carry none, and recording the zero is what
  -- stops the pass re-reading them forever.
  citations_found integer NOT NULL DEFAULT 0,
  resolved_found integer NOT NULL DEFAULT 0,
  -- 'ok' | 'no_text' | 'missing' | 'failed'. A failure is recorded, never
  -- silently retried into an infinite loop.
  outcome text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (source, source_key),
  CONSTRAINT external_citation_documents_outcome_valid
    CHECK (outcome IN ('ok', 'no_text', 'missing', 'failed')),
  CONSTRAINT external_citation_documents_counts_non_negative
    CHECK (citations_found >= 0 AND resolved_found >= 0)
);

CREATE INDEX IF NOT EXISTS external_citation_documents_progress_idx
  ON external_citation_documents (source, processed_at DESC);
