# HNSW BUILD ATTEMPT LOGS — verbatim

The build logs themselves are `*.log` and `.gitignore:8` excludes those repo-wide,
so the lines that carry the evidence are transcribed here instead. Both spill
notices are Postgres NOTICEs relayed by the driver, not our own prose.

## Attempt 1 — 4 GB maintenance_work_mem, 4 parallel maintenance workers

```
2026-09-15T09:51:39.097Z  START final HNSW build — snapshot 5b5d02384b46c96c, mwm 4GB, workers 4
2026-09-15T09:51:39.170Z  contract identity confirmed: deployed view hashes to 5b5d02384b46c96c, ACTIVE generation matches
2026-09-15T09:51:39.171Z  INDEX_CUT_AT 2026-09-15T09:51:39.174Z
2026-09-15T09:51:39.194Z  residual since census (2026-09-15T09:18:00Z .. cut): considered 0, uncovered 0
2026-09-15T09:51:40.386Z  rows to index 7673717
2026-09-15T09:51:40.387Z  session settings confirmed: maintenance_work_mem=4GB max_parallel_maintenance_workers=4
2026-09-15T09:51:40.388Z  DDL CREATE INDEX new1_doc_vector_stage_hnsw ON new1_doc_vector_stage USING hnsw (((embedding)::halfvec(1024)) halfvec_cosine_ops) WITH (m = 16, ef_construction = 64) WHERE (snapshot_hash = '5b5d02384b46c96c')
2026-09-15T10:06:44.833Z  NOTICE hnsw graph no longer fits into maintenance_work_mem after 1571661 tuples
2026-09-15T14:46:01.439Z  FAILED canceling statement due to user request
```

## Attempt 2 — 8 GB maintenance_work_mem, 10 parallel maintenance workers

```
2026-09-15T14:48:15.860Z  START final HNSW build — snapshot 5b5d02384b46c96c, mwm 8GB, workers 10
2026-09-15T14:48:15.948Z  contract identity confirmed: deployed view hashes to 5b5d02384b46c96c, ACTIVE generation matches
2026-09-15T14:48:15.949Z  INDEX_CUT_AT 2026-09-15T14:48:15.949Z
2026-09-15T14:48:15.961Z  residual since census (2026-09-15T09:18:00Z .. cut): considered 0, uncovered 0
2026-09-15T14:48:16.875Z  rows to index 7673717
2026-09-15T14:48:16.878Z  session settings confirmed: maintenance_work_mem=8GB max_parallel_maintenance_workers=10
2026-09-15T14:48:16.878Z  DDL CREATE INDEX new1_doc_vector_stage_hnsw ON new1_doc_vector_stage USING hnsw (((embedding)::halfvec(1024)) halfvec_cosine_ops) WITH (m = 16, ef_construction = 64) WHERE (snapshot_hash = '5b5d02384b46c96c')
2026-09-15T14:53:16.941Z  progress 493417/7673717 (6.4%) 1644.4/s projected 1.21h remaining
2026-09-15T14:58:16.892Z  progress 924427/7673717 (12.0%) 1436.9/s projected 1.3h remaining
2026-09-15T15:03:20.545Z  progress 1348702/7673717 (17.6%) 1414.2/s projected 1.24h remaining
2026-09-15T15:08:16.902Z  progress 1810361/7673717 (23.6%) 1538.8/s projected 1.06h remaining
2026-09-15T15:13:16.914Z  progress 2238219/7673717 (29.2%) 1426.1/s projected 1.06h remaining
2026-09-15T15:18:16.918Z  progress 2689888/7673717 (35.1%) 1505.5/s projected 0.92h remaining
2026-09-15T15:23:16.930Z  progress 3080822/7673717 (40.1%) 1303.1/s projected 0.98h remaining
2026-09-15T15:26:31.626Z  NOTICE hnsw graph no longer fits into maintenance_work_mem after 3144795 tuples
2026-09-15T15:28:16.939Z  progress 3147130/7673717 (41.0%) 221/s projected 5.69h remaining
2026-09-15T15:33:16.950Z  progress 3154386/7673717 (41.1%) 24.2/s projected 51.91h remaining
2026-09-15T15:38:16.952Z  progress 3163115/7673717 (41.2%) 29.1/s projected 43.06h remaining
2026-09-15T15:39:02.611Z  FAILED canceling statement due to user request
```
