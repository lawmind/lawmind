import type { Alert, OverruledStatus } from '../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A CITATOR ALERT SAYS — the one place it is decided.
 *
 * An alert is a report of a CHANGE. `services/api/src/citations/fanout.ts`
 * writes `fromStatus` and `toStatus` into the payload for that reason, and
 * `alerts/route.ts` adds `currentOverruledStatus` — "what the corpus says RIGHT
 * NOW — may differ from `toStatus` above."
 *
 * Until 11 Aug 2026 the client rendered ONLY the current status: "an authority
 * you saved is now doubted." Three things were lost by that, and each is a
 * different way of overstating what we know.
 *
 *   1. THE MOVEMENT ITSELF. An authority that went from `doubted` to
 *      `set_aside` and one that went from good law to `set_aside` are different
 *      events for an advocate mid-brief, and both read identically.
 *   2. THE DISAGREEMENT. When `currentOverruledStatus` differs from `toStatus`
 *      the corpus has moved again since the alert fired. Rendering only the
 *      current value silently discards the alert's own subject; rendering only
 *      `toStatus` would present a superseded reading as current. Both are said.
 *   3. WHICH PARAGRAPHS. `partly_set_aside` without the paragraphs is the
 *      alarming half of the fact with the useful half removed.
 *
 * AND ONE THING WAS INVENTED. `currentOverruledStatus: 'none'` rendered as
 * "is now good law again" — a claim that a court restored the authority. The
 * server never says that: `fanout.ts` notes `none` cannot even be a
 * `toStatus`, so a current reading of `none` means the CORPUS changed, which
 * may be a data correction and not a judicial act. It now says what we actually
 * observed — the record no longer shows it as moved — and nothing more.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * The status as a phrase that reads inside a sentence. Never a bare enum.
 *
 * THREE STATES ONLY, AND `none` IS DELIBERATELY NOT ONE OF THEM.
 *
 * A first draft returned "good law" for `none` and `citation/adversarial.test.ts`
 * refused it — REB §6 and `CITATION_HARNESS.md`: verified is SILENT, and a
 * positive stamp is the one thing this product does not print, because a stamp
 * is what an advocate relies on instead of reading. That is right even inside a
 * past-tense sentence: "it was good law when you used it" is still us vouching
 * for a state, and we only ever mark the exceptions.
 *
 * So `none` is expressed by SENTENCE STRUCTURE below — "since you used it" —
 * which says our record did not show it as moved without claiming it was sound.
 */
export function statusPhrase(status: Exclude<OverruledStatus, 'none'>): string {
  switch (status) {
    case 'set_aside':
      return 'set aside';
    case 'partly_set_aside':
      return 'partly set aside';
    case 'doubted':
      return 'doubted';
  }
}

/** "paras 19–20", "para 19", or null when the server named none. */
function affectedParagraphs(paras: number[] | null | undefined): string | null {
  if (!paras?.length) return null;
  if (paras.length === 1) return `para ${paras[0]}`;
  return `paras ${paras[0]}–${paras[paras.length - 1]}`;
}

export type AlertNarrative = {
  /** The authority, and how the advocate is connected to it. */
  headline: string;
  /** The change this alert reports. Always the alert's own subject. */
  movement: string;
  /**
   * Set ONLY when the corpus has moved again since the alert fired. Its
   * presence is the whole point: an alert whose subject is no longer the
   * current reading must not be shown as if it were.
   */
  sinceThen?: string;
};

export function alertNarrative(alert: Alert): AlertNarrative {
  const relation =
    alert.kind === 'saved_authority_moved'
      ? 'An authority you saved'
      : 'An authority you filed';

  const affected = affectedParagraphs(alert.overruledParas);

  /**
   * `toStatus` can only be one of the three moved states — `fanout.ts` never
   * writes an alert for a flip back to `none` — but the wire type is the full
   * union, so this narrows rather than asserts. An alert that somehow carried
   * `none` says the smaller true thing instead of throwing on a citation
   * surface.
   */
  if (alert.toStatus === 'none') {
    return {
      headline: `${alert.judgmentTitle} — ${relation.toLowerCase()}`,
      movement: 'Its good-law status changed. Open it to see the current position.',
    };
  }

  const to = statusPhrase(alert.toStatus);

  /**
   * The paragraphs belong to the `partly_set_aside` reading and to no other.
   * Attaching them to a whole set-aside would imply a limit that does not
   * exist, which is the more dangerous direction of the two.
   */
  const toWithExtent =
    alert.toStatus === 'partly_set_aside' && affected ? `${to} — ${affected}` : to;

  /**
   * NO POSITIVE CLAIM ABOUT THE EARLIER STATE. "since you used it" says our
   * record did not show it as moved then; "it was good law when you used it"
   * would be us vouching for the authority, which is the stamp the harness
   * refuses. The distinction matters most here, because this is the sentence
   * an advocate reads about a citation they have already filed.
   */
  const movement =
    alert.fromStatus === 'none'
      ? `It has been ${toWithExtent} since you used it.`
      : `It was already ${statusPhrase(alert.fromStatus)} when you used it, and has since been ${toWithExtent}.`;

  /**
   * NEVER SILENTLY PREFERRED, IN EITHER DIRECTION. The server flags that these
   * two can disagree; a client that showed one and dropped the other would be
   * choosing which reading the advocate is allowed to check.
   */
  const sinceThen =
    alert.currentOverruledStatus === alert.toStatus
      ? undefined
      : alert.currentOverruledStatus === 'none'
        ? /*
             NOT "it is good law again". The server never says that — `fanout.ts`
             notes `none` cannot even be a `toStatus` — so a current reading of
             `none` means the CORPUS changed, which may be a data correction
             rather than a court restoring the authority. We report the record,
             and send the advocate to check it.
           */
          'The record no longer shows it as moved. Check it before you rely on that.'
        : `The record now shows it as ${statusPhrase(alert.currentOverruledStatus)}.`;

  return {
    headline: `${alert.judgmentTitle} — ${relation.toLowerCase()}`,
    movement,
    ...(sinceThen ? { sinceThen } : {}),
  };
}
