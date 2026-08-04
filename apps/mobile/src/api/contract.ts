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
  /**
   * `YYYY-MM-DD`. A DATE, NOT A TIMESTAMP.
   *
   * Never hand this to `new Date()` for display: date-only strings parse as UTC
   * midnight, so west of Greenwich a judgment delivered on the 11th renders as
   * the 10th. A judgment date is a fact on a court record, and a product that
   * shifts it by a day in some timezones is wrong about the record.
   */
  judgmentDate: string;
  /**
   * MAY BE EMPTY ON REAL DATA. The two-sentence holding needs a summarisation
   * model that is not wired yet, so the corpus returns `""` for most rows.
   * That is a missing summary, NOT a broken judgment — every other field is
   * present and the authority is real. Surfaces must render an empty holding as
   * ordinary, never as an error or a loading state.
   */
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

/* ------------------------------------------------------------------ statutes */

/**
 * `GET /statutes` and `GET /statutes/sections`.
 *
 * A STATUTE IS NOT A JUDGMENT. It carries no citation, no verification state
 * and no overruled status, so NONE of the citation UI applies to it — there is
 * nothing here to mark safe to file, and nothing to mark as moved.
 *
 * THAT IS A STATEMENT ABOUT OUR SCHEMA, NOT ABOUT THE LAW. Sections are
 * amended, substituted and repealed constantly, and we do not yet store that
 * status. So the absence of a mark here means "we hold no currency
 * information", NOT "this section is in force". No surface may imply the
 * second. An advocate who reads silence as a guarantee, on a section that was
 * substituted last year, is exactly the failure the citation harness exists to
 * prevent — arriving through a door the harness does not watch.
 */
export type Statute = {
  statuteId: string;
  shortTitle: string;
  hindiTitle: string | null;
  actNumber: string;
  actYear: number;
  enactmentDate: string;
  /**
   * THE ONE THAT MATTERS. Which regime applies to an offence turns on when the
   * Act came into force, not when it was passed. BNS, BNSS and BSA were all
   * enacted 2023-12-25 and came into force 2024-07-01 (`DOMAIN_TRUTH.md`).
   */
  enforcementDate: string | null;
  ministry: string | null;
  sourceUrl: string;
  sectionCount: number;
};

export type StatuteSection = {
  sectionId: string;
  statuteId: string;
  shortTitle: string;
  /** TEXT, not a number — "63A" is a section number. Never sort on this. */
  sectionNumber: string;
  heading: string;
  /**
   * Government-published text, served verbatim from the database.
   * NEVER summarised, never reformatted, never re-wrapped by the client. An
   * advocate reads this and files from it; the only safe transformation is
   * none.
   */
  sectionText: string;
  footnote: string | null;
  /** THE ONLY VALID SORT KEY. Lexical order on `sectionNumber` puts s.10 before s.2. */
  orderIndex: number;
  sourceUrl: string;
};

/** PD-10 — five filter sections. Judge and reporter were cut and have no key. */
export type SearchFilters = {
  courts: ('sc' | 'hc' | 'district' | 'tribunal')[];
  bench: ('constitution' | 'three_plus')[];
  date: 'any' | 'last_10' | 'since_2020';
  subjects: string[];
  /**
   * Derived on the server from the official case number, never inferred.
   *
   * A MINORITY OF JUDGMENTS LEGITIMATELY STATE NO SIDE — 139 of the 6,309 in
   * the corpus today. Those are excluded when this filter is set, and are never
   * guessed into a category to make the count look complete. A filtered list
   * that quietly invented a side for a judgment would be the search equivalent
   * of a fabricated citation.
   */
  caseType?: string;
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
/**
 * "WHERE WE LOOKED" — one row per source, each with its own result and
 * timestamp. `renders/49-unverified-citation@2x.png`, canvas `10i`.
 *
 * NOT IN `docs/API_CONTRACTS.md` — CLIENT ASSUMPTION, FLAGGED FOR LCC. The
 * contract has `POST /verify/ecourts` and `POST /verify/confirm` but nothing
 * that returns what each tier found. The screen the harness requires cannot be
 * built without it: "each source checked with a result and a timestamp".
 *
 * `outcome` deliberately has no `failed` member. The language throughout is
 * what we did and did not manage, never an accusation and never our failure.
 */
export type SourceCheck = {
  /** "Our reported corpus", "Delhi High Court judgment portal", "eCourts services". */
  source: string;
  outcome: 'found' | 'not_found' | 'needs_you';
  /** "No result for this case number." — what happened, in plain words. */
  detail: string;
  /** ISO. Rendered as "Checked 4 minutes ago". */
  checkedAt: string;
};

export type CitationCheckDetail = {
  judgmentId: string;
  /** What we found, ending in what we could not do. */
  whatWeFound: string;
  sources: SourceCheck[];
  /** The eCourts path, spelled out so checking takes a minute rather than ten. */
  ecourtsUrl: string;
  prefilledQuery: string;
};

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
  /**
   * NULL UNTIL AUTH LANDS IN S5, and that is not an error.
   *
   * A search is recorded against a user; with no user there is nothing to
   * record against. The key is always present, so treat `null` as "not
   * recorded yet" and never as a failed response — a client that errors on it
   * would break every search until S5.
   */
  searchId: string | null;
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
