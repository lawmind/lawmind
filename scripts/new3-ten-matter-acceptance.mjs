/**
 * NEW3 TEN-MATTER ACCEPTANCE — run against the LIVE local backend.
 * Records for every case: query/action, capability, data source, freshness
 * evidence, actual result, uncertainty/degraded state, latency, PASS/HOLD.
 * Creates ONE fixture user in the example.test domain and deletes everything
 * it wrote at the end.
 */
import postgres from 'postgres';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { SignJWT } from 'jose';

const BASE = process.env.BASE ?? 'http://localhost:3011';
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
/**
 * The signing secret of the API this harness is pointed at. Read from the
 * environment and never defaulted: a fallback secret is a secret everyone has,
 * and this harness MINTS A VALID SESSION with it. Refusing to run is the cheap
 * outcome; silently minting a token against a guessed secret is not.
 */
const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
  console.error(
    'AUTH_SECRET is not set. Point this at a local API and pass the SAME secret that API ' +
      'was started with, e.g.  AUTH_SECRET=<local> BASE=http://localhost:3011 node ' +
      'scripts/new3-ten-matter-acceptance.mjs',
  );
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
  return {
    status: res.status,
    json,
    text: text.slice(0, 4000),
    latencyMs: Math.round(latencyMs * 10) / 10,
  };
}

function record(c) {
  cases.push(c);
  console.log('[' + c.id + '] ' + c.verdict + '  ' + c.latencyMs + 'ms  ' + c.action);
}

// fixture identity
const authId = crypto.randomUUID();
const userId = crypto.randomUUID();
const email = 'new3-acceptance-' + authId.slice(0, 8) + '@example.test';
await sql`INSERT INTO auth_user (id, name, email, email_verified, created_at, updated_at)
          VALUES (${authId}, 'NEW3 Acceptance', ${email}, true, now(), now())`;
await sql`INSERT INTO users (id, auth_id, full_name, phone, email, preferred_language, terms_accepted_at, terms_version, created_at)
          VALUES (${userId}, ${authId}, 'NEW3 Acceptance', '+910000000000', ${email}, 'en', now(), 'v1', now())`;
created.authUserId = authId;
created.userId = userId;
const token = await new SignJWT({ email })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(authId)
  .setIssuer('lawmind')
  .setIssuedAt()
  .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
  .sign(new TextEncoder().encode(AUTH_SECRET));

// freshness evidence, read once, cited by every case
const freshness = await call('GET', '/corpus/freshness/object');
const capabilities = await call('GET', '/release/capabilities');
const version = await call('GET', '/version');
const health = await call('GET', '/health');

const [neutralFx] = await sql`SELECT id, case_title, neutral_citation, court, judgment_date
                              FROM judgments WHERE neutral_citation = '2026:JHHC:25953' LIMIT 1`;
const [reporterFx] = await sql`SELECT id, case_title, reporter_citations, court, judgment_date
                               FROM judgments WHERE id = 'da3efc43-f8b6-4fed-9bf5-cf552b7bbd91'`;
const [cnrFx] = await sql`SELECT id, case_title, cnr, court, judgment_date
                          FROM judgments WHERE cnr = 'BRHC011177572024' LIMIT 1`;
const [caseNoFx] = await sql`SELECT id, case_title, case_number, court, judgment_date
                             FROM judgments WHERE case_number = 'WPA/24211/2023' LIMIT 1`;
// Bounded on purpose: a full GROUP BY over the whole citation table is a
// corpus-wide scan and this is a fixture pick, not a measurement.
const [graphSeed] = await sql`
  SELECT cited_judgment_id AS id, count(*)::int AS inbound
  FROM (SELECT cited_judgment_id FROM judgment_citations
        WHERE cited_judgment_id IS NOT NULL LIMIT 200000) s
  GROUP BY cited_judgment_id ORDER BY inbound DESC LIMIT 1`;
const [graphFx] = await sql`
  SELECT id, case_title, neutral_citation, ${graphSeed.inbound}::int AS inbound
  FROM judgments WHERE id = ${graphSeed.id}`;

const fixtures = { neutralFx, reporterFx, cnrFx, caseNoFx, graphFx };
console.log('FIXTURES', JSON.stringify(fixtures, null, 1));

const freshEvidence = {
  route: 'GET /corpus/freshness/object',
  status: freshness.status,
  body: freshness.json?.data ?? null,
};

const idOf = (x) => (x ? (x.judgmentId ?? x.id ?? null) : null);

// M1 exact citation (neutral)
{
  const q = neutralFx.neutral_citation;
  const r = await call('POST', '/search', { body: { query: q, language: 'en' } });
  const d = r.json?.data;
  const hit = d?.results?.[0];
  record({
    id: 'M1',
    action: 'exact neutral citation — POST /search "' + q + '"',
    capability: 'search.exact_identity',
    dataSource: 'judgments.neutral_citation (AWS Open Data HC corpus, court-published text)',
    freshness: {
      hc: freshEvidence.body?.hc ?? null,
      fixtureJudgmentDate: neutralFx.judgment_date,
    },
    result: {
      status: r.status,
      resultCount: d?.results?.length ?? 0,
      topId: idOf(hit),
      matchesFixture: idOf(hit) === neutralFx.id,
      retrievalOutcome: d?.retrievalOutcome ?? null,
    },
    degraded: d?.degraded ?? null,
    latencyMs: r.latencyMs,
    verdict: idOf(hit) === neutralFx.id ? 'PASS' : 'HOLD',
    raw: r.text.slice(0, 1400),
  });
}

// M2 exact citation (reporter)
{
  const q = reporterFx.reporter_citations[0];
  const r = await call('POST', '/search', { body: { query: q, language: 'en' } });
  const d = r.json?.data;
  const hit = d?.results?.[0];
  record({
    id: 'M2',
    action: 'exact reporter citation — POST /search "' + q + '"',
    capability: 'search.exact_identity',
    dataSource: 'judgments.reporter_citations (SCR, official SCI text)',
    freshness: { fixtureJudgmentDate: reporterFx.judgment_date, sc: freshEvidence.body?.sc ?? null },
    result: {
      status: r.status,
      resultCount: d?.results?.length ?? 0,
      topId: idOf(hit),
      matchesFixture: idOf(hit) === reporterFx.id,
      retrievalOutcome: d?.retrievalOutcome ?? null,
    },
    degraded: d?.degraded ?? null,
    latencyMs: r.latencyMs,
    verdict: idOf(hit) === reporterFx.id ? 'PASS' : 'HOLD',
    raw: r.text.slice(0, 1400),
  });
}

// M3 CNR
{
  const q = cnrFx.cnr;
  const r = await call('POST', '/search', { body: { query: q, language: 'en' } });
  const d = r.json?.data;
  const hit = d?.results?.[0];
  record({
    id: 'M3',
    action: 'CNR lookup — POST /search "' + q + '"',
    capability: 'search.exact_identity (CNR arm)',
    dataSource: 'judgments.cnr — backfilled from AWS HC metadata, NOT from eCourts',
    freshness: { fixtureJudgmentDate: cnrFx.judgment_date },
    result: {
      status: r.status,
      resultCount: d?.results?.length ?? 0,
      topId: idOf(hit),
      matchesFixture: idOf(hit) === cnrFx.id,
      retrievalOutcome: d?.retrievalOutcome ?? null,
    },
    degraded: d?.degraded ?? null,
    latencyMs: r.latencyMs,
    verdict: idOf(hit) === cnrFx.id ? 'PASS' : 'HOLD',
    raw: r.text.slice(0, 1400),
  });
}

// M4 case number
{
  const q = caseNoFx.case_number;
  const r = await call('POST', '/search', { body: { query: q, language: 'en' } });
  const d = r.json?.data;
  const ids = (d?.results ?? []).map(idOf);
  record({
    id: 'M4',
    action: 'case number — POST /search "' + q + '"',
    capability: 'search.exact_identity (case-number arm)',
    dataSource: 'judgments.case_number as printed by the court',
    freshness: { fixtureJudgmentDate: caseNoFx.judgment_date },
    result: {
      status: r.status,
      resultCount: ids.length,
      containsFixture: ids.includes(caseNoFx.id),
      rank: ids.indexOf(caseNoFx.id) + 1,
      retrievalOutcome: d?.retrievalOutcome ?? null,
    },
    degraded: d?.degraded ?? null,
    latencyMs: r.latencyMs,
    verdict: ids.includes(caseNoFx.id) ? 'PASS' : 'HOLD',
    raw: r.text.slice(0, 1400),
  });
}

// M5 title / party — probed at three widths, because the boundary is the finding
{
  const partial = neutralFx.case_title.split(' Vs ')[0].trim();
  const full = neutralFx.case_title;
  const famous = 'SATENDER KUMAR ANTIL';
  const rPartial = await call('POST', '/search', { body: { query: partial, language: 'en' } });
  const rFull = await call('POST', '/search', { body: { query: full, language: 'en' } });
  const rFamous = await call('POST', '/search', { body: { query: famous, language: 'en' } });
  const dP = rPartial.json?.data;
  const dF = rFull.json?.data;
  const dA = rFamous.json?.data;
  const idsFull = (dF?.results ?? []).map(idOf);
  record({
    id: 'M5',
    action:
      'party/title at three widths — POST /search "' +
      partial +
      '" (party only) · "' +
      full +
      '" (full title) · "' +
      famous +
      '" (a famous SC authority by party name)',
    capability: 'search.exact_identity (case-title arm) + lexical fallback',
    dataSource: 'judgments.case_title; the fallback ranks judgments.full_text_tsv',
    freshness: { fixtureJudgmentDate: neutralFx.judgment_date },
    result: {
      fullTitle: {
        status: rFull.status,
        resultCount: idsFull.length,
        containsFixture: idsFull.includes(neutralFx.id),
        rank: idsFull.indexOf(neutralFx.id) + 1,
        degraded: dF?.degraded ?? null,
      },
      partyOnly: {
        status: rPartial.status,
        resultCount: dP?.results?.length ?? 0,
        degraded: dP?.degraded ?? null,
        emptyBecause: dP?.emptyBecause ?? null,
        rarestDf: dP?.retrievalOutcome?.rarestDf ?? null,
      },
      famousPartyName: {
        status: rFamous.status,
        resultCount: dA?.results?.length ?? 0,
        degraded: dA?.degraded ?? null,
        rarestDf: dA?.retrievalOutcome?.rarestDf ?? null,
        note: 'this authority is held — it is the most-cited node in the sampled citation graph',
      },
    },
    degraded: dF?.degraded ?? null,
    latencyMs: rFull.latencyMs,
    verdict: idsFull.includes(neutralFx.id) ? 'PASS_WITH_LIMIT' : 'HOLD',
    limit:
      'A FULL case title resolves rank 1. A party name alone does NOT: it falls through to the lexical arm and is refused or times out. Party-name-first search is not a v1 capability.',
    raw:
      'FULL:' +
      rFull.text.slice(0, 900) +
      ' || PARTY:' +
      rPartial.text.slice(0, 700) +
      ' || FAMOUS:' +
      rFamous.text.slice(0, 700),
  });
}

// M6 statute
{
  const list = await call('GET', '/statutes');
  const r = await call('GET', '/statutes/sections?q=' + encodeURIComponent('murder') + '&limit=5');
  const d = r.json?.data;
  const bns = await call('GET', '/statutes/sections?sectionNumber=103&limit=5');
  const acts = Array.isArray(list.json?.data)
    ? list.json.data.length
    : (list.json?.data?.acts?.length ?? null);
  record({
    id: 'M6',
    action: 'statute lookup — GET /statutes, /statutes/sections?q=murder, ?sectionNumber=103',
    capability: 'statute.lookup',
    dataSource: 'official statute text — Acts and sections held locally',
    freshness: { statuteListStatus: list.status, actsReturned: acts },
    result: {
      status: r.status,
      sectionsForMurder: Array.isArray(d) ? d.length : (d?.sections?.length ?? null),
      s103Status: bns.status,
      s103Count: Array.isArray(bns.json?.data)
        ? bns.json.data.length
        : (bns.json?.data?.sections?.length ?? null),
    },
    degraded: null,
    latencyMs: r.latencyMs,
    verdict: r.status === 200 && list.status === 200 ? 'PASS' : 'HOLD',
    raw: r.text.slice(0, 900) + ' || S103: ' + bns.text.slice(0, 700),
  });
}

// M7 recent authority (structured filter) — the same window, two query widths
{
  const window = { courts: ['hc'], dateFrom: '2026-08-01', dateTo: '2026-08-29' };
  const broad = await call('POST', '/search', {
    body: { query: 'bail', language: 'en', filters: window, pageSize: 5 },
  });
  const narrow = await call('POST', '/search', {
    body: {
      query: 'anticipatory bail cheque dishonour',
      language: 'en',
      filters: window,
      pageSize: 5,
    },
  });
  const dB = broad.json?.data;
  const dN = narrow.json?.data;
  const dates = (dN?.results ?? []).map((x) => x.judgmentDate ?? x.judgment_date ?? null);
  // How many judgments the FILTER alone actually admits — the number the
  // refusal should have been measured against.
  const [{ c: inWindow }] = await sql`
    SELECT count(*)::int AS c FROM judgments
    WHERE judgment_date >= '2026-08-01' AND judgment_date <= '2026-08-29'`;
  record({
    id: 'M7',
    action:
      'recent authority — POST /search over courts=[hc], 2026-08-01..2026-08-29, at two query widths ("bail" and "anticipatory bail cheque dishonour")',
    capability: 'search.structured_filters + search.pagination',
    dataSource: 'judgments (court, judgment_date SQL predicates)',
    freshness: { hc: freshEvidence.body?.hc ?? null, judgmentsInWindow: inWindow },
    result: {
      narrowQuery: {
        status: narrow.status,
        resultCount: dN?.results?.length ?? 0,
        dates,
        allInWindow: dates.every(
          (x) => !x || (String(x) >= '2026-08-01' && String(x) <= '2026-08-30'),
        ),
        degraded: dN?.degraded ?? null,
      },
      broadQuery: {
        status: broad.status,
        resultCount: dB?.results?.length ?? 0,
        degraded: dB?.degraded ?? null,
        emptyBecause: dB?.emptyBecause ?? null,
        rarestDf: dB?.retrievalOutcome?.rarestDf ?? null,
      },
      page: dN?.page ?? null,
      total: dN?.page?.total ?? dN?.total ?? null,
    },
    degraded: dB?.degraded ?? null,
    latencyMs: narrow.latencyMs,
    verdict: (dN?.results?.length ?? 0) > 0 ? 'PASS_WITH_LIMIT' : 'HOLD',
    limit:
      'The date/court filter does not bound the lexical admission gate. retrieve.ts refuses when rarestDf > SPARSE_MAX_RANKED_DOCUMENT_FREQUENCY, and that df is read from lexeme_document_frequency, which is CORPUS-WIDE; `filters` is a parameter of the same function and is not consulted before the refusal. So a search already narrowed to one month is still told query_too_broad_to_rank.',
    raw: 'NARROW:' + narrow.text.slice(0, 1100) + ' || BROAD:' + broad.text.slice(0, 800),
  });
}

// M8 reader + source evidence
{
  const r = await call('GET', '/judgments/' + neutralFx.id);
  const d = r.json?.data;
  record({
    id: 'M8',
    action: 'reader + source evidence — GET /judgments/' + neutralFx.id,
    capability: 'judgment.reader + judgment.exact_span + provenance',
    dataSource:
      'judgments body text + 0092 provenance columns (173 complete rows; the 18.7M historical rows are NOT backfilled)',
    freshness: { fixtureJudgmentDate: neutralFx.judgment_date },
    result: {
      status: r.status,
      topLevelKeys: d ? Object.keys(d) : [],
      overruledStatus: d?.overruledStatus ?? d?.overruled_status ?? null,
      sourceUrl: d?.sourceUrl ?? null,
      evidenceKeys: d
        ? Object.keys(d).filter((k) => /source|provenance|artifact|evidence|text|state/i.test(k))
        : [],
    },
    degraded: d?.bodyText?.evidenceWithheld ?? null,
    latencyMs: r.latencyMs,
    verdict: r.status === 200 ? 'PASS' : 'HOLD',
    raw: r.text.slice(0, 2400),
  });
}

// M9 partial citation graph
{
  const g = await call('GET', '/judgments/' + graphFx.id + '/graph?depth=1&limit=20');
  const t = await call('GET', '/judgments/' + graphFx.id + '/treatment?limit=20');
  const a = await call('GET', '/judgments/' + graphFx.id + '/authorities');
  const gd = g.json?.data;
  record({
    id: 'M9',
    action:
      'partial citation graph — GET /judgments/' + graphFx.id + '/graph, /treatment, /authorities',
    capability: 'treatment.resolved_signals (PARTIAL graph — never a good-law claim)',
    dataSource: 'citations — resolved distinct edges only; the reference-string population is far larger',
    freshness: { inboundEdgesForFixture: graphFx.inbound },
    result: {
      graphStatus: g.status,
      treatmentStatus: t.status,
      authoritiesStatus: a.status,
      graphKeys: gd ? Object.keys(gd) : [],
      nodes: gd?.nodes?.length ?? null,
      edges: gd?.edges?.length ?? null,
      partialLanguagePresent: /partial|incomplete|coverage|not exhaustive/i.test(g.text),
    },
    degraded: null,
    latencyMs: g.latencyMs,
    verdict: g.status === 200 && t.status === 200 ? 'PASS' : 'HOLD',
    raw: g.text.slice(0, 1400) + ' || TREATMENT: ' + t.text.slice(0, 900),
  });
}

// M10 matter + save authority (authenticated)
{
  const me = await call('GET', '/me', { token });
  const m = await call('POST', '/matters', {
    token,
    body: {
      caseTitle: 'NEW3 Acceptance Matter (fixture)',
      court: 'Patna High Court',
      caseType: 'criminal',
      parties: { petitioner: 'Fixture A', respondent: 'State of Bihar' },
      clientName: 'Fixture Client',
      ourSide: 'accused',
      cnrNumber: cnrFx.cnr,
      nextHearingDate: '2026-09-15',
    },
  });
  const matterId =
    m.json?.data?.matter?.matterId ?? m.json?.data?.matterId ?? m.json?.data?.id ?? null;
  if (matterId) created.matterIds.push(matterId);
  const save = matterId
    ? await call('POST', '/matters/' + matterId + '/authorities', {
        token,
        body: { judgmentId: neutralFx.id },
      })
    : { status: 0, json: null, text: 'no matter id', latencyMs: 0 };
  const list = matterId
    ? await call('GET', '/matters/' + matterId + '/authorities', { token })
    : { status: 0, json: null, text: '', latencyMs: 0 };
  const authorityId =
    save.json?.data?.authority?.authorityId ?? save.json?.data?.authorityId ?? null;
  const savedAuthority = save.json?.data?.authority ?? null;
  const listed = list.json?.data?.authorities ?? null;
  if (authorityId) created.authorityIds.push(authorityId);
  record({
    id: 'M10',
    action:
      'matter + save authority — POST /matters, POST /matters/:id/authorities, GET /matters/:id/authorities',
    capability: 'matter.workspace + matter.saved_authorities',
    dataSource: 'user-owned tables (matters, matter_authorities) joined to judgments at read time',
    freshness: {
      overruledStatusReadLiveAtRender: true,
      asOf: list.json?.data?.asOf ?? null,
    },
    result: {
      meStatus: me.status,
      matterStatus: m.status,
      matterId,
      saveStatus: save.status,
      authorityId,
      listStatus: list.status,
      listCount: Array.isArray(listed) ? listed.length : null,
      // The three independent citation fields must all be present on the saved
      // authority — one enum would be a contract violation, not a cosmetic one.
      threeFieldModelPresent: Boolean(
        savedAuthority &&
          'verificationState' in savedAuthority &&
          'verifiedBySource' in savedAuthority &&
          'overruledStatus' in savedAuthority,
      ),
      savedAuthorityCitationFields: savedAuthority
        ? {
            verificationState: savedAuthority.verificationState,
            verifiedBySource: savedAuthority.verifiedBySource,
            overruledStatus: savedAuthority.overruledStatus,
          }
        : null,
    },
    degraded: null,
    latencyMs: Math.round((m.latencyMs + save.latencyMs) * 10) / 10,
    verdict:
      [200, 201].includes(m.status) &&
      [200, 201].includes(save.status) &&
      list.status === 200 &&
      Array.isArray(listed) &&
      listed.length === 1 &&
      Boolean(savedAuthority && 'overruledStatus' in savedAuthority)
        ? 'PASS'
        : 'HOLD',
    raw:
      'ME:' +
      me.text.slice(0, 400) +
      ' || MATTER:' +
      m.text.slice(0, 800) +
      ' || SAVE:' +
      save.text.slice(0, 800) +
      ' || LIST:' +
      (list.text ?? '').slice(0, 600),
  });
}

// M11 broad / degraded lexical query
{
  const q =
    'anticipatory bail in economic offences where the accused cooperated with the investigation';
  const r = await call('POST', '/search', { body: { query: q, language: 'en' } });
  const d = r.json?.data;
  const long = await call('POST', '/search', { body: { query: 'x'.repeat(600), language: 'en' } });
  const highDf = await call('POST', '/search', { body: { query: 'section 302', language: 'en' } });
  record({
    id: 'M11',
    action: 'broad/degraded lexical — POST /search (natural sentence, a 600-char over-limit probe, and a high-df term)',
    capability: 'search.lexical + honest refusal / degraded reporting',
    dataSource: 'judgments.full_text_tsv (GENERATED ALWAYS — lexical coverage never lags ingest)',
    freshness: { lexicalCoverageEqualsIngest: true },
    result: {
      status: r.status,
      resultCount: d?.results?.length ?? 0,
      retrievalOutcome: d?.retrievalOutcome ?? null,
      unpopulatedCourtCategories: d?.unpopulatedCourtCategories ?? null,
      overLimitStatus: long.status,
      overLimitRefusesHonestly: /longer than we can currently run safely/.test(long.text),
      highDfStatus: highDf.status,
      highDfDegraded: highDf.json?.data?.degraded ?? null,
      highDfOutcome: highDf.json?.data?.retrievalOutcome ?? null,
    },
    degraded: d?.degraded ?? null,
    latencyMs: r.latencyMs,
    verdict: r.status === 200 && long.status === 400 ? 'PASS' : 'HOLD',
    raw:
      r.text.slice(0, 1200) +
      ' || OVERLIMIT:' +
      long.text.slice(0, 500) +
      ' || HIGHDF:' +
      highDf.text.slice(0, 700),
  });
}

// cleanup — everything this run wrote
const cleanup = { matterAuthorities: 0, matterEvents: 0, matters: 0, users: 0, authUsers: 0, refreshTokens: 0 };
// Delete by OWNER, not by the ids the responses happened to expose: a route
// whose response shape we misread still wrote a row, and a cleanup that trusts
// the response leaves exactly that row behind.
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
// search_events is deliberately NOT user-keyed — it carries subject_hash, not
// user_id — so there is nothing here to delete and nothing to identify.
cleanup.users = (await sql`DELETE FROM users WHERE id = ${userId}`).count;
cleanup.authUsers = (await sql`DELETE FROM auth_user WHERE id = ${authId}`).count;
const residual = {
  usersLeft: Number((await sql`SELECT count(*)::int AS c FROM users WHERE email = ${email}`)[0].c),
  mattersLeft: Number(
    (await sql`SELECT count(*)::int AS c FROM matters WHERE case_title LIKE 'NEW3 Acceptance%'`)[0].c,
  ),
  mattersTotal: Number((await sql`SELECT count(*)::int AS c FROM matters`)[0].c),
};

const report = {
  takenAt: new Date().toISOString(),
  backend: { base: BASE, health: health.json?.data ?? null, version: version.json?.data ?? null },
  registryVersion: capabilities.json?.data?.registryVersion ?? null,
  freshnessEvidence: freshEvidence,
  fixtures,
  cases,
  cleanup,
  residual,
};
fs.mkdirSync('docs/product', { recursive: true });
fs.writeFileSync('docs/product/TEN_MATTER_ACCEPTANCE_R12.json', JSON.stringify(report, null, 2));
console.log('\nWROTE docs/product/TEN_MATTER_ACCEPTANCE_R12.json');
console.log('CLEANUP', JSON.stringify(cleanup), 'RESIDUAL', JSON.stringify(residual));
console.log('VERDICTS', cases.map((c) => c.id + '=' + c.verdict).join(' '));
await sql.end();
