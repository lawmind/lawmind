# Cost Ledger

Human-readable summary. The append-only machine enforcement ledger is
`docs/cost-spend-ledger.jsonl`. Its `AUTHORIZATION`, `ACTUAL`, and `CLOSE`
events distinguish estimated commitment, measured spend, and completed
recurring/usage work. Historical totals remain visible after closure.

| Date       | Owner | Amount | Kind              | Purpose                                                                                                                                                              | Cap | Shutdown condition | Decision                        |
| ---------- | ----- | -----: | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------ | ------------------------------- |
| 2026-08-16 | CX1   |     $0 | one-time          | Installed duckdb and pyarrow into bundled local Python for required synthetic Parquet proof                                                                          | n/a | n/a                | No paid resource created        |
| 2026-08-16 | CX1   |     $0 | one-time          | Local hardware and Parquet benchmark artifacts under docs/ai/cx1-*                                                                                                   | n/a | n/a                | Repo-local only                 |
| 2026-08-16 | CX1   |     $0 | one-time          | V2 correction pass, official documentation research, bounded local proof, and cleanup                                                                                | n/a | n/a                | Zero Railway, zero paid service |
| 2026-08-16 | CX1   |     $0 | policy correction | Removed self-approval; added external approval validation and cumulative machine ledger design                                                                       | n/a | n/a                | DECISION                        |
| 2026-08-16 | CX1   |     $0 | final hardening   | Added Ed25519 verification, append-only reconciliation/closure, meaningful budget windows, recoverable ownership lock, provider-control hierarchy, and incident rule | n/a | n/a                | Local-only; no provider action  |

`cap` is an estimate unless the provider independently enforces and the ledger
records evidence for a hard provider limit. Billing alerts are not caps.
