/**
 * `alert-poller-cli` — the scheduled half of operational alerting.
 *
 * One tick. Collect, decide, deliver, exit. Scheduling belongs to the platform
 * (`schtasks` locally, `DEPLOYMENT.md` §cron in a deployment), not to a daemon
 * this repo has to keep alive — a watchdog that needs its own watchdog is how
 * `.agents/logs` ended up with a keeper that logged "relaunch issued" 51 times
 * over four hours while the thing it watched was dead.
 *
 *   npx tsx src/ops/alert-poller-cli.ts
 *   npx tsx src/ops/alert-poller-cli.ts --inject   # prove the path end to end
 *
 * `--inject` adds a synthetic `page` condition and lets it travel the SAME
 * cooldown, transport and ledger as a real one. It is marked `injected` in
 * `ops_alert_deliveries` and says DRILL in the subject: a drill that takes a
 * shortcut proves the shortcut, and a drill that cannot be told from an
 * incident poisons the record.
 *
 * Exit code is the operator-facing signal: 0 nothing to send or sent, 1 a
 * delivery was attempted and REFUSED. A scheduler that only watches exit codes
 * still learns the thing that matters most — that we could not raise the alarm.
 */
import postgres from 'postgres';

import { pollAndDeliver } from './alert-poller.ts';
import { notifierFrom } from './notify.ts';

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const inject = argv.includes('--inject');
  /**
   * Name the injected condition, so a drill matrix leaves a receipt per
   * condition instead of six identical `injectedDrill` lines.
   *
   * `--inject-rule lowDisk` reads back out of `.agents/ops/alerts.jsonl` as
   * `lowDisk`, which is what makes "which conditions have we actually drilled"
   * a question the file can answer.
   */
  const ruleIndex = argv.indexOf('--inject-rule');
  const injectRule = ruleIndex === -1 ? undefined : argv[ruleIndex + 1];
  const injectDetail = injectRule
    ? `DRILL of ${injectRule}, injected by alert-poller-cli --inject-rule`
    : undefined;

  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');

  /**
   * A small, separate pool. The poller runs while the box is under whatever
   * pressure it is alerting about, and it must not be the request that finally
   * exhausts the connections it is reporting on.
   */
  const sql = postgres(url, { max: 2, onnotice: () => {} });

  const notifier = notifierFrom(
    {
      resendApiKey: process.env['RESEND_API_KEY'],
      opsAlertEmail: process.env['OPS_ALERT_EMAIL'],
      /* Defaulted rather than left unset: a scheduled tick with no sink writes
       * its pages to a console nobody reads, which is indistinguishable from not
       * having run. */
      opsAlertSinkPath: process.env['OPS_ALERT_SINK'] ?? '.agents/ops/alerts.jsonl',
      mailFrom: process.env['MAIL_FROM'] ?? 'alerts@lawmind.in',
      nodeEnv: process.env['NODE_ENV'] ?? 'development',
    },
    (line) => console.log(line),
  );

  try {
    const result = await pollAndDeliver(sql, notifier, {
      inject:
        inject || injectRule
          ? {
              severity: 'page',
              rule: injectRule ?? 'injectedDrill',
              detail:
                injectDetail ??
                'deliberately injected by alert-poller-cli --inject to prove the delivery path',
            }
          : undefined,
    });

    console.log(
      JSON.stringify(
        {
          at: new Date().toISOString(),
          channel: result.channel,
          evaluated: result.evaluated,
          delivered: result.delivered.map((a) => a.rule),
          suppressedByCooldown: result.suppressed.map((a) => a.rule),
          failure: result.failure,
        },
        null,
        2,
      ),
    );

    if (result.failure !== null) {
      console.error(
        `DELIVERY FAILED — ${result.delivered.length === 0 ? 'nobody was told' : ''} ${result.failure}`,
      );
      return 1;
    }
    return 0;
  } finally {
    await sql.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
