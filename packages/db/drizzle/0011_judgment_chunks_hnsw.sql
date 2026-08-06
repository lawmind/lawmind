-- HNSW replaces ivfflat on `judgment_chunks.embedding`.
--
-- The production index was built by hand while tuning, which means it existed in
-- exactly one database and in no migration. A fresh environment — CI, or a
-- restore — would have come up with the ivfflat index from 0001 and no HNSW at
-- all, and nothing would have said so: retrieval still returns results, just
-- slower and with worse recall. This is that gap closed.
--
-- Why HNSW. Measured on the finished corpus (616,197 chunks, 40 advocate queries,
-- k=50, exact sequential scan as ground truth):
--
--   dense candidate stage, server-side   sequential scan   1,100.5 ms median
--                                        HNSW ef_search=200   10.7 ms median
--
-- Gate S1 allows 3 s for the whole request. `sprints/SPRINT_1.md` §4 names
-- ivfflat, but names it as a means; the sprint's own DONE criterion is the 3 s,
-- and ivfflat additionally decays on an append-only corpus because its centroids
-- are fixed at build time. `docs/LCC_PLAN.md` §2B carries the full reasoning.
--
-- `IF NOT EXISTS` because production already has this index, built CONCURRENTLY
-- over 9.8 minutes. Re-running it here must be a no-op rather than a ten-minute
-- ACCESS EXCLUSIVE lock during a deploy.
--
-- NOTE: this is a plain CREATE INDEX, not CONCURRENTLY, because a migration runs
-- inside a transaction and CONCURRENTLY cannot. That is safe HERE only because
-- the index already exists everywhere it matters and this is a no-op. **Any
-- future rebuild against a populated database must be done out of band**, the way
-- this one was.
CREATE INDEX IF NOT EXISTS "judgment_chunks_embedding_hnsw"
	ON "judgment_chunks" USING hnsw ("embedding" vector_cosine_ops)
	WITH (m = 16, ef_construction = 64);
--> statement-breakpoint
-- The ivfflat index is not merely redundant: it is a second index the planner may
-- choose, and it is maintained on every write. Production dropped it before the
-- bulk embed; this makes that true everywhere.
DROP INDEX IF EXISTS "judgment_chunks_embedding_idx";
