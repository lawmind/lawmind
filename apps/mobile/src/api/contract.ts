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
  /**
   * THE HANDLE ON THIS ROW'S VERIFICATION RECORD — `GET /citations/:id`.
   *
   * NULL ONLY WHEN ROW ALIGNMENT COULD NOT BE GUARANTEED, and null is honest:
   * a guessed id would point the advocate at another judgment's verification
   * record, which is a worse failure than having none. Surfaces offer the
   * "how this was checked" route only where it is present.
   */
  citationCheckId: string | null;
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
  /**
   * VERBATIM SOURCE TEXT, NOT A PULL QUOTE.
   *
   * Measured on production: ~2,600 characters carrying running headers,
   * marginal letters and hyphenated line breaks straight out of OCR. A surface
   * that sets it in a display face with a rule down the side is presenting OCR
   * wreckage as the court's own words.
   */
  operativeParagraph: string;
  verificationState: VerificationState;
  verifiedBySource: VerifiedBySource;
  overruledStatus: OverruledStatus;
  /**
   * NULL, NOT ABSENT. The server sends an explicit `null` on every row that has
   * no value, so the optional marker alone would be a lie the type tells and
   * `?? undefined` would be scattered at every call site instead of once here.
   */
  overruledByJudgmentId?: string | null;
  overruledParas?: number[] | null;
  overruledNote?: string | null;
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
 *
 * IT IS NULLABLE, AND NULL IS NORMAL RATHER THAN AN ERROR.
 *
 * A judgment's header block carries no paragraph number, and older OCR'd
 * judgments lose their numbering entirely. `null` says "this paragraph has
 * nothing citable", which is a fact about the report — substituting the array
 * position would manufacture a citation that looks exactly like a real one
 * once it is in an advocate's note. `index` is the rendering handle for those
 * rows: always present, never citable.
 */
/**
 * THE FIELD NAMES ARE THE SERVER'S, NOT SHORTER ONES.
 *
 * These were transcribed as `number` and `index` and shipped that way. The
 * frozen contract (`docs/API_CONTRACTS.md` line 301) and the live response both
 * say `paragraphNumber` and `paragraphIndex`, so every read of `p.index` was
 * `undefined` — which TypeScript could not catch, because the type asserted a
 * shape the wire never had.
 *
 * OBSERVED ON A DEVICE, 8 Aug 2026, and invisible everywhere else: the reading
 * view keyed its list on `String(p.index)`, so all 22 paragraphs of a real
 * judgment shared the key `"undefined"`, React logged a duplicate-key error per
 * row, and THE PARAGRAPH ANCHORS NEVER RENDERED. Anchors are PD-9 item one —
 * "first because advocates cite by paragraph; without them the reading view is
 * decorative" — and they were decorative on live data while the suite was
 * green, because the fixtures used the transcribed names too.
 *
 * The lesson, recorded rather than just fixed: a hand-transcribed type is an
 * assertion about somebody else's wire format, and the compiler will defend the
 * assertion rather than check it. Transcribe the names exactly.
 */
export type JudgmentParagraph = {
  /** What the court PRINTED. Nullable — a pre-numbering scan has none. */
  paragraphNumber: number | null;
  /** Zero-based position in the rendered array. Always present, never citable. */
  paragraphIndex: number;
  text: string;
  /** Set where the paragraph cites another judgment we hold — drives the jump. */
  citesJudgmentId?: string;
  operative?: boolean;
};

/**
 * PD-9 item 3 — highlight and save a passage to a matter. Shape verified
 * against the live route, `services/api/src/judgments/annotations.ts`, 8 Aug
 * 2026 — not the summarised line in `API_CONTRACTS.md`, which omits `quote`
 * even though the server requires it (`min(1).max(4000)`).
 *
 * PARAGRAPH-LEVEL, NOT A CHARACTER RANGE. `renders/62-judgment-reading@2x.png`
 * shows the action bar attaching to a whole tapped paragraph — this is not
 * Kindle-style arbitrary-range highlighting, and building toward that would be
 * solving a harder problem than the product asks for.
 */
export type Annotation = {
  annotationId: string;
  judgmentId: string;
  matterId: string | null;
  paragraphNumber: number | null;
  paragraphIndex: number;
  quote: string;
  note: string | null;
  createdAt: string;
};

export type AnnotationDraft = {
  paragraphNumber: number | null;
  paragraphIndex: number;
  quote: string;
  note?: string;
  matterId?: string;
};

/**
 * FIVE FIELDS THE CONTRACT IMPLIES AND PRODUCTION DOES NOT SEND.
 *
 * Probed 6 August 2026. `GET /judgments/:id` answers 200 with `paragraphs`,
 * `numberedShare`, `fullText`, `bench` and the three citation fields — and with
 * no `holding`, `operativeParagraph`, `reliedOn`, `holdingParagraphNumber` or
 * `operativeParagraphNumber`. Flagged for LCC.
 *
 * They are OPTIONAL here rather than left required, because a required field
 * that arrives `undefined` is a type that lies: every screen compiles green
 * while rendering an empty section, and the lie surfaces on a phone rather than
 * in the build. Optional forces each surface to decide what absence means.
 *
 * "Relied on" is served from `GET /judgments/:id/authorities` instead, which
 * answers the same question with a date behind every row.
 */
export type JudgmentDetail = Omit<
  SearchResult,
  'holding' | 'operativeParagraph' | 'citationCheckId'
> & {
  /** Absent until the summarisation model is wired. Absence is normal, not an error. */
  holding?: string;
  /** Absent on this route. Present on search results, where it is raw OCR. */
  operativeParagraph?: string;
  /**
   * ABSENT ON THIS ROUTE BY DESIGN, not by omission.
   *
   * `docs/API_CONTRACTS.md`: "The handle comes from the search response." A
   * verification record belongs to a citation as it was SHOWN on a surface —
   * which result, on which search, at which time — and a judgment opened
   * directly has no such moment behind it. So the id travels through the route
   * as `?check=`, and where it is absent the verification surfaces say what
   * they do not have rather than inventing a lookup.
   */
  citationCheckId?: string | null;
  bench: string;
  reliedOn?: { judgmentId: string; caseTitle: string; neutralCitation: string }[];
  holdingParagraphNumber?: number;
  operativeParagraphNumber?: number;
  paragraphs: JudgmentParagraph[];
  /**
   * Share of paragraphs carrying a printed number, 0–1.
   *
   * Below the threshold the reading view hides anchors ENTIRELY rather than
   * showing a broken gutter: a column of mostly-blank anchor slots reads as a
   * rendering fault, and the few numbers present invite citing by position.
   * Measured across 1964–2023, 11 of 15 judgments were above 0.5.
   */
  numberedShare: number;
};

/* --------------------------------------------------- treatment and precedent */

/**
 * HOW LATER COURTS TREATED AN AUTHORITY — `GET /judgments/:id/treatment`.
 *
 * `relationship` is a DIFFERENT QUESTION from `verificationState`. One says what
 * a later bench did with this authority; the other says whether the authority
 * exists at all. A judgment can be `verified` and `overruled`, or `unverified`
 * and `followed`. They are never folded together, and never share a colour —
 * amber means the law moved, and nothing else.
 *
 * This endpoint states what courts DID. It never returns a probability, a score
 * or a predicted outcome: `FEATURE_PARITY.md` §4 declines outcome prediction
 * because it cannot be sourced to a primary record or verified by any tier.
 */
export type TreatmentRelationship = 'followed' | 'distinguished' | 'doubted' | 'overruled';

export type Treatment = {
  judgmentId: string;
  caseTitle: string;
  neutralCitation: string;
  court: string;
  judgmentDate: string;
  relationship: TreatmentRelationship;
  /** The paragraph of the treating judgment that did it, where known. */
  paragraph?: number;
  verificationState: VerificationState;
  verifiedBySource: VerifiedBySource;
  overruledStatus: OverruledStatus;
  asOf: string;
};

export type TreatmentResponse = {
  judgmentId: string;
  asOf: string;
  counts: { followed: number; distinguished: number; doubted: number; overruled: number };
  treatments: Treatment[];
  total: number;
  returned: number;
  /** True when more treatments exist than were returned. Rendered, never hidden. */
  truncated: boolean;
  nextCursor?: string;
};

/**
 * THE CITATION NETWORK — `GET /judgments/:id/graph`.
 *
 * `depth` bounds the walk; `limit` and `truncated` bound the payload. Both are
 * required: a heavily-cited Supreme Court authority has hundreds of citing
 * judgments at depth 1 alone.
 *
 * `truncated` IS A CORRECTNESS FIELD, NOT A PERFORMANCE ONE. A citation network
 * drawn as complete when it is not misstates how much law bears on the
 * authority — an advocate reading four nodes would conclude four judgments have
 * considered it. It is always surfaced as "showing n of m".
 */
export type GraphNode = {
  judgmentId: string;
  caseTitle: string;
  neutralCitation: string;
  court: string;
  judgmentDate: string;
  verificationState: VerificationState;
  verifiedBySource: VerifiedBySource;
  overruledStatus: OverruledStatus;
  asOf: string;
  depth: number;
};

export type GraphEdge = { from: string; to: string; relationship: TreatmentRelationship };

export type PrecedentGraph = {
  rootId: string;
  asOf: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalNodes: number;
  returned: number;
  truncated: boolean;
};

/* ------------------------------------------------- authorities, point in time */

/**
 * WHAT THIS JUDGMENT RELIED ON, AND WHETHER THAT LAW WAS STANDING AT THE TIME —
 * `GET /judgments/:id/authorities`.
 *
 * Documented in `docs/API_CONTRACTS.md` §Point-in-time good law on 7 Aug 2026,
 * after it had shipped. These types were transcribed from the live response
 * before that and now match the document.
 *
 * THE QUESTION THIS ANSWERS IS DIFFERENT FROM EVERY OTHER CITATION QUESTION WE
 * ASK, and the difference is the reason the panel exists.
 *
 *   · `verificationState` asks whether the authority exists — answered once,
 *     permanently.
 *   · `overruledStatus` asks whether it is good law TODAY — answered live at
 *     every render, because law moves under a saved citation.
 *   · `standingWhenRelied` asks whether it was good law ON THE DAY THIS BENCH
 *     RELIED ON IT — answered by two dates, and never changing again.
 *
 * The third is the only one that says something about the reasoning rather than
 * about the record, which is exactly why it must never be allowed to sound like
 * a verdict on that reasoning. See `citation/standing.ts`.
 */
/**
 * FIVE STATES. `overruled_here` IS NOT A SHADE OF `already_moved`.
 *
 * 22 of the 48 citations that date as "already moved" are the overruling
 * judgment reciting the authority it overrules — Tofan Singh on Kanhaiyalal,
 * Navtej Singh Johar on Suresh Kumar Koushal, Vidya Drolia, Sita Soren, Joseph
 * Shine, Vineeta Sharma, Puttaswamy. Their dates are necessarily equal, so a
 * pure date comparison files them under "this bench relied on dead law" — about
 * the bench that killed it, on the landmarks an advocate is most likely to open.
 */
export type AuthorityStanding =
  | 'good_law_then'
  | 'already_moved'
  | 'overruled_here'
  | 'moved_since'
  | 'unknown';

export type PointInTimeAuthority = {
  judgmentId: string;
  caseTitle: string;
  neutralCitation: string;
  judgmentDate: string;
  /** How the relying judgment used it — from the court's own printed annotation. */
  relationship: string;
  standingWhenRelied: AuthorityStanding;
  /**
   * Days between the overruling judgment and this one. Null unless
   * `already_moved` — and null on `overruled_here` deliberately, because a gap
   * of zero days is not a gap.
   */
  daysAlreadyMoved: number | null;
  overruledStatus: OverruledStatus;
  overruledByJudgmentId: string | null;
  /** THE OVERRULING JUDGMENT'S OWN DELIVERY DATE. A legal date. */
  overruledOn: string | null;
  /**
   * The bench that moved it, NAMED. Supplied since 7 Aug 2026, which is what
   * lets the panel say "Tofan Singh set this aside" without a second round trip
   * per authority — an id can never reach a screen, and before this the client
   * had to fetch each overruling judgment just to have something citable to
   * print.
   */
  overruledByCaseTitle: string | null;
  /**
   * WHEN OUR ROW CHANGED, NOT WHEN THE LAW MOVED.
   *
   * Reads `2026-08-06 15:32` — the back-fill run — for an authority set aside in
   * 2020. Deriving `standingWhenRelied` from it is exactly the bug that made
   * `already_moved` read 0 corpus-wide. Kept in the type so nobody rediscovers
   * it in the payload and assumes it means the other thing.
   */
  statusRecordedAt: string | null;
  verificationState: VerificationState;
  verifiedBySource: VerifiedBySource;
  asOf: string;
};

export type AuthoritiesResponse = {
  judgmentId: string;
  caseTitle: string;
  /** The relying judgment's own date — the fixed point every comparison is against. */
  deliveredOn: string;
  asOf: string;
  counts: {
    goodLawThen: number;
    alreadyMoved: number;
    overruledHere?: number;
    movedSince: number;
    unknown: number;
  };
  authorities: PointInTimeAuthority[];
  /**
   * How many cited authorities we could resolve to a judgment we hold.
   *
   * It is NOT the number of authorities the bench cited. A judgment cites
   * statutes, foreign decisions and unreported matters we do not hold, and this
   * counts only the ones we do — so a panel that presented it as "the
   * authorities relied on" would understate the bench's reasoning and invite
   * the advocate to think we had read the whole judgment for them.
   */
  resolvedAuthorities: number;
};

/* ---------------------------------------------------------- counter-arguments */

/**
 * `POST /arguments/counter` — what the other side will likely say.
 *
 * GROUNDED ONLY. The model references judgment IDs handed to it in retrieved
 * context and never emits a citation from memory, exactly as search does.
 *
 * `excluded` IS THE IMPORTANT FIELD. A `set_aside` authority is not offered as
 * a counter-argument, but it is NOT SILENTLY REMOVED either — it comes back
 * named, with its reason, and is rendered as excluded. Dropping it quietly
 * would be a silent drop, which is measured at a zero threshold, and it would
 * also mislead: an advocate who knows that authority exists would assume we
 * had not found it rather than that we had ruled it out.
 */
export type CounterAuthority = {
  judgmentId: string;
  caseTitle: string;
  neutralCitation: string;
  court?: string;
  judgmentDate?: string;
  /** Verbatim source text, not a summary. Long, and often carrying OCR furniture. */
  operativeParagraph?: string;
  verificationState: VerificationState;
  verifiedBySource: VerifiedBySource;
  overruledStatus: OverruledStatus;
  overruledParas?: number[];
  asOf: string;
};

export type CounterArgument = {
  argument: string;
  rebuttal: string;
  authorities: CounterAuthority[];
};

/**
 * S1 RETURNS AUTHORITIES ONLY, AND `arguments` IS ABSENT — not empty, absent.
 *
 * The contract at `docs/API_CONTRACTS.md:264` documents
 * `{ arguments: [ { argument, rebuttal, authorities } ], … }`; production
 * answers `{ position, asOf, authorities, excluded, unverifiedReferences }`.
 * That divergence is deliberate on the server's side — argument and rebuttal
 * prose needs generation that waits for S2 — and it is flagged rather than
 * quietly matched, because the contract is the frozen document and this client
 * is now building against something else.
 *
 * `arguments` is therefore OPTIONAL rather than removed. When generation lands
 * the prose arrives around the authorities that are already rendering, and no
 * screen has to be rewritten to receive it.
 */
export type CounterArgumentsResponse = {
  /** Echoed back so the panel can render what was asked, not what was typed. */
  position?: string;
  asOf?: string;
  /** S1. Grounded authorities for the position, with no prose around them. */
  authorities?: CounterAuthority[];
  /** S2. Absent until generation lands. */
  arguments?: CounterArgument[];
  /** Named and shown, never dropped. */
  excluded?: { judgmentId: string; caseTitle: string; neutralCitation?: string; reason: 'set_aside' }[];
  unverifiedReferences?: UnverifiedReference[];
};

/* ---------------------------------------------------------------- compare */

/**
 * `POST /documents/compare` — two versions of a draft.
 *
 * `citationChanges` IS SEPARATE FROM `textChanges` ON PURPOSE, and the client
 * must keep them separate too.
 *
 * A changed citation is a different KIND of event from changed prose: it
 * re-enters verification, it can introduce an authority that has since been
 * overruled, and it is the one change in a diff that can put an advocate in
 * front of a cost order. A diff that renders "submitted → respectfully
 * submitted" and "added Satender Kumar Antil v. CBI" in the same grey
 * strikethrough hides the second inside the first.
 */
export type TextChange = {
  paragraphIndex: number;
  kind: 'added' | 'removed' | 'changed';
};

export type CitationChange = {
  paragraphIndex: number;
  kind: 'added' | 'removed' | 'changed';
  before?: string;
  after?: string;
  verificationState: VerificationState;
  verifiedBySource: VerifiedBySource;
  overruledStatus: OverruledStatus;
  asOf: string;
};

export type CompareResponse = {
  textChanges: TextChange[];
  citationChanges: CitationChange[];
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
 * "WHERE WE LOOKED" — one row per tier, each with its own result and timestamp.
 * `GET /citations/:citationCheckId`, documented 7 Aug 2026.
 * `renders/49-unverified-citation@2x.png`, canvas `10i`.
 *
 * ── `miss` AND `not_implemented` ARE DIFFERENT FACTS AND MUST NEVER BE
 *    COLLAPSED ────────────────────────────────────────────────────────────────
 *
 * `miss` says we queried an independent source and it had nothing.
 * `not_implemented` says the tier ships in S2 and has not run at all.
 *
 * Rendering the second as the first tells an advocate their citation FAILED an
 * independent check that was never attempted — which would send them chasing a
 * problem that does not exist, and would make the harness agree with itself by
 * computing a confirmation rate over checks that never happened. In S1 exactly
 * one of three tiers runs, so this is the common case, not the edge.
 *
 * `not_attempted` is the third absence: the tier exists and was skipped for this
 * row, usually because an earlier tier already confirmed it.
 */
export type CitationTierStatus = 'confirmed' | 'miss' | 'not_attempted' | 'not_implemented';

export type CitationTier = {
  /** 1 corpus · 2 public_x2 · 3 eCourts. */
  tier: number;
  source: VerifiedBySource;
  status: CitationTierStatus;
  /** What happened, in plain words. Never an accusation and never our failure. */
  detail: string;
  /** ISO, or null where the tier never ran — a check with no time did not happen. */
  at: string | null;
};

/**
 * HOW MUCH OF THE HARNESS ACTUALLY RAN, STATED IN WORDS.
 *
 * The client is not left to infer coverage by counting an array. S1 is
 * `tiersImplemented: 1` of `tiersDefined: 3`, and every surface that shows a
 * verification result says so — otherwise "verified" reads as "verified by
 * everything we have", which is a promise we do not keep until S2.
 */
export type CitationCoverage = {
  tiersImplemented: number;
  tiersDefined: number;
  note: string;
};

export type CitationCheck = {
  citationCheckId: string;
  /** The citation as it was claimed, which may differ from what we resolved. */
  citationClaimed: string;
  checkedAt: string;
  /** Where it was shown — `search`, `draft`, `briefing`. */
  surface: string;
  shownToUser: boolean;
  verificationState: VerificationState;
  verifiedBySource: VerifiedBySource;
  overruledStatus: OverruledStatus;
  /** Whether the moved state was actually rendered. The silent-drop audit reads this. */
  overruledStatusShown: boolean;
  matchConfidence: number | null;
  /** Null where nothing resolved — the citation was claimed and not found. */
  judgment: SearchResult | null;
  tiers: CitationTier[];
  coverage: CitationCoverage;
  asOf: string;
};

/**
 * `POST /citations/copies` — every "Copy citation" tap.
 *
 * AN ADVOCATE WHO COPIES A CITATION INTO THEIR OWN DOCUMENT IS OTHERWISE
 * INVISIBLE TO THE FAN-OUT. They saw a verified badge, they may file it, and no
 * alert could ever reach them when that authority moves. That is the user at
 * highest risk — and plausibly a large share of early users, the ones who trust
 * the search but not yet the drafting.
 *
 * `clientKey` makes the write idempotent: a double tap, or a retry after a
 * dropped connection, must not become two copy records and inflate the count
 * the fan-out is measured against.
 */
export type CitationCopy = {
  judgmentId: string;
  matterId?: string;
  citationCheckId?: string;
  surface: string;
  copiedAt: string;
  clientKey: string;
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

export type EnrolmentStatus = 'unverified' | 'verified' | 'rejected';

export type User = {
  id: string;
  fullName: string;
  preferredLanguage: 'en' | 'hi';
  /** Captured for positioning; PD-2 — it NEVER gates access. */
  barEnrolmentNumber: string | null;
  /**
   * THREE STATES, NOT TWO. `SCHEMA_TRUTH.md#users`: `unverified|verified|rejected`,
   * default `unverified`. This type previously said `'pending' | 'verified'`,
   * which does not contain the server's actual default value — found 8 Aug 2026
   * by reading `services/api/src/auth/account.ts` and `auth.test.ts` directly
   * (the latter asserts `enrolmentStatus === 'rejected'` on the wire). A screen
   * checking for `'pending'` would never have matched a real unverified user.
   *
   * Display only, per PD-2 — never branch access on this value.
   */
  enrolmentStatus: EnrolmentStatus;
  /**
   * `unverified|verified|rejected|none|practice|chamber|expert|firm|enterprise`
   * per `SCHEMA_TRUTH.md#users`, default `none`. Returned by `/me` today
   * (`services/api/src/auth/account.ts`) but was missing from this type — added
   * 8 Aug 2026 rather than left undeclared.
   */
  subscriptionTier: 'none' | 'practice' | 'chamber' | 'expert' | 'firm' | 'enterprise';
  /** PD-8 — consent, taken once at onboarding. Null means drafting is unavailable. */
  termsAcceptedAt: string | null;
  termsVersion: string | null;
};

export type Session = { accessToken: string; refreshToken: string; user: User };

/**
 * IDENTITY IS NOT PROFILE — and `GET /me` says so in its own shape.
 *
 * `POST /auth/verify` proves an email address is reachable. It does NOT create an
 * advocate. Until `PATCH /me` supplies `fullName` and `phone`, `GET /me` answers
 * `{ profileComplete: false, profile: null }`, and that is a real state to design
 * for rather than an error: somebody abandoned onboarding halfway.
 *
 * `SCHEMA_TRUTH.md#auth_user`: "An identity with no profile is a real state and
 * `GET /me` reports `profileComplete: false` rather than returning a half-filled
 * user." So the client NEVER synthesises an empty `User` to keep a screen happy —
 * a blank name rendered as though it were the advocate's is worse than a screen
 * that asks for it.
 *
 * `pushRegistered` IS A BOOLEAN AND THE TOKEN NEVER COMES BACK. It is a device
 * secret; nothing in the client needs to read it, and a shape that returned it
 * would invite somebody to render it.
 */
export type Profile = User & {
  email: string;
  phone: string;
  /** True once a device token has been registered. The token itself is never returned. */
  pushRegistered: boolean;
};

export type MeResponse =
  | { profileComplete: false; profile: null }
  | { profileComplete: true; profile: Profile };

/**
 * `PATCH /me`. `expoPushToken` is NULLABLE RATHER THAN MERELY OPTIONAL: omitted
 * means "no change", explicit `null` means "stop sending to this device". Those
 * are different instructions and collapsing them silently keeps pushing at a
 * phone the advocate signed out of.
 */
export type ProfilePatch = {
  fullName?: string;
  phone?: string;
  preferredLanguage?: 'en' | 'hi';
  barEnrolmentNumber?: string | null;
  expoPushToken?: string | null;
};

/** `GET /terms/current` — PD-8. The version is stored, never a boolean. */
export type CurrentTerms = { version: string; body: string };

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

/**
 * PD-5, PD-6 — four triggers, and only four; there is no subject-following
 * trigger. Shape corrected 8 Aug 2026 against LCC's live probe
 * (`docs/LCC_TO_RCC_HANDOFF.md`), not the aspirational version this type
 * held before — that version invented a `trigger`/`body` shape and two
 * `kind` values (`filed_draft_moved`, `own_matter_judgment`,
 * `unknown_listing`) that were never real. Only two `kind`s exist on the
 * wire today; triggers 3 and 4 have settings keys (`AlertSettings` below)
 * but no producer yet, so no alert with those kinds is ever emitted.
 *
 * `severity: 'batched'` surfaces in the evening briefing's "since
 * yesterday" block, per PD-6 — never a notifications tab.
 * `severity: 'immediate'` is the one push exception (`set_aside`/
 * `partly_set_aside` on a filed or copied-out citation) and needs no
 * additional in-app surface beyond what the OS already shows for the push.
 *
 * `currentOverruledStatus` is read LIVE by the server at response time,
 * separate from `fromStatus`/`toStatus` (the historical values at the
 * moment the alert fired) — never cache one in place of the other.
 */
export type Alert = {
  id: string;
  kind: 'saved_authority_moved' | 'filed_citation_moved';
  severity: 'immediate' | 'batched';
  judgmentId: string;
  matterId: string | null;
  fromStatus: OverruledStatus;
  toStatus: OverruledStatus;
  judgmentTitle: string;
  overruledParas: number[] | null;
  currentOverruledStatus: OverruledStatus;
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
