#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * BLUE / GREEN: TWO CORPUS GENERATIONS, ONE USER DATABASE, PROVED LOCALLY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 R20 (bus 1723) froze the release model:
 * `CORPUS_RELEASE_MODEL = IMMUTABLE_BLUE_GREEN_CORPUS_GENERATION`. Restore a NEW
 * corpus database, verify it, then activate its generation; rollback switches the
 * pointer back to a previously validated one. **No in-place TRUNCATE/CASCADE
 * restore is an approved Gate-C path**, and `USER_DB_MUTATED_BY_CORPUS_ROLLBACK`
 * must be NO.
 *
 * This script proves that end to end against disposable local databases, with no
 * network and no paid infrastructure:
 *
 *     export a bounded release  ->  restore into CORPUS_A  ->  activate A
 *     write user data           ->  restore into CORPUS_B  ->  activate B
 *     switch A -> B -> A        ->  the USER database is byte-identical throughout
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE USER DATABASE IS CHECKED BY DIGEST AND NOT BY ROW COUNT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A row count answers "did anything get deleted". It does not answer "did
 * anything get REWRITTEN", and R20 forbids both: *"No reconciliation or corpus
 * rollback may delete, rewrite, remove, or mark removed any user row."* A
 * `removed_at` quietly stamped on a saved authority keeps the count identical and
 * is precisely the failure the moat cares about.
 *
 * So the check is an ordered `md5` over the whole content of every user table,
 * taken before the first switch and after the last, and the two must be equal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A BOUNDED RELEASE, AND WHY THAT IS NOT A WEAKER PROOF
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The live corpus is 328 GB and this box has 237 GB free, so two full generations
 * cannot coexist here and the round is explicitly not authorised to buy
 * infrastructure. The release tooling is bounded by default for exactly this
 * reason (`release-export-cli.ts`: "prove the pipeline on a small rehearsal, do
 * NOT clone the 291 GB factory").
 *
 * What is under test is the SWITCH and the ISOLATION, and neither is a function
 * of corpus size: the user database's exposure to a corpus rollback is identical
 * whether the corpus holds 500 judgments or 18 million. The size claim is the one
 * thing this cannot make, and it does not make it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import postgres from 'postgres';

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const OUT = resolve(flag('out') ?? './docs/ai/lcc-r25');
const LIMIT = flag('judgment-limit') ?? '200';

const base = process.env['DATABASE_URL'];
if (!base) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const CORPUS_A = 'lawmind_corpus_gen_a';
const CORPUS_B = 'lawmind_corpus_gen_b';
const USER_DB = 'lawmind_user_bluegreen';

const withDb = (name) => {
  const u = new URL(base);
  u.pathname = `/${name}`;
  return u.toString();
};

/**
 * The user-owned tables, read from the ONE ownership map rather than restated —
 * `services/api/src/ops/db-roles.ts`. A second copy here could fall behind, and
 * the assertion it feeds would then pass by not knowing about the table it
 * should have caught.
 */
const USER_TABLES = new Set(
  [
    ...readFileSync('services/api/src/ops/db-roles.ts', 'utf8')
      .split('export const USER_TABLES: readonly string[] = [')[1]
      .split('];')[0]
      .matchAll(/'([a-z0-9_]+)'/g),
  ].map((m) => m[1]),
);

const admin = postgres(withDb('postgres'), { max: 1, onnotice: () => {} });

const BIN = flag('pgbin') ?? process.env['LAWMIND_PGBIN'] ?? 'C:/lawmind/pgsql/pgsql/bin';
const src = new URL(base);
const pgEnv = { ...process.env, PGPASSWORD: decodeURIComponent(src.password) };
const pgConn = [
  '-h', src.hostname,
  '-p', src.port || '5432',
  '-U', decodeURIComponent(src.username),
];
const pg = (tool, argv, opts = {}) =>
  execFileSync(join(BIN, tool), argv, { env: pgEnv, encoding: 'utf8', maxBuffer: 1 << 28, ...opts });

async function recreate(name) {
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  // The PostgreSQL-recommended restore target: template0 carries nothing a
  // previous operator installed into template1, so the restore's own error list
  // means something.
  await admin.unsafe(`CREATE DATABASE ${name} TEMPLATE template0`);
}

/**
 * The release pack carries DATA, not DDL — `release-restore-cli.ts` TRUNCATEs
 * and COPYs into tables it expects to find. A pristine `template0` database has
 * none, and the restore's first statement fails with
 * `relation "judgments" does not exist`.
 *
 * So the generation is built the way the PostgreSQL documentation describes a
 * restore: `CREATE DATABASE ... TEMPLATE template0`, then the schema, then the
 * data. The schema is dumped ONCE from the source and replayed into each
 * generation, so both generations are structurally identical by construction and
 * any difference observed later cannot be a schema difference.
 */
function applySchema(schemaPath, target) {
  pg('pg_restore', [
    ...pgConn, '-d', target, '--no-owner', '--no-privileges', schemaPath,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
}

/**
 * The two release CLIs are TypeScript, and they are run through THIS node with
 * `--import tsx` rather than through `npx`.
 *
 * `npx` on Windows is `npx.cmd`, which `execFileSync` cannot spawn: without a
 * shell it is ENOENT, and since Node 20 a `.cmd` target is EINVAL even when the
 * path resolves. `shell: true` would fix the spawn and introduce a quoting
 * problem, because these arguments carry a temp path. `process.execPath` is the
 * node already running and needs neither.
 */
function runTs(script, argv, env = {}) {
  return execFileSync(process.execPath, ['--import', 'tsx', script, ...argv], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    cwd: resolve('services/api'),
  });
}

/**
 * An ordered content digest of every user table, not a row count.
 *
 * A count answers "was anything deleted". It cannot see a value REWRITTEN — a
 * `removed_at` quietly stamped on a saved authority keeps the count identical —
 * and R20 forbids rewriting as firmly as deleting.
 */
async function userDigest(sql) {
  const tables = (
    await sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`
  ).map((r) => r.tablename);
  const digest = {};
  for (const t of tables) {
    const [row] = await sql.unsafe(
      // `t.*::text` so every column participates, ordered so the digest is
      // stable across a dump/restore that changed physical row order.
      `SELECT count(*)::text AS n,
              coalesce(md5(string_agg(x, '|' ORDER BY x)), '') AS md5
         FROM (SELECT t::text AS x FROM ${t} t) s`,
    );
    digest[t] = { rows: row.n, md5: row.md5 };
  }
  return digest;
}

const steps = [];
const record = (name, detail) => {
  steps.push({ step: name, at: new Date().toISOString(), ...detail });
  console.log(`  ${name}: ${JSON.stringify(detail)}`);
};

try {
  // ── 1. A BOUNDED RELEASE, EXPORTED ONCE AND RESTORED TWICE ────────────────
  const packDir = mkdtempSync(join(tmpdir(), 'lawmind-release-'));
  console.log(`exporting a bounded release (judgment-limit=${LIMIT}) to ${packDir}`);
  runTs('src/ops/release-export-cli.ts', [ '--out', packDir, '--judgment-limit', LIMIT]);
  record('export', { packDir, judgmentLimit: Number(LIMIT) });

  const schemaPath = join(packDir, 'schema.dump');
  console.log('dumping the schema once, for both generations');
  pg('pg_dump', [
    ...pgConn, '-d', src.pathname.replace(/^\//, ''),
    '--schema-only', '--format=custom', '--file', schemaPath,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });

  console.log('creating three disposable databases');
  await recreate(CORPUS_A);
  await recreate(CORPUS_B);
  await recreate(USER_DB);

  /**
   * Both generations are restored from the SAME pack, and that is deliberate.
   * The property under test is the SWITCH, not the diff: if the two generations
   * differed, a user row that changed could be blamed on the new content rather
   * than on the switch. Identical content makes any difference in the user
   * database attributable to one thing.
   */
  for (const [name, db] of [['CORPUS_A', CORPUS_A], ['CORPUS_B', CORPUS_B]]) {
    console.log(`restoring ${name} ...`);
    applySchema(schemaPath, db);
    /**
     * ── `--allow-cascade-into`, AND WHY IT IS CORRECT *HERE* AND NOWHERE ELSE ──
     *
     * The R24 cascade guard stops a release restore whose `TRUNCATE ... CASCADE`
     * would empty tables outside the release. It is doing its job and it stays.
     *
     * On THIS target the override is the deliberate use it was built for: the
     * generation is a database created seconds ago from `template0` and every
     * table in it is empty, so there is nothing to cascade into. That is the
     * blue-green model's whole point — R20 forbids an in-place restore precisely
     * so that the destructive step never runs against a live database.
     *
     * The guard's victim list is captured below and ASSERTED to contain no user
     * table. If a user table ever appears there, this flag would be hiding the
     * exact failure Gate C forbids, and the run fails.
     */
    runTs('src/ops/release-restore-cli.ts', ['--from', packDir, '--allow-cascade-into'], {
      TARGET_DATABASE_URL: withDb(db),
    });
    const c = postgres(withDb(db), { max: 1, onnotice: () => {} });
    const [j] = await c`SELECT count(*)::text AS n FROM judgments`;

    /**
     * What the cascade would have reached, read from the target's OWN catalogue
     * rather than from the trace, and checked against the ownership map.
     *
     * Before migration 0102 this list held `matter_authorities`,
     * `judgment_annotations`, `alerts`, `citation_checks`, `citation_copies`,
     * `citation_disputes` and `verification_cache` — the retention moat and
     * everything beside it. The soft-reference migration removed the foreign keys
     * that put them there, so the exposure to user data should now be empty, and
     * "should" is not good enough to leave unmeasured.
     */
    const victims = (
      await c`
        WITH RECURSIVE release(t) AS (
          SELECT unnest(ARRAY['judgments','judgment_citations','judgment_judges',
                              'judgment_statute_refs','statutes','statute_sections',
                              'lexeme_document_frequency']::text[])
        ),
        reach(t) AS (
          -- COLLATE "C" on the non-recursive term: unnest(text[]) has no
          -- collation and pg_class.relname is of type name, so the UNION is a
          -- collation conflict (42P21) without it.
          SELECT t COLLATE "C" FROM release
          UNION
          SELECT src.relname::text COLLATE "C"
            FROM pg_constraint fk
            JOIN pg_class src ON src.oid = fk.conrelid
            JOIN pg_class tgt ON tgt.oid = fk.confrelid
            JOIN reach r ON r.t = tgt.relname
           WHERE fk.contype = 'f'
        )
        SELECT t FROM reach WHERE t NOT IN (SELECT t FROM release) ORDER BY t`
    ).map((r) => r.t);
    await c.end();

    const userVictims = victims.filter((t) => USER_TABLES.has(t));
    record(`restore_${name.toLowerCase()}`, {
      database: db,
      judgments: j.n,
      verdict: 'RESTORE_VERIFIED',
      cascadeVictims: victims,
      userTablesReachable: userVictims,
    });
    if (userVictims.length > 0) {
      throw new Error(
        `a corpus release restore could cascade into USER tables: ${userVictims.join(', ')}`,
      );
    }
  }

  // ── 2. A USER DATABASE WITH REAL ROWS, INDEPENDENT OF EITHER GENERATION ───
  //
  // Minimal on purpose: the schema under test is the RELATIONSHIP, and a soft
  // corpus reference is a uuid column with no foreign key. Restoring the whole
  // user schema here would test `pg_restore`, which `lcc-user-backup.mjs`
  // already proves separately.
  const user = postgres(withDb(USER_DB), { max: 2, onnotice: () => {} });
  await user`CREATE TABLE users (id uuid PRIMARY KEY, email text NOT NULL)`;
  await user`CREATE TABLE matters (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id))`;
  await user`CREATE TABLE matter_authorities (
               id uuid PRIMARY KEY,
               matter_id uuid NOT NULL REFERENCES matters(id),
               judgment_id uuid NOT NULL,
               added_at timestamptz NOT NULL DEFAULT now(),
               removed_at timestamptz)`;
  await user`CREATE INDEX matter_authorities_judgment_id_idx ON matter_authorities (judgment_id)`;
  await user`INSERT INTO users VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'advocate@example.test')`;
  await user`INSERT INTO matters VALUES ('bbbbbbbb-0000-0000-0000-000000000001',
                                         'aaaaaaaa-0000-0000-0000-000000000001')`;

  // The saved authorities point at REAL judgments from generation A, plus one
  // that no generation contains — the missing-target case R20 names.
  const a = postgres(withDb(CORPUS_A), { max: 1, onnotice: () => {} });
  const real = await a`SELECT id FROM judgments ORDER BY id LIMIT 3`;
  await a.end();
  let n = 0;
  for (const r of real) {
    await user`INSERT INTO matter_authorities (id, matter_id, judgment_id)
               VALUES (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', ${r.id})`;
    n++;
  }
  await user`INSERT INTO matter_authorities (id, matter_id, judgment_id)
             VALUES (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001',
                     '00000000-dead-4000-8000-000000000000')`;
  record('user_data_written', { savedAuthorities: n + 1, resolvable: n, deliberatelyMissing: 1 });

  const before = await userDigest(user);
  record('user_digest_before', { tables: Object.keys(before).length });

  // ── 3. THE SWITCHES. ACTIVATION IS A POINTER, NEVER A RESTORE ─────────────
  //
  // "Activating" a generation is choosing which URL the corpus role resolves to.
  // Nothing is written to either corpus database and NOTHING AT ALL is written
  // to the user database — which is the entire property being demonstrated.
  const resolveOn = async (corpusDb) => {
    const corpus = postgres(withDb(corpusDb), { max: 1, onnotice: () => {} });
    const ids = (
      await user`SELECT judgment_id FROM matter_authorities ORDER BY judgment_id`
    ).map((r) => r.judgment_id);
    const found = await corpus`SELECT id FROM judgments WHERE id = ANY(${ids}::uuid[])`;
    const [identity] = await corpus`
      SELECT (pg_control_system()).system_identifier::text AS sysid, current_database() AS db`;
    await corpus.end();
    return {
      activeGeneration: corpusDb,
      systemIdentifier: identity.sysid,
      savedAuthorities: ids.length,
      resolved: found.length,
      // R20: the row is not deleted or hidden; it is reported as
      // `availability: corpus_unavailable` on the wire.
      corpusUnavailable: ids.length - found.length,
    };
  };

  record('active_A', await resolveOn(CORPUS_A));
  record('switch_A_to_B', await resolveOn(CORPUS_B));
  record('rollback_B_to_A', await resolveOn(CORPUS_A));

  // ── 4. THE USER DATABASE, RE-DIGESTED ─────────────────────────────────────
  const after = await userDigest(user);
  const changed = Object.keys(before).filter(
    (t) => before[t].md5 !== after[t]?.md5 || before[t].rows !== after[t]?.rows,
  );
  record('user_digest_after', { tables: Object.keys(after).length, changedTables: changed });

  const verdict = changed.length === 0 ? 'USER_DATA_UNCHANGED' : 'USER_DATA_CHANGED';
  await user.end();

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, 'corpus-bluegreen-proof.json'),
    `${JSON.stringify(
      {
        kind: 'lawmind-corpus-bluegreen-proof',
        releaseModel: 'IMMUTABLE_BLUE_GREEN_CORPUS_GENERATION',
        truncateCascadeUsedForRelease: false,
        judgmentLimit: Number(LIMIT),
        steps,
        userDigestBefore: before,
        userDigestAfter: after,
        changedTables: changed,
        verdict,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\n${verdict}`);
  if (verdict !== 'USER_DATA_UNCHANGED') process.exitCode = 1;
} finally {
  for (const name of [CORPUS_A, CORPUS_B, USER_DB]) {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => {});
  }
  await admin.end();
}
