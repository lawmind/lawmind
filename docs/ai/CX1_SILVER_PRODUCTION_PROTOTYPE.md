# CX1 Silver Production Prototype

Last updated: **2026-08-17 16:33 Asia/Dubai**

Lane: **CX1 shadow / lab**

## Scope

This is an offline prototype for a future Silver writer/compactor shape. It writes only under the disposable lab root by default:

- `C:/lawmind/cx1-lab`

It does not modify canonical production rows, indexes, Gold data, provider harvesting, API contracts, or runtime retrieval behavior.

## Artifacts

| Artifact | Purpose |
|---|---|
| `scripts/cx1_silver_lib.py` | shared deterministic row, Parquet, manifest, hashing, and lab-path guard helpers |
| `scripts/cx1-silver-writer.py` | JSONL to court-partitioned Parquet/ZSTD writer with manifest and idempotence check |
| `scripts/cx1-silver-compact.py` | deterministic Parquet object compactor with output manifest |
| `scripts/cx1-silver-smoke.py` | synthetic fixture smoke test for writer, rerun idempotence, and compaction |
| `scripts/cx1-silver-failure-smoke.py` | synthetic stale-manifest/temp-dir failure-injection smoke |
| `docs/ai/cx1-silver-results/prototype-smoke.json` | machine-readable smoke result |
| `docs/ai/cx1-silver-results/failure-smoke.json` | machine-readable failure-injection result |

## Smoke Result

Command:

```powershell
C:\lawmind\cx1-lab\venv\Scripts\python.exe scripts\cx1-silver-smoke.py
```

Result:

| Check | Value |
|---|---:|
| Status | pass |
| Fixture rows | 24 |
| Writer objects | 12 |
| Compacted objects | 6 |
| Writer rerun idempotent | true |

The smoke test writes a synthetic JSONL fixture, builds Silver Parquet objects, reruns the writer against the same manifest, then compacts the output. It verifies that row count is preserved and object hashes are present. The writer rerun returned `already_complete`.

## Evidence

```json
{
  "status": "pass",
  "fixtureRows": 24,
  "writerObjects": 12,
  "compactedObjects": 6,
  "writerIdempotent": true,
  "writerContentHash": "8fcd58e11b32a4cd1236a3d8922d044e55f150bdbc5372a9a670c72e4e9691ee",
  "compactedContentHash": "76cb8e6612b0b858f33a260defcc61abad20f503a8e0b2be974f12d75fc36954",
  "payloadRoot": "C:\\lawmind\\cx1-lab\\silver-prototype-smoke"
}
```

## Failure Smoke

Command:

```powershell
C:\lawmind\cx1-lab\venv\Scripts\python.exe scripts\cx1-silver-failure-smoke.py
```

Result:

| Check | Value |
|---|---:|
| Status | pass |
| Fixture rows | 18 |
| Writer objects | 10 |
| Compacted objects | 4 |
| Writer repaired stale final manifest | true |
| Writer cleaned stale temp dir | true |
| Compactor repaired stale final manifest | true |
| Compactor cleaned stale temp dir | true |
| Outside-lab output refused | true |

This smoke test injects stale final manifests and stale `*.tmp` manifests before running the writer and compactor. It verifies that both tools replace the stale final outputs with complete manifests, clean old temp directories, and keep the lab-root output guard active.

## Current KNOW

- The prototype can produce deterministic court-partitioned Parquet/ZSTD outputs from a synthetic JSONL fixture.
- The writer can detect an already-complete prior run when input hash and manifest are unchanged.
- The compactor can rewrite the fixture output into fewer objects while preserving row count.
- All payload writes are lab-fenced by default.
- Synthetic stale-manifest and stale-temp recovery works for the writer and compactor.

## Not Yet KNOW

- Crash recovery is not fully proven; the current failure injection is synthetic and does not cover process kill, disk-full, or corrupted Parquet cases.
- Real-corpus replay has not run through this writer/compactor.
- Production object sizing, row-group sizing, orchestration, and promotion contracts are not approved by this smoke.
- This result does not change Gold, retrieval, or citation verification behavior.
