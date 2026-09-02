#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * §15 — DOES THE USER BACKUP ACTUALLY CARRY WHAT R26/R27/R28 ADDED?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `lcc-user-backup.mjs` dumps the tables `ops/db-roles.ts` lists as user-owned
 * and restores them into a pristine database. It verifies the restore against
 * the DUMP — row counts, checksums — which answers "did the restore work" and
 * cannot answer the question §15 actually asks:
 *
 *     is every user-domain row the CURRENT product writes inside that dump?
 *
 * A table added this round and not classified, or classified and not present,
 * produces a backup that restores perfectly and silently omits an advocate's
 * work. So this writes real data THROUGH THE API, backs the database up,
 * restores it somewhere else, and then reads the same data back through the API
 * again — pointed at the restored database and the same corpus.
 *
 * The comparison is on what the advocate would see, not on what the dump
 * contained: same matter, same authority id and addedAt, same event, same
 * annotation, same data request, same training consent, and the same
 * idempotency key still replaying rather than creating a second row.
 */
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import postgres from 'postgres';

import { signAccessToken } from '../packages/auth/src/tokens.ts';
import { createApp } from '../services/api/src/app.ts';
import {
  CORPUS_SPLIT_TEST_DB,
  USER_SPLIT_TEST_DB,
  applyNegativeSchema,
  buildSplitEnvironment,
  dropSplitEnvironment,
  withDatabase,
} from './lcc-r28-split-env.mjs';

const args = process.argv.slice(2);
const flagOf = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const OUT = resolve(flagOf('out') ?? './docs/ai/lcc-r28');
const BIN = flagOf('pgbin') ?? process.env['LAWMIND_PGBIN'] ?? 'C:/lawmind/pgsql/pgsql/bin';
const PACK = resolve(flagOf('pack') ?? join(OUT, 'user-backup-pack'));
const RESTORE_DB = 'lawmind_r28_user_restore';
const SECRET = 'r28-backup-secret-not-used-anywhere-real-0123456789';

const base = process.env['DATABASE_URL'];
if (!base) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}
const src = new URL(base);
const pgEnv = { ...process.env, PGPASSWORD: decodeURIComponent(src.password) };
const conn = ['-h', src.hostname, '-p', src.port || '5432', '-U', decodeURIComponent(src.username)];
const pg = (tool, argv, opts = {}) =>
  execFileSync(join(BIN, tool), argv, { env: pgEnv, encoding: 'utf8', maxBuffer: 1 << 28, ...opts });

const steps = [];
const record = (step, detail) => {
  steps.push({ step, ...detail });
  console.log(`  ${step}: ${JSON.stringify(detail)}`);
};

/** Everything the smoke reads back, in one shape, so before and after compare. */
async function readWorkload(app, token, ids) {
  const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const get = async (path) => {
    const res = await app.request(path, { headers: H });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const [me, matters, detail, authorities, annotations, requests, consent, documents] =
    await Promise.all([
      get('/me'),
      get('/matters'),
      get(`/matters/${ids.matterId}`),
      get(`/matters/${ids.matterId}/authorities`),
      get(`/judgments/${ids.judgmentId}/annotations`),
      get('/me/data-requests'),
      get('/me/training-consent'),
      get('/documents'),
    ]);
  const d = (r) => r.body?.data ?? {};
  const saved = (d(authorities).authorities ?? []).find((a) => a.judgmentId === ids.judgmentId);
  return {
    statuses: {
      me: me.status,
      matters: matters.status,
      detail: detail.status,
      authorities: authorities.status,
      annotations: annotations.status,
      requests: requests.status,
      consent: consent.status,
      documents: documents.status,
    },
    email: d(me).user?.email ?? null,
    matterCount: (d(matters).matters ?? []).length,
    matterId: d(detail).matter?.matterId ?? null,
    caseTitle: d(detail).matter?.caseTitle ?? null,
    eventCount: (d(detail).events ?? d(detail).matter?.events ?? []).length,
    authorityId: saved?.authorityId ?? null,
    authorityAddedAt: saved?.addedAt ?? null,
    /* Hydrated from the CORPUS, which the restore never touched. Included so a
     * restored user database that lost its judgment ids would show up as a lost
     * title rather than as a silently shorter list. */
    authorityCaseTitle: saved?.caseTitle ?? null,
    annotationCount: (d(annotations).annotations ?? []).length,
    dataRequestCount: (d(requests).requests ?? d(requests).dataRequests ?? []).length,
    trainingConsentGranted: d(consent).granted ?? d(consent).consent?.granted ?? null,
    documentCount: (d(documents).documents ?? []).length,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log('R28 user backup / restore, proved through the API\n');

  await buildSplitEnvironment({ base, bin: BIN, log: (s) => console.log(s) });
  const negative = await applyNegativeSchema({ base, log: (s) => console.log(s) });

  const corpusUrl = withDatabase(base, CORPUS_SPLIT_TEST_DB);
  const userUrl = withDatabase(base, USER_SPLIT_TEST_DB);
  const corpusSql = postgres(corpusUrl, { max: 3, onnotice: () => {} });
  let userSql = postgres(userUrl, { max: 3, onnotice: () => {} });

  const judgmentId = randomUUID();
  await corpusSql`
    INSERT INTO judgments (id, case_title, neutral_citation, reporter_citations, court,
                           judgment_date, language, source_url, full_text)
    VALUES (${judgmentId}, 'SYNTHETIC — Backup Restore Target', 'FIX 2026 INSC 7', '{}',
            'Supreme Court of India', '2026-04-01', 'en', ${`r28br://${judgmentId}`},
            'synthetic backup-restore target text')`;

  const authId = `r28-br-${randomUUID()}`;
  const email = `${authId}@example.test`;
  await userSql`INSERT INTO auth_user (id, name, email, email_verified)
                VALUES (${authId}, 'Adv', ${email}, true)`;
  await userSql`INSERT INTO users (auth_id, full_name, phone, email, enrolment_status)
                VALUES (${authId}, 'Backup Restore',
                        ${`+9199${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`},
                        ${email}, 'unverified')`;
  const token = await signAccessToken({ sub: authId, email }, SECRET);

  const appWith = (u) =>
    createApp({
      ping: async () => {
        await corpusSql`SELECT 1`;
      },
      search: { sql: corpusSql, userSql: u, embedQuery: async () => null },
      auth: { auth: null, sql: u, secret: SECRET },
    });

  const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const app = appWith(userSql);
  const post = async (path, body, extra = {}) => {
    const res = await app.request(path, {
      method: 'POST',
      headers: { ...H, ...extra },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  // ── 1. WRITE A REAL WORKLOAD THROUGH THE API ──────────────────────────────
  const matter = await post('/matters', {
    caseTitle: 'State v. Backup Restore',
    court: 'Delhi High Court',
    caseType: 'criminal',
    parties: { petitioner: 'State', respondent: 'BR' },
    clientName: 'BR',
    ourSide: 'accused',
  });
  const matterId = matter.body.data.matter.matterId;
  await post(`/matters/${matterId}/authorities`, { judgmentId });
  await post(`/matters/${matterId}/events`, {
    eventDate: '2026-09-02',
    eventType: 'note',
    notes: 'backup restore event',
  });
  await post(`/judgments/${judgmentId}/annotations`, {
    paragraphNumber: 1,
    paragraphIndex: 0,
    quote: 'a passage worth keeping',
    note: 'backup restore annotation',
  });
  await post('/me/data-requests', { kind: 'correction', note: 'backup restore request' });
  await post('/me/training-consent', { version: 'training-v1' });
  const idemKey = `r28-br-${randomUUID()}`;
  const idemBody = {
    caseTitle: 'State v. Idempotent Backup',
    court: 'Delhi High Court',
    caseType: 'criminal',
    parties: { petitioner: 'State', respondent: 'IB' },
    clientName: 'IB',
    ourSide: 'accused',
  };
  const idemFirst = await post('/matters', idemBody, { 'idempotency-key': idemKey });

  const ids = { matterId, judgmentId };
  const before = await readWorkload(app, token, ids);
  record('workload_written', {
    matter: matter.status,
    idempotent: idemFirst.status,
    ...before.statuses,
  });

  // ── 2. BACK IT UP WITH THE EXISTING, ALREADY-VERIFIED TOOLING ─────────────
  //
  // Deliberately the real script rather than a pg_dump written here: §15 asks
  // whether THE BACKUP covers this round's additions, and a second dumper would
  // answer a question about itself.
  await userSql.end();
  rmSync(PACK, { recursive: true, force: true });
  execFileSyncBackup();
  function execFileSyncBackup() {
    execFileSync(
      process.execPath,
      [
        join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs'),
        'scripts/lcc-user-backup.mjs',
        '--out',
        PACK,
        '--no-restore',
      ],
      {
        env: { ...process.env, USER_DATABASE_URL: userUrl, DB_SPLIT_MODE: 'split' },
        stdio: ['ignore', 'inherit', 'inherit'],
        encoding: 'utf8',
      },
    );
  }
  const manifest = JSON.parse(
    execFileSync('node', ['-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(join(PACK, 'MANIFEST.json'))},'utf8'))`], { encoding: 'utf8' }),
  );
  record('backup', {
    tables: manifest.tables.length,
    absent: manifest.absentTables.length,
    dumpMs: manifest.dumpMs,
  });

  // ── 3. RESTORE INTO A FRESH DATABASE ──────────────────────────────────────
  const admin = postgres(withDatabase(base, 'postgres'), { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${RESTORE_DB} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${RESTORE_DB} TEMPLATE template0`);
  try {
    pg('pg_restore', [...conn, '-d', RESTORE_DB, '--no-owner', '--no-privileges', join(PACK, 'user-schema.dump')], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch {
    /* The schema dump is whole-database and names objects a pristine target
     * cannot own. The DATA restore below is the one that must be clean. */
  }
  pg(
    'pg_restore',
    [
      ...conn, '-d', RESTORE_DB, '--no-owner', '--no-privileges', '--disable-triggers',
      '--exit-on-error', '--single-transaction', join(PACK, 'user-data.dump'),
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  record('restore', { database: RESTORE_DB });

  /**
   * The restored database is stripped of corpus tables too.
   *
   * Without this the smoke below would run against a user database that also
   * contains an empty `judgments`, and a route reading the corpus through the
   * user handle would answer `200` with nothing rather than failing — §8's
   * masking problem, arriving through the restore instead of through the build.
   */
  const restoredUrl = withDatabase(base, RESTORE_DB);
  const restored = postgres(restoredUrl, { max: 3, onnotice: () => {} });
  const present = (
    await restored`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  ).map((r) => r.tablename);
  const { CORPUS_TABLES } = await import('../services/api/src/ops/db-roles.ts');
  const toDrop = CORPUS_TABLES.filter((t) => present.includes(t));
  if (toDrop.length > 0) {
    await restored.unsafe(`DROP TABLE ${toDrop.map((t) => `public."${t}"`).join(', ')} CASCADE`);
  }
  record('restored_negative_schema', { droppedCorpusTables: toDrop.length });

  // ── 4. THE SAME CURRENT-V1 SMOKE, ON THE RESTORED DATABASE ────────────────
  const restoredApp = appWith(restored);
  const after = await readWorkload(restoredApp, token, ids);
  record('restored_read', after.statuses);

  const idemReplay = await restoredApp.request('/matters', {
    method: 'POST',
    headers: { ...H, 'idempotency-key': idemKey },
    body: JSON.stringify(idemBody),
  });
  const idemReplayBody = await idemReplay.json().catch(() => null);
  const replayedSameRow =
    idemReplayBody?.data?.matter?.matterId === idemFirst.body?.data?.matter?.matterId;
  record('idempotency_after_restore', { status: idemReplay.status, replayedSameRow });

  const checks = {
    no_500_anywhere: Object.values(after.statuses).every((s) => s !== 500),
    same_identity: after.email === before.email && after.email !== null,
    same_matter: after.matterId === before.matterId && after.matterId !== null,
    same_case_title: after.caseTitle === before.caseTitle,
    same_matter_count: after.matterCount === before.matterCount && before.matterCount > 0,
    same_events: after.eventCount === before.eventCount && before.eventCount > 0,
    same_authority_id: after.authorityId === before.authorityId && after.authorityId !== null,
    same_authority_added_at: after.authorityAddedAt === before.authorityAddedAt,
    /* Cross-role hydration still works: the restored USER database and the
     * untouched CORPUS database, merged in the application. */
    authority_still_hydrates: after.authorityCaseTitle === before.authorityCaseTitle
      && after.authorityCaseTitle !== null,
    same_annotations: after.annotationCount === before.annotationCount && before.annotationCount > 0,
    same_data_requests:
      after.dataRequestCount === before.dataRequestCount && before.dataRequestCount > 0,
    same_training_consent: after.trainingConsentGranted === before.trainingConsentGranted,
    same_documents: after.documentCount === before.documentCount,
    /* R28's own addition: `api_idempotency_records` is user-owned, so a restored
     * database must still refuse to create a second matter under a used key. */
    idempotency_survived_the_restore: replayedSameRow,
  };
  const pass = Object.values(checks).every(Boolean);

  writeFileSync(
    join(OUT, 'user-backup-restore.json'),
    `${JSON.stringify(
      {
        kind: 'lawmind-r28-user-backup-restore',
        note:
          'A real current-v1 workload written through the API, backed up with the shipped ' +
          'user-backup tooling, restored into a fresh database, and read back through the ' +
          'API against the same corpus.',
        sourceUserDatabase: USER_SPLIT_TEST_DB,
        restoredUserDatabase: RESTORE_DB,
        corpusDatabase: CORPUS_SPLIT_TEST_DB,
        negativeSchema: negative,
        backupManifest: {
          tables: manifest.tables,
          absentTables: manifest.absentTables,
          counts: manifest.counts,
        },
        before,
        after,
        steps,
        checks,
        verdict: pass ? 'USER_BACKUP_RESTORE_PASS' : 'USER_BACKUP_RESTORE_FAIL',
      },
      null,
      2,
    )}\n`,
  );

  for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? 'PASS' : 'FAIL'}  ${k}`);
  console.log(pass ? '\nUSER_BACKUP_RESTORE_PASS' : '\nUSER_BACKUP_RESTORE_FAIL');

  await Promise.all([corpusSql.end(), restored.end()]);
  await admin.unsafe(`DROP DATABASE IF EXISTS ${RESTORE_DB} WITH (FORCE)`).catch(() => {});
  await admin.end();
  if (!pass) process.exitCode = 1;
}

try {
  await main();
} finally {
  await dropSplitEnvironment(base);
}
