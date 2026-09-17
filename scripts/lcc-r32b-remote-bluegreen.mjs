#!/usr/bin/env node
/**
 * LCC R32B — corpus A -> B -> A on the DEPLOYED Gate-C API.
 *
 * The switch is what production would do: point CORPUS_DATABASE_URL at another
 * verified generation and restart the service. Everything the advocate would
 * see is read over public HTTPS; the USER database is digested over SSH before
 * the first switch and after the last, and must be byte-identical.
 *
 *   A  save an authority that exists only in A      201, hydrates with a title
 *   B  read the same matter                         the row is an unavailable shell,
 *                                                  same authorityId/addedAt, nothing fabricated
 *   B  re-save of that same target                  200 { unavailableAuthority }, no mutation
 *   B  a new save of a target B does not carry      409 CORPUS_TARGET_UNAVAILABLE
 *   A  read again                                   hydrated, same authorityId/addedAt
 *
 * Usage:
 *   node scripts/lcc-r32b-remote-bluegreen.mjs --api https://alpha-api.lawmind.co \
 *     --tokens ~/.lawmind-gatec/smoke-tokens.json --judgment-id <in A, not in B> \
 *     [--out docs/ai/lcc-r32b-do/remote-bluegreen.json]
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const API = flag('api').replace(/\/$/, '');
const TOKEN = JSON.parse(readFileSync(flag('tokens'), 'utf8')).onboarded;
const TARGET = flag('judgment-id');
const OUT = resolve(flag('out') ?? 'docs/ai/lcc-r32b-do/remote-bluegreen.json');
const KEY = join(homedir(), '.lawmind-gatec', 'lawmind-gatec-202609161754');
const KH = join(homedir(), '.lawmind-gatec', 'known_hosts');
const API_HOST = 'deploy@178.128.209.91';
const CORPUS_HOST = 'deploy@157.245.156.133';

const ssh = (host, cmd, input) =>
  execFileSync('ssh', ['-i', KEY, '-o', `UserKnownHostsFile=${KH}`, '-o', 'BatchMode=yes', host, cmd], {
    encoding: 'utf8',
    input,
    maxBuffer: 1 << 26,
  });

const steps = [];
const record = (step, detail) => {
  steps.push({ step, at: new Date().toISOString(), ...detail });
  console.log(`  ${step}: ${JSON.stringify(detail)}`);
};

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
      ...(method === 'POST' ? { 'Idempotency-Key': `r32b-bg-${randomUUID()}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Ordered md5 of every USER table's full content. */
function userDigest() {
  const sql = `
DO $$ DECLARE r record; m text; n bigint; BEGIN
FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1 LOOP
  EXECUTE format('SELECT count(*), coalesce(md5(string_agg(x, E''\\n'' ORDER BY x)), ''empty'') FROM (SELECT t::text AS x FROM public.%I t) s', r.tablename) INTO n, m;
  RAISE NOTICE 'DIGEST %|%|%', r.tablename, n, m;
END LOOP; END $$;`;
  const out = ssh(API_HOST, 'sudo -u postgres psql -d lawmind_user -q 2>&1', sql);
  return Object.fromEntries(
    [...out.matchAll(/DIGEST ([^|]+)\|(\d+)\|(\w+)/g)].map((m) => [m[1], `${m[2]}:${m[3]}`]),
  );
}

async function switchTo(db) {
  ssh(
    API_HOST,
    `sudo sed -i -E 's#/lawmind_corpus_[ab]$#/${db}#' /etc/lawmind/api.env && sudo systemctl restart lawmind-api`,
  );
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`${API}/ready`).then((x) => x.json()).catch(() => null);
    if (r?.data?.status === 'ready') {
      const active = ssh(API_HOST, `sudo grep -oE 'lawmind_corpus_[ab]$' /etc/lawmind/api.env`).trim();
      record('switched', { to: db, active, ready: true });
      if (active !== db) throw new Error(`switch reported ${active}, wanted ${db}`);
      return;
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error(`API not ready after switching to ${db}`);
}

const inGen = (db) =>
  ssh(CORPUS_HOST, `sudo -u postgres psql -d ${db} -Atc "SELECT count(*) FROM judgments WHERE id = '${TARGET}'"`).trim();

let pass = false;
try {
  const presence = { A: inGen('lawmind_corpus_a'), B: inGen('lawmind_corpus_b') };
  record('generations', { target: TARGET, presence });
  if (presence.A !== '1' || presence.B !== '0') throw new Error('target must be in A and absent from B');

  await switchTo('lawmind_corpus_a');
  const created = await call('POST', '/matters', {
    caseTitle: 'Gate C Blue Green',
    court: 'Delhi High Court',
    caseType: 'criminal',
    parties: { petitioner: 'State', respondent: 'BG' },
    clientName: 'BG',
    ourSide: 'accused',
  });
  const matterId = created.body?.data?.matter?.matterId;
  const saved = await call('POST', `/matters/${matterId}/authorities`, { judgmentId: TARGET });
  const { authorityId, addedAt } = saved.body?.data?.authority ?? {};
  const readA = await call('GET', `/matters/${matterId}/authorities`);
  const hitA = (readA.body?.data?.authorities ?? []).find((a) => a.judgmentId === TARGET);
  record('active_A', { created: created.status, saved: saved.status, authorityId, addedAt, caseTitle: hitA?.caseTitle ?? null });

  const before = userDigest();
  record('user_digest_before', { tables: Object.keys(before).length });

  await switchTo('lawmind_corpus_b');
  const readB = await call('GET', `/matters/${matterId}/authorities`);
  const shell = (readB.body?.data?.unavailableAuthorities ?? []).find((a) => a.judgmentId === TARGET);
  record('under_B', {
    status: readB.status,
    availability: shell?.availability ?? null,
    sameAuthorityId: shell?.authorityId === authorityId,
    sameAddedAt: shell?.addedAt === addedAt,
    noFabricatedFields:
      !!shell && shell.caseTitle === undefined && shell.neutralCitation === undefined && shell.verificationState === undefined,
    inAvailableList: (readB.body?.data?.authorities ?? []).some((a) => a.judgmentId === TARGET),
  });
  // R17: re-saving the row that already exists is the already-satisfied save,
  // `200 { unavailableAuthority }` with no mutation (authorities.ts, R17 item 3).
  const resave = await call('POST', `/matters/${matterId}/authorities`, { judgmentId: TARGET });
  record('resave_under_B', {
    status: resave.status,
    sameAuthorityId: resave.body?.data?.unavailableAuthority?.authorityId === authorityId,
  });
  // A NEW save of a target this generation does not carry is refused, and the
  // refusal never claims the judgment does not exist.
  const newSave = await call('POST', `/matters/${matterId}/authorities`, { judgmentId: randomUUID() });
  record('new_save_under_B', {
    status: newSave.status,
    code: newSave.body?.error?.code ?? null,
    falseExistentialClaim: /no (such )?judgment|does not exist/i.test(newSave.body?.error?.message ?? ''),
  });

  await switchTo('lawmind_corpus_a');
  const readBack = await call('GET', `/matters/${matterId}/authorities`);
  const hitBack = (readBack.body?.data?.authorities ?? []).find((a) => a.judgmentId === TARGET);
  record('back_on_A', {
    status: readBack.status,
    caseTitle: hitBack?.caseTitle ?? null,
    sameAuthorityId: hitBack?.authorityId === authorityId,
    sameAddedAt: hitBack?.addedAt === addedAt,
  });

  const after = userDigest();
  const changed = Object.keys({ ...before, ...after }).filter((t) => before[t] !== after[t]);
  record('user_digest_after', { tables: Object.keys(after).length, changedTables: changed });

  const s = Object.fromEntries(steps.map((x) => [x.step, x]));
  pass =
    s.active_A.saved === 201 && !!s.active_A.caseTitle &&
    s.under_B.availability === 'corpus_unavailable' && s.under_B.sameAuthorityId && s.under_B.sameAddedAt &&
    s.under_B.noFabricatedFields && !s.under_B.inAvailableList &&
    s.resave_under_B.status === 200 && s.resave_under_B.sameAuthorityId &&
    s.new_save_under_B.status === 409 && s.new_save_under_B.code === 'CORPUS_TARGET_UNAVAILABLE' &&
    !s.new_save_under_B.falseExistentialClaim &&
    !!s.back_on_A.caseTitle && s.back_on_A.sameAuthorityId && s.back_on_A.sameAddedAt &&
    changed.length === 0;
} catch (err) {
  record('error', { message: err instanceof Error ? err.message : String(err) });
  await switchTo('lawmind_corpus_a').catch(() => {});
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ kind: 'lcc-r32b-remote-bluegreen', api: API, pass, steps }, null, 2)}\n`);
console.log(`\nREMOTE_BLUE_GREEN = ${pass ? 'PASS' : 'FAIL'}`);
console.log(`USER_DATA_CHANGED_BY_CORPUS_SWITCH = ${steps.find((x) => x.step === 'user_digest_after')?.changedTables?.length === 0 ? 'NO' : 'UNPROVEN'}`);
process.exit(pass ? 0 : 1);
