-- pgvector. `judgment_chunks.embedding` is vector(1024), so this must land before
-- the schema migration. If the extension is unavailable the migration fails here,
-- loudly, rather than the API discovering it at query time.
CREATE EXTENSION IF NOT EXISTS vector;
