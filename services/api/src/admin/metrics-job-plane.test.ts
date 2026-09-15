/**
 * THE JOB CONTROL PLANE'S TWO RULES, AND THE ELEVEN DAYS THEY GOT WRONG.
 *
 * `ops_job_current` holds the LATEST reading per job. Latest is not the same as
 * RECENT, and the difference is the whole subject of this file.
 *
 * MEASURED 5 Sep 2026: nothing had published to `ops_job_observations` since
 * 25 Aug 09:40:26Z — 274 hours — because `job-health.mjs` had learned six new
 * states on 1 Sep and migration 0083's CHECK constraint still permitted seven,
 * so every publish was rejected in full and silently (publish failure is
 * non-fatal by design). For all eleven days `stalledCriticalJobs` re-asserted
 * the frozen rows in the present tense: `new1-doc-vector-embed FAILED`, about a
 * job that was producing 34,000 vectors an hour on a GPU pinned at 99%.
 *
 * The rows were not wrong. They were old, and nothing in the rule could tell the
 * difference. So:
 *
 *   1. a stalled reading pages only while the feed behind it is alive;
 *   2. past that line `jobObservationAgeHours` carries the page on its own, with
 *      the honest reason — we cannot see, rather than a job has died;
 *   3. and ONE stalled job is a page, which the thresholds did not actually say.
 *
 * Every case runs inside a transaction that is always rolled back. This table is
 * append-only and shared by five lanes: a test that leaves a row behind has
 * published a lie about somebody else's job, permanently.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { ALERT_RULES, collectMetrics } from './metrics.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

/** Thrown to discard the fixture rows. Never escapes `withPlane`. */
class Rollback extends Error {}

type Fixture = { job_id: string; state: string; ageHours: number };

/**
 * Run `fn` against a control plane containing EXACTLY `fixtures` and nothing
 * else, then discard every trace of it.
 *
 * The critical rows already on this box are deleted inside the transaction
 * rather than worked around, because `observedAgeHours` is a `min()` across all
 * critical rows — leaving the live ones in would make the freshest real reading,
 * not the fixture, decide the case under test. That is a test that passes for a
 * reason the author did not choose.
 */
async function withPlane<T>(
  fixtures: readonly Fixture[],
  fn: (alerts: { severity: string; rule: string; detail: string }[]) => T,
): Promise<T> {
  let out: T | undefined;
  let ran = false;
  try {
    await sql.begin(async (tx) => {
      await tx`DELETE FROM ops_job_observations WHERE critical`;
      for (const f of fixtures) {
        await tx`
          INSERT INTO ops_job_observations (job_id, owner_lane, observed_at, state, critical, why, observer)
          VALUES (${f.job_id}, 'TEST', now() - (${f.ageHours} || ' hours')::interval,
                  ${f.state}, true, 'fixture', 'metrics-job-plane.test.ts')`;
      }
      const snapshot = await collectMetrics(tx as unknown as typeof sql);
      out = fn(snapshot.alerts);
      ran = true;
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  assert.equal(ran, true, 'the transaction body did not run');
  return out as T;
}

/* The narrowing helpers take the WHOLE alert, not just `rule`. Declaring the
 * parameter as `{ rule: string }[]` narrowed the return type too, so every
 * `severity`/`detail` assertion below failed to typecheck at c36c853f. */
type PlaneAlert = { severity: string; rule: string; detail: string };
const stalled = (alerts: PlaneAlert[]) => alerts.filter((a) => a.rule === 'stalledCriticalJobs');
const staleFeed = (alerts: PlaneAlert[]) =>
  alerts.filter((a) => a.rule === 'jobObservationAgeHours');

describe('job control plane alerts', () => {
  after(async () => {
    await sql.end({ timeout: 5 });
  });

  it('pages on a stalled job while the feed behind it is alive', async () => {
    await withPlane([{ job_id: 'test-walk', state: 'FAILED', ageHours: 0 }], (alerts) => {
      const hit = stalled(alerts);
      assert.equal(hit.length, 1, 'a fresh FAILED reading must page');
      assert.equal(hit[0]!.severity, 'page');
      assert.match(hit[0]!.detail, /test-walk/);
      /* The age is stated so a page can never be read as more current than the
       * reading behind it — the exact confusion that produced eleven days of
       * present-tense claims about an eleven-day-old row. */
      assert.match(hit[0]!.detail, /control plane's reading .*h ago/);
    });
  });

  it('ONE stalled job is a page — the thresholds used to mean "one is silent"', async () => {
    /* `add()` breaches on `value > t`, so the old `{ watch: 1, page: 1 }` could
     * never fire for a single job however loudly the comment said it should.
     * This is the regression guard for the arithmetic, not for the wording. */
    assert.equal(ALERT_RULES.stalledCriticalJobs.page, 0);
    await withPlane(
      [{ job_id: 'test-only-one', state: 'RUNNING_STALLED', ageHours: 0 }],
      (alerts) => {
        assert.equal(stalled(alerts).length, 1);
      },
    );
  });

  it('does NOT page a stalled job out of a feed it has already declared blind', async () => {
    const dead = ALERT_RULES.jobObservationAgeHours.page + 1;
    await withPlane([{ job_id: 'test-walk', state: 'FAILED', ageHours: dead }], (alerts) => {
      assert.deepEqual(
        stalled(alerts),
        [],
        'a reading older than the feed-outage bound is not evidence about now',
      );
      /* Silence is NOT the outcome. The human is still woken — with the reason
       * that is actually true. */
      const feed = staleFeed(alerts);
      assert.equal(feed.length, 1);
      assert.equal(feed[0]!.severity, 'page');
      assert.match(feed[0]!.detail, /last published/);
    });
  });

  it('a healthy fresh plane raises neither rule', async () => {
    await withPlane(
      [
        { job_id: 'test-walk', state: 'RUNNING_BY_PROGRESS', ageHours: 0 },
        { job_id: 'test-poll', state: 'RUNNING_PROGRESSING', ageHours: 0 },
      ],
      (alerts) => {
        assert.deepEqual(stalled(alerts), []);
        assert.deepEqual(staleFeed(alerts), []);
      },
    );
  });

  it('accepts every state job-health can emit — 0083 permitted seven of thirteen', async () => {
    /* The states added on 1 Sep are the ones the classifier reaches for when a
     * job is WORKING and its registration is merely stale. A CHECK that rejects
     * them does not drop a row: `publish()` sends the reading in one INSERT, so
     * it freezes the entire control plane. */
    const states = [
      'RUNNING_PROGRESSING',
      'RUNNING_STALLED',
      'STARTING',
      'PAUSED',
      'STOPPED',
      'FAILED',
      'UNKNOWN',
      'RUNNING_BY_PROGRESS',
      'STALE_REGISTRATION',
      'RUNNING_REPLAYING',
      'IDLE_CAUGHT_UP',
      'PRESENT',
      'NOT_DECLARED',
    ];
    try {
      await sql.begin(async (tx) => {
        for (const state of states) {
          await tx`
            INSERT INTO ops_job_observations (job_id, owner_lane, state, critical, observer)
            VALUES (${'test-state-' + state}, 'TEST', ${state}, false, 'metrics-job-plane.test.ts')`;
        }
        throw new Rollback();
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
  });
});
