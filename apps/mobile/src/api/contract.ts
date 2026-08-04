/**
 * LAWMIND — the client's view of `docs/API_CONTRACTS.md`.
 *
 * FROZEN FOR THE SPRINT. RCC builds against this with mocks and never waits on
 * LCC; LCC implements to it. A mid-sprint change requires telling both lanes.
 *
 * These are the shapes only — nothing here fetches. Types are transcribed from
 * the contract, not inferred from a mock: a mock that drifts from the contract
 * is a client that compiles today and breaks on the day the server lands.
 */

/** Every response. There is no bare payload and no bare error string. */
export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/* ------------------------------------------------------------------ citation */

/**
 * THREE INDEPENDENT FIELDS, NEVER ONE ENUM.
 *
 * `verificationState` answers whether the authority exists.
 * `verifiedBySource` answers who confirmed it, and drives the ON-TAP DETAIL.
 * `overruledStatus` answers whether it is still good law and is INDEPENDENT —
 * a judgment can be `verified` and `set_aside` at once.
 *
 * Any response carrying a citation must include all three. A citation missing
 * them is a bug: the client renders "not confirmed" and reports it. It is never
 * upgraded to confirmed by absence.
 */
export type VerificationState = 'verified' | 'unverified' | 'failed';
export type VerifiedBySource = 'corpus' | 'public_x2' | 'ecourts' | 'none';
export type OverruledStatus = 'none' | 'set_aside' | 'partly_set_aside' | 'doubted';

export type SearchResult = {
  judgmentId: string;
  caseTitle: string;
  neutralCitation: string;
  reporterCitations: string[];
  court: string;
  judgmentDate: string;
  holding: string;
  operativeParagraph: string;
  verificationState: VerificationState;
  verifiedBySource: VerifiedBySource;
  overruledStatus: OverruledStatus;
  overruledByJudgmentId?: string;
  overruledParas?: number[];
  overruledNote?: string;
  /**
   * NOT IN `docs/API_CONTRACTS.md` — CLIENT ASSUMPTION, FLAGGED FOR LCC.
   *
   * The dashed card shows the reason inside itself ("two secondary sources
   * describe it; the portal has no record"). The contract carries a `reason`
   * on `unverifiedReferences` but not on a `results` row, and a result can be
   * `unverified` while still being a resolved judgment. Without this the card
   * falls back to a generic line, which is honest but tells the advocate less
   * than the server already knows.
   */
  unconfirmedReason?: string;
};

/**
 * `GET /judgments/:id` — the contract says only "{ judgment with fullText }".
 *
 * THE PARAGRAPH SHAPE BELOW IS A CLIENT ASSUMPTION AND IS FLAGGED FOR LCC.
 * PD-9 makes paragraph anchors the first-priority feature of the reading view —
 * advocates cite by paragraph, and without numbered paragraphs the view is
 * decorative. A single `fullText` blob cannot carry an anchor, so the client
 * needs paragraphs as rows with their court-assigned numbers.
 *
 * `number` is the number PRINTED IN THE REPORT, not an array index. They are
 * not always contiguous and they do not always start at 1.
 */
export type JudgmentParagraph = {
  number: number;
  text: string;
  /** Set where the paragraph cites another judgment we hold — drives the jump. */
  citesJudgmentId?: string;
  operative?: boolean;
};

export type JudgmentDetail = SearchResult & {
  bench: string;
  reliedOn: { judgmentId: string; caseTitle: string; neutralCitation: string }[];
  holdingParagraphNumber: number;
  operativeParagraphNumber: number;
  paragraphs: JudgmentParagraph[];
};

/** PD-10 — five filter sections. Judge and reporter were cut and have no key. */
export type SearchFilters = {
  courts: ('sc' | 'hc' | 'district' | 'tribunal')[];
  bench: ('constitution' | 'three_plus')[];
  date: 'any' | 'last_10' | 'since_2020';
  subjects: string[];
  /** "Hides anything we could not confirm." */
  onlyVerified: boolean;
  /** "Good law only." */
  excludeSetAsideOrDoubted: boolean;
};

/**
 * A FILTER NEVER HIDES SOMETHING SILENTLY.
 *
 * Every result a filter removed is named back to the advocate with a one-tap
 * escape. This is the same principle as `unverifiedReferences` — the advocate
 * always knows what they are not seeing, because they cannot correct what they
 * were never shown.
 */
export type HiddenResult = {
  /** The whole row, not just its name — "show it anyway" must render a real card. */
  result: SearchResult;
  hiddenBy: string;
};

/**
 * NEVER EMPTY BY OMISSION. Anything the model referenced that no tier confirmed
 * appears here, and the client shows it. Silent-drop rate is tracked with a
 * ZERO threshold — a citation the user never sees is worse than one marked
 * unverified, because the user cannot correct what they were not shown.
 */
export type UnverifiedReference = { citationClaimed: string; reason: string };

export type SearchResponse = {
  results: SearchResult[];
  unverifiedReferences: UnverifiedReference[];
  searchId: string;
  /** Client assumption, flagged for LCC — see `HiddenResult`. */
  hidden?: HiddenResult[];
};

export type SearchRequest = {
  query: string;
  language: 'en' | 'hi';
  filters?: { court?: string; dateFrom?: string; dateTo?: string; caseType?: string };
  matterId?: string;
};

/* ---------------------------------------------------------------------- auth */

export type User = {
  id: string;
  fullName: string;
  preferredLanguage: 'en' | 'hi';
  /** Captured for positioning; PD-2 — it NEVER gates access. */
  barEnrolmentNumber: string | null;
  enrolmentStatus: 'pending' | 'verified';
  /** PD-8 — consent, taken once at onboarding. Null means drafting is unavailable. */
  termsAcceptedAt: string | null;
  termsVersion: string | null;
};

export type Session = { accessToken: string; refreshToken: string; user: User };

/* -------------------------------------------------------------------- matters */

export type Matter = {
  id: string;
  caseTitle: string;
  cnrNumber: string | null;
  court: string;
  caseType: string;
  parties: string;
  clientName: string;
  ourSide: string;
  nextHearingDate: string | null;
};

export type MatterEvent = {
  id: string;
  matterId: string;
  eventDate: string;
  eventType: string;
  orderText: string | null;
  notes: string | null;
  /** PD-4 — private by DEFAULT, in the column and not in application code. */
  noteVisibility: 'private' | 'shared';
};

/* ------------------------------------------------------------------ briefings */

export type Briefing = {
  id: string;
  matterId: string;
  hearingDate: string;
  subject: string;
  whereItStands: string;
  pendingBeforeCourt: string;
  authorities: SearchResult[];
  checklist: { id: string; label: string; done: boolean }[];
  /** Set by cause-list escalation. An unconfirmed listing is never shown as confirmed. */
  datesNotConfirmed: boolean;
  generatedAt: string;
};

/* ------------------------------------------------------------------- drafting */

export type DocumentType = { type: string; label: string; requiredFields: string[] };

export type DraftDocument = {
  documentId: string;
  documentType: string;
  language: 'en' | 'hi';
  /** Paragraph prose only. PD-7 — citations are locked, enforced server-side. */
  paragraphs: { index: number; text: string }[];
  citations: SearchResult[];
  unverifiedReferences: UnverifiedReference[];
};

/* ---------------------------------------------------------------------- court */

/** Vendor-agnostic. OD-1 is open; the manual path returns `{ available: false }`. */
export type CourtLookupResult =
  | { available: false }
  | { available: true; matter: Omit<Matter, 'id'> };

/* --------------------------------------------------------------------- alerts */

/** PD-5 — four triggers, and only four. There is no subject-following trigger. */
export type Alert = {
  id: string;
  trigger: 'saved_authority_moved' | 'filed_draft_moved' | 'own_matter_judgment' | 'unknown_listing';
  matterId: string | null;
  judgmentId: string | null;
  body: string;
  createdAt: string;
  readAt: string | null;
};

/**
 * PD-5 — `filedDraftMoved` is absent by design. Trigger 2 CANNOT BE DISABLED:
 * an advocate who has filed a document citing law that has since moved does not
 * get to opt out of being told. Sending a key for it is a 400.
 */
export type AlertSettings = {
  savedAuthorityMoved: boolean;
  ownMatterJudgment: boolean;
  unknownListing: boolean;
};
