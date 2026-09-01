/**
 * NEW2 — R19 §6. THE `-DB` EXISTING ROWS, BY ID.
 *
 * R18 counted them — 43 rows store the plain form while the document prints the
 * suffixed form glued to the next token, and a further 9 store the plain form
 * while the suffixed form is printed with a clean boundary — but it recorded
 * only the counts. R19 has to carry those rows into a named quarantine class and
 * account for each of them exactly once, so it needs the ids.
 *
 * The predicate is pushed into the database: a row qualifies when its stored
 * citation has no suffix and the SAME citation appears in its text with one. A
 * neutral citation contains only digits, letters and colons, so it is safe to
 * concatenate into a regex without escaping. Only matching rows cross the wire.
 *
 * Read-only, keyset-batched on `judgments_neutral_citation_key`, checkpointed
 * after every batch, two connections, no lease, no row written.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-r19-db-suffix-rows.mts [--batch 2000] [--resume]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const has = (n: string) => process.argv.includes(`--${n}`);
const OUTDIR = join(ROOT, arg('outdir', 'docs/ai/new2-r19'));
const OUT = join(OUTDIR, 'db-suffix-rows.jsonl');
const CKPT = join(OUTDIR, 'db-suffix-checkpoint.json');
const BATCH = Number(arg('batch', '2000'));
const NL = String.fromCharCode(10);

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

const KEYEXPR = "upper(regexp_replace(coalesce(neutral_citation,''),'[^A-Za-z0-9]','','g'))";

type Row = {
  id: string;
  court: string;
  case_number: string | null;
  neutral_citation: string;
  source_url: string | null;
  full_text: string | null;
  k: string;
};

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  mkdirSync(OUTDIR, { recursive: true });
  let cursor = '';
  let cursorId = '00000000-0000-0000-0000-000000000000';
  let scanned = 0;
  const counts: Record<string, number> = {};
  const bump = (k: string, by = 1): void => {
    counts[k] = (counts[k] ?? 0) + by;
  };

  if (has('resume') && existsSync(CKPT)) {
    const c = JSON.parse(readFileSync(CKPT, 'utf8'));
    cursor = c.cursor ?? '';
    cursorId = c.cursorId ?? '00000000-0000-0000-0000-000000000000';
    scanned = c.batchesDone ?? 0;
    Object.assign(counts, c.counts ?? {});
    console.log(`[r19-db] resumed at ${cursor}`);
  } else {
    writeFileSync(OUT, '');
  }

  const t0 = Date.now();
  for (;;) {
    // The keyset is (key, id): one neutral citation names several connected
    // matters, so a cursor on the key alone drops the rest of any key that
    // straddles a batch boundary — the defect R18 found and fixed.
    const rows = await sql<Row[]>`
      WITH page AS (
        SELECT id, court, case_number, neutral_citation, source_url, full_text,
               ${sql.unsafe(KEYEXPR)} AS k
          FROM judgments
         WHERE ${sql.unsafe(KEYEXPR)} > ''
           AND ${sql.unsafe(KEYEXPR)} >= ${cursor}
           AND (${sql.unsafe(KEYEXPR)}, id) > (${cursor}, ${cursorId}::uuid)
           AND source_url LIKE '%indian-high-court-judgments%'
         ORDER BY ${sql.unsafe(KEYEXPR)}, id
         LIMIT ${BATCH}
      )
      SELECT * FROM page
       WHERE neutral_citation !~ '-(DB|FB)$'
         AND full_text ~ (neutral_citation || '-(DB|FB)')`;
    // The predicate lives OUTSIDE the paging CTE so that only matching rows cross
    // the wire — which means the returned rows cannot carry the cursor. The page
    // boundary comes back separately, and an empty page is not the end of the walk.
    const [edge] = await sql<{ k: string; id: string; n: string }[]>`
      WITH page AS (
        SELECT id, ${sql.unsafe(KEYEXPR)} AS k
          FROM judgments
         WHERE ${sql.unsafe(KEYEXPR)} > ''
           AND ${sql.unsafe(KEYEXPR)} >= ${cursor}
           AND (${sql.unsafe(KEYEXPR)}, id) > (${cursor}, ${cursorId}::uuid)
           AND source_url LIKE '%indian-high-court-judgments%'
         ORDER BY ${sql.unsafe(KEYEXPR)}, id
         LIMIT ${BATCH}
      )
      SELECT k, id::text AS id, (SELECT count(*)::text FROM page) AS n
        FROM page ORDER BY k DESC, id DESC LIMIT 1`;
    if (!edge) break;
    cursor = edge.k;
    cursorId = edge.id;
    scanned++;
    bump('ROWS_SCANNED', Number(edge.n));
    const emit: string[] = [];

    for (const r of rows) {
      const stored = r.neutral_citation;
      if (/-(?:DB|FB)$/.test(stored)) {
        bump('STORED_WITH_SUFFIX');
        continue;
      }
      const text = r.full_text ?? '';
      if (text.length === 0) continue;
      const i = text.indexOf(stored + '-DB') !== -1 ? text.indexOf(stored + '-DB') : text.indexOf(stored + '-FB');
      if (i === -1) continue;
      const suffix = text.startsWith(stored + '-DB', i) ? 'DB' : 'FB';
      const end = i + stored.length + 3;
      const tail = text.slice(end, end + 18);
      // A boundary after the suffix means the OLD regex could take it and the
      // row is a plain-vs-suffixed disagreement of a different kind. No boundary
      // is the defect itself: the old rule silently returned the shorter key.
      const glued = /^[A-Za-z0-9]/.test(tail);
      bump(glued ? 'STORED_PLAIN_SUFFIX_GLUED' : 'STORED_PLAIN_SUFFIX_WITH_BOUNDARY');
      emit.push(
        JSON.stringify({
          judgmentId: r.id,
          court: r.court,
          caseNumber: r.case_number,
          storedNeutralCitation: stored,
          suffixPrinted: suffix,
          suffixedForm: `${stored}-${suffix}`,
          glued,
          klass: glued ? 'STORED_PLAIN_SUFFIX_GLUED' : 'STORED_PLAIN_SUFFIX_WITH_BOUNDARY',
          tail: tail.replace(/\s+/g, ' '),
          window: text.slice(Math.max(0, i - 120), end + 120).replace(/\s+/g, ' '),
          cleanPrintElsewhere: (() => {
            const g = new RegExp(`${stored}-${suffix}(?![A-Za-z0-9])`, 'g');
            return (text.match(g) ?? []).length;
          })(),
          sourceObjectKey: (r.source_url ?? '').replace(/^https?:\/\/[^/]+\//, '') || null,
        }),
      );
    }

    if (emit.length > 0) appendFileSync(OUT, emit.join(NL) + NL);
    writeFileSync(
      CKPT,
      JSON.stringify({ cursor, cursorId, batchesDone: scanned, counts, at: new Date().toISOString() }, null, 1) + NL,
    );
    if (scanned % 50 === 0)
      console.log(`[r19-db] batch ${scanned}  ${((Date.now() - t0) / 1000).toFixed(0)}s  ${JSON.stringify(counts)}`);
  }
  console.log(`[r19-db] done ${JSON.stringify(counts)}`);
} finally {
  await sql.end({ timeout: 5 });
}
