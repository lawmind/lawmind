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
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

/**
 * ───────────────────────────────────────────────────────────────────────────
 * THE IDENTITY MAP — WITHOUT IT, TWO THIRDS OF THE PACK RESTORES INTO NOTHING
 * ───────────────────────────────────────────────────────────────────────────
 *
 * `JUDGMENT_VERDICTS` above carries `content_hash` as its join key back to a
 * rebuilt corpus, and that was correct as far as it went. It does not go far
 * enough, and the gap is arithmetic rather than opinion.
 *
 * The verdict projection has a WHERE clause: a judgment appears only if it
 * carries a `script_quality`, an `overruled_status` or an `hc_document_class`.
 * That is **6,194,817 of 18,759,022 rows**. Every other table in {@link MOAT}
 * addresses judgments by their `gen_random_uuid()` id — `judgment_citations`
 * on both ends, `judgment_statute_refs`, `judgment_date_quality`,
 * `verification_cache`, `matter_authorities`, `citation_copies`,
 * `official_source_artifact`, `judgment_annotations`, and the rest. Measured
 * 30 August 2026, the union of ids those tables reference is the WHOLE corpus:
 *
 *     referenced distinct ids              18,759,022
 *     of those, in the verdict projection   6,194,817
 *     of those, NOT in it                  12,564,205   (67.0%)
 *     dangling (no judgments row)                   0
 *
 * So a restore into a re-ingested corpus — where every id is a fresh
 * `gen_random_uuid()` — can re-point 33% of the citator and loses the address
 * of the other 67%. The rows survive. What they are ABOUT does not. That is
 * the difference between a backup and a pile of foreign keys, and no row count
 * or checksum can see it, because the rows are all present and all intact.
 *
 * Hence this: **every judgment id, with the content and source identity that
 * outlives a re-ingest.** Two columns would be enough for the join
 * (`id`, `content_hash`); `source_url` rides along because a normalisation
 * change to the text moves the hash and the source key still holds, and the
 * four provenance columns ride along because §4C requires them and they are
 * populated on 0.03% of rows — they cost nothing and cannot be recomputed.
 *
 * It is a QUERY, not a table: restoring it is a COPY into whatever corpus
 * exists at the time, exactly like the verdict projection.
 */
const JUDGMENT_IDENTITY = `
  SELECT id, content_hash, source_url,
         source_id, source_edition, authorization_basis, provenance_recorded_at
    FROM judgments`;

/**
 * ───────────────────────────────────────────────────────────────────────────
 * THE FILES — "IT IS IN THE GIT CHECKOUT" IS NOT AN OFF-MACHINE COPY
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Gate B's protected set names eval/gold sets, source manifests, worklists and
 * checkpoints, provenance, migrations and recent official-source evidence.
 * Every one of those lives as a FILE in this repository, and until now the
 * pack's answer was that they are tracked in Git. They are — in a repository
 * whose only clone is on this workstation and whose HEAD is not pushed. A
 * protected artifact that exists solely as an unpushed local Git object is
 * exactly as lost as one that was never written.
 *
 * So the bytes travel. Each root says what class it satisfies and why it is
 * not rebuildable, because the day somebody drops one they should have to
 * argue with the reason.
 *
 * WHAT IS DELIBERATELY LEFT OUT, so the omission is a decision:
 *   · `docs/ai/embedding-manifests/document-vectors{,-v2}/` — 4.3 GB of vector
 *     batch output. Vectors are not required merely because they are expensive
 *     (governing minimum set, §4), and these are regenerable from the corpus
 *     and the protected model at GPU cost. The identity and census manifests
 *     that describe them ARE carried.
 *   · `.agents/logs/**` and `.agents/tmp/**` — transient scratch.
 *   · `node_modules`, build output, and the model weights, which have their own
 *     encrypted pack rather than being duplicated into this one.
 */
const PROTECTED_FILES = [
  { root: 'docs/roadmaps', why: 'GOVERNING AUTHORITY — the founder\u2019s exact Master Roadmap v7.1 and Sprint Prompts v2 bytes' },
  { root: 'docs/ai/new3-hard-negatives.json', why: 'EVAL/GOLD' },
  { root: 'docs/ai/new3-noncitation-gold.json', why: 'EVAL/GOLD' },
  { root: 'docs/ai/new3-semantic-expansion-gold.json', why: 'EVAL/GOLD' },
  { root: 'docs/ai/new3-semantic-expansion-gold-v2.json', why: 'EVAL/GOLD' },
  { root: 'docs/ai/new3-semantic-expansion-gold-v2-rejected.json', why: 'EVAL/GOLD — the rejected set is evidence about the accepted one' },
  { root: 'docs/ai/new3-statute-transition-gold.json', why: 'EVAL/GOLD — BNS/BNSS/BSA transition' },
  { root: 'docs/ai/new3-uncited-authority-gold.json', why: 'EVAL/GOLD' },
  { root: 'docs/ai/new3-uncited-authority-gold-v2.json', why: 'EVAL/GOLD' },
  { root: 'docs/ai/new3', why: 'EVAL/GOLD — the rest of the NEW3 gold set' },
  { root: 'docs/ai/new2-r9', why: 'SOURCE MANIFESTS + statute chronology/correction decisions' },
  { root: 'docs/ai/new2-r10', why: 'SOURCE MANIFESTS — freshness, parity matrix, revalidation' },
  { root: 'docs/ai/new2-r83', why: 'SOURCE MANIFESTS — IPC/CrPC acquisition and freshness decomposition' },
  { root: 'docs/ai/embedding-manifests/EMBEDDING_IDENTITY_V2.json', why: 'CANONICAL IDENTITY — which model produced which vectors' },
  { root: 'docs/ai/embedding-manifests/tier-census.json', why: 'CANONICAL IDENTITY — the tier population it was measured against' },
  { root: 'docs/ai/embedding-manifests/legal-objects', why: 'SOURCE MANIFESTS — proposition objects, not vectors' },
  { root: 'docs/ai/lcc-r11', why: 'RECENT OFFICIAL-SOURCE EVIDENCE — eCourts network safety' },
  { root: 'docs/ai/lcc-r12', why: 'RECENT OFFICIAL-SOURCE EVIDENCE — eCourts coverage ledger' },
  { root: 'docs/ai/lcc-r13', why: 'RECENT OFFICIAL-SOURCE EVIDENCE — the eCourts bounded-stop report and the model manifest' },
  { root: 'docs/ai/new1-tier-a/.worklist.txt', why: 'RESTART-CRITICAL WORKLIST' },
  { root: 'docs/ai/new1-tier-a/.worklist-v2.txt', why: 'RESTART-CRITICAL WORKLIST' },
  { root: 'docs/ai/new1-r9/delta/queue-state.json', why: 'RESTART-CRITICAL CHECKPOINT — the incremental queue cursor' },
  { root: 'docs/ai/new1-r9/delta/queue-ledger.jsonl', why: 'RESTART-CRITICAL CHECKPOINT — what the queue has already emitted' },
  { root: 'services/ingest/.checkpoints', why: 'RESTART-CRITICAL CHECKPOINTS — every ingest scope cursor; losing them re-walks the corpus' },
  { root: 'packages/db/drizzle', why: 'MIGRATIONS — the journal and the SQL, so a fresh install is reproducible' },
  { root: 'packages/db/factory', why: 'MIGRATIONS — the factory migrations, including the snapshot writer' },
  { root: 'CLAUDE.md', why: 'PROVENANCE/AUTHORIZATION — \u00a76a is the controlling record of source authorization' },
  { root: 'DOMAIN_TRUTH.md', why: 'PROVENANCE — BNS/BNSS/BSA facts no model knows' },
  { root: 'PRODUCT_DECISIONS.md', why: 'CANONICAL DECISIONS — PD-1..PD-15' },
  { root: 'docs/CURRENT_PLAN.md', why: 'CANONICAL DECISIONS — the ordered queue and the roadmap overrides' },
  { root: 'docs/SCHEMA_TRUTH.md', why: 'SCHEMA — the only authority on data shapes' },
  { root: 'docs/CITATION_HARNESS.md', why: 'CANONICAL DECISIONS — the rule that can end the product' },
  { root: 'docs/ECOURTS_AUTHORISATION.md', why: 'AUTHORIZATION BASIS — the grant this harvest runs under' },
  { root: 'docs/SCI_AUTHORISATION.md', why: 'AUTHORIZATION BASIS — the contested SCI position, kept as it stands' },
  { root: 'docs/OPEN_DECISIONS.md', why: 'CANONICAL DECISIONS — what nobody may decide alone' },
  { root: 'docs/FOUNDER_QUEUE.md', why: 'CANONICAL DECISIONS — what is owed by the founder' },
];

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The tar BINARY, named rather than looked up.
 *
 * `tar` on PATH under a Git Bash shell is GNU tar, which reads `C:\lawmind\...`
 * as a REMOTE HOST SPEC (`host:path`) and exits 2 with nothing on stderr. The
 * Windows built-in is bsdtar and handles the same arguments correctly. This
 * cost one 20-minute pack build, at the last step, after the dump and both
 * exports had already succeeded.
 */
const TAR = process.env['LAWMIND_TAR'] ?? (process.platform === 'win32' ? 'C:/Windows/System32/tar.exe' : 'tar');

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
/**
 * `--resume` reuses any pack output already on disk.
 *
 * Not a convenience. A pack build is a 20-minute dump plus two multi-gigabyte
 * exports, and the first run of this version died at the LAST step, the tar,
 * after all of that had succeeded. Without resume the only way to recover a
 * one-line failure is to pay for the dump again, which is how a fix gets
 * skipped rather than made. Each step is skipped only if its OWN output exists.
 */
const RESUME = args.includes('--resume');
const done = (path) => RESUME && existsSync(path);
if (SKIP_DUMP && !existsSync(dumpPath)) {
  console.error(`--skip-dump given but ${dumpPath} does not exist`);
  process.exit(2);
}

let dumpSeconds = 0;
let identityRows = null;
if (SKIP_DUMP) {
  console.log(`restoring the EXISTING pack at ${OUT} — no dump taken\n`);
} else {
  console.log(`dumping ${packing.length} tables + the judgments verdict projection\n`);
  const tableArgs = packing.flatMap((m) => ['-t', `public.${m.table}`]);
  const dumpStarted = Date.now();
  if (done(dumpPath)) {
    console.log(`  reusing ${dumpPath}`);
  } else {
    pg('pg_dump', [...conn, '-d', DB, '-Fc', '--no-owner', '--no-acl', '-f', dumpPath, ...tableArgs], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    dumpSeconds = (Date.now() - dumpStarted) / 1000;
  }
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
  if (done(schemaPath)) {
    console.log(`  reusing ${schemaPath}`);
  } else {
    pg('pg_dump', [...conn, '-d', DB, '--schema-only', '--no-owner', '--no-acl', '-f', schemaPath], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
  }

  // The verdict projection, as compressed CSV. Separate from the custom-format
  // dump on purpose: it is a QUERY, not a table, and a restore of it is a COPY
  // into whatever corpus exists at the time rather than a table replacement.
  const verdictPath = join(OUT, 'judgment-verdicts.csv');
  if (done(`${verdictPath}.gz`)) {
    console.log(`  reusing ${verdictPath}.gz`);
  } else {
    pg('psql', [...conn, '-d', DB, '-v', 'ON_ERROR_STOP=1', '-c', `\\copy (${JUDGMENT_VERDICTS}) TO '${verdictPath.replace(/\\/g, '/')}' WITH CSV HEADER`], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    await pipeline(
      createReadStream(verdictPath),
      createGzip({ level: 9 }),
      createWriteStream(`${verdictPath}.gz`),
    );
    // The uncompressed CSV is a build artifact, not part of the pack. It was
    // excluded from MANIFEST.files and left on disk, so encrypt-pack.mjs — which
    // encrypts every top-level file — would have carried a redundant 957 MB
    // plaintext copy off-machine beside its own gzip. Removed for the same reason
    // the identity CSV is: the pack should contain what a restore needs and
    // nothing else.
    rmSync(verdictPath, { force: true });
  }

  /**
   * The IDENTITY map, same shape as the verdict projection and for the reason
   * given at {@link JUDGMENT_IDENTITY}: without it 67% of the packed foreign
   * keys restore into a corpus they can no longer address.
   */
  const identityPath = join(OUT, 'judgment-identity.csv');
  if (done(`${identityPath}.gz`)) {
    console.log(`  reusing ${identityPath}.gz`);
    // The manifest still has to state how many rows a restore should expect,
    // and a reused export that recorded nothing would leave the check with
    // nothing to check against.
    identityRows = Number(
      pg('psql', [...conn, '-d', DB, '-t', '-A', '-c', 'SELECT count(*) FROM judgments']).trim(),
    );
  } else {
    const identityStarted = Date.now();
    pg('psql', [...conn, '-d', DB, '-v', 'ON_ERROR_STOP=1', '-c', `\\copy (${JUDGMENT_IDENTITY}) TO '${identityPath.replace(/\\/g, '/')}' WITH CSV HEADER`], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    identityRows = Number(
      pg('psql', [...conn, '-d', DB, '-t', '-A', '-c', 'SELECT count(*) FROM judgments']).trim(),
    );
    await pipeline(
      createReadStream(identityPath),
      createGzip({ level: 9 }),
      createWriteStream(`${identityPath}.gz`),
    );
    rmSync(identityPath, { force: true });
  }
  console.log(`  identity map      ${identityRows.toLocaleString()} rows in ${((Date.now() - identityStarted) / 1000).toFixed(1)}s`);

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * THE FILE CAPTURE, AND THE CONSISTENCY RULE IT RUNS UNDER
   * ─────────────────────────────────────────────────────────────────────────
   *
   * `services/ingest/.checkpoints` is written by workers that are RUNNING right
   * now, and the mandate is explicit that they are not to be paused to make a
   * backup. So this capture is not atomic and does not pretend to be. The rule,
   * stated here because a consistency claim that lives only in someone's head
   * is not a claim:
   *
   *   POINT-IN-TIME PER FILE, NOT ACROSS FILES. Each file is copied and hashed
   *   as one read; two files may therefore come from different instants. Every
   *   captured file is recorded in FILES.json with its size, its sha256 AS
   *   CAPTURED, and its mtime, so a restore can tell how stale each one is and
   *   which worker had moved on.
   *
   * That is the correct guarantee for this data: a checkpoint is a RESUME
   * POINT. A slightly old one costs re-walked work; a torn one would be worse,
   * and per-file atomicity is what prevents tearing. Nothing here is a
   * cross-file transaction and nothing pretends to be.
   */
  const filesArchive = join(OUT, 'protected-files.tar.gz');
  const captured = [];
  const absentRoots = [];
  const stage = join(OUT, '.stage');
  rmSync(stage, { recursive: true, force: true });
  for (const spec of PROTECTED_FILES) {
    const src = join(REPO, spec.root);
    if (!existsSync(src)) {
      absentRoots.push(spec);
      continue;
    }
    const dst = join(stage, spec.root);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst, { recursive: true });
  }
  // Hash what was actually staged — the copy is the thing that gets archived,
  // so hashing the source would certify bytes the pack does not contain.
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else captured.push({ path: rel, bytes: statSync(full).size, mtime: statSync(full).mtime.toISOString(), sha256: null, full });
    }
  };
  if (existsSync(stage)) walk(stage);
  for (const f of captured) {
    f.sha256 = await sha256File(f.full);
    delete f.full;
  }
  execFileSync(TAR, ['-czf', filesArchive, '-C', stage, '.'], { stdio: ['ignore', 'inherit', 'inherit'] });
  rmSync(stage, { recursive: true, force: true });
  writeFileSync(
    join(OUT, 'FILES.json'),
    JSON.stringify(
      {
        tool: 'scripts/lcc-moat-backup.mjs',
        archive: 'protected-files.tar.gz',
        capturedAt: new Date().toISOString(),
        consistencyRule:
          'POINT-IN-TIME PER FILE, NOT ACROSS FILES. Live workers were NOT paused. Each file was copied and hashed as one read; sha256 and mtime below are AS CAPTURED. Checkpoints are resume points, so a slightly stale one costs re-walked work and a torn one would not — per-file atomicity is the guarantee that matters here.',
        roots: PROTECTED_FILES,
        absentRoots,
        fileCount: captured.length,
        totalBytes: captured.reduce((a, f) => a + f.bytes, 0),
        files: captured,
      },
      null,
      2,
    ),
  );
  console.log(`  protected files   ${captured.length} files, ${(captured.reduce((a, f) => a + f.bytes, 0) / 1e6).toFixed(1)} MB staged -> ${(statSync(filesArchive).size / 1e6).toFixed(1)} MB archive`);
  if (absentRoots.length > 0) {
    console.log(`  ABSENT ROOTS      ${absentRoots.length} recorded in FILES.json as absent, never as empty`);
  }
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
  /**
   * The identity map is a QUERY over every judgment, not a table, so it has no
   * row in {@link rowCounts}. Recorded here because a restore has to know how
   * many rows to expect before it can tell a truncated CSV from a small corpus.
   */
  identityRows,
  protectedFiles: existsSync(join(OUT, 'FILES.json'))
    ? JSON.parse(readFileSync(join(OUT, 'FILES.json'), 'utf8')).fileCount
    : null,
  files: {},
  excluded: {
    judgments: 'rebuildable from the AWS Open Data buckets — 151 GB, deliberately not packed',
    judgment_paragraphs: 'derived from judgments — 92 GB',
    judgment_chunks: 'rebuildable at GPU cost — 9.4 GB',
    'docs/ai/embedding-manifests/document-vectors{,-v2}':
      '4.3 GB of vector batch output. Vectors are not required merely because they are expensive; these regenerate from the corpus and the protected model. The identity and census manifests that describe them ARE carried.',
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
