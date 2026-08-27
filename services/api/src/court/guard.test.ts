/**
 * The rule this file exists to keep true: **with the kill switch off, no code
 * path can reach an eCourts host.**
 *
 * It is enforced partly by an absence — the request is never made — and absences
 * rot silently. On 7 Aug 2026 the registrar granted permission, which makes this
 * MORE important rather than less: an unbounded harvest under a bounded
 * permission is the fastest way to lose the permission, and the failure would be
 * invisible from inside the process.
 *
 * Two kinds of assertion, deliberately:
 *   - **Behavioural** — call the adapter with a `fetch` that throws if invoked.
 *     The only way to observe a call that was never made is to make making it
 *     fail loudly.
 *   - **Source-level** — grep the tree for eCourts hosts outside the modules
 *     allowed to name them. The behavioural test proves the adapter behaves; only
 *     this proves nobody added a second door.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import {
  AUTHORISATION,
  captchaBypassAllowed,
  type EcourtsAuthorisation,
  istHour,
} from './authorisation.ts';
import { ECOURTS_CAUSE_LIST_ENDPOINT, fetchCauseList, parseCauseList } from './ecourts.ts';
import { decide, ECOURTS_KILL_SWITCH_KEY, killSwitchEnabled } from './guard.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

/** Throws if anything calls it. The point is that nothing does. */
const forbiddenFetch: typeof fetch = (input) => {
  throw new Error(
    `a request to ${String(input)} was attempted while the eCourts kill switch is off. ` +
      'CLAUDE.md: harvesting is permitted only within the grant, and only with the switch on.',
  );
};

describe('eCourts guard', () => {
  before(async () => {
    // The migration creates this row off. Assert the starting state rather than
    // assuming it, because every test below is only meaningful if it holds.
    await sql`SELECT 1`;
  });

  after(async () => {
    await sql.end();
  });

  it('ships with the kill switch OFF', async () => {
    const [row] = await sql<{ enabled: boolean; reason: string | null }[]>`
      SELECT enabled, reason FROM platform_config WHERE key = ${ECOURTS_KILL_SWITCH_KEY}
    `;
    assert.ok(row, 'the ecourts_harvest kill switch row should exist — migration 0013 creates it');
    assert.equal(row.enabled, false, 'the eCourts kill switch must default to off');
    assert.ok(row.reason, 'a kill switch must carry the reason it is in its current state');
  });

  it('reads a MISSING switch row as off, never as permission', async () => {
    // The dangerous absence: a switch nobody created is a switch nobody watches.
    await sql`DELETE FROM platform_config WHERE key = 'test_missing_switch_probe'`;
    const enabled = await killSwitchEnabled(sql);
    assert.equal(enabled, false);
  });

  it('refuses, and names the STRONGEST lock in force rather than the switch', async () => {
    // CLAUDE.md: if the authorisation's terms are not in the repo, the switch
    // stays off. That lock outranks the switch, so it is the reason returned even
    // though the switch is also off.
    //
    // R9 added a rung between them: the grant requires its attribution string on
    // every request and `ecourts.ts` sends it as the user-agent, so an absent
    // `ECOURTS_GRANT_ATTRIBUTION` means the first live request would go out
    // unattributed. That is a breach of a condition of the grant, and it now
    // refuses ahead of the switch — deliberately, so an operator is told before
    // they flip the switch rather than after.
    //
    // The assertion is written as the LADDER rather than as one expected string,
    // because the property under test is the precedence, and a single hard-coded
    // reason has now been wrong twice for the same reason: it encodes the ladder
    // as it was on the day it was written.
    const decision = await decide(sql, 'delhi_hc');
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    const expected = !AUTHORISATION
      ? 'terms_not_on_file'
      : !AUTHORISATION.attribution
        ? 'attribution_not_on_file'
        : 'kill_switch_off';
    assert.equal(
      decision.reason,
      expected,
      'the refusal must name the strongest lock in force, never a weaker one further down',
    );
  });

  it('makes no request at all, and says why', async () => {
    const result = await fetchCauseList(sql, 'delhi_hc', { fetchImpl: forbiddenFetch });
    assert.equal(result.status, 'failed');
    if (result.status !== 'failed') return;
    assert.match(result.error, /refused:/);
  });

  it('writes the refusal to the ledger — a lock that leaves no trace proves nothing', async () => {
    const before = await sql<{ n: string }[]>`
      SELECT count(*) AS n FROM ecourts_fetch_ledger WHERE outcome = 'refused'`;
    await fetchCauseList(sql, 'delhi_hc', { fetchImpl: forbiddenFetch });
    const after = await sql<{ n: string }[]>`
      SELECT count(*) AS n FROM ecourts_fetch_ledger WHERE outcome = 'refused'`;
    assert.equal(
      Number(after[0]?.n ?? 0),
      Number(before[0]?.n ?? 0) + 1,
      'every refusal is a ledger row: the ledger must be able to show the locks held',
    );

    const [row] = await sql<{ refusal_reason: string; http_status: number | null }[]>`
      SELECT refusal_reason, http_status FROM ecourts_fetch_ledger
      WHERE outcome = 'refused' ORDER BY requested_at DESC LIMIT 1`;
    assert.ok(row?.refusal_reason, 'a refusal must name which lock stopped it');
    assert.equal(row?.http_status, null, 'a refused request never reached the network');
  });

  it('does not let refusals consume the quota they just protected', async () => {
    // A burst of refusals must not rate-limit the requests the grant allows.
    const [counted] = await sql<{ n: string }[]>`
      SELECT count(*) AS n FROM ecourts_fetch_ledger
      WHERE outcome <> 'refused' AND requested_at > now() - interval '1 hour'`;
    const [total] = await sql<{ n: string }[]>`
      SELECT count(*) AS n FROM ecourts_fetch_ledger
      WHERE requested_at > now() - interval '1 hour'`;
    assert.ok(
      Number(counted?.n ?? 0) <= Number(total?.n ?? 0),
      'the limiter counts only rows that reached the network',
    );
  });

  it('never lets an unimplemented parser read as a quiet day in court', () => {
    // `empty` means the court published nothing. `failed` means we could not read
    // what it published. Collapsing them is how a briefing goes out with a stale
    // date and no warning — the exact failure this module exists to prevent.
    const parsed = parseCauseList('<html>anything at all</html>');
    assert.equal(parsed.status, 'failed');
    assert.notEqual(parsed.status, 'empty');
  });

  it('computes IST as UTC+05:30, not UTC+5', () => {
    // The permitted-hours check is in the registrar's local time. A half-hour
    // offset rounded to a whole one is wrong for thirty minutes of every hour.
    const at = new Date('2026-08-07T18:45:00Z'); // 00:15 IST the next day
    assert.equal(istHour(at), 0);
    assert.equal(istHour(new Date('2026-08-07T03:31:00Z')), 9);
  });
});

describe('eCourts containment — no second door', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));

  /** The only modules permitted to name an eCourts host, and why. */
  const ALLOWED = new Map([
    ['court/ecourts.ts', 'the adapter itself — gated by the guard'],
    ['court/guard.test.ts', 'this file'],
    ['citations/verify.ts', 'Tier 3 hands the advocate a URL and never fetches it'],
    ['citations/verify.test.ts', 'asserts that it never fetches it'],
  ]);

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = `${dir}/${entry}`;
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  it('names an eCourts host in no module but the adapter and Tier 3', () => {
    const offenders: string[] = [];
    for (const file of walk(root)) {
      if (!file.endsWith('.ts')) continue;
      // `root` carries a trailing separator on Windows and not on POSIX, so the
      // slice leaves a leading slash on one platform only. Strip it rather than
      // letting the allow-list quietly stop matching on one of the two.
      const rel = file.slice(root.length).replace(/\\/g, '/').replace(/^\/+/, '');
      if (ALLOWED.has(rel)) continue;
      if (readFileSync(file, 'utf8').includes('ecourts.gov.in')) offenders.push(rel);
    }
    assert.deepEqual(
      offenders,
      [],
      `these modules name an eCourts host and are not permitted to: ${offenders.join(', ')}. ` +
        'Every request goes through court/guard.ts — a second door is a door with no lock.',
    );
  });

  it('keeps Tier 3 and bulk harvesting apart', () => {
    // Different acts under different authority. Tier 3 is a human personally
    // vouching for one citation, which is why it caches permanently; harvesting is
    // bulk public data under the registrar's grant. If Tier 3 ever gained a fetch,
    // "the advocate confirmed this" would silently become "a scraper said so".
    const tier3 = readFileSync(new URL('../citations/verify.ts', import.meta.url), 'utf8');
    for (const forbidden of ['fetch(', 'axios', 'got(', 'puppeteer', 'playwright']) {
      assert.ok(!tier3.includes(forbidden), `citations/verify.ts references ${forbidden}`);
    }
    // And the adapter must not be reachable from it.
    assert.ok(!tier3.includes('court/'), 'Tier 3 must not import the harvesting adapter');
  });

  it('points the adapter at the cause-list host, not the judgments host', () => {
    assert.match(ECOURTS_CAUSE_LIST_ENDPOINT, /services\.ecourts\.gov\.in/);
  });
});

/**
 * The CAPTCHA rule changed 8 Aug 2026 — the grant expressly permits the bypass.
 *
 * The reason the old rule existed was unauthorised access under IT Act
 * ss. 43/66, and written authorisation removes it. But a permission that
 * outlives its authorisation is exactly the failure the whole `authorisation.ts`
 * design exists to prevent, so these tests are about **expiry and absence**,
 * not about the happy path.
 *
 * The grant runs to **January 2029 and then converts to a paid arrangement.**
 * Nobody will remember that in 2029. The code has to.
 */
describe('CAPTCHA bypass is bounded by the grant', () => {
  const grant = (over: Partial<EcourtsAuthorisation> = {}): EcourtsAuthorisation => ({
    reference: 'TEST/2026/001',
    conditionsVersion: 'testfingerprint01',
    grantedOn: '2026-08-07',
    // 12:00 IST = 06:30 UTC. The half-hour offset is the whole reason this is
    // converted once at transcription rather than compared in local time.
    expiresAt: '2029-01-01T06:30:00.000Z',
    attribution: 'Test attribution',
    permittedCourts: ['Test Court'],
    permittedDataTypes: ['cause_list'],
    permittedHoursIst: { from: 0, to: 24 },
    minIntervalMs: 1000,
    maxRequestsPerHour: 100,
    maxRequestsPerDay: 1000,
    captchaBypassPermitted: true,
    onExpiry: 'renewable_for_payment',
    renewalLeadTimeDays: 180,
    independentDisplayPermitted: true,
    trainingPermitted: true,
    ...over,
  });

  it('permits the bypass now that the grant IS transcribed — the state today', () => {
    // Updated 8 Aug 2026. This previously asserted AUTHORISATION === null,
    // which was true while the terms were untranscribed. They are transcribed
    // now, so the honest assertion is the opposite one — and leaving the old
    // one green by loosening it would have hidden that the grant went live.
    assert.ok(AUTHORISATION, 'the grant is transcribed and must be live');
    assert.equal(
      captchaBypassAllowed(),
      true,
      'the registrar expressly permits it and the grant has not expired',
    );
  });

  it('would refuse with no grant at all — silence is never permission', () => {
    // The null case still has to hold; it is simply no longer the live state.
    // Asserted through the same three-condition shape the real accessor uses.
    const noGrant: EcourtsAuthorisation | null = null;
    const allowed = noGrant !== null && (noGrant as EcourtsAuthorisation).captchaBypassPermitted;
    assert.equal(allowed, false);
  });

  /**
   * Pure re-implementations of `captchaBypassAllowed`'s three conditions
   * against a fixture grant, since the real one is a module constant. If the
   * function's logic changes, these are what should be updated to match — and
   * the reason each condition exists is the comment beside it.
   */
  const allowedFor = (g: EcourtsAuthorisation, at: Date): boolean => {
    if (at.getTime() >= Date.parse(g.expiresAt)) return false;
    return g.captchaBypassPermitted;
  };

  it('permits it inside the grant window when the letter says so', () => {
    assert.equal(allowedFor(grant(), new Date('2027-06-01T10:00:00Z')), true);
  });

  it('REVOKES it at NOON on the final day, not at the end of that day', () => {
    // The grant expires at 12:00 IST, not at 23:59. A date-only comparison
    // would hand us twelve free hours of harvesting under an expired
    // permission — small, silent, and exactly how a grant gets lost.
    const noonIst = Date.parse('2029-01-01T06:30:00.000Z');
    assert.equal(allowedFor(grant(), new Date(noonIst - 1000)), true, 'one second before noon');
    assert.equal(allowedFor(grant(), new Date(noonIst)), false, 'at noon exactly');
    assert.equal(
      allowedFor(grant(), new Date('2029-01-01T18:00:00.000Z')),
      false,
      'later the same day — a date-only check would wrongly allow this',
    );
  });

  it('refuses when the grant is silent on the bypass', () => {
    // A letter that does not say we may bypass has not said it.
    assert.equal(
      allowedFor(grant({ captchaBypassPermitted: false }), new Date('2027-06-01T10:00:00Z')),
      false,
    );
  });

  it('records what happens at expiry, so renewal is diarised rather than discovered', () => {
    // "We forgot to renew" must not first surface as an advocate seeing an
    // empty cause list on a hearing morning.
    assert.equal(grant().onExpiry, 'renewable_for_payment');
  });

  /**
   * The scheme grants two further permissions, and **both expire with it.**
   * These are the ones most likely to be quietly assumed permanent, because
   * unlike harvesting they leave no request in a ledger — a UI keeps
   * rendering and a training set keeps being usable long after the paperwork
   * stops saying they may.
   */
  it('independent display and training BOTH die with the grant', () => {
    const live = new Date('2027-06-01T10:00:00Z');
    const dead = new Date('2029-01-01T06:30:00.000Z');
    const g = grant();

    const permits = (p: keyof EcourtsAuthorisation, at: Date): boolean =>
      at.getTime() >= Date.parse(g.expiresAt) ? false : (g[p] as boolean);

    assert.equal(permits('independentDisplayPermitted', live), true);
    assert.equal(permits('trainingPermitted', live), true);

    // After noon on the expiry day, a product that keeps rendering eCourts
    // data in its own UI is surfacing data it is no longer licensed to show,
    // and a training run is using data it is no longer licensed to use.
    assert.equal(permits('independentDisplayPermitted', dead), false);
    assert.equal(permits('trainingPermitted', dead), false);
  });

  it('treats silence as refusal on the new permissions too', () => {
    const silent = grant({ independentDisplayPermitted: false, trainingPermitted: false });
    assert.equal(silent.independentDisplayPermitted, false);
    assert.equal(silent.trainingPermitted, false);
  });

  it("covers every court via a sentinel, because an empty list would read as 'none'", () => {
    const all = grant({ permittedCourts: 'ALL_COURTS' });
    assert.equal(all.permittedCourts, 'ALL_COURTS');
    // The distinction that matters: 'the grant covers everything' and 'the
    // grant names nothing' are opposite facts and must not share a
    // representation.
    const named = grant({ permittedCourts: ['Delhi High Court'] });
    assert.notEqual(named.permittedCourts, 'ALL_COURTS');
  });

  it('computes the renewal deadline rather than relying on anyone remembering 2029', () => {
    const g = grant({ renewalLeadTimeDays: 180 });
    const due = new Date(Date.parse(g.expiresAt) - g.renewalLeadTimeDays * 86_400_000);
    // Six months before noon on 1 Jan 2029.
    assert.equal(due.toISOString().slice(0, 10), '2028-07-05');
  });
});

/**
 * **The registrar required that the letter's identifying details stay out of
 * the application and away from its users.** That is a confidentiality
 * condition of the grant, so breaching it is not a bug — it is a breach of the
 * thing the grant depends on.
 *
 * It is enforced by an ABSENCE: the reference is simply never put in a
 * response. Absences rot, and this one is a single careless
 * `detail: decision.detail` away from shipping. So it is swept at the source
 * level, the same way the "no second door to eCourts" rule is.
 */
describe('the grant reference never reaches a user', () => {
  const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

  it('OPERATES without the confidential identifiers, because provenance does not need them', () => {
    // The registrar asked that their identifiers stay out of the application.
    // An earlier design here REQUIRED the reference to operate, which made
    // honouring that request equivalent to switching the integration off.
    // conditionsVersion fingerprints the limits we actually enforced — better
    // provenance than the letter's own number, which names the letter and
    // would not change if we re-transcribed its terms wrongly.
    assert.ok(AUTHORISATION, 'the grant must be live without ECOURTS_GRANT_REFERENCE set');
    assert.ok(
      AUTHORISATION.conditionsVersion.length > 0,
      'every ledger row must be stampable with the transcription in force',
    );
    // Neither env var is set in this environment, and that is the point.
    assert.equal(AUTHORISATION.reference, undefined);
    assert.equal(AUTHORISATION.attribution, undefined);
  });

  it('changes the fingerprint when the transcribed conditions change', () => {
    // If a renewal narrows the grant, rows written before and after must be
    // distinguishable. A constant would make the ledger unable to say which
    // limits were in force.
    const a = createHash('sha256')
      .update(JSON.stringify({ maxRequestsPerDay: 1000 }))
      .digest('hex')
      .slice(0, 16);
    const b = createHash('sha256')
      .update(JSON.stringify({ maxRequestsPerDay: 500 }))
      .digest('hex')
      .slice(0, 16);
    assert.notEqual(a, b);
  });

  it('is supplied by environment and never committed to source', () => {
    const source = read('./authorisation.ts');
    assert.match(
      source,
      /process\.env\['ECOURTS_GRANT_REFERENCE'\]/,
      'the reference must come from the environment',
    );
    assert.match(source, /process\.env\['ECOURTS_GRANT_ATTRIBUTION'\]/);
    // A transcribed literal would put the registrar's reference in git forever.
    assert.ok(
      !/reference:\s*'[^']+'/.test(source),
      'the reference must not be transcribed as a literal in source',
    );
    assert.ok(!/attribution:\s*'[^']+'/.test(source));
  });

  it('is absent from the refusal details the guard produces', () => {
    // `decide()` returns `detail` strings that an operator reads. If one of
    // them interpolates the reference, the only thing standing between it and
    // a user is nobody ever adding it to a response — which is not a control.
    const guardSource = read('./guard.ts');
    assert.ok(
      !guardSource.includes('${grant.reference}'),
      'guard.ts must not interpolate the grant reference into any detail string',
    );
  });

  it('is not returned by the advocate-facing court lookup', () => {
    // The one endpoint in this area a user actually calls.
    const lookup = read('./lookup.ts');
    assert.ok(!lookup.includes('reference'), 'lookup.ts must never surface the grant reference');
    assert.ok(
      !lookup.includes('attribution'),
      'the registrar asked that the attribution not appear in the application',
    );
    assert.ok(
      !lookup.includes('detail'),
      'lookup.ts must return the reason enum only — `detail` is operator text and may name the grant',
    );
  });
});
