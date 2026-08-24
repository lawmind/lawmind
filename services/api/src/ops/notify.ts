/**
 * GETTING AN ALERT TO A HUMAN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SEPARATE FILE FROM THE METRICS THAT PRODUCE THE ALERTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `admin/metrics.ts` has evaluated `ALERT_RULES` since the day it was written,
 * and until now **nothing delivered one**. `GET /admin/metrics` returns
 * `alerts[]` to whoever asks, and nobody asks at 3 a.m. Metrics without
 * notification are not incident response; they are a log line with better
 * formatting.
 *
 * The conditions stay where they are — next to the numbers they judge — and this
 * file does one thing: take an alert that has already been decided and put it in
 * front of a person.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE THIS FILE IS SHAPED BY, INHERITED FROM `packages/auth/src/mail.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **Never report a send that did not happen.**
 *
 * A mailer that silently falls back to the console turns a missing environment
 * variable into a system where every alert is "delivered" and no one is ever
 * told. That failure is worse than having no alerting at all, because the
 * absence of a page reads as "nothing is wrong". So:
 *
 *   * `send` either succeeds or throws — there is no path that returns success
 *     without a provider having accepted the message;
 *   * the console transport NAMES ITSELF as a transport that sent nothing, and
 *     that name is written into `ops_alert_deliveries.channel`, so a drill
 *     against a misconfigured environment cannot be mistaken for a real page;
 *   * `notifierFrom` REFUSES to select the console transport in production.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY RESEND AND NOT A PAGING VENDOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The plan is explicit that no paid observability vendor is required yet, and
 * Resend is already the approved transport with a key already in the
 * environment. One HTTP POST, no new dependency, no new account, no new bill.
 * PagerDuty or an SMS escalation is a later swap behind this same interface —
 * which is the point of there being an interface for a single implementation.
 */

/** An alert that has already been judged. This file does not evaluate rules. */
export type OpsAlert = {
  severity: 'page' | 'watch';
  /** The `ALERT_RULES` key. The cooldown is keyed on this. */
  rule: string;
  detail: string;
};

export type Notifier = {
  /** Named in the delivery ledger. A transport that sends nothing says so here. */
  readonly name: string;
  send: (alerts: readonly OpsAlert[], context: NotifyContext) => Promise<void>;
};

export type NotifyContext = {
  /** Which deployment is shouting. An alert with no origin is a puzzle. */
  environment: string;
  buildSha: string;
  /** True for a deliberately injected drill. Said in the subject, not implied. */
  injected: boolean;
};

const line = (a: OpsAlert) => `[${a.severity.toUpperCase()}] ${a.rule} — ${a.detail}`;

export function alertSubject(alerts: readonly OpsAlert[], context: NotifyContext): string {
  const pages = alerts.filter((a) => a.severity === 'page').length;
  const prefix = context.injected ? 'DRILL — ' : '';
  const what =
    alerts.length === 1 ? (alerts[0]?.rule ?? 'alert') : `${alerts.length} conditions`;
  return `${prefix}Lawmind ${context.environment}: ${pages} page — ${what}`;
}

export function alertBody(
  alerts: readonly OpsAlert[],
  context: NotifyContext,
): { text: string; html: string } {
  /**
   * Plain, and deliberately ugly. This is read on a phone at an hour when
   * nobody is reading carefully, so it says WHAT and WHERE and nothing else.
   * No dashboard link — there is no dashboard, and a link to one that does not
   * exist is the kind of small lie that makes the next alert less believed.
   */
  const head = context.injected
    ? 'THIS IS AN INJECTED TEST CONDITION. No advocate is affected.'
    : 'Lawmind operational alert.';

  const text = [
    head,
    '',
    ...alerts.map(line),
    '',
    `environment: ${context.environment}`,
    `build: ${context.buildSha}`,
    `at: ${new Date().toISOString()}`,
    '',
    'Conditions are evaluated in services/api/src/admin/metrics.ts (ALERT_RULES).',
    'Full current state: GET /admin/metrics.',
  ].join('\n');

  const html =
    `<p><strong>${head}</strong></p><ul>` +
    alerts.map((a) => `<li>${line(a)}</li>`).join('') +
    `</ul><p style="color:#666">${context.environment} · ${context.buildSha} · ` +
    `${new Date().toISOString()}</p>`;

  return { text, html };
}

/**
 * Resend. `POST https://api.resend.com/emails`, bearer key, JSON body — the same
 * call `packages/auth/src/mail.ts` makes, and the shape was taken from there
 * rather than recalled.
 */
export function resendNotifier(apiKey: string, from: string, to: string): Notifier {
  return {
    name: 'resend',
    async send(alerts, context) {
      const { text, html } = alertBody(alerts, context);
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from,
          to,
          subject: alertSubject(alerts, context),
          html,
          text,
        }),
      });
      if (!response.ok) {
        // The provider's own words. A generic "delivery failed" costs an hour
        // of guessing at a domain that was never verified.
        const detail = await response.text().catch(() => '');
        throw new Error(`resend rejected the alert: HTTP ${response.status} ${detail}`.trim());
      }
    },
  };
}

/**
 * Development only, and it announces that it sent nothing.
 *
 * The name is what lands in `ops_alert_deliveries.channel`, so a query for
 * "were we ever actually paged" cannot be answered wrongly by this transport.
 */
export function consoleNotifier(log: (s: string) => void): Notifier {
  return {
    name: 'console (nothing was sent)',
    async send(alerts, context) {
      log(`OPS ALERT — nothing was sent, this is the console transport\n${alertBody(alerts, context).text}`);
    },
  };
}

/**
 * Choose a transport, and fail loudly rather than degrade quietly.
 *
 * `OPS_ALERT_EMAIL` is required separately from `RESEND_API_KEY`: having a way
 * to send mail is not the same as knowing who to wake, and defaulting to the
 * sign-in `from` address would deliver every page to a mailbox nobody reads.
 */
export function notifierFrom(
  env: {
    resendApiKey: string | undefined;
    opsAlertEmail: string | undefined;
    mailFrom: string;
    nodeEnv: string;
  },
  log: (s: string) => void,
): Notifier {
  if (env.resendApiKey && env.opsAlertEmail) {
    return resendNotifier(env.resendApiKey, env.mailFrom, env.opsAlertEmail);
  }
  if (env.nodeEnv !== 'production') return consoleNotifier(log);
  throw new Error(
    'RESEND_API_KEY and OPS_ALERT_EMAIL must both be set when NODE_ENV is production. ' +
      'Refusing to start with no way to raise an alert: the console transport would ' +
      'record every page as delivered while nobody was ever told.',
  );
}
