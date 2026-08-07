import type { Matter } from '../../api/contract';
import { describeHearingDate, formatLong, parseCivilDate, todayCivil, type CivilDate } from '../../theme/hearingDate';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CLIENT UPDATE — the only Lawmind surface a non-user ever sees.
 *
 * `PRODUCT_BRIEF.md`: "The advocate's name is prominent and ours is small.
 * Reverse that and it becomes an advertisement, advocates stop sending it, and
 * the one organic channel we have closes."
 *
 * This module holds the WORDS and nothing else — no view, no share sheet — so
 * the copy can be asserted character by character in a test. What goes to a
 * client is the one output in this product that cannot be corrected after it is
 * sent, and it is read by somebody with no legal training who is anxious about
 * their case.
 *
 * THE RULES THE COPY OBEYS, all from `PRODUCT_BRIEF.md` §What we are not:
 *
 *   · It is not legal advice, and it never reads as advice TO the client. It
 *     reports what the court did and what happens next. "The court will hear the
 *     bail application" is a fact; "you should do X" is advice and is never
 *     produced here.
 *   · No citations. A client cannot check one and it would frighten rather than
 *     inform. This is the one surface in the product that carries none, which is
 *     also why it needs no verification treatment.
 *   · No case number in any filename or subject line — a matter title in a
 *     WhatsApp preview on a shared phone is a confidentiality problem.
 *   · Plain dates, written out. "13 August 2026", never "13/08" — ambiguous
 *     across conventions and unreadable to somebody scanning it on a phone.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ClientUpdate = {
  eyebrow: string;
  advocateName: string;
  caseTitle: string;
  /** What happened, in one sentence. */
  whatHappened: string;
  whatHappensNextLabel: string;
  /** One or two short lines. Never more — this is read on a phone in a queue. */
  whatHappensNext: string[];
  sentBy: string;
  sentOn: string;
  /** Ours, and deliberately the smallest thing on the card. */
  footer: string;
};

export const CLIENT_CARD_FOOTER = 'Prepared with Lawmind';

/**
 * Renders the update from the matter row and the outcome the advocate recorded.
 *
 * `nextHearingDate` may be null — a matter heard with orders reserved has no
 * next date, and the copy says exactly that rather than leaving a blank where a
 * date should be. A client reading a missing date assumes the worst.
 */
export function buildClientUpdate(input: {
  matter: Matter;
  advocateName: string;
  /** What happened at this hearing. */
  outcome: 'adjourned' | 'heard' | 'listed';
  /** The date the hearing took place. Defaults to today. */
  hearingDate?: string;
  today?: CivilDate;
}): ClientUpdate {
  const today = input.today ?? todayCivil();
  const heardOn = parseCivilDate(input.hearingDate ?? '') ?? today;
  const next = parseCivilDate(input.matter.nextHearingDate ?? '');

  const whatHappened = (() => {
    switch (input.outcome) {
      case 'adjourned':
        return next
          ? `The matter was heard on ${formatLong(heardOn)} and has been listed for ${formatLong(next)}.`
          : `The matter was heard on ${formatLong(heardOn)}. The next date has not yet been given.`;
      case 'heard':
        return `The matter was heard on ${formatLong(heardOn)} and the court has reserved its order.`;
      case 'listed':
        return next
          ? `The matter is listed for ${formatLong(next)}.`
          : 'The matter is pending before the court.';
    }
  })();

  const whatHappensNext = (() => {
    switch (input.outcome) {
      case 'adjourned':
        return next
          ? ['The court will take up the matter on the next date.', 'Nothing is required from you before that date.']
          : ['We will inform you as soon as the next date is given.'];
      case 'heard':
        return [
          'The court will deliver its order.',
          'We will inform you as soon as it is pronounced.',
        ];
      case 'listed':
        return next
          ? [`The court will take up the matter ${describeHearingDate(input.matter.nextHearingDate!, today).toLowerCase()}.`]
          : ['We will inform you when a date is given.'];
    }
  })();

  return {
    eyebrow: 'Case update',
    advocateName: input.advocateName,
    caseTitle: input.matter.caseTitle,
    whatHappened,
    whatHappensNextLabel: 'What happens next',
    whatHappensNext,
    sentBy: input.advocateName,
    sentOn: formatLong(today),
    footer: CLIENT_CARD_FOOTER,
  };
}

/**
 * THE PLAIN-TEXT FALLBACK.
 *
 * The design specifies an IMAGE — it renders in the thread, survives forwarding,
 * and can be shown across a desk. Image capture needs a native module that is
 * not in this build (see `docs/FOUNDER_QUEUE.md`), so until it is, the advocate
 * sends text.
 *
 * The text is NOT a degraded caption for a missing picture. It carries the same
 * sentences in the same order, so what a client receives is complete either way;
 * what is lost is the typography and the advocate's name at the top, which is a
 * marketing loss rather than an information one. Saying which is which is the
 * point of writing this down.
 */
export function clientUpdateAsText(update: ClientUpdate): string {
  return [
    `${update.caseTitle}`,
    '',
    update.whatHappened,
    '',
    `${update.whatHappensNextLabel}:`,
    ...update.whatHappensNext.map((line) => `— ${line}`),
    '',
    `Sent by ${update.sentBy}, ${update.sentOn}`,
  ].join('\n');
}
