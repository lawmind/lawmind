# CX1 Embedding Scale Model V2

No corpus embeddings were generated.

## Current Facts

VERIFIED: the existing repository shape is BGE-M3 dense vector(1024).

VERIFIED: vector(1024) stores 4,096 payload bytes, halfvec(1024) stores 2,048
payload bytes, and bit(1024) stores 128 payload bytes before row and index
overhead.

MEASURED-BUT-LIMITED: the repository records 616,197 vectors and an HNSW index
of approximately 4.7 GB, about 7.8 KB per vector, for one existing workload.

## Linear Capacity Estimates

ESTIMATE: the tables below multiply vector counts by payload width or the
existing per-vector HNSW observation. They are linear capacity estimates, not
guaranteed future index sizes. HNSW size varies with parameters, tuple overhead,
dead rows, PostgreSQL behavior, and data distribution.

| Strategy at 20.529M source documents | fp32 payload | halfvec payload | binary payload |
| --- | ---: | ---: | ---: |
| One vector/document | 84 GB | 42 GB | 2.6 GB |
| 10% substantive authorities | 8.4 GB | 4.2 GB | 0.3 GB |
| Three legal-object vectors on 10% | 25 GB | 13 GB | 0.8 GB |
| Five chunks/document | 420 GB | 210 GB | 13 GB |

ESTIMATE: applying 7.8 KB/vector linearly gives approximately 160 GB HNSW
overhead for one vector across 20.529M documents, 16 GB for 10% substantive
authorities, and 801 GB for five chunks/document. These are scenario bounds, not
future index forecasts.

DECISION: do not embed the full corpus and do not create full paragraph/chunk
HNSW.

## Hierarchical Plan

DECISION: candidate order is:

1. one vector for a measured subset of substantive authorities;
2. holding, issue, or proposition vectors with verified evidence spans;
3. important paragraphs cited later, saved by users, or required by retrieval
   evaluation;
4. procedural documents only if measured retrieval gain justifies them.

DECISION: minimum vectors required to meet LawMind retrieval quality is the goal,
not vector count in isolation.

## NEW1 Decision Benchmark

FUTURE-BENCHMARK: NEW1 decides all of the following after lexical, citation,
treatment, statute, and legal-object retrieval baselines are stable:

- which documents and legal objects are embedded;
- how many vectors each eligible document receives;
- fp32 versus halfvec for the scoring stage;
- whether a binary candidate stage preserves required quality;
- p95 latency, RAM, disk, build time, and restore time;
- whether pgvector remains adequate on LawMind's measured queries.

DECISION: pgvector is the first candidate because it is already in the approved
stack.

DECISION: no Qdrant migration, deployment, or provider work now. A vector-store
change requires a measured pgvector failure and a founder-approved stack change.
