#!/usr/bin/env node
/**
 * NEW1 R9 — embed PRIMARY LEGAL TEXT THAT IS NOT A JUDGMENT, into the one table
 * that was built to keep the kinds apart.
 *
 *   node services/harness/src/source-vector-embed.mjs --source statute_section [--limit N] [--dry-run]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY `document_vector_staging` AND NOT A SECOND NEW1 TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The directive's requirement for this round is one sentence long and it is a
 * data-model requirement, not a retrieval one: *keep source type in metadata so
 * a statute section, a judgment and an eCourts observation are never confused.*
 *
 * `document_vector_staging` already carries exactly that — `source_object_type`,
 * `representation_type`, `definition_version`, `dim`, `precision`, and a unique
 * identity index over (type, id, representation, model, model version, source
 * hash). It is empty, which reads as dead but is not: it is the shape LCC
 * migrated for this and nobody has had a non-judgment population to put in it
 * until the statute corpus landed.
 *
 * Putting statute sections in a NEW1-private table instead would produce the
 * confusion the requirement forbids, one round later and with two schemas to
 * reconcile. So this writes to the shared table.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CHECK CONSTRAINT THIS CANNOT WRITE THROUGH, AND WHY IT DOES NOT GUESS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   document_vector_staging_source_object_type_check
 *     CHECK (source_object_type = ANY (ARRAY['judgment', 'legal_object']))
 *
 * A statute section is neither. `legal_object` means a model-extracted holding,
 * issue or proposition lifted out of a judgment — filing an Act's section under
 * it would put an enacted provision and a model's reading of a judgment in the
 * same class, which is precisely the confusion this file exists to prevent.
 *
 * `packages/db` is LCC's and the ordinal comes from `MIGRATION_SLOT`, so this
 * file does NOT widen the constraint. It PREFLIGHTS it and refuses with the
 * exact statement that would fix it, so the ask is one paste rather than a
 * description. Until then `--fallback-table` stages the same rows, with the same
 * columns and the same identity, in a NEW1-owned table that a single
 * `INSERT … SELECT` promotes once the constraint is widened. The GPU work is not
 * held hostage to a `CHECK`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT GETS EMBEDDED, AND WHY THE ACT NAME IS INSIDE THE VECTOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `<short title> — s. <number> <heading>\n<section text>`.
 *
 * The Act name and section number go in the text so that a retrieved passage is
 * self-describing — a section quoted without the Act it belongs to is unusable to
 * an advocate whatever the metadata says. Sections are ~1,000 characters on
 * average, so the 4,800 cap almost never binds and the vector covers the whole
 * provision.
 *
 * ── WHAT THE TITLE DOES **NOT** DO, MEASURED 27 AUG 2026 ─────────────────────
 *
 * This header previously claimed the title was the DISCRIMINATING token — that
 * without it, IPC s.302 and BNS s.103 would be near-duplicates in the vector
 * space. **That claim was tested against its own counterfactual and it is
 * mostly wrong.** Both encodings, same sidecar, same day:
 *
 *                                        with title   body only    delta
 *   BNS s.101 Murder  vs IPC s.300         0.9093      0.9570     -0.0477
 *   BNS s.103 Punish. vs IPC s.302         0.8169      0.8725     -0.0556
 *   BSA s.63          vs Evidence s.65B    0.8751      0.8749     +0.0002
 *   mean over ALL cross-Act pairs          0.5449      0.5249     +0.0200
 *
 * So it separates the old-code/new-code twins by about five hundredths — leaving
 * them at 0.82-0.91, which is still "these are the same provision" — and does
 * NOTHING at all for the Evidence Act pair. Worse, it raises mean similarity
 * everywhere else, because every title shares "The", "Act" and a year: within-Act
 * neighbours got CLOSER (IPC s.300 vs s.302: 0.6715 -> 0.7030).
 *
 * The correct conclusion, and it is the one the citation harness already
 * enforces elsewhere: **which Act a provision belongs to is a FILTER on the row,
 * never a hope about the ranking.** `statute_id` and `short_title` are columns;
 * a query that must not mix codes constrains on them. The vector carries what
 * the provision MEANS, and the whole reason cross-code twins score 0.9 is that
 * they mean the same thing — which is correct behaviour and useful for
 * "what replaced this section", not a defect to tune away.
 *
 * The title stays in the text for the self-describing reason above. It is no
 * longer claimed to be doing a job it measurably does not do.
 *
 * Recipe string stays `HEAD:<n>` and the model string stays byte-identical to
 * the judgment walk's, because the two populations have to be comparable in one
 * vector space or holding them in one table buys nothing.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('../../../', import.meta.url);
const url = readFileSync(new URL('.env', ROOT), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();

const SOURCE = process.env.SOURCE ?? argOf('--source') ?? 'statute_section';
const GPU_URL = process.env.EMBED_GPU_URL ?? 'http://127.0.0.1:8799/embed';
const HEAD_CHARS = Number(process.env.HEAD_CHARS ?? 4800);
const EMBED_BATCH_CHARS = Number(process.env.EMBED_BATCH_CHARS ?? 240000);
const PAGE = Number(process.env.PAGE ?? 400);
const LIMIT = Number(process.env.LIMIT ?? argOf('--limit') ?? Infinity);
const DRY_RUN = process.argv.includes('--dry-run');
const FALLBACK = process.argv.includes('--fallback-table');

const MODEL = 'BGE-M3 onnx fp32, CLS-pooled, L2-normalised, GPU sidecar';
const MODEL_VERSION = 'bge-m3-onnx-fp32';
const DIM = 1024;
const FALLBACK_TABLE = 'new1_source_vector_stage';

function argOf(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * One selector per source kind. Adding eCourts order text later is a new entry
 * here and nothing else — the write path, the identity and the refusal are
 * already kind-agnostic.
 */
const SOURCES = {
  statute_section: {
    objectType: 'statute_section',
    definitionVersion: 'statute-section-v1',
    /** `order_index` is the natural keyset: stable, and it walks an Act in order. */
    async page(sql, cursor, limit) {
      return sql`
        SELECT sec.id,
               s.short_title,
               sec.section_number,
               sec.heading,
               sec.section_text
          FROM statute_sections sec
          JOIN statutes s ON s.id = sec.statute_id
         WHERE sec.section_text IS NOT NULL
           AND length(btrim(sec.section_text)) > 0
           ${cursor ? sql`AND sec.id > ${cursor}::uuid` : sql``}
         ORDER BY sec.id
         LIMIT ${limit}`;
    },
    text(r) {
      const head = [r.short_title, r.section_number ? 's. ' + r.section_number : null, r.heading]
        .filter(Boolean)
        .join(' — ');
      return (head + '\n' + r.section_text).slice(0, HEAD_CHARS);
    },
  },
};

const spec = SOURCES[SOURCE];
if (!spec) {
  console.error('unknown --source ' + SOURCE + '; known: ' + Object.keys(SOURCES).join(', '));
  process.exit(2);
}

const sql = postgres(url, { ssl: false, max: 2, onnotice: () => {}, connection: { statement_timeout: 0 } });

/**
 * Ask the constraint, do not assume it. The whole failure mode this preflight
 * prevents is embedding 36,663 sections on the GPU and discovering at the INSERT
 * that none of them can be written.
 */
async function targetTable() {
  const [row] = await sql`
    SELECT pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE conrelid = 'document_vector_staging'::regclass
       AND conname = 'document_vector_staging_source_object_type_check'`;
  const admits = row ? row.def.includes(`'${spec.objectType}'`) : false;
  if (admits) return { table: 'document_vector_staging', reason: 'constraint admits ' + spec.objectType };
  const fix =
    `ALTER TABLE document_vector_staging DROP CONSTRAINT document_vector_staging_source_object_type_check;\n` +
    `ALTER TABLE document_vector_staging ADD CONSTRAINT document_vector_staging_source_object_type_check\n` +
    `  CHECK (source_object_type = ANY (ARRAY['judgment','legal_object','statute_section','official_order','ecourts_observation']));`;
  if (!FALLBACK) {
    console.error('REFUSED: document_vector_staging does not admit source_object_type = ' + spec.objectType);
    console.error('  live constraint: ' + (row?.def ?? '(absent)'));
    console.error('  the migration that fixes it, verbatim:\n' + fix);
    console.error('  or re-run with --fallback-table to stage into ' + FALLBACK_TABLE + ' meanwhile.');
    return null;
  }
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ${FALLBACK_TABLE} (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      representation_type text NOT NULL,
      source_object_type text NOT NULL,
      source_object_id uuid NOT NULL,
      source_hash text NOT NULL,
      embedding_model text NOT NULL,
      embedding_model_version text NOT NULL,
      definition_version text NOT NULL,
      dim int NOT NULL,
      precision text NOT NULL,
      embedding_fp32 vector(${DIM}),
      status text NOT NULL DEFAULT 'staged',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  await sql.unsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${FALLBACK_TABLE}_identity_idx
      ON ${FALLBACK_TABLE} (source_object_type, source_object_id, representation_type,
                            embedding_model, embedding_model_version, source_hash)`);
  return { table: FALLBACK_TABLE, reason: 'constraint refuses ' + spec.objectType + '; staging to fallback', fix };
}

async function embed(texts) {
  const out = [];
  let i = 0;
  while (i < texts.length) {
    const batch = [];
    let chars = 0;
    while (i < texts.length && (batch.length === 0 || chars + texts[i].length < EMBED_BATCH_CHARS)) {
      batch.push(texts[i]);
      chars += texts[i].length;
      i += 1;
    }
    const res = await fetch(GPU_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: batch }),
      signal: AbortSignal.timeout(600000),
    });
    if (!res.ok) throw new Error('sidecar ' + res.status + ': ' + (await res.text()).slice(0, 200));
    const body = await res.json();
    for (const v of body.vectors) out.push(v);
  }
  return out;
}

const t0 = Date.now();
let cursor = null;
let seen = 0;
let written = 0;
let skippedExisting = 0;
let target = null;

try {
  target = await targetTable();
  if (!target) process.exit(4);
  console.log('target table: ' + target.table + '  (' + target.reason + ')');

  for (;;) {
    if (seen >= LIMIT) break;
    const rows = await spec.page(sql, cursor, Math.min(PAGE, LIMIT - seen));
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    seen += rows.length;

    const prepared = rows.map((r) => {
      const text = spec.text(r);
      return { id: r.id, text, hash: createHash('sha256').update(text).digest('hex') };
    });

    // Identity-skip BEFORE the GPU, exactly as the judgment walk does. A rerun
    // after an interruption must cost nothing, and `ON CONFLICT DO NOTHING`
    // makes the WRITE idempotent without making the WORK idempotent.
    const existing = await sql.unsafe(
      `SELECT source_object_id, source_hash FROM ${target.table}
        WHERE source_object_type = $1 AND source_object_id = ANY($2::uuid[])`,
      [spec.objectType, prepared.map((p) => p.id)],
    );
    const have = new Set(existing.map((e) => e.source_object_id + '|' + e.source_hash));
    const todo = prepared.filter((p) => !have.has(p.id + '|' + p.hash));
    skippedExisting += prepared.length - todo.length;
    if (todo.length === 0) continue;

    if (DRY_RUN) {
      written += todo.length;
      console.log(`dry-run  seen ${seen}  would write ${written}  sample "${todo[0].text.slice(0, 90).replace(/\s+/g, ' ')}"`);
      continue;
    }

    const vectors = await embed(todo.map((p) => p.text));
    const values = todo.map((p, j) => ({
      representation_type: 'document',
      source_object_type: spec.objectType,
      source_object_id: p.id,
      source_hash: p.hash,
      embedding_model: MODEL,
      embedding_model_version: MODEL_VERSION,
      definition_version: spec.definitionVersion,
      dim: DIM,
      precision: 'fp32',
      embedding_fp32: '[' + vectors[j].join(',') + ']',
      status: 'staged',
    }));
    const res = await sql.unsafe(
      `INSERT INTO ${target.table}
         (representation_type, source_object_type, source_object_id, source_hash,
          embedding_model, embedding_model_version, definition_version, dim, precision,
          embedding_fp32, status)
       SELECT * FROM unnest(
         $1::text[], $2::text[], $3::uuid[], $4::text[], $5::text[], $6::text[],
         $7::text[], $8::int[], $9::text[], $10::vector[], $11::text[])
       ON CONFLICT DO NOTHING`,
      [
        values.map((v) => v.representation_type),
        values.map((v) => v.source_object_type),
        values.map((v) => v.source_object_id),
        values.map((v) => v.source_hash),
        values.map((v) => v.embedding_model),
        values.map((v) => v.embedding_model_version),
        values.map((v) => v.definition_version),
        values.map((v) => v.dim),
        values.map((v) => v.precision),
        values.map((v) => v.embedding_fp32),
        values.map((v) => v.status),
      ],
    );
    written += res.count ?? values.length;
    const secs = (Date.now() - t0) / 1000;
    console.log(
      `seen ${seen}  written ${written}  skipped ${skippedExisting}  ${secs.toFixed(0)}s  ${(written / Math.max(secs, 0.001)).toFixed(0)}/s`,
    );
  }

  const [{ n }] = await sql.unsafe(
    `SELECT count(*)::int AS n FROM ${target.table} WHERE source_object_type = $1`,
    [spec.objectType],
  );
  const summary = {
    kind: 'new1_source_vector_run',
    source: SOURCE,
    sourceObjectType: spec.objectType,
    definitionVersion: spec.definitionVersion,
    targetTable: target.table,
    targetReason: target.reason,
    pendingMigration: target.fix ?? null,
    recipe: 'HEAD:' + HEAD_CHARS,
    model: MODEL,
    dryRun: DRY_RUN,
    seen,
    written,
    skippedExisting,
    rowsForThisType: n,
    elapsedSeconds: (Date.now() - t0) / 1000,
    finishedAt: new Date().toISOString(),
  };
  mkdirSync(new URL('docs/ai/new1-r9/', ROOT), { recursive: true });
  writeFileSync(
    new URL('docs/ai/new1-r9/source-vector-' + SOURCE + '.json', ROOT),
    JSON.stringify(summary, null, 2) + '\n',
  );
  console.log('DONE ' + JSON.stringify(summary));
} catch (e) {
  console.error('FAILED ' + (e?.message ?? e));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 10 });
}
