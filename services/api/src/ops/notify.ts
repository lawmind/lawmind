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
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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
  const what = alerts.length === 1 ? (alerts[0]?.rule ?? 'alert') : `${alerts.length} conditions`;
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
/**
 * A DURABLE sink on disk. The controlled mailbox, until there is a real one.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT consoleNotifier WITH EXTRA STEPS
 * ---------------------------------------------------------------------------
 *
 * R4's alerting verdict was PARTIAL, and the sentence that mattered was
 * "Nothing was emailed... no human acknowledged a page." Eight assertions passed
 * against a test notifier that existed only for the length of the test. The
 * console transport is weaker still: its output goes to a terminal nobody is
 * watching, and when the process exits no evidence remains that a page was ever
 * raised.
 *
 * This writes one JSON line per delivery to a file that OUTLIVES the process, so
 * "were we ever actually paged, and for what" is answerable by reading a file
 * rather than by trusting somebody's memory of a terminal. That is the property
 * a drill needs and the only one the console cannot provide.
 *
 * ---------------------------------------------------------------------------
 * IT DOES NOT PRETEND TO BE A HUMAN
 * ---------------------------------------------------------------------------
 *
 * The name lands in ops_alert_deliveries.channel, so it says so in the name: a
 * query asking "did a page reach a person" must never be answerable "yes" by
 * this transport. RESEND_API_KEY plus OPS_ALERT_EMAIL remain the only pair that
 * reaches an inbox, and notifierFrom still refuses to start in production
 * without them.
 */
export function fileSinkNotifier(path: string): Notifier {
  return {
    name: `file-sink (durable, no human paged): ${path}`,
    async send(alerts, context) {
      const { text } = alertBody(alerts, context);
      const record = {
        at: new Date().toISOString(),
        environment: context.environment,
        build: context.buildSha,
        injected: context.injected,
        pages: alerts.filter((a) => a.severity === 'page').map((a) => a.rule),
        watches: alerts.filter((a) => a.severity === 'watch').map((a) => a.rule),
        subject: alertSubject(alerts, context),
        alerts,
        text,
      };
      mkdirSync(dirname(path), { recursive: true });
      /* Append, never rewrite. The file IS the receipt history, and rewriting it
       * would destroy the evidence of every earlier drill. */
      appendFileSync(path, JSON.stringify(record) + '\n', 'utf8');
    },
  };
}

export function consoleNotifier(log: (s: string) => void): Notifier {
  return {
    name: 'console (nothing was sent)',
    async send(alerts, context) {
      log(
        `OPS ALERT — nothing was sent, this is the console transport\n${alertBody(alerts, context).text}`,
      );
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
    /** `OPS_ALERT_SINK` — a file that outlives the process. Never a human. */
    opsAlertSinkPath?: string | undefined;
    mailFrom: string;
    nodeEnv: string;
  },
  log: (s: string) => void,
): Notifier {
  if (env.resendApiKey && env.opsAlertEmail) {
    return resendNotifier(env.resendApiKey, env.mailFrom, env.opsAlertEmail);
  }
  /**
   * No inbox configured. Prefer the DURABLE sink over the console, because the
   * difference between them is whether a page leaves any evidence at all once
   * the process exits — and a drill whose only record was a terminal buffer is
   * exactly what R4 called `PARTIAL`.
   *
   * Still not production-eligible: the refusal below is unchanged. This is the
   * named controlled sink, and it says so in its own name.
   */
  if (env.opsAlertSinkPath) return fileSinkNotifier(env.opsAlertSinkPath);
  if (env.nodeEnv !== 'production') return consoleNotifier(log);
  throw new Error(
    'RESEND_API_KEY and OPS_ALERT_EMAIL must both be set when NODE_ENV is production. ' +
      'Refusing to start with no way to raise an alert: the console transport would ' +
      'record every page as delivered while nobody was ever told.',
  );
}
