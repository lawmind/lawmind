/**
 * NEW2 — R20 §7. THE CONTROLS THAT TRY TO BREAK THE PREFILTER.
 *
 * `n2-r20-affected-universe.mts` walks a prefilter and calls it a corpus-wide
 * SUPERSET. A superset claim is only worth what its falsifiers are worth, so
 * this runs three, none of which is satisfied by the differential being clean:
 *
 *   A. FAITHFULNESS. Every document the walk found with a glued suffix should
 *      already hold the OLD rule's answer as an edge row. If one does not, the
 *      edge pass did not write what the extractor read, and the prefilter has a
 *      hole the differential could never have shown.
 *
 *   B1. THE NECESSARY CONDITION, TESTED RATHER THAN ASSUMED. A blind sample of
 *      documents OUTSIDE the prefilter, with the text actually read and both
 *      rules actually run — no appeal to the SQL precondition at all.
 *
 *   B2. THE SUPERSET, TESTED WIDE. A much larger blind sample outside the
 *      prefilter with the necessary condition evaluated in Postgres so the text
 *      never crosses the wire; anything that matches is then read in full.
 *
 * `judgments.id` is a random uuid, so a contiguous run of the primary key is
 * uncorrelated with court, year and source — a slab is a sample here, which it
 * would not be on a clustered key. Starting points are seeded, so the draw is
 * reproducible.
 *
 * A NOTE ON THE PLAN, BECAUSE IT COST A RUN. `select j.id::text as id … order by
 * id` makes Postgres sort on the OUTPUT column `(id)::text`, not the primary
 * key, and the plan becomes a parallel sequential scan of a 151 GB table. The
 * order-by is qualified and the output column renamed for exactly that reason.
 *
 * Read-only. No writes, no migration, no network.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = join(ROOT, 'docs/ai/new2-r20');

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const DEEP_SLABS = Number(arg('deepSlabs', '40'));
const DEEP_PER = Number(arg('deepPer', '500'));
const WIDE_SLABS = Number(arg('wideSlabs', '100'));
const WIDE_PER = Number(arg('widePer', '5000'));

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

const OLD = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/g;
const NEW = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})\b(?:-(?:DB|FB))?/g;
const all = (re: RegExp, s: string): string[] =>
  [...s.matchAll(new RegExp(re.source, re.flags))].map((m) => m[0]);
const differs = (a: string[], b: string[]): boolean =>
  a.length !== b.length || a.some((v, k) => v !== b[k]);
const PRECONDITION = '[0-9]-(DB|FB)[0-9A-Za-z_]';

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

/** Deterministic starting points, so the slab draw is reproducible from the seed. */
function seededUuid(seed: number, i: number): string {
  let h = (seed ^ (i * 2654435761)) >>> 0;
  let out = '';
  for (let k = 0; k < 8; k += 1) {
    h = (h * 1664525 + 1013904223) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  const s = out.slice(0, 32);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
const SEED = 20260901;

try {
  const ids = readFileSync(join(OUTDIR, '.affected-universe.txt'), 'utf8').split('\n').filter(Boolean);
  const inSet = new Set(ids);

  // ---- A. FAITHFULNESS of the edge pass on every document the walk found. ---
  const hits = readFileSync(join(OUTDIR, 'affected-hits.jsonl'), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { id: string; old: string });
  const wanted = [...new Map(hits.map((h) => [`${h.id}|${h.old}`, h])).values()];
  const faithful = { checked: 0, EDGE_PRESENT: 0, EDGE_MISSING: 0, NOT_IN_PREFILTER: 0 };
  const missing: unknown[] = [];
  for (const h of wanted) {
    faithful.checked += 1;
    if (!inSet.has(h.id)) faithful.NOT_IN_PREFILTER += 1;
    const rows = await sql`
      select 1 from judgment_citations
      where citing_judgment_id = ${h.id}::uuid and normalised_citation = ${h.old}
      limit 1`;
    if (rows.length > 0) faithful.EDGE_PRESENT += 1;
    else {
      faithful.EDGE_MISSING += 1;
      missing.push(h);
    }
  }
  console.log(`[A faithfulness] ${JSON.stringify(faithful)}`);

  // ---- B1. Text actually read, both rules actually run, outside the prefilter.
  const deep = { SAMPLED: 0, OUTSIDE: 0, INSIDE_SKIPPED: 0, PRECONDITION_MATCHED: 0, CHANGED: 0 };
  const deepChanges: unknown[] = [];
  for (let i = 0; i < DEEP_SLABS; i += 1) {
    const rows = await sql.unsafe(
      `select j.id::text as jid, j.court as jcourt, j.full_text as jtext
       from judgments j
       where j.id > '${seededUuid(SEED, i)}'::uuid and j.full_text is not null
       order by j.id limit ${DEEP_PER}`,
    );
    for (const r of rows as { jid: string; jcourt: string; jtext: string }[]) {
      deep.SAMPLED += 1;
      if (inSet.has(r.jid)) {
        deep.INSIDE_SKIPPED += 1;
        continue;
      }
      deep.OUTSIDE += 1;
      if (new RegExp(PRECONDITION).test(r.jtext)) deep.PRECONDITION_MATCHED += 1;
      const oldOut = all(OLD, r.jtext);
      const newOut = all(NEW, r.jtext);
      if (!differs(oldOut, newOut)) continue;
      deep.CHANGED += 1;
      deepChanges.push({ id: r.jid, court: r.jcourt, old: oldOut.slice(0, 6), new: newOut.slice(0, 6) });
    }
    if (i % 10 === 0) console.log(`[B1 deep] ${i}/${DEEP_SLABS} ${JSON.stringify(deep)}`);
  }
  console.log(`[B1 deep] done ${JSON.stringify(deep)}`);

  // ---- B2. Wide, no text on the wire until something matches. ---------------
  const wide = { SAMPLED: 0, OUTSIDE: 0, INSIDE_SKIPPED: 0, PRECONDITION_MATCHED: 0, CHANGED: 0 };
  const wideChanges: unknown[] = [];
  for (let i = 0; i < WIDE_SLABS; i += 1) {
    const rows = await sql.unsafe(
      `select j.id::text as jid, j.court as jcourt, (j.full_text ~ '${PRECONDITION}') as pre
       from judgments j
       where j.id > '${seededUuid(SEED + 7, i)}'::uuid and j.full_text is not null
       order by j.id limit ${WIDE_PER}`,
    );
    const followUp: string[] = [];
    for (const r of rows as { jid: string; jcourt: string; pre: boolean }[]) {
      wide.SAMPLED += 1;
      if (inSet.has(r.jid)) {
        wide.INSIDE_SKIPPED += 1;
        continue;
      }
      wide.OUTSIDE += 1;
      if (r.pre) {
        wide.PRECONDITION_MATCHED += 1;
        followUp.push(r.jid);
      }
    }
    for (const id of followUp) {
      const got = await sql`select court, full_text from judgments where id = ${id}::uuid`;
      const r = got[0] as { court: string; full_text: string } | undefined;
      if (!r) continue;
      const oldOut = all(OLD, r.full_text);
      const newOut = all(NEW, r.full_text);
      if (!differs(oldOut, newOut)) continue;
      wide.CHANGED += 1;
      wideChanges.push({ id, court: r.court, old: oldOut.slice(0, 6), new: newOut.slice(0, 6) });
    }
    if (i % 20 === 0) console.log(`[B2 wide] ${i}/${WIDE_SLABS} ${JSON.stringify(wide)}`);
  }
  console.log(`[B2 wide] done ${JSON.stringify(wide)}`);

  writeFileSync(
    join(OUTDIR, 'negative-control.json'),
    JSON.stringify(
      {
        artifact: 'NEW2_R20_NEGATIVE_CONTROL',
        takenAt: new Date().toISOString(),
        seed: SEED,
        prefilterSize: ids.length,
        A_faithfulness: { ...faithful, missing },
        B1_textReadOutsidePrefilter: { ...deep, slabs: DEEP_SLABS, perSlab: DEEP_PER, changes: deepChanges },
        B2_wideOutsidePrefilter: { ...wide, slabs: WIDE_SLABS, perSlab: WIDE_PER, changes: wideChanges },
      },
      null,
      1,
    ),
  );
  console.log('written docs/ai/new2-r20/negative-control.json');
} finally {
  await sql.end();
}
