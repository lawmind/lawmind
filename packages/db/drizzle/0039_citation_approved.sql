-- docs/ai/CITATION_GRAPH_STAGE7.md, Stage 7 of the DATA -> RETRIEVAL
-- EXECUTION PROGRAM. `approved` splits out from `followed` -- its own
-- printed word ("- approved" in a Case Law Cited table), not a synonym. A
-- 2,000-row sample found it 61 times in that exact table-annotation shape,
-- comparable in frequency to `followed` itself (84) -- a real, distinguishable
-- signal the extractor was already reading and discarding into the wrong
-- bucket.

ALTER TABLE judgment_citations
	DROP CONSTRAINT IF EXISTS "judgment_citations_relationship_check";

ALTER TABLE judgment_citations
	ADD CONSTRAINT "judgment_citations_relationship_check"
	CHECK ("relationship" IN ('cites', 'followed', 'approved', 'distinguished', 'doubted', 'overruled', 'overruled_in_part'));
