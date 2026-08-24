/**
 * Operational alert delivery.
 *
 * The property under test is not "an alert object was constructed". It is that
 * **a human is told, once, and that the record says whether they were** — the
 * three ways alerting fails quietly:
 *
 *   1. it pages on every tick until the mailbox filters it;
 *   2. delivery fails and the absence reads as "nothing was wrong";
 *   3. the collector cannot run, and "no alerts" is indistinguishable from
 *      "could not look".
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import postgres from 'postgres';

import { ALERT_COOLDOWN_MINUTES, pollAndDeliver } from './alert-poller.ts';
import { alertBody, alertSubject, notifierFrom, type Notifier, type OpsAlert } from './notify.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 3, onnotice: () => {} });

const DRILL: OpsAlert = {
  severity: 'page',
  rule: 'testInjectedRule',
  detail: 'injected by alert-poller.test.ts',
};

/** A transport that records rather than sends, and one that always refuses. */
function capturing(): Notifier & { sent: OpsAlert[][] } {
  const sent: OpsAlert[][] = [];
  return {
    name: 'test-capture',
    sent,
    async send(alerts) {
      sent.push([...alerts]);
    },
  };
}

const refusing: Notifier = {
  name: 'test-refusing',
  async send() {
    throw new Error('HTTP 403 domain is not verified');
  },
};

async function clearRule(rule: string) {
  await sql`DELETE FROM ops_alert_deliveries WHERE rule = ${rule}`;
}

describe('operational alert delivery', () => {
  before(async () => {
    await clearRule(DRILL.rule);
  });

  after(async () => {
    await clearRule(DRILL.rule);
    await sql.end();
  });

  it('delivers an injected page through the real path and records it', async () => {
    const notifier = capturing();
    const result = await pollAndDeliver(sql, notifier, { inject: DRILL });

    assert.ok(
      notifier.sent.length === 1,
      'the transport was never called — nothing reached a human',
    );
    assert.ok(
      notifier.sent[0]?.some((a) => a.rule === DRILL.rule),
      'the injected condition did not reach the transport',
    );
    assert.equal(result.failure, null);

    const [row] = await sql<{ channel: string; injected: boolean; failure: string | null }[]>`
      SELECT channel, injected, failure FROM ops_alert_deliveries
       WHERE rule = ${DRILL.rule} ORDER BY delivered_at DESC LIMIT 1`;
    assert.ok(row, 'delivery was not recorded — "was anyone told" must be answerable by query');
    assert.equal(row.channel, 'test-capture');
    // A drill must be distinguishable from an incident by someone reading this
    // table six months later.
    assert.equal(row.injected, true);
    assert.equal(row.failure, null);
  });

  it('does not page twice for the same rule inside the cooldown', async () => {
    // The first delivery is still on the ledger from the test above.
    const notifier = capturing();
    const result = await pollAndDeliver(sql, notifier, { inject: DRILL });

    assert.equal(notifier.sent.length, 0, 'a second page was sent inside the cooldown');
    assert.ok(
      result.suppressed.some((a) => a.rule === DRILL.rule),
      'the suppression must be reported, not silent',
    );
    assert.ok(ALERT_COOLDOWN_MINUTES > 0);
  });

  it('records a REFUSED delivery and does not let it start a cooldown', async () => {
    await clearRule(DRILL.rule);
    const result = await pollAndDeliver(sql, refusing, { inject: DRILL });

    assert.match(result.failure ?? '', /domain is not verified/);
    assert.equal(
      result.delivered.length,
      0,
      'a refused send delivered nothing and must not be reported as delivered',
    );

    const [row] = await sql<{ failure: string | null }[]>`
      SELECT failure FROM ops_alert_deliveries
       WHERE rule = ${DRILL.rule} ORDER BY delivered_at DESC LIMIT 1`;
    assert.match(row?.failure ?? '', /domain is not verified/);

    /**
     * The load-bearing half: a failed attempt must NOT count as a page, or the
     * cooldown silences the retry and the incident is never reported at all.
     */
    const notifier = capturing();
    await pollAndDeliver(sql, notifier, { inject: DRILL });
    assert.equal(notifier.sent.length, 1, 'a failed delivery started a cooldown');
    await clearRule(DRILL.rule);
  });

  it('turns a collector that cannot run into an alert of its own', async () => {
    /**
     * "No alerts" and "could not look" are the same silence, and the second is
     * the state where an incident is guaranteed to be invisible.
     */
    const broken = postgres('postgresql://nobody@127.0.0.1:1/nothing', {
      max: 1,
      onnotice: () => {},
      connect_timeout: 2,
    });
    const notifier = capturing();
    try {
      const result = await pollAndDeliver(broken, notifier, {});
      assert.ok(
        result.evaluated.some((a) => a.rule === 'metricsUnavailable' && a.severity === 'page'),
        'a failed collection was treated as quiet',
      );
      /**
       * And it must still SEND. The cooldown and the delivery record both live
       * in the database being monitored, so the one case where this alert
       * matters most was also the case where reading the cooldown threw and
       * nothing went out. A duplicate page is a nuisance; a missing one is the
       * incident nobody hears about.
       */
      assert.equal(notifier.sent.length, 1, 'the database was down and no page was sent');
      assert.equal(result.ledgerReadable, false, 'an unreadable ledger must be reported as such');
    } finally {
      await broken.end().catch(() => {});
    }
  });
});

describe('the alert message itself', () => {
  it('says DRILL when it is one, and names the environment and build', () => {
    const context = { environment: 'staging', buildSha: 'abc1234', injected: true };
    assert.match(alertSubject([DRILL], context), /^DRILL — /);
    const { text } = alertBody([DRILL], context);
    assert.match(text, /INJECTED TEST CONDITION/);
    assert.match(text, /staging/);
    assert.match(text, /abc1234/);
  });

  it('does not say DRILL for a real page', () => {
    const context = { environment: 'production', buildSha: 'abc1234', injected: false };
    assert.doesNotMatch(alertSubject([DRILL], context), /DRILL/);
    assert.doesNotMatch(alertBody([DRILL], context).text, /INJECTED/);
  });
});

describe('transport selection', () => {
  it('refuses to start in production with no way to raise an alarm', () => {
    /**
     * The `packages/auth/src/mail.ts` rule, applied to alerting: falling back to
     * a console transport in production would record every page as delivered
     * while nobody was ever told — worse than having no alerting, because the
     * absence of a page reads as "nothing is wrong".
     */
    assert.throws(
      () =>
        notifierFrom(
          {
            resendApiKey: undefined,
            opsAlertEmail: undefined,
            mailFrom: 'a@b.c',
            nodeEnv: 'production',
          },
          () => {},
        ),
      /Refusing to start/,
    );
    // Having a key is not the same as knowing who to wake.
    assert.throws(
      () =>
        notifierFrom(
          {
            resendApiKey: 'key',
            opsAlertEmail: undefined,
            mailFrom: 'a@b.c',
            nodeEnv: 'production',
          },
          () => {},
        ),
      /OPS_ALERT_EMAIL/,
    );
  });

  it('names the console transport as one that sent nothing', () => {
    const n = notifierFrom(
      {
        resendApiKey: undefined,
        opsAlertEmail: undefined,
        mailFrom: 'a@b.c',
        nodeEnv: 'development',
      },
      () => {},
    );
    // This string lands in ops_alert_deliveries.channel, so a query for "were
    // we ever actually paged" cannot be answered wrongly by this transport.
    assert.match(n.name, /nothing was sent/);
  });
});
