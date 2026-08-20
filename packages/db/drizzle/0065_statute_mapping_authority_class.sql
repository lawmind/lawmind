-- ───────────────────────────────────────────────────────────────────────────
-- AN OFFICIAL COMPARISON TABLE IS NOT ENACTED LAW
-- ───────────────────────────────────────────────────────────────────────────
--
-- All 226 rows in `statute_mappings` come from BPR&D comparative PDFs:
--
--     evidence -> bsa    exact 105 · split  12
--     crpc     -> bnss   exact  70 · merged 17 · split 8
--     ipc      -> bns    exact   9 · split   3 · merged 2
--
-- The BPR&D is the Bureau of Police Research and Development. Its comparison
-- tables are **official, useful, and produced by the executive** — and they are
-- not the Sanhitas. Parliament enacted the BNS, BNSS and BSA; the BPR&D wrote a
-- concordance to help police and prosecutors find their way around them.
--
-- `source` records the URL, so the distinction is *derivable* today by anybody
-- who recognises the host. That is not the same as *represented*: a query that
-- joins `statute_mappings` gets 226 rows of equal weight, and nothing in the row
-- says one of them would lose an argument in court.
--
-- **The failure this prevents is specific.** An advocate is told "IPC 420
-- corresponds to BNS 318(4)". If that came from the enacted text's own
-- repeal-and-savings provision, it is law. If it came from a comparison table,
-- it is a competent official's reading of the law — persuasive, routinely right,
-- and not something to put in a written submission as though the legislature had
-- said it. Those are different claims and the schema currently cannot tell them
-- apart.
--
-- ───────────────────────────────────────────────────────────────────────────
-- FOUR CLASSES, RANKED, AND NOTHING DEFAULTS UPWARD
-- ───────────────────────────────────────────────────────────────────────────
--
--   ENACTED_STATUTE                  The correspondence is stated in enacted
--                                    text — a repeal-and-savings section, a
--                                    transition provision, a schedule. This is
--                                    law. **No row currently qualifies.**
--
--   OFFICIAL_CORRESPONDENCE          An official government concordance or
--                                    comparison table. BPR&D, MHA. Authoritative
--                                    about the executive's reading; not enacted.
--                                    **All 226 current rows are this.**
--
--   OFFICIAL_EXPLANATORY_MATERIAL    Statement of Objects and Reasons, official
--                                    FAQs, departmental circulars. Explains
--                                    intent; binds nobody.
--
--   LAWMIND_DERIVED                  We worked it out. Must carry its own
--                                    evidence and must never be presented at the
--                                    same weight as any of the above.
--
-- `authority_rank` exists for the same reason `trust_rank` does in 0064: "at
-- least official" should be an inequality, not an IN-list somebody forgets to
-- extend.
--
-- **The default is `LAWMIND_DERIVED`, the WEAKEST class.** A row inserted
-- without stating its authority is a row whose authority nobody established, and
-- the safe reading of that is the lowest one. Defaulting to
-- `OFFICIAL_CORRESPONDENCE` would let an unattributed guess inherit the BPR&D's
-- standing by doing nothing.
--
-- ───────────────────────────────────────────────────────────────────────────
-- THE COVERAGE NUMBER, AND WHY IT MAKES `no_equivalent` DANGEROUS
-- ───────────────────────────────────────────────────────────────────────────
--
-- Measured 20 Aug 2026 against the enacted texts we hold:
--
--     act    sections held   with a mapping   coverage
--     bns              358                4       1.1%
--     bnss             531               24       4.5%
--     bsa              170              101      59.4%
--
-- **Four of the Bharatiya Nyaya Sanhita's 358 sections have a mapping.** The BNS
-- is the code that replaced the Indian Penal Code and is the most-used statute
-- in Indian criminal practice.
--
-- So the overwhelmingly common case is that a lookup finds nothing, and what the
-- product says then is the whole question. `statute_relationship` already has a
-- `no_equivalent` value — correctly, because the Sanhitas genuinely dropped some
-- offences — and **zero rows currently use it**, which is right.
--
-- The danger is not that value. It is a caller inferring it from absence:
--
--     UNMAPPED       nobody has read the correspondence for this section.
--                    Our ignorance. The state of 98.9% of the BNS.
--     no_equivalent  an authority states there is no counterpart.
--                    A POSITIVE finding, and it needs a source like any other.
--
-- These are the same two populations `hc_document_class IS NULL` conflates and
-- the same two `coverage_cell` separates with `SOURCE_HAS_ZERO` versus
-- `UNKNOWN`: refused-by-a-rule and never-looked-at read identically and want
-- opposite work. Absence of a row means UNMAPPED, always. An LLM must never be
-- used to fill one in — a fabricated section correspondence is a fabricated
-- citation wearing different clothes.
--
SET LOCAL lock_timeout = '3s';

ALTER TABLE statute_mappings
  ADD COLUMN IF NOT EXISTS authority_class text NOT NULL DEFAULT 'LAWMIND_DERIVED',
  ADD COLUMN IF NOT EXISTS authority_rank  smallint NOT NULL DEFAULT 1,
  -- The issuing body as it should be NAMED to a user, distinct from the URL.
  -- "BPR&D comparative table" is what an advocate needs to weigh the claim;
  -- a bprd.nic.in URL is what an engineer needs to find it again.
  ADD COLUMN IF NOT EXISTS authority_body  text;

ALTER TABLE statute_mappings
  DROP CONSTRAINT IF EXISTS statute_mappings_authority_class_check;

ALTER TABLE statute_mappings
  ADD CONSTRAINT statute_mappings_authority_class_check CHECK (
    (authority_class = 'ENACTED_STATUTE'               AND authority_rank = 4) OR
    (authority_class = 'OFFICIAL_CORRESPONDENCE'       AND authority_rank = 3) OR
    (authority_class = 'OFFICIAL_EXPLANATORY_MATERIAL' AND authority_rank = 2) OR
    (authority_class = 'LAWMIND_DERIVED'               AND authority_rank = 1)
  );

-- A positive `no_equivalent` finding is a CLAIM and needs a source of at least
-- official standing. We must not tell an advocate that Parliament dropped an
-- offence on our own reading of a table we did not check.
ALTER TABLE statute_mappings
  DROP CONSTRAINT IF EXISTS statute_mappings_no_equivalent_needs_authority;

ALTER TABLE statute_mappings
  ADD CONSTRAINT statute_mappings_no_equivalent_needs_authority CHECK (
    relationship <> 'no_equivalent' OR authority_rank >= 2
  );

-- Backfill by SOURCE, matched on the issuing host rather than assumed. Anything
-- this does not recognise keeps the weakest default — an unrecognised source is
-- an unestablished authority, which is exactly what LAWMIND_DERIVED means.
UPDATE statute_mappings
   SET authority_class = 'OFFICIAL_CORRESPONDENCE',
       authority_rank  = 3,
       authority_body  = 'Bureau of Police Research and Development (BPR&D), comparative table'
 WHERE source ILIKE '%bprd.nic.in%';

CREATE INDEX IF NOT EXISTS statute_mappings_new_act_section_idx
  ON statute_mappings (new_act, new_section, authority_rank DESC);

CREATE INDEX IF NOT EXISTS statute_mappings_old_act_section_idx
  ON statute_mappings (old_act, old_section, authority_rank DESC);

COMMENT ON COLUMN statute_mappings.authority_class IS
  'ENACTED_STATUTE (4) > OFFICIAL_CORRESPONDENCE (3) > '
  'OFFICIAL_EXPLANATORY_MATERIAL (2) > LAWMIND_DERIVED (1). All 226 rows as of '
  '20 Aug 2026 are OFFICIAL_CORRESPONDENCE — BPR&D comparison tables, which are '
  'the executive''s reading of the Sanhitas and not the Sanhitas. NOTHING is '
  'ENACTED_STATUTE yet. Defaults to the WEAKEST class: a row whose authority '
  'nobody established must not inherit the BPR&D''s standing by doing nothing.';

COMMENT ON COLUMN statute_mappings.authority_body IS
  'The issuing body as it should be NAMED to a user, distinct from the URL. An '
  'advocate needs "BPR&D comparative table" to weigh the claim.';

COMMENT ON TABLE statute_mappings IS
  'Section correspondences between the repealed codes and the Sanhitas. ABSENCE '
  'OF A ROW MEANS UNMAPPED — nobody has read the correspondence — and NEVER '
  'no_equivalent, which is a positive finding requiring an official source and '
  'is CHECK-enforced to authority_rank >= 2. Coverage 20 Aug 2026: bns 4/358, '
  'bnss 24/531, bsa 101/170. Never fill a mapping with an LLM: a fabricated '
  'section correspondence is a fabricated citation wearing different clothes.';
