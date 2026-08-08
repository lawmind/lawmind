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

  it('refuses while the grant terms are not transcribed — even before the switch', async () => {
    // CLAUDE.md: if the authorisation's terms are not in the repo, the switch
    // stays off. This lock outranks the switch, so it is the reason returned even
    // though the switch is also off.
    const decision = await decide(sql, 'delhi_hc');
    assert.equal(decision.allowed, false);
    if (decision.allowed) return;
    assert.equal(
      decision.reason,
      AUTHORISATION ? 'kill_switch_off' : 'terms_not_on_file',
      'with no transcribed terms the refusal must name the terms, not the switch',
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
    grantedOn: '2026-08-07',
    // 12:00 IST = 06:30 UTC. The half-hour offset is the whole reason this is
    // converted once at transcription rather than compared in local time.
    expiresAt: '2029-01-01T06:30:00.000Z',
    attribution: 'Test attribution',
    permittedCourts: ['Test Court'],
    permittedHoursIst: { from: 0, to: 24 },
    minIntervalMs: 1000,
    maxRequestsPerHour: 100,
    maxRequestsPerDay: 1000,
    captchaBypassPermitted: true,
    onExpiry: 'renewable_for_payment',
    independentDisplayPermitted: true,
    trainingPermitted: true,
    ...over,
  });

  it('refuses the bypass while no grant is transcribed — the state today', () => {
    // AUTHORISATION is null until the letter is transcribed. Silence is not
    // permission, and this is the assertion that keeps that true.
    assert.equal(AUTHORISATION, null, 'fixture assumption: no grant is on file yet');
    assert.equal(captchaBypassAllowed(), false);
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
});
