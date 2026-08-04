import type { OverruledStatus, SearchResult, VerificationState } from '../api/contract';

/**
 * LAWMIND — what a citation renders. THE ONLY PLACE THIS IS DECIDED.
 *
 * PONYTAIL-EXEMPT. The citation pipeline is never simplified, never inlined
 * into a screen, and never duplicated "just for this one card". A second place
 * that decides what a citation looks like is a second place that can decide
 * wrong, and the failure mode is an advocate filing a judgment that was set
 * aside in 2018.
 *
 * DERIVED AT RENDER TIME, NEVER STORED. `docs/CITATION_HARNESS.md` §Rendering.
 * The inputs are the three independent fields off the database row, handed to
 * the client verbatim by the API:
 *
 *   verification_state  — does this authority exist?      verified|unverified|failed
 *   verified_by_source  — who confirmed it?               corpus|public_x2|ecourts|none
 *   overruled_status    — is it still good law?           none|set_aside|partly_set_aside|doubted
 *
 * A JUDGMENT CAN BE `verified` AND `set_aside` AT ONCE. They answer different
 * questions from different sources, which is why they are two fields and why
 * this returns two independent marks rather than one state.
 */

/** What the card's own chrome says about whether the authority EXISTS. */
export type ExistenceMark =
  /** Verified. Renders NOTHING — no badge, chip, tick, ring or colour. */
  | { kind: 'silent' }
  /**
   * `unverified` or `failed`. A dashed ink card that owns its own space, with
   * the reason and the eCourts route inside it. Never red, never an alert
   * triangle, never the word "failed".
   */
  | { kind: 'unconfirmed'; headline: string; reason: string; ecourtsAction: string };

/** What the card says about whether the law has MOVED. Independent of the above. */
export type MovedMark =
  | { kind: 'none' }
  | {
      kind: 'moved';
      status: Exclude<OverruledStatus, 'none'>;
      headline: string;
      /** `set_aside` is the one case where Lawmind refuses to let an authority be used. */
      blocksAddToMatter: boolean;
      /** `doubted` gets no band — one muted line. Binary is a correctness bug in Indian practice. */
      band: 'danger' | 'caution' | 'none';
    };

export type CitationRender = { existence: ExistenceMark; moved: MovedMark };

/**
 * COPY IS LICENCE PROTECTION, NOT AN AUDIT.
 *
 * The Supreme Court now treats an unverified citation as a matter of
 * professional conduct and High Courts have made cost orders. The app is not
 * checking on a professional; it is standing between them and a cost order.
 *
 * Retired → ships:
 *   "We verified this citation"  → "Safe to file"
 *   "Verification failed"        → "We could not confirm this exists"
 *   "Not confirmed"              → "Do not file this without checking it"
 *   "3 of 4 citations verified"  → "One citation could put you at risk"
 */
export const copy = {
  unconfirmedHeadline: 'Do not file this without checking it',
  ecourtsAction: 'Confirm it on eCourts — about a minute',
  safeToFile: 'Safe to file',
} as const;

/**
 * `failed` RENDERS EXACTLY AS `unverified`.
 *
 * The advocate cannot act on the difference, and a provider outage must never
 * read as a gap in the corpus. The distinction is real in the data, is
 * preserved there, and is separated in the metrics so an outage does not
 * masquerade as a corpus gap. It is not a distinction the UI can make useful.
 */
function existenceMark(
  verificationState: VerificationState,
  reason: string | undefined
): ExistenceMark {
  if (verificationState === 'verified') return { kind: 'silent' };
  return {
    kind: 'unconfirmed',
    headline: copy.unconfirmedHeadline,
    reason: reason ?? 'We could not confirm this judgment exists.',
    ecourtsAction: copy.ecourtsAction,
  };
}

/**
 * Three states, not one. Binary is a correctness bug in Indian practice: a
 * partly set aside authority is still good on everything the appeal did not
 * touch, and a doubted one still binds.
 */
function movedMark(status: OverruledStatus, note: string | undefined, paras: number[] | undefined): MovedMark {
  if (status === 'none') return { kind: 'none' };

  const affected = paras?.length
    ? `paras ${paras.length === 1 ? paras[0] : `${paras[0]}–${paras[paras.length - 1]}`}`
    : null;

  switch (status) {
    case 'set_aside':
      return {
        kind: 'moved',
        status,
        headline: note ?? 'This authority has been set aside.',
        blocksAddToMatter: true,
        band: 'danger',
      };
    case 'partly_set_aside':
      return {
        kind: 'moved',
        status,
        headline: affected ? `Do not rely on ${affected}` : 'Partly set aside.',
        blocksAddToMatter: false,
        band: 'caution',
      };
    case 'doubted':
      return {
        kind: 'moved',
        status,
        headline: note ?? 'Doubted in a later judgment. Still binding.',
        blocksAddToMatter: false,
        band: 'none',
      };
  }
}

/**
 * The one entry point. Every surface that draws a citation calls this and
 * renders what it returns — search results, judgment detail, briefing
 * authorities, draft footer.
 *
 * A RESULT MISSING ANY OF THE THREE FIELDS IS A BUG, AND THE CLIENT TREATS IT
 * AS UNCONFIRMED. Absence never upgrades to confirmed. `docs/API_CONTRACTS.md`
 * §Search: "A citation missing them is a bug: the client renders 'not
 * confirmed' and reports it."
 */
export function citationRender(result: {
  verificationState?: SearchResult['verificationState'];
  overruledStatus?: SearchResult['overruledStatus'];
  overruledNote?: string;
  overruledParas?: number[];
  unconfirmedReason?: string;
}): CitationRender {
  const hasFields = result.verificationState !== undefined && result.overruledStatus !== undefined;

  if (!hasFields) {
    return {
      existence: existenceMark('unverified', 'This result arrived without its verification fields.'),
      moved: { kind: 'none' },
    };
  }

  return {
    existence: existenceMark(result.verificationState!, result.unconfirmedReason),
    moved: movedMark(result.overruledStatus!, result.overruledNote, result.overruledParas),
  };
}

/**
 * The header count. IT COUNTS WHAT NEEDS ATTENTION, NOT WHAT PASSED.
 *
 * "5 judgments · 2 need your attention", never "3 verified". Pre-announcing the
 * tally of what passed leaves the list nothing to tell you, and it decorates
 * the floor. `renders/64-verified-silent@2x.png`.
 */
export function attentionCount(results: SearchResult[]): number {
  return results.filter((r) => {
    const { existence, moved } = citationRender(r);
    return existence.kind === 'unconfirmed' || moved.kind === 'moved';
  }).length;
}
