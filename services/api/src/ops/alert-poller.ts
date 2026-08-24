/**
 * THE POLLER — the thing that was missing between a metric and a human.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES, AND THE THREE THINGS IT REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Runs the SAME collector `GET /admin/metrics` renders, takes the alerts it
 * already decided, and delivers the `page`-severity ones. It evaluates nothing
 * of its own — a poller with its own copy of the thresholds is a poller that
 * will disagree with the endpoint the day one of them changes.
 *
 * **It does not deliver `watch`.** `watch` means something will fail if it
 * continues; it is for a human reading the endpoint, not for waking one. An
 * alerting system that pages on everything is an alerting system that is muted,
 * and then the one that mattered is muted too.
 *
 * **It does not send the same rule twice inside its cooldown.** A disk filling
 * up breaches on every tick for hours. The cooldown is keyed on the RULE rather
 * than on the message, so a detail line that drifts (`p95 18.1s` -> `18.4s`)
 * cannot defeat it.
 *
 * **It does not treat a failed collection as quiet.** `collectMetrics` throwing
 * means we could not look — which is not the same as nothing being wrong, and
 * is exactly the state where an incident is invisible. It becomes its own
 * alert, `metricsUnavailable`, with the same cooldown as everything else.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DELIVERY IS RECORDED, INCLUDING WHEN IT FAILS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every attempt writes `ops_alert_deliveries`, success or failure, with the
 * transport name and the provider's own error. "Was anyone actually told" has to
 * be answerable by query. An alert whose delivery failed silently is worse than
 * no alert at all, because the absence of a page reads as "nothing was wrong".
 *
 * A failure does NOT advance the cooldown — the row is written with `failure`
 * set and the next tick tries again. Recording an attempt as if it had landed
 * is the same lie in a different place.
 */
import type { Sql } from 'postgres';

import { collectMetrics, type MetricsDeps } from '../admin/metrics.ts';
import { buildSha } from '../build-info.ts';
import type { Notifier, OpsAlert } from './notify.ts';

/**
 * How long a rule stays quiet after a successful page.
 *
 * Long enough that a persistent condition does not become a mailing list, short
 * enough that a real incident is repeated while it is still happening. Two hours
 * is roughly "you will be reminded before the next shift", and it is one
 * constant rather than a per-rule table because a per-rule table is a thing to
 * argue about rather than act on.
 */
export const ALERT_COOLDOWN_MINUTES = 120;

export type PollResult = {
  /** Every alert the collector produced, both severities. */
  evaluated: OpsAlert[];
  /**
   * False when the cooldown could not be read or the delivery could not be
   * recorded. The page still went out — see the note in `pollAndDeliver` — but
   * the record of it did not, so a later "were we told" query will be short.
   */
  ledgerReadable: boolean;
  /** `page` severity, minus anything inside its cooldown. */
  delivered: OpsAlert[];
  suppressed: OpsAlert[];
  /** Set when delivery was attempted and the transport refused. */
  failure: string | null;
  channel: string;
};

async function rulesInCooldown(sql: Sql, rules: readonly string[]): Promise<Set<string>> {
  if (rules.length === 0) return new Set();
  const rows = await sql<{ rule: string }[]>`
    SELECT DISTINCT rule FROM ops_alert_deliveries
     WHERE rule = ANY(${[...rules]})
       AND failure IS NULL
       AND delivered_at > now() - (${ALERT_COOLDOWN_MINUTES} || ' minutes')::interval`;
  return new Set(rows.map((r) => r.rule));
}

async function record(
  sql: Sql,
  alerts: readonly OpsAlert[],
  channel: string,
  failure: string | null,
  injected: boolean,
): Promise<void> {
  if (alerts.length === 0) return;
  await sql`
    INSERT INTO ops_alert_deliveries ${sql(
      alerts.map((a) => ({
        rule: a.rule,
        severity: a.severity,
        detail: a.detail,
        channel,
        failure,
        injected,
      })),
    )}`;
}

export type PollOptions = {
  /**
   * A deliberately injected condition, for proving the path end to end.
   *
   * It travels through the SAME cooldown, the SAME transport and the SAME
   * ledger as a real page — a drill that takes a shortcut proves the shortcut.
   * It is marked `injected` in the ledger and says DRILL in the subject, so it
   * can never be mistaken for an incident by someone reading either one later.
   */
  inject?: OpsAlert | undefined;
  environment?: string | undefined;
  metrics?: MetricsDeps | undefined;
};

export async function pollAndDeliver(
  sql: Sql,
  notifier: Notifier,
  options: PollOptions = {},
): Promise<PollResult> {
  const injected = options.inject !== undefined;
  let evaluated: OpsAlert[];

  try {
    const snapshot = await collectMetrics(sql, options.metrics ?? {});
    evaluated = snapshot.alerts;
  } catch (error) {
    /**
     * Could not look. Not the same as nothing wrong, and the one state where an
     * incident is guaranteed to be invisible — so it is promoted to a page in
     * its own right rather than logged and swallowed.
     */
    evaluated = [
      {
        severity: 'page',
        rule: 'metricsUnavailable',
        detail: `the metrics collector failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }

  if (options.inject) evaluated = [...evaluated, options.inject];

  const pages = evaluated.filter((a) => a.severity === 'page');

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * A LEDGER WE CANNOT READ MUST NOT SILENCE THE PAGE
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Found by the test rather than by design. The cooldown and the delivery
   * record both live in the database this poller is monitoring — so the one
   * case where the alert matters most, the database being unreachable, was also
   * the case where reading the cooldown threw and nothing was ever sent.
   *
   * So both the read and the write are allowed to fail independently of the
   * send. **A duplicate page is a nuisance; a missing one is the incident
   * nobody hears about**, and that asymmetry decides the direction: an
   * unreadable ledger means NOTHING is in cooldown, and everything goes out.
   */
  let cooling: Set<string>;
  let ledgerReadable = true;
  try {
    cooling = await rulesInCooldown(
      sql,
      pages.map((a) => a.rule),
    );
  } catch {
    cooling = new Set();
    ledgerReadable = false;
  }
  const suppressed = pages.filter((a) => cooling.has(a.rule));
  const delivered = pages.filter((a) => !cooling.has(a.rule));

  if (delivered.length === 0) {
    return {
      evaluated,
      ledgerReadable,
      delivered: [],
      suppressed,
      failure: null,
      channel: notifier.name,
    };
  }

  let failure: string | null = null;
  try {
    await notifier.send(delivered, {
      environment: options.environment ?? process.env['NODE_ENV'] ?? 'development',
      buildSha,
      injected,
    });
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  /* Same reasoning as the cooldown read: if the ledger cannot be written the
   * page has still been sent, and losing the audit row is the smaller loss. */
  try {
    await record(sql, delivered, notifier.name, failure, injected);
  } catch {
    ledgerReadable = false;
  }

  return {
    ledgerReadable,
    evaluated,
    // Honest about what actually landed: a refused send delivered nothing.
    delivered: failure === null ? delivered : [],
    suppressed,
    failure,
    channel: notifier.name,
  };
}
