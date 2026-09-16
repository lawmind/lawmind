#!/usr/bin/env node
/**
 * LCC R32B — Gate-C core smoke against the DEPLOYED API, over public HTTPS.
 *
 * Nothing here builds the app in process. Every call goes through TLS, Caddy,
 * the systemd service and its two database roles, which is the path RCC's phone
 * will take.
 *
 * Inputs:
 *   --api https://alpha-api.lawmind.co
 *   --fixtures file.json   { citation, judgmentId, cnr, court, rareTerm }
 *                          drawn from the restored corpus, never hard-coded
 *   --tokens file.json     { onboarded, identityOnly }  bearer tokens for two
 *                          staging smoke principals (see the runbook)
 *   --out docs/ai/lcc-r32b-do/remote-smoke.json
 *
 * Every check records status and the fields it judged. A 5xx anywhere fails the
 * run. No retries: a smoke that retries until green measures nothing.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? undefined : args[i + 1];
};
const API = (flag('api') ?? '').replace(/\/$/, '');
const FX = JSON.parse(readFileSync(flag('fixtures'), 'utf8'));
const TK = JSON.parse(readFileSync(flag('tokens'), 'utf8'));
const OUT = resolve(flag('out') ?? 'docs/ai/lcc-r32b-do/remote-smoke.json');
if (!API.startsWith('https://')) throw new Error('--api must be https');

const checks = [];
const check = (name, pass, detail) => {
  checks.push({ name, pass: !!pass, ...detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail).slice(0, 220)}`);
};

async function call(method, path, { token, body, key } = {}) {
  const started = performance.now();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return {
    status: res.status,
    ms: Math.round(performance.now() - started),
    requestId: res.headers.get('x-request-id'),
    body: json,
  };
}
const data = (r) => r.body?.data ?? {};
const T = TK.onboarded;

// ── platform ───────────────────────────────────────────────────────────────
const health = await call('GET', '/health');
check('health', health.status === 200 && data(health).status === 'ok', { status: health.status, sha: data(health).sha });
const ready = await call('GET', '/ready');
check('ready', ready.status === 200 && data(ready).splitMode === 'split' && data(ready).rolesDistinct === true, {
  status: ready.status,
  ...data(ready),
});
const version = await call('GET', '/version');
check('version', version.status === 200 && /^[0-9a-f]{40}$/.test(data(version).gitSha ?? ''), {
  status: version.status,
  gitSha: data(version).gitSha,
});
const caps = await call('GET', '/release/capabilities');
const capMap = data(caps).capabilities ?? {};
const semantic = Object.entries(capMap).filter(([k]) => /semantic|dense|vector/i.test(k));
check('capabilities', caps.status === 200 && Object.keys(capMap).length > 0, {
  status: caps.status,
  registryVersion: data(caps).registryVersion,
  semantic: semantic.map(([k, v]) => ({ k, state: v.state })),
});
check('no public semantic search', semantic.every(([, v]) => v.state !== 'ENABLED'), {
  semantic: semantic.map(([k, v]) => `${k}=${v.state}`),
});

// ── auth ───────────────────────────────────────────────────────────────────
const anon = await call('GET', '/me');
check('auth: no token refused', anon.status === 401 || anon.status === 403, { status: anon.status, code: anon.body?.error?.code });
const me = await call('GET', '/me', { token: T });
check('auth: bearer accepted', me.status === 200, { status: me.status });

// ── search ─────────────────────────────────────────────────────────────────
const search = async (name, query, filters) => {
  const r = await call('POST', '/search', { token: T, body: { query, language: 'en', ...(filters ? { filters } : {}) } });
  const d = data(r);
  const results = d.results ?? d.hits ?? [];
  return { r, d, results };
};
{
  const { r, d, results } = await search('lexical', FX.rareTerm);
  check('search: normal lexical', r.status === 200 && results.length > 0, {
    status: r.status, ms: r.ms, results: results.length, degraded: d.degraded, outcome: d.retrievalOutcome,
    withParagraphEvidence: results.filter((x) => x.operativeParagraphVerified && x.exactSpan).length,
  });
}
{
  const { r, d, results } = await search('citation', FX.citation);
  const hit = results.find((x) => (x.judgmentId ?? x.id) === FX.judgmentId);
  check(`search: exact citation ${FX.citation}`, r.status === 200 && !!hit, {
    status: r.status, ms: r.ms, results: results.length, degraded: d.degraded, outcome: d.retrievalOutcome,
    first: results[0]?.judgmentId ?? results[0]?.id,
  });
}
{
  const { r, d, results } = await search('cnr', FX.cnr);
  check('search: CNR', r.status === 200 && results.length >= 1, {
    status: r.status, ms: r.ms, results: results.length, degraded: d.degraded, outcome: d.retrievalOutcome,
  });
}
{
  const { r, d, results } = await search('filtered', FX.rareTerm, { court: FX.court });
  check('search: filtered structured', r.status === 200 && results.every((x) => !x.court || x.court === FX.court), {
    status: r.status, ms: r.ms, results: results.length, degraded: d.degraded, outcome: d.retrievalOutcome,
  });
}

// ── reader ─────────────────────────────────────────────────────────────────
const reader = await call('GET', `/judgments/${FX.judgmentId}`, { token: T });
check('reader: paragraphs', reader.status === 200 && (data(reader).paragraphs ?? []).length > 0, {
  status: reader.status, ms: reader.ms, paragraphs: (data(reader).paragraphs ?? []).length,
});

// ── matters (R16 + R17) ────────────────────────────────────────────────────
const matterBody = {
  caseTitle: `Gate C Smoke ${new Date().toISOString().slice(0, 16)}`,
  court: 'Delhi High Court',
  caseType: 'criminal',
  parties: { petitioner: 'State', respondent: 'Smoke' },
  clientName: 'Smoke',
  ourSide: 'accused',
};
const key = `r32b-${randomUUID()}`;
const created = await call('POST', '/matters', { token: T, body: matterBody, key });
const matterId = data(created).matter?.matterId;
check('matter: create', created.status === 201 && !!matterId, { status: created.status, matterId });
const replay = await call('POST', '/matters', { token: T, body: matterBody, key });
check('R16: idempotent replay returns the same matter', replay.status < 300 && data(replay).matter?.matterId === matterId, {
  status: replay.status, replayed: data(replay).matter?.matterId,
});
const detail = await call('GET', `/matters/${matterId}`, { token: T });
check('matter: detail', detail.status === 200, { status: detail.status });
const event = await call('POST', `/matters/${matterId}/events`, {
  token: T, key: `r32b-${randomUUID()}`,
  body: { eventDate: '2026-09-20', eventType: 'note', notes: 'Gate C smoke event' },
});
check('matter: event create', event.status === 201, { status: event.status });
const saved = await call('POST', `/matters/${matterId}/authorities`, {
  token: T, key: `r32b-${randomUUID()}`, body: { judgmentId: FX.judgmentId },
});
const authority = data(saved).authority ?? {};
check('matter: save authority', saved.status === 201 && !!authority.authorityId, {
  status: saved.status, authorityId: authority.authorityId, addedAt: authority.addedAt,
});
const absent = await call('POST', `/matters/${matterId}/authorities`, {
  token: T, key: `r32b-${randomUUID()}`, body: { judgmentId: randomUUID() },
});
check('R17: unavailable target refused without a false existential claim',
  absent.status === 409 && absent.body?.error?.code === 'CORPUS_TARGET_UNAVAILABLE' &&
    !/no (such )?judgment|does not exist/i.test(absent.body?.error?.message ?? ''),
  { status: absent.status, code: absent.body?.error?.code, message: absent.body?.error?.message },
);
const annotation = await call('POST', `/judgments/${FX.judgmentId}/annotations`, {
  token: T, key: `r32b-${randomUUID()}`,
  body: { paragraphNumber: 1, paragraphIndex: 0, quote: 'Gate C smoke', note: 'Gate C smoke annotation' },
});
check('annotation: create', annotation.status === 201, { status: annotation.status, code: annotation.body?.error?.code });

// ── identity-only deletion ─────────────────────────────────────────────────
const erase = await call('POST', '/me/data-requests', {
  token: TK.identityOnly, key: `r32b-${randomUUID()}`, body: { kind: 'erasure' },
});
check('identity-only deletion request', erase.status === 201 || erase.status === 202, {
  status: erase.status, kind: data(erase).request?.kind, code: erase.body?.error?.code,
});

const serverErrors = checks.filter((c) => typeof c.status === 'number' && c.status >= 500);
const out = {
  kind: 'lcc-r32b-remote-smoke',
  at: new Date().toISOString(),
  api: API,
  sha: data(version).gitSha,
  matterId,
  authority,
  pass: checks.every((c) => c.pass) && serverErrors.length === 0,
  checks,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nREMOTE_CORE_SMOKE = ${out.pass ? 'PASS' : 'FAIL'}`);
process.exit(out.pass ? 0 : 1);
