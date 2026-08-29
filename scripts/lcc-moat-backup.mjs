#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CURATED MOAT — WHAT WE CANNOT GET BACK, DUMPED AND PROVED RESTORABLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * P7. **A backup that has never been restored is a hypothesis.** So this does
 * the whole loop by default:
 *
 *     DUMP -> create a disposable database -> RESTORE -> verify row counts and
 *     content checksums -> measure the time -> drop the disposable database
 *
 * and refuses to call anything viable on a dump alone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS IN THE PACK, AND WHY THE 151 GB TABLE IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The test is not "is it valuable", it is **"if this box died tonight, could we
 * rebuild it from the sources we are authorised to use?"**
 *
 *   `judgments` (151 GB) and `judgment_paragraphs` (92 GB) — REBUILDABLE. Both
 *   are derived from the AWS Open Data buckets by a pipeline that lives in this
 *   repository. Slow and annoying, not lost. Backing them up locally would turn
 *   a 400 MB pack into a 250 GB one and the mandate is explicit: *"Do NOT
 *   perform a full 287GB clone."*
 *
 *   `judgment_chunks` (9.4 GB) — REBUILDABLE, at GPU cost. Named here so the
 *   omission is a decision rather than an oversight.
 *
 *   Everything in {@link MOAT} — NOT rebuildable at any price:
 *     · an advocate's matters, notes, annotations and saved searches
 *     · a HUMAN's Tier 3 verification vouch (`verification_cache`)
 *     · the audit ledger, which is append-only precisely so it cannot be redone
 *     · months of GPU and LLM work: resolved citation edges, date verdicts,
 *       damage verdicts, statute references, recovery attempts
 *
 * `judgments` contributes one thing to the pack: a PROJECTION of the columns
 * that are verdicts rather than source text — `script_quality`,
 * `overruled_status`, `hc_document_class` and friends, keyed by id. That is a
 * few hundred MB instead of 151 GB, and it is the part no bucket can return.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTHING HERE ACTIVATES ANYTHING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * No object store is written to, no credential is read, no account is created.
 * The output is a directory on this disk and a manifest. Offsite storage is a
 * founder decision (`FQ-BACKUP-SPEND`); this tool exists so that decision can be
 * made against a real compressed byte count instead of an estimate.
 *
 *   node scripts/lcc-moat-backup.mjs --out ./backup-pack
 *   node scripts/lcc-moat-backup.mjs --out ./backup-pack --no-restore   # dump only
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

/**
 * The pack. Each entry says WHY it cannot be rebuilt, because the day somebody
 * removes one they should have to argue with the reason.
 */
const MOAT = [
  // ── An advocate's own work. Irreplaceable by definition. ──────────────────
  { table: 'users', why: 'the advocates themselves' },
  { table: 'auth_user', why: 'sign-in identity' },
  { table: 'auth_account', why: 'sign-in identity' },
  { table: 'matters', why: 'client names, notes, hearing detail — the retention moat' },
  { table: 'matter_events', why: 'matter history' },
  { table: 'matter_authorities', why: 'what an advocate saved to a matter' },
  { table: 'matter_shares', why: 'who was given sight of a matter, and when — a conflicts record' },
  { table: 'judgment_annotations', why: "an advocate's own highlights" },
  { table: 'saved_searches', why: 'a saved search is content the advocate asked us to keep' },
  { table: 'documents', why: 'metadata for uploads; the objects themselves are in R2' },
  { table: 'briefings', why: 'generated wedge content tied to a matter' },
  { table: 'alerts', why: 'what an advocate has and has not been told' },
  { table: 'citation_copies', why: 'the ONLY way to warn someone who filed a citation that later moved' },
  { table: 'data_requests', why: 'DPDP obligations with a clock on them' },
  { table: 'training_consent_events', why: 'consent history — DPDP s.6 evidence' },

  // ── Human judgement and governance. Cannot be recomputed. ─────────────────
  { table: 'verification_cache', why: 'a HUMAN solved a CAPTCHA and vouched — Tier 3' },
  { table: 'citation_disputes', why: 'trust feedback, and what an admin did about it' },
  { table: 'audit_log', why: 'append-only by design; re-deriving it is a contradiction in terms' },
  { table: 'platform_config', why: 'kill switches and flags, with their reasons' },

  // ── Months of GPU, LLM and crawl work. Rebuildable only in principle. ─────
  { table: 'judgment_citations', why: 'resolved citation edges — the citator itself' },
  { table: 'judgment_citation_aliases', why: 'the concordance exact search depends on' },
  { table: 'judgment_citation_keys', why: 'citation identity keys' },
  { table: 'judgment_date_quality', why: 'date verdicts with their witnesses' },
  { table: 'judgment_recovery_queue', why: 'what is queued for OCR recovery and why' },
  { table: 'judgment_text_recovery', why: 'recovered text with digit_trust provenance' },
  { table: 'judgment_statute_refs', why: 'statute references, re-derived once already at cost' },
  { table: 'statute_mappings', why: 'BNS/BNSS/BSA transition evidence' },
  { table: 'statute_sections', why: 'statute text' },
  { table: 'coverage_cell', why: 'coverage truth per court-year' },
  { table: 'hc_ingest_ledger', why: 'the FAILURE side of ingest; source_url only records successes' },
  { table: 'ecourts_observation', why: 'RAW eCourts observations; the grant is spent, the observation is not repeatable' },
  { table: 'ecourts_transition', why: 'derived case-state transitions' },
  { table: 'ecourts_fetch_ledger', why: 'the only proof we stayed inside the registrar grant -- losing it loses the answer to "did you"' },
  /**
   * THE RAW BYTES THEMSELVES, which this pack did not carry.
   *
   * `ecourts_observation` is the NORMALISED reading of a response.
   * `official_source_artifact` is the response — the actual bytes an authorised
   * request obtained, retained before anything parsed them. Backing up the
   * interpretation and not the evidence gets the direction exactly wrong: a
   * parser can be rewritten against retained bytes, and no parser can
   * reconstruct bytes that were thrown away.
   *
   * It is also the only copy. Each artifact cost a slot out of 1,000 daily
   * against a grant that expires January 2029, and the eCourts cause-list
   * interface serves the CURRENT day — a response from 29 August 2026 is not
   * re-fetchable at any price.
   *
   * 53 MB whole, across all sources. That is not bulk and it is not excluded for
   * being large; the bulk corpus and the vector tables stay out, deliberately.
   */
  { table: 'official_source_artifact', why: 'the RAW retained response bytes -- a parser can be rewritten, discarded bytes cannot; each eCourts row cost a slot of a grant that expires' },
  { table: 'lexeme_document_frequency', why: 'the measured corpus sample the sparse ranker ranks with' },
];

/**
 * The verdict columns on `judgments`. A projection, not the table.
 *
 * `content_hash` rides along as the join key back to a rebuilt corpus: judgment
 * ids are `gen_random_uuid()` and would not survive a re-ingest, so an id-keyed
 * export would restore into a corpus it could no longer address.
 */
const JUDGMENT_VERDICTS = `
  SELECT id, content_hash, script_quality, script_quality_method, script_quality_at,
         overruled_status, overruled_by_judgment_id, overruled_paras, overruled_note,
         overruled_status_changed_at, hc_document_class, hc_class_method
    FROM judgments
   WHERE script_quality IS NOT NULL
      OR overruled_status <> 'none'
      OR hc_document_class IS NOT NULL`;

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const OUT = resolve(flag('out') ?? './backup-pack');
const DO_RESTORE = !args.includes('--no-restore');
const BIN = flag('pgbin') ?? 'C:/lawmind/pgsql/pgsql/bin';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(2);
}
const parsed = new URL(url);
const DB = parsed.pathname.replace(/^\//, '');
const SCRATCH = `${DB}_moat_restore_test`;
const env = { ...process.env, PGPASSWORD: decodeURIComponent(parsed.password) };
const conn = ['-h', parsed.hostname, '-p', parsed.port || '5432', '-U', decodeURIComponent(parsed.username)];

function pg(tool, toolArgs, opts = {}) {
  return execFileSync(join(BIN, tool), toolArgs, { env, encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
}

function sha256File(path) {
  return new Promise((res, rej) => {
    const h = createHash('sha256');
    createReadStream(path)
      .on('data', (d) => h.update(d))
      .on('end', () => res(h.digest('hex')))
      .on('error', rej);
  });
}

mkdirSync(OUT, { recursive: true });
const started = Date.now();

/**
 * A moat table that does not exist is a FINDING, not a crash.
 *
 * The first run died on `ecourts_observations`, which the pack expected and this
 * database does not have. Two possible meanings, and only an operator can tell
 * them apart: a migration that was never applied, or a list that is wrong. Either
 * way the right behaviour is to pack what exists and SAY what did not — a backup
 * tool that refuses to run because one table is missing protects nothing at all.
 */
const present = new Set(
  pg('psql', [...conn, '-d', DB, '-t', '-A', '-c',
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`])
    .split(String.fromCharCode(10))
    .map((l) => l.trim())
    .filter(Boolean),
);
const missing = MOAT.filter((m) => !present.has(m.table));
const packing = MOAT.filter((m) => present.has(m.table));
if (missing.length > 0) {
  console.log('NOT IN THIS DATABASE — recorded as absent, never as empty:');
  for (const m of missing) console.log(`  ${m.table.padEnd(30)} ${m.why}`);
  console.log('');
}

// ── 1. DUMP ────────────────────────────────────────────────────────────────
const dumpPath = join(OUT, 'moat.dump');
const schemaPath = join(OUT, 'schema.sql');

/**
 * `--skip-dump` restores from a pack that ALREADY EXISTS, and it is the more
 * honest exercise of the two.
 *
 * A restore proved against a dump taken thirty seconds earlier proves that
 * `pg_dump` and `pg_restore` agree. What anyone actually needs to know is
 * whether the pack sitting on disk from last week can be brought back — and
 * that is what this flag runs. It also makes the proof re-runnable after an
 * interruption without paying for the dump twice.
 */
const SKIP_DUMP = args.includes('--skip-dump');
if (SKIP_DUMP && !existsSync(dumpPath)) {
  console.error(`--skip-dump given but ${dumpPath} does not exist`);
  process.exit(2);
}

let dumpSeconds = 0;
if (SKIP_DUMP) {
  console.log(`restoring the EXISTING pack at ${OUT} — no dump taken\n`);
} else {
  console.log(`dumping ${packing.length} tables + the judgments verdict projection\n`);
  const tableArgs = packing.flatMap((m) => ['-t', `public.${m.table}`]);
  const dumpStarted = Date.now();
  pg('pg_dump', [...conn, '-d', DB, '-Fc', '--no-owner', '--no-acl', '-f', dumpPath, ...tableArgs], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  dumpSeconds = (Date.now() - dumpStarted) / 1000;
}

/**
 * The SCHEMA, whole, separately — and the first restore proved why.
 *
 * `pg_dump -t table` does NOT carry the custom TYPES that table's columns
 * depend on. Six tables came back MISSING from the first restore —
 * `data_requests`, `verification_cache`, `citation_disputes`,
 * `platform_config`, `statute_mappings`, `ecourts_fetch_ledger` — and every one
 * of them has an enum column. The tables with no enums restored perfectly, so
 * the dump looked fine and the pack was not.
 *
 * That is precisely the failure a dump-only backup cannot see: the artefact
 * exists, its bytes are intact, its checksum matches, and it cannot be restored.
 * The schema dump is DDL only, so it costs seconds.
 */
if (!SKIP_DUMP) {
  pg('pg_dump', [...conn, '-d', DB, '--schema-only', '--no-owner', '--no-acl', '-f', schemaPath], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  // The verdict projection, as compressed CSV. Separate from the custom-format
  // dump on purpose: it is a QUERY, not a table, and a restore of it is a COPY
  // into whatever corpus exists at the time rather than a table replacement.
  const verdictPath = join(OUT, 'judgment-verdicts.csv');
  pg('psql', [...conn, '-d', DB, '-v', 'ON_ERROR_STOP=1', '-c', `\\copy (${JUDGMENT_VERDICTS}) TO '${verdictPath.replace(/\\/g, '/')}' WITH CSV HEADER`], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  await pipeline(
    createReadStream(verdictPath),
    createGzip({ level: 9 }),
    createWriteStream(`${verdictPath}.gz`),
  );
}

// ── 2. MANIFEST ────────────────────────────────────────────────────────────
/**
 * ───────────────────────────────────────────────────────────────────────────
 * THE COUNTS MUST COME FROM WHEN THE DUMP WAS TAKEN, NOT FROM NOW
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The first `--skip-dump` run reported three MISMATCHes — `users` 67 vs 63,
 * `auth_user` 67 vs 63, `audit_log` 231 vs 224 — and every one of them was a
 * defect in the VERIFICATION rather than in the pack.
 *
 * A dump is a point-in-time snapshot. The database it came from keeps being
 * written to; in this case by the round's own test suites, which seed users and
 * write audit rows every time they run. Comparing a live `count(*)` against a
 * restore of an hour-old dump measures how busy the database has been, not
 * whether the backup works.
 *
 * Worse, the run then OVERWROTE the manifest with the live figures, destroying
 * the record of what the dump actually contained — so the evidence needed to
 * tell the two apart was deleted by the act of looking.
 *
 * So: a fresh dump records the counts it just took, and a `--skip-dump` run
 * READS them back and leaves the manifest alone. The 31 tables that matched
 * exactly, including 22,322,047 citation rows and a matching content checksum,
 * were the actual result.
 */
const manifestPath = join(OUT, 'MANIFEST.json');
const priorManifest =
  SKIP_DUMP && existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8'))
    : null;
const rowCounts = priorManifest?.rowCounts
  ? priorManifest.rowCounts
  : JSON.parse(
      pg('psql', [...conn, '-d', DB, '-t', '-A', '-c',
        `SELECT json_object_agg(t, n) FROM (${packing.map((m) => `SELECT '${m.table}' AS t, (SELECT count(*) FROM public.${m.table}) AS n`).join(' UNION ALL ')}) x`]).trim(),
    );
if (priorManifest?.rowCounts) {
  console.log(`comparing against the counts recorded at dump time (${priorManifest.createdAt})\n`);
}

const files = readdirSync(OUT).filter((f) => f !== 'MANIFEST.json' && f !== 'judgment-verdicts.csv');
const manifest = {
  createdAt: new Date().toISOString(),
  database: DB,
  tool: 'scripts/lcc-moat-backup.mjs',
  dumpSeconds,
  tables: packing,
  missingTables: missing,
  rowCounts,
  files: {},
  excluded: {
    judgments: 'rebuildable from the AWS Open Data buckets — 151 GB, deliberately not packed',
    judgment_paragraphs: 'derived from judgments — 92 GB',
    judgment_chunks: 'rebuildable at GPU cost — 9.4 GB',
  },
};
for (const f of files) {
  const p = join(OUT, f);
  manifest.files[f] = { bytes: statSync(p).size, sha256: await sha256File(p) };
}
// Never rewritten by a `--skip-dump` run: the manifest is the record of what
// the dump CONTAINED, and overwriting it with today's figures deletes the
// evidence the verification depends on.
if (!priorManifest) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const packBytes = Object.values(manifest.files).reduce((a, f) => a + f.bytes, 0);
console.log(`\nPACK`);
console.log(`  tables            ${packing.length} packed, ${missing.length} absent`);
console.log(`  compressed bytes  ${packBytes.toLocaleString()}  (${(packBytes / 1e9).toFixed(3)} GB)`);
console.log(`  dump time         ${dumpSeconds.toFixed(1)}s`);

if (!DO_RESTORE) {
  console.log('\n--no-restore given. A dump that has not been restored is a HYPOTHESIS, not a backup.');
  process.exit(0);
}

// ── 3. RESTORE INTO A DISPOSABLE DATABASE ──────────────────────────────────
console.log(`\nrestoring into a disposable database: ${SCRATCH}`);
try {
  // `--force` because a previous aborted run can leave a session attached, and
  // a silent failure here becomes `database already exists` one line later —
  // which is exactly how this failed the first time.
  pg('dropdb', [...conn, '--if-exists', '--force', SCRATCH], { stdio: 'ignore' });
} catch {
  /* nothing to drop */
}
pg('createdb', [...conn, SCRATCH], { stdio: ['ignore', 'inherit', 'inherit'] });

const restoreStarted = Date.now();
// Types and tables first, from the schema dump; then the data. Errors are
// expected here (extensions, roles) and the verification below is what decides.
try {
  pg('psql', [...conn, '-d', SCRATCH, '-q', '-f', schemaPath], { stdio: ['ignore', 'ignore', 'ignore'] });
} catch {
  /* DDL warnings are not the test */
}
try {
  pg('pg_restore', [...conn, '-d', SCRATCH, '--no-owner', '--no-acl', '--data-only', '--disable-triggers', '-j', '2', dumpPath], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
} catch (error) {
  // pg_restore exits non-zero on warnings (missing roles, extensions). The
  // verification below is the real test, so record and continue rather than
  // claiming failure on a warning — or success on one.
  console.log('  pg_restore reported warnings; the row/checksum verification below decides.');
  void error;
}
const restoreSeconds = (Date.now() - restoreStarted) / 1000;

// ── 4. VERIFY ──────────────────────────────────────────────────────────────
console.log('\nVERIFY  table                          source     restored   match');
let allMatch = true;
for (const m of packing) {
  // A table that cannot be counted did not restore. `MISSING` rather than 0,
  // because "the table is not there" and "the table is empty" are the two
  // states this whole exercise exists to tell apart.
  let restored;
  try {
    restored = pg('psql', [...conn, '-d', SCRATCH, '-t', '-A', '-c', `SELECT count(*) FROM public.${m.table}`]).trim();
  } catch {
    restored = 'MISSING';
  }
  const source = String(rowCounts[m.table]);
  const ok = restored === source;
  if (!ok) allMatch = false;
  console.log(`        ${m.table.padEnd(30)} ${source.padStart(9)} ${String(restored).padStart(10)}   ${ok ? 'ok' : 'MISMATCH'}`);
}

/**
 * Row counts alone would pass on a restore that silently truncated a text
 * column, so one CONTENT checksum too, over the table whose loss would hurt
 * most and whose values are not integers.
 */
/**
 * DETERMINISTIC, and the first run was not.
 *
 * `LIMIT 100000` with no `ORDER BY` returns a hundred thousand arbitrary rows,
 * and two databases pick different ones — so the first proof reported a checksum
 * MISMATCH on data that was in fact identical. A verification that can cry wolf
 * is worse than none: the next person learns to ignore it.
 */
const checksumSql = `SELECT md5(string_agg(t, '|' ORDER BY t)) FROM (
  SELECT coalesce(citing_judgment_id::text,'') || coalesce(cited_judgment_id::text,'') || coalesce(relationship,'')
    AS t FROM public.judgment_citations
   ORDER BY citing_judgment_id, cited_judgment_id, relationship
   LIMIT 100000) x`;
const sourceSum = pg('psql', [...conn, '-d', DB, '-t', '-A', '-c', checksumSql]).trim();
const restoredSum = pg('psql', [...conn, '-d', SCRATCH, '-t', '-A', '-c', checksumSql]).trim();
const sumOk = sourceSum === restoredSum && sourceSum !== '';
if (!sumOk) allMatch = false;
console.log(`\n  content checksum (judgment_citations, 100k rows)  ${sumOk ? 'MATCH' : 'MISMATCH'}`);
console.log(`    source   ${sourceSum}`);
console.log(`    restored ${restoredSum}`);

console.log(`\n  restore time      ${restoreSeconds.toFixed(1)}s`);
console.log(`  total elapsed     ${((Date.now() - started) / 1000).toFixed(1)}s`);

const restoreResult = { at: new Date().toISOString(), seconds: restoreSeconds, verified: allMatch, checksumMatch: sumOk };
// Recorded ONTO the manifest that describes this pack, not onto a new one.
const finalManifest = priorManifest ?? manifest;
finalManifest.restore = restoreResult;
writeFileSync(manifestPath, JSON.stringify(finalManifest, null, 2));

console.log(`\ndropping ${SCRATCH}`);
pg('dropdb', [...conn, '--if-exists', '--force', SCRATCH], { stdio: 'ignore' });

console.log(
  allMatch
    ? '\nRESTORE PROVEN — every row count and the content checksum matched.'
    : '\nRESTORE NOT PROVEN — see the mismatches above. This pack is not viable.',
);
process.exit(allMatch ? 0 : 1);
