/**
 * Expo push — behind an interface, like the mailer, for the same reason.
 *
 * **No credential is required.** The Expo push service accepts unauthenticated
 * `POST https://exp.host/--/api/v2/push/send`; an access token is needed only if
 * the project opts into enhanced security. `EXPO_ACCESS_TOKEN` is therefore
 * optional and is sent as a bearer when present. Verified against Expo's own
 * documentation rather than assumed — this was nearly written off as blocked on a
 * credential that turns out not to be needed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PD-6 — CADENCE IS THE PRODUCT DECISION, NOT THE TRANSPORT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Alerts are **batched into the evening briefing**. Exactly two things push
 * immediately: `set_aside` on a citation in an **exported** draft, and a newly
 * discovered listing for **tomorrow**. Nothing else, ever.
 *
 * "A wrong cadence trains advocates to disable notifications permanently, and
 * they do not come back." That is why this module sends **one push per advocate**
 * covering all of tomorrow's hearings rather than one per matter. An advocate
 * with four listings gets one notification, not four.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A DEAD TOKEN IS CLEARED, NOT RETRIED FOREVER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Expo answers per message with a ticket. `DeviceNotRegistered` means the app was
 * uninstalled or the token rotated, and it will never succeed again. The caller
 * clears it, because a token retried nightly forever is a permanent error rate
 * that hides real failures inside noise.
 */

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export type PushTicket =
  | { to: string; ok: true; id: string }
  /** `deviceGone` is separated because it is the only one the caller ACTS on. */
  | { to: string; ok: false; deviceGone: boolean; message: string };

export type Pusher = {
  readonly name: string;
  send: (messages: PushMessage[]) => Promise<PushTicket[]>;
};

/** Expo accepts at most 100 messages per request. */
const CHUNK = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function expoPusher(accessToken?: string): Pusher {
  return {
    name: accessToken ? 'expo (authenticated)' : 'expo',
    async send(messages) {
      const tickets: PushTicket[] = [];

      for (const batch of chunk(messages, CHUNK)) {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(batch),
        });

        if (!response.ok) {
          // The whole batch failed — a transport error, not a per-device verdict.
          // Reported per message so the caller's accounting stays whole, and
          // deviceGone is false because nothing here says the device is gone.
          const detail = await response.text().catch(() => '');
          for (const m of batch) {
            tickets.push({
              to: m.to,
              ok: false,
              deviceGone: false,
              message: `expo rejected the batch: HTTP ${response.status} ${detail}`.trim(),
            });
          }
          continue;
        }

        const body = (await response.json()) as {
          data?: { status: string; id?: string; message?: string; details?: { error?: string } }[];
        };
        const results = body.data ?? [];

        batch.forEach((m, i) => {
          const r = results[i];
          if (!r) {
            // Expo returned fewer tickets than messages. Never silently drop the
            // difference: an unaccounted message is indistinguishable from a
            // delivered one, and the sweep counts on the arithmetic holding.
            tickets.push({
              to: m.to,
              ok: false,
              deviceGone: false,
              message: 'expo returned no ticket for this message',
            });
            return;
          }
          if (r.status === 'ok' && r.id) {
            tickets.push({ to: m.to, ok: true, id: r.id });
            return;
          }
          tickets.push({
            to: m.to,
            ok: false,
            deviceGone: r.details?.error === 'DeviceNotRegistered',
            message: r.message ?? r.details?.error ?? 'unknown push error',
          });
        });
      }

      return tickets;
    },
  };
}

/**
 * Development only. Prints what would have been sent.
 *
 * Announces itself as a transport that delivered nothing, so a misconfigured
 * production deploy cannot read as a working one — the same rule the mailer
 * follows.
 */
export function consolePusher(log: (line: string) => void): Pusher {
  return {
    name: 'console (nothing was delivered)',
    async send(messages) {
      for (const m of messages) log(`PUSH → ${m.to}: ${m.title} — ${m.body}`);
      return messages.map((m) => ({ to: m.to, ok: true as const, id: 'console' }));
    },
  };
}

/**
 * Choose a transport.
 *
 * Unlike mail, production does NOT require a credential here — Expo sends
 * unauthenticated — so production always gets the real pusher and there is no
 * silent-degradation path to guard against.
 */
export function pusherFrom(
  env: { expoAccessToken: string | undefined; nodeEnv: string },
  log: (line: string) => void,
): Pusher {
  if (env.nodeEnv === 'production') return expoPusher(env.expoAccessToken);
  return consolePusher(log);
}

/**
 * The evening briefing notification.
 *
 * Deliberately plain. It says how many hearings and names one, because a
 * notification an advocate has to open to understand is a notification that
 * teaches them opening it is optional.
 */
export function briefingPush(
  token: string,
  hearings: { caseTitle: string; court: string }[],
  hearingDate: string,
): PushMessage {
  const first = hearings[0];
  const body =
    hearings.length === 1 && first
      ? `${first.caseTitle} at ${first.court}. Your briefing is ready.`
      : `${hearings.length} hearings tomorrow, including ${first?.caseTitle ?? ''}. Your briefings are ready.`;

  return {
    to: token,
    title: 'Tomorrow in court',
    body,
    // The client opens straight to the day rather than to a list the advocate
    // then has to navigate at 7am.
    data: { type: 'briefing', hearingDate },
  };
}
