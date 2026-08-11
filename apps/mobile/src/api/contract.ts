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
/**
 * `ecourts_bulk` added 8 Aug 2026 — bulk CNR resolution against the eCourts
 * registry, `docs/CITATION_HARNESS.md` "`verifiedBySource` gains a fifth
 * value". It is a MACHINE confirming against the registry, never a named
 * advocate solving the captcha and vouching — that is `ecourts` alone, and
 * the two must never share wording. Strength, strongest first: `ecourts` >
 * `public_x2` > `ecourts_bulk` > `corpus`.
 */
export type VerifiedBySource = 'corpus' | 'public_x2' | 'ecourts' | 'ecourts_bulk' | 'none';
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
  /**
   * NULL IS A REAL ANSWER, AND IT IS NOT A MISSING FIELD — IT IS A JUDGMENT
   * THAT CARRIES NO CITATION AT ALL.
   *
   * This type said `string` until 11 Aug 2026 while every server route that
   * carries a citation typed it `string | null` and passed it through verbatim
   * (`services/api/src/search/retrieve.ts:45`, `judgments/route.ts:24`,
   * `judgments/as-at.ts:73`, `judgments/treatment.ts:40`). The lie was
   * invisible for the life of the project because every row in the corpus was a
   * Supreme Court judgment with a citation. It stopped being invisible when
   * 40,980 High Court judgments landed, 100% of them with no neutral citation
   * and no reporter citation.
   *
   * A CITATIONLESS JUDGMENT IS NOT AN INVALID ONE. It is a real judgment of a
   * real court, searchable and readable, that cannot be cited in a filing.
   * That is a third thing, distinct from both "verified" and "unverified", and
   * it is a fact about the CITATION FIELD rather than about verification — so
   * it is deliberately NOT part of the three-field citation-state model, which
   * this change does not touch.
   */
  neutralCitation: string | null;
  /** Empty on every High Court row the AWS bucket supplies. Never synthesised. */
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
  /**
   * THE NUMBER THE COURT PRINTED. Added 7 Aug 2026, additive — confirmed
   * carried on every live `/search` result (`services/api/src/search/route.ts`)
   * even though this type omitted it until 11 Aug. `null` is a real, common
   * answer: pre-1990s judgments arrive as scans that lost their numbering, and
   * a headnote is never numbered. **Never invented** — a client that guesses a
   * number here would be presenting a position it made up as the court's own
   * pagination, behind an authority rule.
   */
  operativeParagraphNumber?: number | null;
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
  /**
   * THE MOMENT THE SERVER READ `overruled_status` FOR THIS ROW. Added
   * 11 Aug 2026, additive — confirmed carried on every live `/search` result,
   * stamped once per request so every row in one response agrees.
   *
   * NOT a prop to pass as `ResultCard`'s `statusAsOf` on a live screen —
   * `statusAsOf` means "this status could not be re-read now", and a freshly
   * fetched search result is exactly the case that is live. This field exists
   * for the surface that does not exist yet: an offline-cached result. When
   * that surface is built, it renders "good-law status as of {asOf}" against
   * THIS value rather than the moment the phone last had a signal — the
   * never-cached rule requires the as-of date to be when the SERVER read the
   * row, never when the client happened to receive it. `CITATION_HARNESS.md`.
   */
  asOf: string;
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
  /**
   * The judgment this paragraph cites, where the citation resolves to a row we
   * hold. Drives the jump in `ReadingView`.
   *
   * LIVE SINCE 11 Aug 2026 — `services/api/src/judgments/route.ts` calls
   * `attachCitesJudgmentId`. It was dormant for most of the project's life:
   * declared here, implemented in the reader, and never once sent, so the
   * feature worked against fixtures and never in production. Requested on the
   * bus (0028), built by LCC, and re-verified here by reading the route rather
   * than the message announcing it.
   *
   * ABSENT IS A DELIBERATE ANSWER, NEVER A GAP. The server omits it when the
   * paragraph cites nothing, when the citation resolves to zero judgments, when
   * it resolves to MORE than one — a citation identifying two judgments
   * identifies neither — and when the only match is the judgment already open,
   * because a self-link is not navigation. The client must therefore render no
   * link on absence and must never fall back to a search: that would turn an
   * ambiguity the server refused to resolve into a guess the advocate cannot
   * see, which is the exact failure `cite:` search exists to prevent.
   */
  citesJudgmentId?: string;

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
  /** `neutralCitation` is nullable here for the same reason it is on a result row. */
  reliedOn?: { judgmentId: string; caseTitle: string; neutralCitation: string | null }[];
  holdingParagraphNumber?: number;
  operativeParagraphNumber?: number;
  /**
   * THE COURT'S OWN NUMBER FOR THE CASE — `CWJC 12345/2019`, `Crl.A. 221/2018`.
   *
   * Sent on every judgment (`services/api/src/judgments/route.ts` selects
   * `case_number` and returns it) and declared here for the first time on
   * 11 Aug 2026. Nullable, exactly as `packages/db/src/schema.ts:326` has it.
   *
   * IT IS NOT A CITATION AND MUST NEVER BE RENDERED AS ONE. A case number
   * identifies a proceeding on a court's own register; a citation identifies a
   * reported judgment. But it is the identifier `CITATION_HARNESS.md` §"The
   * fourth concern" requires us to preserve — *"preserve case number, parties,
   * court, date, source URL and paragraph information where available"* — and
   * for the 40,980 High Court judgments carrying no citation at all, it is the
   * only handle an advocate has for referring to the matter.
   */
  caseNumber?: string | null;
  /** Derived by the server FROM `case_number`, never from the judgment's content. */
  caseType?: 'criminal' | 'civil' | null;
  /**
   * WHERE THE COURT PUBLISHED IT. `notNull` in the schema and returned on every
   * judgment, so this is not optional — it is the one link that lets an advocate
   * check us against the court itself.
   *
   * NEVER CONSTRUCTED. A source URL assembled client-side would be a guess at
   * another service's routing, and a wrong one sends an advocate to a different
   * case while telling them it is this one.
   */
  sourceUrl: string;
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
/**
 * WHAT A LATER BENCH DID TO THIS AUTHORITY — the six values
 * `judgment_citations.relationship` actually stores
 * (`packages/db/src/schema.ts:711`), not the four this type declared until
 * 11 Aug 2026.
 *
 * `services/api/src/judgments/treatment.ts` applies NO filter on the column, so
 * every value reaches the client. Two were missing here and both rendered as a
 * blank label in `TreatmentCard`, because a lookup on an unknown key returns
 * `undefined`:
 *
 *   · `overruled_in_part` — 20 rows in production. Worse than a blank label:
 *     `lawMoved` tested `=== 'overruled'`, so a bench that overruled this
 *     authority IN PART was not marked as the law moving at all.
 *   · `cites` — a bare reference with no treatment. Common, and legitimately
 *     quieter than the others, but it must still say what it is.
 *
 * A SEVENTH VALUE IS POSSIBLE. The column is not an enum server-side, so this
 * union is the client's best current knowledge rather than a guarantee.
 * Surfaces must render an unrecognised value honestly instead of blank —
 * `TreatmentCard` does, and a test holds it there.
 */
export type TreatmentRelationship =
  | 'cites'
  | 'followed'
  | 'distinguished'
  | 'doubted'
  | 'overruled'
  | 'overruled_in_part';

export type Treatment = {
  judgmentId: string;
  caseTitle: string;
  /**
   * NULLABLE FOR THE SAME REASON IT IS ON A SEARCH ROW — the server has always
   * typed it `string | null` and 40,980 High Court judgments carry none. Render
   * it through `citation/citationDisplay.ts`, never raw.
   */
  neutralCitation: string | null;
  court: string;
  judgmentDate: string;
  relationship: TreatmentRelationship;
  /** The paragraph of the treating judgment that did it, where known. */
  paragraph?: number;
  /**
   * THE PHRASE THE COURT PRINTED — sent on every row, undeclared until
   * 11 Aug 2026, so the one thing that makes a treatment claim auditable was
   * unreachable by the client.
   *
   * `treatment.ts`: "Present only for a real treatment, so any row claiming one
   * can be audited back to its own text." Without it the card asserts that a
   * later bench distinguished this authority and offers nothing to check that
   * against — which is the shape of claim this product exists not to make.
   * `null` where the extractor found no phrase.
   */
  evidence?: string | null;
  verificationState: VerificationState;
  verifiedBySource: VerifiedBySource;
  overruledStatus: OverruledStatus;
  asOf: string;
};

export type TreatmentResponse = {
  judgmentId: string;
  asOf: string;
  /**
   * SIX KEYS, NOT FOUR — `judgment_citations.relationship` holds six values and
   * `total` below sums all six. The client declared four until 11 Aug 2026, so
   * a screen adding the counts it knew about and comparing them to `total`
   * would find a gap it could not explain: 23 live `overruled_in_part` rows,
   * plus every plain `cites` edge, silently uncounted.
   *
   * LCC added the two missing keys the same day (bus 0035 → `treatment.ts`).
   */
  counts: {
    followed: number;
    distinguished: number;
    doubted: number;
    overruled: number;
    overruledInPart: number;
    cites: number;
  };
  treatments: Treatment[];
  total: number;
  returned: number;
  /** True when more treatments exist than were returned. Rendered, never hidden. */
  truncated: boolean;
  /** `string | null` on the wire, never merely absent — `treatment.ts`. */
  nextCursor?: string | null;
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
  /**
   * NULLABLE FOR THE SAME REASON IT IS ON A SEARCH ROW — the server has always
   * typed it `string | null` and 40,980 High Court judgments carry none. Render
   * it through `citation/citationDisplay.ts`, never raw.
   */
  neutralCitation: string | null;
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
  /**
   * NULLABLE FOR THE SAME REASON IT IS ON A SEARCH ROW — the server has always
   * typed it `string | null` and 40,980 High Court judgments carry none. Render
   * it through `citation/citationDisplay.ts`, never raw.
   */
  neutralCitation: string | null;
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
  /**
   * NULLABLE FOR THE SAME REASON IT IS ON A SEARCH ROW — the server has always
   * typed it `string | null` and 40,980 High Court judgments carry none. Render
   * it through `citation/citationDisplay.ts`, never raw.
   */
  neutralCitation: string | null;
  court?: string;
  judgmentDate?: string;
  /** Verbatim source text, not a summary. Long, and often carrying OCR furniture. */
  operativeParagraph?: string;
  /**
   * THE NUMBER THE COURT PRINTED, carried here exactly as it is on a search row.
   * `services/api/src/arguments/counter.ts` maps it onto every authority; this
   * type omitted it until 11 Aug 2026, so the panel had no anchor to offer.
   * `null` is real and common — never invented.
   */
  operativeParagraphNumber?: number | null;
  verificationState: VerificationState;
  verifiedBySource: VerifiedBySource;
  /**
   * NOT ALWAYS `none` — AND THAT IS THE WHOLE POINT.
   *
   * `counter.ts` excludes only `set_aside`, so `doubted` and
   * `partly_set_aside` authorities are RETURNED HERE and must render the LAW
   * MOVED mark like every other surface. Stale-overruled carries a zero
   * threshold; an authority proposed against the advocate's own position with
   * its status hidden is the worst place to hide it.
   */
  overruledStatus: OverruledStatus;
  /** `number[] | null` on the wire — `retrieve.ts:51`. Never merely absent. */
  overruledParas?: number[] | null;
  /**
   * SENT SINCE 11 AUG 2026, and it is what makes the `partly_set_aside` case
   * legible: `renderState.ts` puts the note in `whatStillStands`, the half the
   * advocate is about to argue against, and states it FIRST.
   *
   * It was carried on `excluded[]` and not on `authorities[]` until this
   * client's audit found the asymmetry — `retrieve.ts` had selected both on
   * every row all along. LCC added them the same day (bus 0037 → counter.ts).
   */
  overruledNote?: string | null;
  overruledByJudgmentId?: string | null;
  asOf: string;
};

export type CounterArgument = {
  argument: string;
  rebuttal: string;
  authorities: CounterAuthority[];
};

/**
 * AN AUTHORITY WE RULED OUT, NAMED — the row `excluded` carries.
 *
 * Was an inline shape declaring three of the six fields the server sends
 * (`services/api/src/arguments/counter.ts`) until 11 Aug 2026. The two it
 * omitted are the two the design asks for: `design/screens/07-counter-arguments.dc.html`
 * writes the reason as *"The relevant directions in this authority were set
 * aside in Social Action Forum (2018) — not offered as a counter-argument"*,
 * and the case that did the setting aside can only come from the server.
 * Undeclared meant unbuilt, so the card printed a generic sentence instead.
 */
export type ExcludedAuthority = {
  judgmentId: string;
  caseTitle: string;
  /** Nullable for the same reason it is everywhere else — 40,980 rows carry none. */
  neutralCitation: string | null;
  reason: 'set_aside';
  /**
   * THE JUDGMENT THAT SET IT ASIDE. `null` when the corpus records the status
   * but not the authority for it, which is common on older rows.
   */
  overruledByJudgmentId?: string | null;
  /**
   * THE COURT'S OWN NOTE ON WHAT WAS SET ASIDE, verbatim. Shown in place of our
   * generic sentence when present — it says which directions fell and in which
   * case, and we have no basis to write either ourselves.
   */
  overruledNote?: string | null;
  /** When the server read `overruled_status` for this row. */
  asOf?: string;
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
  excluded?: ExcludedAuthority[];
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
/**
 * HOW MUCH OF THE STATUTE LIBRARY WE ACTUALLY HOLD.
 *
 * Sent on every `GET /statutes` since the route was written, and read by
 * nothing until 11 Aug 2026. The acts index therefore presented a list with no
 * statement of what was missing from it — the same silence `CoverageScreen`
 * exists to break for judgments: "silence about a gap does the same damage as
 * a fabricated citation; both let an advocate rely on something that is not
 * there."
 *
 * THREE OF THESE FIELDS ARE TRAPS, and the route's own comments name them:
 *
 *   · `complete` is authoritative. NEVER infer completeness from
 *     `held === sourceTotal` — an ingest can equal the count transiently
 *     mid-run, or reach it with Acts that failed and were retried into place.
 *   · `sourceTotal: null` means we have never enumerated the source. It does
 *     NOT mean zero, and it must never be rendered as a denominator.
 *   · `ingestInProgress: null` means we cannot tell. It is nullable precisely
 *     because a boolean cannot say "unknown", and `false` for an absent row is
 *     a claim we cannot support.
 *
 * `failedCount` and `sectionlessCount` are TWO DIFFERENT GAPS: Acts we could
 * not fetch, and Acts we hold whose sections never parsed. Reporting one number
 * would hide the other.
 */
export type StatuteCoverage = {
  held: number;
  sourceTotal: number | null;
  complete: boolean;
  failedCount: number;
  /** Named, never merely counted — "an unauditable gap is not a known gap". */
  failedIds: string[];
  sectionlessCount: number;
  enumeratedAt: string | null;
  ingestInProgress: boolean | null;
};

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
  /**
   * NULLABLE — `SectionRow` in `services/api/src/statutes/route.ts` types it
   * `string | null` and passes it through verbatim. A section with no marginal
   * heading is ordinary in older Acts, not a parse failure, so the row renders
   * without one rather than reserving space for a line that is not coming.
   */
  heading: string | null;
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

/**
 * WHAT RESOLVED, AND IT IS FIVE FIELDS — NOT A `SearchResult`.
 *
 * `services/api/src/citations/check.ts:124` builds this object by hand from
 * the joined row: `judgmentId`, `caseTitle`, `neutralCitation`, `court`,
 * `judgmentDate`. Nothing else. This was typed `SearchResult | null` until
 * 11 Aug 2026, which promised ten fields the endpoint has never sent — and
 * `tsc` would have accepted `check.judgment.overruledStatus` in any future
 * screen, handing it `undefined` on a good-law question.
 *
 * THE THREE CITATION FIELDS ARE ON THE CHECK ITSELF, not on this object, and
 * that is the right place for them: they describe what was found when the
 * citation was checked. Reading them from here is the mistake this narrower
 * type now makes impossible rather than merely inadvisable.
 */
export type CitationCheckJudgment = {
  judgmentId: string;
  caseTitle: string;
  /** Nullable here for the same reason it is on every other surface. */
  neutralCitation: string | null;
  court: string;
  /** `YYYY-MM-DD`. A date on a court record, never a timestamp. */
  judgmentDate: string;
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
  judgment: CitationCheckJudgment | null;
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

/**
 * AN AUTHORITY SAVED TO A MATTER — `GET|POST|DELETE /matters/:id/authorities`,
 * live 11 Aug 2026. Shape read from `services/api/src/matters/authorities.ts`,
 * not from the summary of it.
 *
 * REMOVAL IS A TIMESTAMP, NEVER A DELETE, mirroring `matter_shares`: a removed
 * row still comes back with `removedAt` set. A matter file that silently forgets
 * an authority was ever saved is a matter file that cannot answer "what did I
 * rely on in March", which is the question the workspace exists to answer.
 */
export type MatterAuthority = {
  authorityId: string;
  judgmentId: string;
  caseTitle: string;
  /** Nullable for the same reason it is everywhere else. Render via `citationDisplay`. */
  neutralCitation: string | null;
  addedBy: string;
  addedAt: string;
  /** Non-null once removed. The row is kept, not erased. */
  removedAt: string | null;
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
  /**
   * STRUCTURED SEARCH — additive, 9 Aug 2026. `docs/API_CONTRACTS.md` §Search.
   *
   * Present only when `query` parsed as a field/Boolean/citation/proximity/range
   * expression (`judge:"Kania" AND section:138`); absent for ordinary prose,
   * which takes the semantic path unchanged. `parsed` is the server's own
   * plain-English echo of what it understood — e.g. *"Judgments decided by a
   * judge matching 'Kania', and referring to section 138."*
   *
   * MUST BE SHOWN TO THE ADVOCATE WHENEVER PRESENT, never only on zero results.
   * A misparse produces *results*, not an error — `a AND b OR c` read as
   * `a AND (b OR c)` still returns real judgments, just not the ones asked for.
   * Stating the interpretation and letting the advocate check it against what
   * they typed is the only defence against that; hiding it when results look
   * plausible is exactly when it is needed most.
   */
  parsed?: string;
  /**
   * THE FULL MATCH COUNT, NOT THE PAGE LENGTH. A structured query can match far
   * more than the five rows in `results` (`section:138 act:"NI Act"` → 359),
   * and an advocate deciding whether to narrow a search needs to know which.
   * Present only alongside `parsed`.
   *
   * `total: 0` is a first-class, TRUSTED answer, never a fallback trigger.
   * `docs/CITATION_HARNESS.md`/A2.7: structure decides, semantics fills, and the
   * two are NEVER blended — a structured query that matches nothing renders
   * "no judgment matches this", never a quiet retry against semantic search.
   * `judge:"Kania" AND section:138` returning three cheque cases by other
   * judges would read as "these are the Kania cases", not as "we guessed",
   * and the advocate has no way to tell the difference.
   */
  total?: number;
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
  /** Wire field is `userId`, not `id` — `readProfile()`/`profileFor()` in `services/api/src/auth/*.ts` both return `userId: row.id`. */
  userId: string;
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

/**
 * `POST /auth/verify`'s `user` is the identity shape (`authId`/`profileComplete`/
 * `profile`), the same as `MeResponse.user` — not a flat `User`. Unused by
 * `state/session.ts` today (status is settled by a separate `GET /me` call,
 * deliberately, per that file's own comment), but typed correctly rather than
 * left wrong because nothing currently reads it.
 */
export type Session = {
  accessToken: string;
  refreshToken: string;
  user: { authId: string; email: string; profileComplete: boolean; profile: Profile | null };
};

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

/**
 * `GET /me` wraps everything under `user` — `handleMe()` in
 * `services/api/src/auth/routes.ts` returns `ok(c, { user: {...} })`, not a
 * flat object. This type was flat until 8 Aug 2026, which made
 * `!me.profileComplete` true unconditionally (reading a key that only ever
 * existed one level down) — every sign-in, including a fully onboarded
 * account, was treated as profile-incomplete and sent back to onboarding.
 * Found live on device: `GET /me` curled directly returned
 * `profileComplete: true`, but the app still routed to `/onboarding` every
 * time. `state/session.ts`'s `loadProfile` reads `res.data.user` now.
 */
export type MeResponse = {
  user:
    | { authId: string; email: string | null; profileComplete: false; profile: null }
    | { authId: string; email: string | null; profileComplete: true; profile: Profile };
};

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

/**
 * `GET /corpus/coverage` — R3, additive, 11 Aug 2026. `docs/API_CONTRACTS.md`
 * §Search. Public route, no auth.
 *
 * WHY THIS EXISTS: `SELECT court, count(*) FROM judgments` returns one row —
 * Supreme Court of India, 38,341. An advocate practising in a High Court
 * searches, gets a confident-looking (empty) result, and is told nothing about
 * the fact that we hold 0 of 3,493,695 Allahabad documents. `CLAUDE.md`:
 * silence about a gap does the same damage as a fabricated citation.
 *
 * THREE RULES, NOT COSMETIC:
 *
 * 1. `sourceDocuments` counts DOCUMENTS, never judgments, and no surface may
 *    relabel it. `docs/HC_CORPUS_SURVEY.md` measured the judgment share of
 *    the AWS High Court bucket at a RANGE, 0.75%-18.64% — the only published
 *    label does not distinguish a judgment from an order on 17.89% of rows.
 *    Rendering "0 of 3,493,695 judgments" states a number nobody measured.
 * 2. `supremeCourt.sourceDocuments` is `null`, never `0` — that bucket was
 *    never enumerated per year, and unknown is a state, not zero.
 * 3. This is OUR uncertainty about coverage, never the advocate's authority
 *    having moved. Renders in neutral ink. Amber is reserved for `overruledStatus`
 *    and nothing else.
 */
export type CorpusCoverage = {
  supremeCourt: {
    courtName: string;
    /** A real, live count of `judgments` rows — the Supreme Court bucket is complete, so this word is earned. */
    held: number;
    /** Always `null` — see rule 2 above. */
    sourceDocuments: null;
  };
  /** Sorted worst-gap-first by the server, so the biggest hole is what renders first. */
  highCourts: {
    courtName: string;
    courtCode: string;
    /** DOCUMENTS. See the type-level note — never rendered as "judgments". */
    sourceDocuments: number;
    held: number;
    firstYear: number;
    lastYear: number;
  }[];
  /** True on every response today. States out loud that `sourceDocuments` is not a judgment count. */
  judgmentShareUnknown: boolean;
  /** `[0.0075, 0.1864]` — the measured range, never a point estimate. */
  judgmentShareRange: [number, number];
  /** When the SOURCE was counted, not when a row was written. Null only if the source was never enumerated. */
  enumeratedAt: string | null;
};

/**
 * `GET/POST/DELETE /me/training-consent` — DPDP Act 2023 s. 6. ADDITIVE,
 * 9 Aug 2026. `docs/API_CONTRACTS.md` §Training consent.
 *
 * NOT THE PD-8 ONBOARDING CONSENT. `CurrentTerms`/`acceptTerms` cover AI
 * assistance and the duty to verify. This answers a different, DPDP-specific
 * question: may an advocate's own accepted search results, kept drafts and
 * matter citations be used to train a future model? s. 6 requires that
 * consent be free, specific, informed and — unlike the onboarding terms —
 * withdrawable as easily as it was given. The two must never be collected
 * together or inferred from one another.
 */
export type TrainingConsent = {
  /** Both server-side columns set. Never inferred from silence. */
  granted: boolean;
  /** Null when never granted — an absence reported as an absence. */
  grantedAt: string | null;
  /** The notice actually agreed to. Null alongside `granted: false`. */
  version: string | null;
  /** What the app should show. Send this back on `POST`, not a client constant. */
  currentVersion: string;
  /**
   * False when consent was given against a superseded notice — real consent,
   * just not to what is on screen now. Distinct from `granted` on purpose:
   * collapsing them would let a notice change silently re-authorise or
   * silently revoke everyone.
   */
  isCurrent: boolean;
};

/* -------------------------------------------------------------------- matters */

export type Matter = {
  /**
   * Wire field is `matterId`, not `id` — `shapeMatter()` in
   * `services/api/src/matters/route.ts`, confirmed against the live source
   * 8 Aug 2026 rather than assumed. Every screen that read `.id` before this
   * was reading `undefined`; it went unnoticed because no matter existed to
   * click through until tonight's device pass.
   */
  matterId: string;
  caseTitle: string;
  cnrNumber: string | null;
  court: string;
  caseType: string;
  /**
   * `matters.parties` is `jsonb` with no key spec anywhere in
   * `docs/SCHEMA_TRUTH.md` — the server accepts and returns any object
   * (`z.record(z.string(), z.unknown())`). Was typed `string` here, which
   * would have rendered `{matter.parties}` as `[object Object]` (or thrown)
   * the first time a real matter existed. `{ description }` is RCC's choice
   * of shape, not a contract LCC enforces.
   */
  parties: { description: string };
  clientName: string;
  ourSide: string;
  nextHearingDate: string | null;
  /**
   * HOW THE CALLER REACHES THIS MATTER — sent on `GET /matters` per row and on
   * `GET /matters/:id` at the top level, and read by nothing until 11 Aug 2026.
   *
   * The server states it rather than letting the client infer it, and says why:
   * "an absence and a permission boundary look identical otherwise, and one of
   * those is a bug report waiting to happen." A sharee's bundle comes back with
   * `documents: []` and private notes nulled, which is indistinguishable from a
   * matter that simply has neither.
   *
   * IT DECIDES WHAT MAY BE OFFERED, NOT WHAT MAY BE READ. `authorities.ts`:
   * "a sharee can see the file but cannot add to it" — every write in
   * `matters/route.ts` checks `user_id` directly. Without this field the
   * workspace offered a sharee four buttons that answer 404.
   *
   * Optional because `POST /matters` and `PATCH /matters/:id` return a bare
   * `shapeMatter()` with no `access` — the caller of those is the owner by
   * construction.
   */
  access?: MatterAccess;
  /** Sent by `shapeMatter()`, undeclared until 11 Aug 2026. Nothing reads them yet. */
  status?: string;
  source?: string;
  createdAt?: string;
};

/** `owner` writes; `shared` reads. `none` never reaches a client — it 404s. */
export type MatterAccess = 'owner' | 'shared';

export type MatterEvent = {
  /** Wire field is `eventId`, same drift as `Matter.matterId` above. */
  eventId: string;
  eventDate: string;
  eventType: string;
  orderText: string | null;
  notes: string | null;
  /** PD-4 — private by DEFAULT, in the column and not in application code. */
  noteVisibility: 'private' | 'shared';
  /** Sent on every event, undeclared until 11 Aug 2026. Who recorded it. */
  source?: string;
  createdAt?: string;
};

/* ------------------------------------------------------------------ briefings */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * REWRITTEN 11 AUG 2026 AGAINST `services/api/src/briefings/route.ts`. The type
 * that stood here described a briefing NOBODY HAS EVER SENT.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It declared `id`, `subject`, `whereItStands`, `pendingBeforeCourt`,
 * `checklist: {id,label,done}[]` and `datesNotConfirmed: boolean`. The endpoint
 * sends `briefingId`, `caseTitle`, `court`, `blocks` and `dateConfidence`, and
 * has sent those since the route was written. `BriefingScreen` read the six
 * invented fields and got `undefined` for every one — on the wedge feature,
 * read standing outside a courtroom.
 *
 * TWO OF THE SIX WERE SAFETY FAILURES, NOT COSMETIC ONES:
 *
 *   · `datesNotConfirmed` COLLAPSED THREE STATES INTO TWO. `route.ts` is
 *     explicit — "Three states, never a boolean. Both null means nobody has
 *     checked this date; the client must not render that as confirmed." The
 *     undeclared field read `undefined`, which is falsy, so an unconfirmed
 *     listing rendered exactly like a confirmed one. An advocate misses a
 *     hearing that way.
 *   · `authorities: SearchResult[]` was wrong in kind. The wire type is a
 *     union on `available`, and it carries NO `verificationState` — see
 *     `BriefingAuthority`.
 */
export type BriefingBlocks = {
  /** Block 01. `present: false` carries a `note` saying so, never an empty string. */
  lastOrder: {
    present: boolean;
    eventId?: string;
    eventDate?: string;
    orderText?: string;
    note?: string;
  };
  /** Block 02. */
  pendingApplications: {
    count: number;
    items: { eventId: string; eventDate: string; description: string }[];
    note?: string;
  };
  /**
   * Block 03, AS STORED — ids only. The rendered authorities come from the
   * top-level `authorities` array, whose status is re-read live on every
   * request. Never render from here: that is the cached blob, and good-law
   * status is the one thing the harness forbids caching.
   */
  authorities: { judgmentId: string; addedAt: string; paragraphNumber: number | null }[];
  /**
   * Block 04. `text` and `basis` — NOT `label`, and there is no `done`.
   * Nothing server-side records a tick, so the tick is local to the session
   * and this type must not imply otherwise.
   */
  checklist: { id: string; text: string; basis: string }[];
};

/**
 * WHETHER THE LISTING ITSELF IS CONFIRMED — THREE STATES, NEVER A BOOLEAN.
 *
 * `never_checked` is deliberately not folded into `not_confirmed`: a date the
 * advocate typed that no cause list has been consulted about is not a failed
 * check, and marking it as one would cry wolf on every manually entered matter
 * (PD-12 — manual entry is first-class, never a fallback).
 */
export type DateConfidence = {
  source: string | null;
  confirmedAt: string | null;
  notConfirmedAt: string | null;
  notConfirmedReason: string | null;
  state: 'confirmed' | 'not_confirmed' | 'never_checked';
};

/**
 * AN AUTHORITY ON A BRIEFING — a union on `available`, and NOT a `SearchResult`.
 *
 * The unavailable arm exists because `route.ts` refuses to drop an authority
 * whose row could not be read: "an authority that vanishes from a briefing is
 * indistinguishable from one that was never cited, which is the silent-drop
 * failure wearing different clothes." It must be rendered, with its note.
 *
 * IT CARRIED NO `verificationState` UNTIL 11 AUG 2026, and the consequence was
 * visible: `citationRender` treats a missing existence field as UNCONFIRMED —
 * absence never upgrades to confirmed — so every briefing authority drew "Do
 * not file this without checking it", including ones from the advocate's own
 * verified matter. Reported rather than defaulted away (bus 0038); LCC sends
 * both fields now, Tier 1 by construction, and the mark is silent again.
 */
export type BriefingAuthority =
  | { judgmentId: string; available: false; note: string }
  | {
      judgmentId: string;
      available: true;
      caseTitle: string;
      neutralCitation: string | null;
      /**
       * `'verified' | 'corpus'` by construction today — a briefing authority
       * IS a corpus row, so it resolves to itself. Declared as the full unions
       * anyway: the day a briefing can carry an authority resolved by another
       * tier, this type does not have to change for the mark to stay honest.
       */
      verificationState: VerificationState;
      verifiedBySource: VerifiedBySource;
      /** Read live on this request. Never the value last night's sweep saw. */
      overruledStatus: OverruledStatus;
      overruledByJudgmentId: string | null;
      /** The case name of the judgment that moved the law, joined server-side. */
      overruledByTitle: string | null;
      overruledParas: number[] | null;
      overruledNote: string | null;
      /** `set_aside` only. The one refusal in the product, decided server-side. */
      addToMatterAllowed: boolean;
    };

export type Briefing = {
  briefingId: string;
  matterId: string;
  caseTitle: string;
  court: string;
  /** `YYYY-MM-DD`. A date, never a timestamp. */
  hearingDate: string;
  generatedAt: string;
  deliveredAt: string | null;
  openedAt: string | null;
  dateConfidence: DateConfidence;
  /** `null` when the stored blob could not be parsed — every block then says so. */
  blocks: BriefingBlocks | null;
  authorities: BriefingAuthority[];
};

/**
 * THE SAME BRIEFING AS A ROW IN A LIST — and it is a THIRD shape, because the
 * two list routes do not agree with each other.
 *
 * `GET /matters/:id/briefings` sends `dateConfidence` as an object.
 * `GET /matters/:id` (the matter bundle) sends the same facts FLAT, as
 * `datesConfirmedAt` / `datesNotConfirmedAt` / `datesNotConfirmedReason` /
 * `hearingDateSource` — see `MatterBundleBriefing`. Neither carries a subject
 * or a case title. Reported to LCC; modelled separately here because modelling
 * them as one would mean one of the two screens reading a field that is not
 * there, which is the defect this whole section exists to correct.
 */
export type BriefingListItem = {
  briefingId: string;
  hearingDate: string;
  generatedAt: string;
  openedAt: string | null;
  dateConfidence: DateConfidence;
};

/** The briefing rows carried inside `GET /matters/:id`. Flat date fields. */
export type MatterBundleBriefing = {
  briefingId: string;
  hearingDate: string;
  generatedAt: string;
  openedAt: string | null;
  datesConfirmedAt: string | null;
  datesNotConfirmedAt: string | null;
  datesNotConfirmedReason: string | null;
  hearingDateSource: string | null;
};

/* ------------------------------------------------------------------- drafting */

export type DocumentType = { type: string; label: string; requiredFields: string[] };

/**
 * ONE ARRAY, NOT TWO. `POST /documents`'s response carries a separate
 * `unverifiedReferences`, but `GET /documents/:id` does not — an unresolved
 * citation on a saved draft is just a row here with `judgmentId: null`, never
 * a second bucket to remember to check. `citationClaimed` is the only text
 * available for one of those; `caseTitle` is null alongside it.
 *
 * `overruledStatus` is null exactly when `judgmentId` is null — there is no
 * judgment row to read a status from. Coerce to `'none'` before handing this
 * to `citationRender()`, which expects the non-null union.
 */
export type DraftCitation = {
  citationCheckId: string;
  citationClaimed: string;
  judgmentId: string | null;
  caseTitle: string | null;
  verificationState: VerificationState;
  verifiedBySource: VerifiedBySource;
  overruledStatus: OverruledStatus | null;
};

/**
 * `GET /documents/:id` → `{ document }`. Verified 11 Aug 2026 directly
 * against `services/api/src/documents/route.ts`'s `readDocument()` — nothing
 * on the client had ever called this route before, and the shape here
 * replaces an earlier version of this type that invented `paragraphs` and a
 * `SearchResult[]`-shaped `citations` neither of which the server has ever
 * sent. `docs/API_CONTRACTS.md` §Drafting abbreviates the response as
 * `{ document }` with no field list, so this was a client assumption that
 * went unverified for as long as nothing exercised it.
 */
export type DraftDocument = {
  documentId: string;
  documentType: string;
  matterId: string | null;
  /**
   * THE WHOLE GENERATED PROSE, AS ONE STRING — not split into paragraphs.
   * `PATCH /documents/:id` takes `{ paragraphs: [{ index, text }] }` as
   * INPUT for editing, but the read shape never sends that split; a surface
   * that wants paragraph breaks splits `content` for DISPLAY ONLY, the same
   * way `OnboardingScreen`'s terms body is broken on blank lines.
   */
  content: string;
  language: 'en' | 'hi';
  createdAt: string;
  citations: DraftCitation[];
  /**
   * "4 of 4 citations verified" — derived at read time. `API_CONTRACTS.md`:
   * renders in the draft footer IN-APP ONLY, never written into the document
   * and never exported (PD-8). This is the one place "verified" is a number
   * rather than a silent absence — the exception is documented, not a lapse
   * in the verified-is-silent rule.
   */
  citationSummary: { total: number; verified: number };
};

/**
 * `GET /documents` — the Drafts list. `docs/API_CONTRACTS.md` §Drafts list,
 * added 11 Aug 2026. Auth required, newest first.
 *
 * NO `content` HERE. A list of twenty drafts would ship twenty full
 * documents to render twenty titles, and that content is sensitive-class
 * (`docs/PRIVACY_PII.md`).
 *
 * `unverifiedCount` counts `failed` TOGETHER WITH `unverified`, deliberately
 * — `docs/CITATION_HARNESS.md`: an advocate cannot act on the difference,
 * and an outage must not read as a corpus gap. Render it as "could not
 * confirm", never "verification failed".
 *
 * `overruledStatus` is NOT summarised into this list, on purpose — it is
 * read live at render on the surfaces that show a citation, never cached
 * into a count that ages. Do not derive a LAW MOVED mark from this response.
 */
export type DraftListItem = {
  documentId: string;
  documentType: string;
  matterId: string | null;
  matterTitle: string | null;
  language: 'en' | 'hi';
  createdAt: string;
  citationCount: number;
  unverifiedCount: number;
};

/* ---------------------------------------------------------------------- court */

/** Vendor-agnostic. OD-1 is open; the manual path returns `{ available: false }`. */
export type CourtLookupResult =
  | { available: false }
  | { available: true; matter: Omit<Matter, 'matterId'> };

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
  /**
   * ADDITIVE, 9 Aug 2026. Setting keys with no producer yet — the switch
   * saves and the server honours it, but nothing today can ever write the
   * alert it names, so flipping it on is inert.
   *
   * DERIVED server-side from the `alert_kind` enum, never hard-coded here:
   * when a trigger ships, its key drops out of this list on its own. A
   * client that hard-codes the two names today would be correct now and
   * silently wrong the day trigger 3 or 4 lands. Always present — an empty
   * array means everything toggleable currently works.
   */
  unavailable: string[];
};
