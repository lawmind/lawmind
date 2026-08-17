#!/usr/bin/env python
"""Shared CX1 Silver prototype helpers.

The prototype writes only under C:/lawmind/cx1-lab by default. It is an offline
handoff artifact for NEW2, not an integration with Gold or production storage.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
from datetime import date
from pathlib import Path
from typing import Iterable
from collections import defaultdict


LAB_ROOT = Path("C:/lawmind/cx1-lab").resolve()
SCHEMA_VERSION = "cx1-silver-v1"


def require_lab_path(path: Path) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(LAB_ROOT)
    except ValueError as exc:
        raise SystemExit(f"REFUSING: {resolved} is outside {LAB_ROOT}") from exc
    return resolved


def safe_rmtree(path: Path) -> None:
    resolved = require_lab_path(path)
    if resolved.exists():
        shutil.rmtree(resolved)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def canonical_row(row: dict) -> dict:
    required = ["id", "court", "judgment_date", "document_class", "language", "case_title", "full_text"]
    missing = [key for key in required if row.get(key) in (None, "")]
    if missing:
        raise ValueError(f"row {row.get('id', '<unknown>')} missing {', '.join(missing)}")
    year = int(row.get("year") or str(row["judgment_date"])[:4])
    source_url = row.get("source_url") or ""
    full_text = str(row["full_text"])
    source_sha = row.get("source_sha256") or sha256_bytes(full_text.encode("utf-8"))
    base = {
        "id": str(row["id"]),
        "court": str(row["court"]),
        "year": year,
        "judgment_date": str(row["judgment_date"]),
        "language": str(row["language"]),
        "document_class": str(row["document_class"]),
        "case_title": str(row["case_title"]),
        "full_text": full_text,
        "source_url": source_url,
        "source_sha256": source_sha,
    }
    base["row_sha256"] = sha256_bytes(json.dumps(base, sort_keys=True, ensure_ascii=False).encode("utf-8"))
    return base


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            if not line.strip():
                continue
            try:
                rows.append(canonical_row(json.loads(line)))
            except Exception as exc:
                raise SystemExit(f"{path}:{line_no}: {exc}") from exc
    rows.sort(key=lambda r: (r["court"], r["year"], r["judgment_date"], r["id"]))
    return rows


def group_objects(rows: list[dict], target_object_bytes: int) -> dict[str, list[list[dict]]]:
    grouped: dict[str, list[list[dict]]] = defaultdict(list)
    current: dict[str, list[dict]] = defaultdict(list)
    current_bytes: dict[str, int] = defaultdict(int)
    for row in rows:
        court = row["court"]
        row_bytes = len(row["full_text"].encode("utf-8")) + 512
        if current[court] and current_bytes[court] + row_bytes > target_object_bytes:
            grouped[court].append(current[court])
            current[court] = []
            current_bytes[court] = 0
        current[court].append(row)
        current_bytes[court] += row_bytes
    for court, batch in current.items():
        if batch:
            grouped[court].append(batch)
    return grouped


def input_hash(paths: Iterable[Path]) -> str:
    h = hashlib.sha256()
    for path in sorted(Path(p).resolve() for p in paths):
        h.update(str(path).encode("utf-8"))
        h.update(b"\0")
        h.update(sha256_file(path).encode("ascii"))
        h.update(b"\0")
    return h.hexdigest()


def import_arrow():
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError as exc:
        raise SystemExit(
            "pyarrow is required. Use C:/lawmind/cx1-lab/venv/Scripts/python.exe for CX1 Silver prototype runs."
        ) from exc
    return pa, pq


def silver_schema():
    pa, _ = import_arrow()
    return pa.schema(
        [
            ("id", pa.string()),
            ("court", pa.string()),
            ("year", pa.int32()),
            ("judgment_date", pa.date32()),
            ("language", pa.string()),
            ("document_class", pa.string()),
            ("case_title", pa.string()),
            ("full_text", pa.string()),
            ("source_url", pa.string()),
            ("source_sha256", pa.string()),
            ("row_sha256", pa.string()),
        ]
    )


def table_from_rows(rows: list[dict]):
    pa, _ = import_arrow()
    schema = silver_schema()
    columns = []
    for field in schema:
        values = [row[field.name] for row in rows]
        if field.name == "judgment_date":
            values = [date.fromisoformat(value) for value in values]
        columns.append(pa.array(values, type=field.type))
    return pa.Table.from_arrays(columns, schema=schema)


def write_parquet(rows: list[dict], path: Path, row_group_size: int) -> None:
    _, pq = import_arrow()
    path.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(
        table_from_rows(rows),
        path,
        compression="zstd",
        compression_level=9,
        row_group_size=row_group_size,
        use_dictionary=True,
    )


def read_parquet_rows(paths: list[Path]) -> list[dict]:
    _, pq = import_arrow()
    rows: list[dict] = []
    for path in paths:
        table = pq.read_table(path)
        for row in table.to_pylist():
            if isinstance(row["judgment_date"], date):
                row["judgment_date"] = row["judgment_date"].isoformat()
            rows.append(canonical_row(row))
    rows.sort(key=lambda r: (r["court"], r["year"], r["judgment_date"], r["id"]))
    return rows


def atomic_replace(tmp: Path, final: Path) -> None:
    require_lab_path(tmp)
    require_lab_path(final)
    if final.exists():
        shutil.rmtree(final)
    os.replace(tmp, final)


def object_records(root: Path) -> list[dict]:
    records = []
    for file in sorted(root.rglob("*.parquet")):
        records.append(
            {
                "path": file.relative_to(root).as_posix(),
                "bytes": file.stat().st_size,
                "sha256": sha256_file(file),
            }
        )
    return records


def write_manifest(root: Path, manifest: dict) -> None:
    manifest_path = root / "_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
