/**
 * Sending the magic link — behind an interface, because the provider is not the
 * interesting part and should never be load-bearing.
 *
 * **Resend, not Postmark.** `CLAUDE.md` §4 named Postmark; the founder asked for
 * an alternative on 7 Aug 2026 and this is the swap, recorded in
 * `docs/OSS_STACK.md`. The reasoning, so the next person does not re-litigate it:
 * self-serve signup with no sales call, 3,000 emails a month free which covers
 * the whole of beta, and **an API that is one HTTP POST** — so this integration
 * adds no dependency at all. MSG91 is the consolidation option later, since it is
 * already the approved vendor for phone OTP and swapping is now a config change
 * rather than a rewrite.
 *
 * No client data goes through here. A magic link carries an email address and a
 * token, never a matter, a party name or a document — so the DPDP residency
 * question that constrains model routing does not arise on this path.
 *
 * **The rule that shapes the whole file: never report a send that did not
 * happen.** A sign-in flow that says "check your email" when nothing was sent
 * strands the advocate in a state they cannot escape and cannot diagnose. So
 * `send` either succeeds or throws, and there is no path that returns success
 * without a provider having accepted the message.
 */

export type MagicLinkEmail = {
  to: string;
  url: string;
  /** Minutes until the link expires. Stated in the email, not left to be guessed. */
  expiresInMinutes: number;
};

export type Mailer = {
  /** The name of the transport that handled it, for the log line. */
  readonly name: string;
  send: (email: MagicLinkEmail) => Promise<void>;
};

const SUBJECT = 'Your Lawmind sign-in link';

function body({ url, expiresInMinutes }: MagicLinkEmail): { html: string; text: string } {
  const text =
    `Sign in to Lawmind\n\n${url}\n\n` +
    `This link expires in ${expiresInMinutes} minutes and can be used once.\n\n` +
    'If you did not ask to sign in, you can ignore this email — nobody can use ' +
    'the link without opening it from your inbox.';

  const html =
    `<p>Sign in to Lawmind.</p>` +
    `<p><a href="${url}">Sign in</a></p>` +
    `<p>This link expires in ${expiresInMinutes} minutes and can be used once.</p>` +
    `<p>If you did not ask to sign in, you can ignore this email — nobody can use ` +
    `the link without opening it from your inbox.</p>` +
    `<p style="color:#666">${url}</p>`;

  return { html, text };
}

/**
 * Resend. `POST https://api.resend.com/emails`, bearer key, JSON body — the
 * shape was read from their API reference, not recalled.
 */
export function resendMailer(apiKey: string, from: string): Mailer {
  return {
    name: 'resend',
    async send(email) {
      const { html, text } = body(email);
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ from, to: email.to, subject: SUBJECT, html, text }),
      });

      if (!response.ok) {
        // The provider's own message, carried through. A generic "email failed"
        // costs an hour of guessing at a domain that was never verified.
        const detail = await response.text().catch(() => '');
        throw new Error(`resend rejected the message: HTTP ${response.status} ${detail}`.trim());
      }
    },
  };
}

/**
 * Development only. Writes the link where the developer can see it.
 *
 * **It announces itself in the log line as a transport that sent nothing**, so a
 * misconfigured production deploy cannot look like a working one. `mailerFrom`
 * below refuses to select this outside development for the same reason.
 */
export function consoleMailer(log: (line: string) => void): Mailer {
  return {
    name: 'console (nothing was sent)',
    async send(email) {
      log(
        `MAGIC LINK for ${email.to} — nothing was emailed, this is the console transport\n${email.url}`,
      );
    },
  };
}

/**
 * Choose a transport, and **fail loudly rather than degrade quietly.**
 *
 * Falling back to the console transport in production would turn a missing
 * environment variable into a product where nobody can sign in and every log line
 * says it worked. An API that cannot send mail should refuse to start, not
 * discover it at the first advocate.
 */
export function mailerFrom(
  env: { resendApiKey: string | undefined; mailFrom: string; nodeEnv: string },
  log: (line: string) => void,
): Mailer {
  if (env.resendApiKey) return resendMailer(env.resendApiKey, env.mailFrom);
  if (env.nodeEnv !== 'production') return consoleMailer(log);
  throw new Error(
    'RESEND_API_KEY is not set and NODE_ENV is production. Refusing to start with no way ' +
      'to send a sign-in link: the console transport would report success while every ' +
      'advocate waited for an email that was never sent.',
  );
}
