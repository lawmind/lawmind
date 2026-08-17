-- The atomic legal-object vocabulary — nine task values that decompose a
-- judgment into propositions small enough to verify by exact span.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY MORE TASKS RATHER THAN A RICHER `case_structure`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `0051` added the composite objects: `case_structure`, `holding`, `arguments`,
-- `authorities`, `topics`. Those are the shapes a human would draw, and the
-- measured problem with them is that a composite object fails as a unit. When a
-- `case_structure` extraction is rejected, everything inside it is discarded —
-- including the parts whose spans located perfectly.
--
-- The five measured tasks verify at 78-84% and that headline is flat across all
-- of them, but FABRICATION varies 18x underneath it (CURRENT_PLAN Q1.44, bus
-- 0534). A rate that stable across tasks that different is a sign the unit of
-- measurement is too coarse to see what is actually failing.
--
-- The nine values below are chosen so that each one is a single assertion with a
-- single span. `verification_state` is decided by string-matching the model's
-- claimed evidence span against the source text — never by the model's own
-- confidence — so an atomic task either locates or it does not, and a rejection
-- names exactly one proposition instead of a paragraph of them.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT EACH ONE IS, BECAUSE A BARE LIST BECOMES FOLKLORE
-- ─────────────────────────────────────────────────────────────────────────────
--
--   issue                  a question the court framed for decision
--   relief                 what was actually sought, and by whom
--   procedural_event       a step in the case's own history (remand, transfer,
--                          consolidation) as RECITED in the judgment. NOT a live
--                          court observation -- those belong in the observation
--                          stream, never here
--   date_event            a date the judgment asserts, bound to what happened on
--                          it. Extracted, never inferred: a date the advocate
--                          relies on is a date that must appear in the text
--   fact_proposition       a finding of fact, as found -- not as argued
--   party_action           something a party did, attributed to that party
--   court_action           something the court did (allowed, dismissed, stayed,
--                          remitted), attributed to that court
--   reasoning_proposition  one step of the reasoning that links a fact to a
--                          conclusion. The unit `holding` was too big to verify
--   statute_role           the ROLE a section plays in the decision -- applied,
--                          distinguished, interpreted, read down. `0045`'s
--                          `statute_reference` records THAT a section was cited;
--                          this records what the court did with it
--
-- `statute_role` is named for the role and not `statute_section_role`, matching
-- the existing `statute_reference` rather than inventing a second naming style
-- one column over.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE OLD VALUES ALL SURVIVE, AND THE DROP-THEN-ADD IS DELIBERATE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Same shape as `0051`, for the same reason stated there: two CHECKs on one
-- column both have to pass, so adding a second alongside the first would reject
-- every new task while LOOKING, from the table definition, like it had been
-- superseded. Dropped and replaced, with `0045`'s and `0051`'s sets carried
-- forward unchanged.
--
-- This is additive to the vocabulary and nothing is removed, so no existing row
-- can violate the new constraint — but that is an argument, not a check, so the
-- constraint is added VALIDATED (the default) and PostgreSQL verifies it against
-- every existing row rather than taking the argument's word for it.
ALTER TABLE document_enrichments
  DROP CONSTRAINT IF EXISTS document_enrichments_task_check;

ALTER TABLE document_enrichments
  ADD CONSTRAINT document_enrichments_task_check CHECK (task IN (
    -- 0045's set, unchanged.
    'citation_extraction', 'metadata', 'treatment', 'text_quality',
    'classification', 'statute_reference', 'amendment_event', 'evidence_span',
    -- 0051's composite legal objects, unchanged.
    'case_structure', 'holding', 'arguments', 'authorities', 'topics',
    -- The atomic vocabulary.
    'issue', 'relief', 'procedural_event', 'date_event', 'fact_proposition',
    'party_action', 'court_action', 'reasoning_proposition', 'statute_role'
  ));

COMMENT ON CONSTRAINT document_enrichments_task_check ON document_enrichments IS
  'The authoritative enrichment task list. `task` is text + CHECK rather than an '
  'enum because a new task is a normal weekly event and 0044 measured what it '
  'costs to rewrite a type in production. Extend by replacing this constraint, '
  'never by adding a second one alongside it.';
