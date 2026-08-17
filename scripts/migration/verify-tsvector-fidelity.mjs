#!/usr/bin/env node
/**
 * Prove that the LOCALLY RECOMPUTED generated columns equal what the SOURCE
 * computed — by comparing against the source's own values.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT PARANOIA
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgments.full_text_tsv` is `GENERATED ALWAYS AS (to_tsvector('english',
 * full_text)) STORED`. A generated column cannot be written to, so the restore
 * could not carry the source's values across — the target server recomputed
 * every one of them.
 *
 * Everything else in this migration is verified by counting rows that were
 * COPIED. This column is the one thing that was DERIVED, on a different machine,
 * a different operating system and a different collation provider (Railway is
 * libc `en_US.utf8`, local is ICU `en-US`). "Same expression, so same result" is
 * an INFERENCE, and full-text ranking is exactly where a wrong inference would
 * be invisible: no error, no row-count difference, just different search results
 * than production had.
 *
 * The source's values are not lost. `dump-chunked.mjs` wrote `SELECT *`, so
 * every chunk on disk still carries the tsvector Railway computed. That makes
 * this checkable against primary evidence rather than argued about — which
 * matters more than usual here, because the source database is now offline and
 * cannot be re-queried.
 *
 * `CREATE TABLE probe (LIKE public.judgments)` defaults to EXCLUDING GENERATED,
 * so the probe's column is a PLAIN tsvector and the 33-field chunk loads into it
 * unchanged. That is the same property `restore-chunked.mjs` relies on, reused
 * here to read the source's answer back.
 *
 *   node scripts/migration/verify-tsvector-fidelity.mjs                 # default sample
 *   node scripts/migration/verify-tsvector-fidelity.mjs --chunk judgments__007.bin.zst
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { PG, pgEnv, psqlValue, psqlExec } from './pg-local.mjs';

const OUT = path.join(PG.dump, 'chunked');
const ZSTD = process.env.LAWMIND_ZSTD ?? 'C:\\lawmind\\bin\\zstd.exe';
const exe = (n) => path.join(PG.bin, `${n}.exe`);
const PROBE = 'tsv_fidelity_probe';

function loadProbe(file) {
  const posix = path.join(OUT, file).replace(/\\/g, '/');
  const sql = `COPY public.${PROBE} FROM PROGRAM '${ZSTD.replace(/\\/g, '/')} -d -c "${posix}"' (FORMAT binary)`;
  const r = spawnSync(exe('psql'), ['-d', PG.database, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    env: pgEnv(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(`could not load ${file}:\n${(r.stderr || '').trim()}`);
    process.exit(1);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const chunk = argv.includes('--chunk') ? argv[argv.indexOf('--chunk') + 1] : 'judgments__000.bin.zst';
  if (!fs.existsSync(path.join(OUT, chunk))) {
    console.error(`no such chunk: ${path.join(OUT, chunk)}`);
    process.exit(2);
  }

  const generated = psqlValue(
    `SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='judgments'
        AND column_name='full_text_tsv' AND is_generated <> 'NEVER'`,
    PG.database,
  ).trim();
  if (generated !== '1') {
    console.error('judgments.full_text_tsv is NOT a generated column — fix that before measuring it');
    process.exit(1);
  }

  console.log(`probe: loading ${chunk} (source-computed tsvectors) into ${PROBE}`);
  psqlExec(`DROP TABLE IF EXISTS public.${PROBE}`, PG.database);
  psqlExec(`CREATE TABLE public.${PROBE} (LIKE public.judgments)`, PG.database);

  // Guard: LIKE must have given us a PLAIN column, or the 33 fields will not fit
  // and — worse — a silently generated probe column would compare itself to
  // itself and always pass.
  const probeGen = psqlValue(
    `SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='${PROBE}'
        AND column_name='full_text_tsv' AND is_generated <> 'NEVER'`,
    PG.database,
  ).trim();
  if (probeGen !== '0') {
    console.error(`${PROBE}.full_text_tsv came out GENERATED — the probe would compare itself to itself. Aborting.`);
    psqlExec(`DROP TABLE public.${PROBE}`, PG.database);
    process.exit(1);
  }

  loadProbe(chunk);

  const rows = psqlValue(`SELECT count(*) FROM public.${PROBE}`, PG.database).trim();
  const matched = psqlValue(
    `SELECT count(*) FROM public.${PROBE} p JOIN public.judgments j ON j.id = p.id`,
    PG.database,
  ).trim();
  const nullSrc = psqlValue(
    `SELECT count(*) FROM public.${PROBE} WHERE full_text_tsv IS NULL`,
    PG.database,
  ).trim();
  const differing = psqlValue(
    `SELECT count(*) FROM public.${PROBE} p JOIN public.judgments j ON j.id = p.id
      WHERE p.full_text_tsv IS DISTINCT FROM j.full_text_tsv`,
    PG.database,
  ).trim();

  console.log('');
  console.log(`  rows in chunk (source)              ${rows}`);
  console.log(`  joined to local judgments           ${matched}`);
  console.log(`  source tsvector NULL                ${nullSrc}`);
  console.log(`  TSVECTORS THAT DIFFER               ${differing}`);
  console.log('');

  if (matched !== rows) {
    console.log(`FAIL — ${Number(rows) - Number(matched)} row(s) in the source chunk are missing locally.`);
  }

  if (differing !== '0') {
    const sample = psqlValue(
      `SELECT string_agg(s, E'\\n') FROM (
         SELECT p.id::text || E'\\n    source: ' || left(p.full_text_tsv::text, 160)
                            || E'\\n    local : ' || left(j.full_text_tsv::text, 160) AS s
           FROM public.${PROBE} p JOIN public.judgments j ON j.id = p.id
          WHERE p.full_text_tsv IS DISTINCT FROM j.full_text_tsv
          LIMIT 3) t`,
      PG.database,
    );
    console.log('first differing rows:');
    console.log(sample);
    console.log('');
    console.log('FAIL — local full-text search will not rank the way production did.');
  }

  psqlExec(`DROP TABLE public.${PROBE}`, PG.database);

  const ok = differing === '0' && matched === rows;
  console.log(
    ok
      ? `PASS — ${matched} tsvectors recomputed locally are byte-identical to the source's own.`
      : 'FAIL — see above. Do not cut over.',
  );
  process.exit(ok ? 0 : 1);
}

main();
