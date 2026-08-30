/**
 * NEW3 ACCEPTANCE DELTA — Sprint 2, R13.
 *
 * NOT the ten-matter suite. This reruns ONLY the cases whose backend dependency
 * actually landed, plus the two controls the round is required to carry:
 *
 *   AB-1  party-name workflows            (backend: d96147e, query-shape.ts)
 *   AB-2  filtered broad-query workflows  (backend: d96147e, rankWithinBoundedPopulation)
 *   CTRL-CITATION  one exact-citation positive control
 *   CTRL-CORELOOP  one Search -> Reader -> Save -> Matter smoke
 *
 * Why a delta and not a repeat: AB-1 and AB-2 already established the affected
 * baseline in TEN_MATTER_ACCEPTANCE_R12.json. Rerunning the other eight cases
 * would spend fixture writes on append-only tables to re-observe an unchanged
 * result, and a suite killed part-way has already left rows behind in this repo
 * once. Everything this run writes is deleted by OWNER at the end, and the
 * residual counts are reported rather than assumed.
 *
 * Run:
 *   AUTH_SECRET=<the secret the local API was started with> \
 *   BASE=http://127.0.0.1:3011 node scripts/new3-acceptance-delta.mjs
 */
import postgres from 'postgres';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { SignJWT } from 'jose';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3011';
const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.replace(/^﻿/, '').trim())
    .filter((l) => /^[A-Za-z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  console.error('AUTH_SECRET is not set — pass the SAME secret the local API was started with.');
  process.exit(1);
}
const sql = postgres(env.DATABASE_URL, { max: 3, idle_timeout: 10 });

const cases = [];
const created = { authUserId: null, userId: null, matterIds: [], authorityIds: [] };

async function call(method, path, opts = {}) {
  const { token, body } = opts;
  const t0 = process.hrtime.bigint();
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const latencyMs = Number(process.hrtime.bigint() - t0) / 1e6;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-json */
  }
  return { status: res.status, json, text: text.slice(0, 4000), latencyMs: Math.round(latencyMs * 10) / 10 };
}
const search = (body) => call('POST', '/search', { body });
const outcomeOf = (r) => r.json?.data?.retrievalOutcome ?? null;
const resultsOf = (r) => r.json?.data?.results ?? [];

function record(c) {
  cases.push(c);
  console.log('[' + c.id + '] ' + c.verdict + '  ' + c.latencyMs + 'ms  ' + c.action);
}

const version = await call('GET', '/version');
const health = await call('GET', '/health');
const freshness = await call('GET', '/corpus/freshness/object');

// ---------------------------------------------------------------- AB-1
// The R12 registry row records MEASURED ZERO for both probes. The backend fix
// d96147e claims party-name recall 3/6 -> 6/6. Both R12 probes are rerun
// verbatim so the delta is a comparison and not a new experiment.
{
  const rare = await search({ query: 'SATENDER KUMAR ANTIL', language: 'en' });
  const common = await search({ query: 'SANJAY KUMAR MISHRA @ SANJAY MISHRA', language: 'en' });
  const rareHits = resultsOf(rare);
  const commonHits = resultsOf(common);
  const rank1IsTheAuthority = /SATENDER KUMAR ANTIL/i.test(
    String(rareHits[0]?.caseTitle ?? rareHits[0]?.title ?? ''),
  );
  record({
    id: 'AB-1',
    action: 'party-name-only search — POST /search, the two probes the R12 registry row cites',
    capability: 'search.party_name_only',
    backendDependency: 'd96147e fix(search): the admission bound was asking about the word, not the population',
    r12Baseline: 'MEASURED ZERO on both probes',
    result: {
      rareName: {
        query: 'SATENDER KUMAR ANTIL',
        count: rareHits.length,
        rank1IsTheAuthority,
        degraded: rare.json?.data?.degraded ?? null,
        outcome: outcomeOf(rare),
        latencyMs: rare.latencyMs,
        titles: rareHits.slice(0, 3).map((r) => r.caseTitle ?? r.title ?? null),
      },
      commonName: {
        query: 'SANJAY KUMAR MISHRA @ SANJAY MISHRA',
        count: commonHits.length,
        degraded: common.json?.data?.degraded ?? null,
        outcome: outcomeOf(common),
        latencyMs: common.latencyMs,
      },
    },
    latencyMs: Math.max(rare.latencyMs, common.latencyMs),
    // PARTIAL is the honest verdict and is deliberately not PASS: half the
    // measured baseline moved and half did not.
    verdict: rareHits.length > 0 && rank1IsTheAuthority && commonHits.length === 0 ? 'PASS_WITH_LIMIT' : rareHits.length > 0 && commonHits.length > 0 ? 'PASS' : 'HOLD',
  });
}

// ---------------------------------------------------------------- AB-2
// R12 recorded: 'bail' + courts:[hc] + a 29-day window refused at rarestDf
// 0.2577. Six scopes are measured here, from the corpus-wide ceiling down to a
// three-day single-court window, so "did filtering start to matter" is answered
// by a curve rather than by one point.
{
  const scopes = [
    ['unfiltered', { query: 'bail', language: 'en' }],
    ['category_hc_29d', { query: 'bail', language: 'en', filters: { courts: ['hc'], dateFrom: '2026-08-01', dateTo: '2026-08-29' } }],
    ['category_hc_31d', { query: 'bail', language: 'en', filters: { courts: ['hc'], dateFrom: '2026-07-01', dateTo: '2026-07-31' } }],
    ['one_court_8mo', { query: 'bail', language: 'en', filters: { court: 'High Court of Delhi', dateFrom: '2026-01-01', dateTo: '2026-08-29' } }],
    ['one_court_1mo', { query: 'bail', language: 'en', filters: { court: 'High Court of Delhi', dateFrom: '2026-07-01', dateTo: '2026-07-31' } }],
    ['one_court_3d', { query: 'bail', language: 'en', filters: { court: 'High Court of Delhi', dateFrom: '2026-07-01', dateTo: '2026-07-03' } }],
  ];
  const measured = {};
  for (const [name, body] of scopes) {
    const r = await search(body);
    const hits = resultsOf(r);
    measured[name] = {
      count: hits.length,
      degraded: r.json?.data?.degraded ?? null,
      emptyBecause: r.json?.data?.emptyBecause ?? null,
      state: outcomeOf(r)?.state ?? null,
      rarestDf: outcomeOf(r)?.rarestDf ?? null,
      latencyMs: r.latencyMs,
    };
  }
  // The narrow control proves the arm is alive at all.
  const control = await search({
    query: 'anticipatory bail cheque dishonour',
    language: 'en',
    filters: { courts: ['hc'], dateFrom: '2026-08-01', dateTo: '2026-08-29' },
  });
  measured.narrow_control = {
    count: resultsOf(control).length,
    degraded: control.json?.data?.degraded ?? null,
    state: outcomeOf(control)?.state ?? null,
    rarestDf: outcomeOf(control)?.rarestDf ?? null,
    latencyMs: control.latencyMs,
  };
  const narrowingNowWorks = measured.one_court_1mo.count > 0 || measured.one_court_3d.count > 0;
  const categoryStillRefuses = measured.category_hc_29d.count === 0;
  record({
    id: 'AB-2',
    action: 'filtered broad query — POST /search across six narrowing scopes plus a narrow control',
    capability: 'search.filtered_broad_query',
    backendDependency: 'd96147e rankWithinBoundedPopulation',
    r12Baseline: "'bail' + courts:[hc] + 2026-08-01..2026-08-29 refused, rarestDf 0.2577",
    result: measured,
    // rarestDf is reported identically in every scope INCLUDING the ones that
    // now succeed. That is a wire-truth defect, not a search defect, and it is
    // raised as CCR-2026-08-30-02 rather than fixed here.
    rarestDfIsScopeInvariant: new Set(Object.values(measured).filter((m) => m.rarestDf != null).map((m) => m.rarestDf)).size,
    latencyMs: Math.max(...Object.values(measured).map((m) => m.latencyMs)),
    verdict: narrowingNowWorks && categoryStillRefuses ? 'PASS_WITH_LIMIT' : narrowingNowWorks ? 'PASS' : 'HOLD',
  });
}

// ---------------------------------------------------- CTRL-CITATION
// Required positive control: exact citation must still resolve after a change
// to the query classifier. A classifier that started swallowing citations
// would be invisible in AB-1 and AB-2 alone.
const [neutralFx] = await sql`SELECT id, case_title, neutral_citation, court, judgment_date
                              FROM judgments WHERE neutral_citation = '2026:JHHC:25953' LIMIT 1`;
{
  const r = await search({ query: neutralFx.neutral_citation, language: 'en' });
  const hits = resultsOf(r);
  const top = hits[0] ?? null;
  const exact = top && (top.judgmentId ?? top.id) === neutralFx.id;
  record({
    id: 'CTRL-CITATION',
    action: 'exact-citation positive control — POST /search "' + neutralFx.neutral_citation + '"',
    capability: 'search.exact_citation',
    result: {
      count: hits.length,
      rank1MatchesFixture: Boolean(exact),
      outcome: outcomeOf(r),
      exactIdentityUsable: outcomeOf(r)?.exactIdentityUsable ?? null,
    },
    latencyMs: r.latencyMs,
    verdict: exact ? 'PASS' : 'HOLD',
  });
}

// ---------------------------------------------------- CTRL-CORELOOP
// Required smoke: Search -> Reader -> Save -> Matter, end to end, authenticated.
const authId = crypto.randomUUID();
const userId = crypto.randomUUID();
const email = 'new3-delta-' + authId.slice(0, 8) + '@example.test';
await sql`INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at)
          VALUES (${authId}, 'NEW3 Delta', ${email}, true, now(), now())`;
await sql`INSERT INTO users (id, auth_id, full_name, phone, email, preferred_language, terms_accepted_at, terms_version, created_at)
          VALUES (${userId}, ${authId}, 'NEW3 Delta', '+910000000000', ${email}, 'en', now(), 'v1', now())`;
created.authUserId = authId;
created.userId = userId;
const token = await new SignJWT({ email })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(authId)
  .setIssuer('lawmind')
  .setIssuedAt()
  .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
  .sign(new TextEncoder().encode(AUTH_SECRET));

{
  const s = await search({ query: neutralFx.neutral_citation, language: 'en' });
  const found = resultsOf(s)[0] ?? null;
  const jid = found?.judgmentId ?? found?.id ?? neutralFx.id;
  const reader = await call('GET', '/judgments/' + jid);
  const m = await call('POST', '/matters', {
    token,
    body: {
      caseTitle: 'NEW3 Delta Matter (fixture)',
      court: 'Patna High Court',
      caseType: 'criminal',
      parties: { petitioner: 'Fixture A', respondent: 'State of Bihar' },
      clientName: 'Fixture Client',
      ourSide: 'accused',
      nextHearingDate: '2026-09-15',
    },
  });
  const matterId = m.json?.data?.matter?.matterId ?? m.json?.data?.matterId ?? m.json?.data?.id ?? null;
  if (matterId) created.matterIds.push(matterId);
  const save = matterId
    ? await call('POST', '/matters/' + matterId + '/authorities', { token, body: { judgmentId: jid } })
    : { status: 0, json: null, text: 'no matter id', latencyMs: 0 };
  const list = matterId
    ? await call('GET', '/matters/' + matterId + '/authorities', { token })
    : { status: 0, json: null, text: '', latencyMs: 0 };
  const saved = save.json?.data?.authority ?? null;
  const listed = list.json?.data?.authorities ?? null;
  if (saved?.authorityId) created.authorityIds.push(saved.authorityId);
  // The three independent citation fields must all survive the round trip.
  // One enum in their place is a contract violation, not a cosmetic one.
  const threeField = Boolean(
    saved && 'verificationState' in saved && 'verifiedBySource' in saved && 'overruledStatus' in saved,
  );
  const ok =
    s.status === 200 && reader.status === 200 && m.status === 201 && save.status === 201 && list.status === 200;
  record({
    id: 'CTRL-CORELOOP',
    action: 'core-loop smoke — Search -> Reader -> Save -> Matter, authenticated',
    capability: 'search.exact_citation + judgment.reader + matter.workspace + matter.saved_authorities',
    result: {
      searchStatus: s.status,
      readerStatus: reader.status,
      matterStatus: m.status,
      matterId,
      saveStatus: save.status,
      listStatus: list.status,
      listCount: Array.isArray(listed) ? listed.length : null,
      threeFieldModelPresent: threeField,
      savedAuthorityStates: saved
        ? {
            verificationState: saved.verificationState ?? null,
            verifiedBySource: saved.verifiedBySource ?? null,
            overruledStatus: saved.overruledStatus ?? null,
          }
        : null,
    },
    latencyMs: Math.max(s.latencyMs, reader.latencyMs, m.latencyMs, save.latencyMs, list.latencyMs),
    verdict: ok && threeField ? 'PASS' : 'HOLD',
  });
}

// ---------------------------------------------------- cleanup, by owner
const cleanup = { matterAuthorities: 0, matterEvents: 0, matters: 0, users: 0, authUsers: 0, refreshTokens: 0 };
for (const row of await sql`SELECT id FROM matters WHERE user_id = ${userId}`) {
  if (!created.matterIds.includes(row.id)) created.matterIds.push(row.id);
}
for (const id of created.matterIds) {
  await sql`DELETE FROM matter_shares WHERE matter_id = ${id}`;
  cleanup.matterAuthorities += (await sql`DELETE FROM matter_authorities WHERE matter_id = ${id}`).count;
  cleanup.matterEvents += (await sql`DELETE FROM matter_events WHERE matter_id = ${id}`).count;
  cleanup.matters += (await sql`DELETE FROM matters WHERE id = ${id}`).count;
}
cleanup.refreshTokens = (await sql`DELETE FROM refresh_tokens WHERE user_id = ${userId}`).count;
await sql`DELETE FROM activation_events WHERE user_id = ${userId}`;
await sql`DELETE FROM searches WHERE user_id = ${userId}`;
cleanup.users = (await sql`DELETE FROM users WHERE id = ${userId}`).count;
cleanup.authUsers = (await sql`DELETE FROM auth_user WHERE id = ${authId}`).count;
const residual = {
  usersLeft: Number((await sql`SELECT count(*)::int AS c FROM users WHERE email = ${email}`)[0].c),
  mattersLeft: Number(
    (await sql`SELECT count(*)::int AS c FROM matters WHERE case_title LIKE 'NEW3 Delta%'`)[0].c,
  ),
};

const report = {
  artifact: 'NEW3_ACCEPTANCE_DELTA_R13',
  takenAt: new Date().toISOString(),
  scope:
    'DELTA ONLY. AB-1 and AB-2 rerun because backend d96147e landed; two controls required by the round. The other eight ten-matter cases were NOT rerun and their R12 verdicts stand.',
  supersedesForTheseCasesOnly: 'docs/product/TEN_MATTER_ACCEPTANCE_R12.json (cases M5, M7)',
  backend: { base: BASE, version: version.json?.data ?? null, health: health.json?.data ?? null },
  freshnessEvidence: { route: 'GET /corpus/freshness/object', status: freshness.status, body: freshness.json?.data ?? null },
  fixtures: { neutralFx },
  cases,
  cleanup,
  residual,
};
fs.mkdirSync('docs/product', { recursive: true });
fs.writeFileSync('docs/product/NEW3_ACCEPTANCE_DELTA_R13.json', JSON.stringify(report, null, 2));
console.log('\nWROTE docs/product/NEW3_ACCEPTANCE_DELTA_R13.json');
console.log('CLEANUP', JSON.stringify(cleanup), 'RESIDUAL', JSON.stringify(residual));
console.log('VERDICTS', cases.map((c) => c.id + '=' + c.verdict).join(' '));
await sql.end();
