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
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

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
/**
 * OD-14 LAYER 4 — **WHO** said the law moved. NEW3 R16 `R16-RCC-01`.
 *
 * A SEPARATE CONCEPT FROM EVERY NEIGHBOUR IT SITS BESIDE, and that is the whole
 * reason it exists as its own field. `verificationState` answers "does this
 * authority exist", `overruledStatus` answers "has the law moved", and this
 * answers "on whose word". Three different questions from three different
 * sources; collapsing any two produces a claim we cannot support.
 *
 * `services/api/src/judgments/precedential-effect.ts` derives it from
 * `judgment_citations.treatment_provenance` and ranks COURT > REPORTER >
 * UNKNOWN > DEFECTIVE. **95.62% of what drives LAW MOVED is a law reporter's
 * headnote and 3.65% is the later court's own reasoning**, so the difference is
 * not a rounding detail: "a reporter records that this was overruled" is a very
 * different thing to walk into court with than "the Supreme Court held it was".
 *
 * ONLY `COURT` MAY BE WORDED AS A HOLDING — `mayStateAsHolding()` in
 * `citation/treatmentAttribution.ts`, this client's single copy of that rule.
 * `REPORTER` is attributed to the reporter. `DEFECTIVE` and `UNKNOWN` are never
 * promoted into evidence of anything.
 *
 * ADDITIVE AND OPTIONAL EVERYWHERE. It never changes a banner, never changes
 * `canAddToMatter`, and absence means "nothing was said about who", never
 * "nobody". A route that does not send it renders no attribution line at all.
 *
 * IT IS NOT ON `SearchResult`, DELIBERATELY. `services/api/src/search/route.ts`
 * DROPS the field from both the structured and hybrid result projections even
 * though `retrieve.ts` computes it — NEW3 R16 §4 records that asymmetry as
 * deferred and LCC-owned. Declaring it on a search row would be this client
 * inventing a field the search wire has never carried, and every consumer would
 * then read `undefined` and print an attribution nobody sent.
 */
export type TreatmentAttribution = 'COURT' | 'REPORTER' | 'DEFECTIVE' | 'UNKNOWN';
/**
 * OD-14, resolved 21 Aug 2026 — `services/api/src/judgments/precedential-effect.ts`.
 * The finer fact underneath `overruledStatus`: EIGHT values against the wire
 * enum's four, because `set_aside` alone cannot distinguish "this decision was
 * undone" from "a later bench overruled the proposition; this decision stands".
 * `overruledStatus` is unchanged and still the only value a client that has
 * never seen this may render as a banner — this rides alongside it, additive.
 *
 * THE VALUE SET IS OPEN-ENDED AND WIDENS HERE OR NOT AT ALL. `precedentialEffect`
 * is a string field the server may grow, so every consumer must keep a safe path
 * for a value it does not know — `citation/treatmentRelationship.ts` does, and
 * its `default` arm is what made the eighth value safe before it was declared.
 * Widening this union from server source alone stays forbidden; it widens when
 * the CONTRACT widens it.
 */
export type PrecedentialEffect =
  | 'none'
  | 'overruled'
  | 'overruled_in_part'
  | 'set_aside'
  | 'partly_set_aside'
  | 'doubted'
  | 'review_required'
  /**
   * R14 A5, the eighth value, served today. The stored adverse status has NO
   * USABLE EVIDENCE behind it — every adverse edge is a modality defect, which
   * NEW2 adjudicated as not a treatment at all.
   *
   * DISTINCT FROM `review_required`, and the distinction decides the direction.
   * `review_required` is genuine ambiguity about what a later court did, and
   * refusing is the cautious side. `evidence_defect` is a fact about OUR PARSER
   * and not about the law, so it must SUBTRACT a warning and never ADD a
   * prohibition: no relationship verb, no banner, no statement about what any
   * court did. Neutral later-judgment copy only.
   */
  | 'evidence_defect';

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
   * OD-14 LAYER 2 — additive alongside `overruledStatus`, which stays the
   * banner. Optional because not every route that carries a citation has been
   * confirmed to send it (`docs/CURRENT_PLAN.md` NEW3 22 Aug: briefings does
   * not yet — flagged to LCC). Absent means "treat this like before OD-14",
   * never "none".
   */
  precedentialEffect?: PrecedentialEffect;
  /**
   * OD-14 LAYER 3 — THE ONE FIELD THAT MAY ACTUALLY DIFFER FROM
   * `overruledStatus === 'none'`. An `overruled` (not `set_aside`) authority
   * carries `overruledStatus: 'set_aside'` (still the strongest banner) AND
   * `canAddToMatter: true` (the decision between the original parties stands).
   * `docs/CITATION_HARNESS.md` + `precedential-effect.ts`. THIS is the field
   * `citationRender`'s `blocksAddToMatter` must key on when present — deriving
   * the refusal from `overruledStatus` alone reintroduces the exact bug OD-14
   * fixed server-side. Absent falls back to the pre-OD-14 conservative rule
   * (refuse on any non-`none` `overruledStatus`), which is safe, not correct.
   */
  canAddToMatter?: boolean;
  /**
   * The raw stored column, for the admin monitor only. NEVER render this as a
   * banner or use it to decide anything an advocate sees — `overruledStatus`
   * above is already the derived value a surface must show.
   */
  overruledStatusStored?: OverruledStatus;
  /**
   * A verified adverse edge the corpus has not yet applied to this row's own
   * `overruledStatus` (`unappliedTreatment` in `precedential-effect.ts`). NOT
   * a banner — never render this where `moved` renders. Non-null for 2
   * judgments today; exists so the fact is not silent.
   */
  unappliedTreatment?: string | null;
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
  /**
   * NULLABLE SINCE 11 AUG 2026 (LCC `c2da1b9`/migration `0040`). `bench` used
   * to hold `patnahcucisdb94`-shaped AWS S3 partition slugs on every High
   * Court row — 51.3% of the corpus, 40,980 judgments — because the ingest
   * script's `bench` and the column's `bench` named two different things: the
   * establishment that PUBLISHED the file versus the judges who sat. The
   * slugs moved to `source_bench_code` server-side; this column now goes
   * `null` wherever no coram was recorded, which is every High Court row
   * today. Render absence as absence — a fabricated coram is worse than none.
   */
  bench: string | null;
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

  /* ---------------------------------------------- the trust surface, R12 §5 */

  /**
   * THE BODY-TEXT REFUSAL ENVELOPE — `services/api/src/judgments/route.ts`,
   * `search/body-text-safety.ts`.
   *
   * `evidenceWithheld: true` means this judgment's body text is CONVICTED
   * damaged and `fullText` has been emptied deliberately — empty by REFUSAL,
   * not by absence. **The reader must render the refusal. It must never render
   * an empty page**, which reads as "this judgment has no text" and is a claim
   * about the court rather than about our copy.
   *
   * Everything else about the judgment stays true and stays shown: the
   * citation, title, court, date and treatment are undamaged, and body damage
   * is no evidence against them.
   *
   * Optional only because an older server sends no envelope. Absent means the
   * question was never asked, which is not the same as a clean answer.
   */
  bodyText?: {
    /** `TEXT_DAMAGED` | `TEXT_UNKNOWN`. There is no CLEAN state — nothing certifies clean. */
    state: 'TEXT_DAMAGED' | 'TEXT_UNKNOWN';
    /**
     * How well the damage is PROVEN, a different axis from whether it is
     * damaged. `PROOF` is a byte-stream examination; `SCREEN` is a density or a
     * marker — enough to refuse a batch, not enough to tell a person their
     * document is corrupt. The two are never pooled into one damage rate.
     */
    grade: 'PROOF' | 'SCREEN' | 'NONE';
    evidenceWithheld: boolean;
  };
  /**
   * WHAT THE RETAINED ARTIFACT IS — a statement about the artifact, never a
   * segmentation of the body. `REPORTER_EDITION` matters legally: a reporter's
   * copy-edited text is not the court's own words (`CLAUDE.md`, *EBC v. Modak*)
   * and may not be presented as them.
   */
  textOrigin?: 'REPORTER_EDITION' | 'COURT_SOURCE' | 'UNKNOWN';
  /** FALSE for a reporter edition. This client never generates, so it only refuses. */
  generationEvidenceEligible?: boolean;
  /**
   * FOUR FACTS, AND THE CLIENT CAN TELL ALL FOUR APART. `DATE_UNCHECKED` is the
   * named form of "nobody looked" and was what the R12 probe observed — so
   * **present is not verified, and no surface may imply otherwise.**
   * `DATE_SUSPECT` is the only one that refuses.
   */
  dateQualityState?: 'DATE_VERIFIED' | 'DATE_SUSPECT' | 'DATE_UNKNOWN' | 'DATE_UNCHECKED';
  /** The raw column behind `dateQualityState`; `null` means nothing has looked. */
  dateQuality?: 'DATE_VERIFIED' | 'DATE_SUSPECT' | 'DATE_UNKNOWN' | null;
  /**
   * WHERE THIS DOCUMENT CAME FROM, AS A RECORD — migration `0092`, put on the
   * wire by LCC R12 (`f2a14b5`). **Measured 30 Aug 2026: 5,830 of 18,758,460
   * rows carry it, 0.031%.** Every other judgment answers `null` here, and NULL
   * is published rather than defaulted.
   *
   * `recorded` is the field to branch on. A client must NOT read absence of the
   * record as absence of provenance, and must never render "source unknown" as
   * a quality claim: `sourceUrl` is present for 100% of the corpus, so we can
   * always say where a document came from. What is missing is the STRUCTURED
   * record.
   *
   * BANNED CLAIM, from the frozen registry: "Verified from the retained
   * official PDF" is FALSE for 99.92% of the corpus and must never appear on a
   * judgment surface. "Source: <court>, <url>" is true everywhere.
   */
  provenance?: {
    /** e.g. `aws_hc`, `sci_pdf`. `null` for almost every row. */
    source: string | null;
    /**
     * The RECORDED edition. `textOrigin` beside it is the EVIDENCED answer and
     * is derived per row; this one is recorded for almost nothing, and
     * defaulting it to `court_raw` would be true of the corpus and unevidenced
     * of the row.
     */
    sourceEdition: string | null;
    /** An ingest-provenance note, NOT a rights determination. */
    basis: string | null;
    recordedAt: string | null;
    /** TRUE only when this ROW carries recorded provenance. Branch on this. */
    recorded: boolean;
  };
  /**
   * OD-14 LAYER 4 — WHO said the law moved, for the authority being read.
   * `services/api/src/judgments/route.ts` emits it on every response.
   *
   * ON THIS TYPE AND NOT ON `SearchResult`, even though this type is built
   * from that one. The judgment route emits it; the search route drops it.
   * Putting it on the `Omit<SearchResult, …>` base would silently declare it
   * on every search row too — see the union's own note.
   */
  treatmentAttribution?: TreatmentAttribution;
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
  'cites' | 'followed' | 'distinguished' | 'doubted' | 'overruled' | 'overruled_in_part';

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
  /*
    `paragraph?: number` LIVED HERE AND WAS FICTION. Removed 11 Aug 2026.

    `judgment_citations` has no paragraph column (`packages/db/src/schema.ts`
    — the positional field it stores is `char_offset`), `treatment.ts` selects
    and returns no such key, and no fixture ever set one. `TreatmentCard` read
    it and appended ` · ¶ n` to the citation line, so the card promised to name
    the paragraph a later bench acted in and could never do it.

    This is the INVERSE of the defect class this sweep keeps finding. The usual
    one drops a field the server really sends; this one declares a field the
    server has no column for, and it is more dangerous in review — the type
    reads as evidence that the wire carries a paragraph, and the next person to
    need one would build on it rather than ask LCC for it.
  */
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
  /**
   * WHO said it, on the row that says WHAT was said —
   * `services/api/src/judgments/treatment.ts`, derived per row from that
   * row's own `treatment_provenance`.
   *
   * The sharpest case for the whole layer: on this screen a reporter's
   * editorial headnote and the later court's own reasoning rendered
   * IDENTICALLY, side by side, in a list whose entire purpose is to show an
   * advocate how the law moved.
   */
  treatmentAttribution?: TreatmentAttribution;
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

/**
 * THE GRAPH SAYS IT IS PARTIAL — G-3, closed by LCC R12 (`f2a14b5`,
 * `services/api/src/judgments/graph-coverage.ts`).
 *
 * Before this field existed, `truncated` said "this PAGE is short" and nothing
 * said "this GRAPH is 0.56% complete" — so a judgment with no edges was
 * indistinguishable from a judgment that cites nothing. On a citation graph
 * that is the same silent-drop defect `CITATION_HARNESS.md` forbids for a
 * citation: **absence of an edge is never absence of a citation**, and no
 * surface may draw it as though it were.
 *
 * `declaredPartial` is `true` and is a CONSTANT on the server, not a threshold.
 * There is no coverage level at which this graph becomes a complete statement
 * about Indian citation practice; when it genuinely is, the field is removed
 * rather than flipped. So a client must never branch on it being `false`.
 *
 * `note` is the server's own sentence and is rendered VERBATIM where the graph
 * is shown. It is kept server-side deliberately — three clients paraphrasing
 * the distinction would produce three different claims, and this is the claim
 * an advocate must not get wrong.
 */
export type GraphCoverage = {
  /** What was counted, in the server's words. */
  basis: string;
  resolvedEdgesInCorpus: number;
  judgmentsWithAnyResolvedOutgoing: number;
  corpusDenominator: number;
  /** Always `true`. See above — never branch on a `false` that cannot occur. */
  declaredPartial: true;
  /** Share of the corpus with at least one resolved outgoing citation, 0-1. */
  outgoingCoverageShare: number;
  measuredAt: string;
  /** Render this verbatim. Never paraphrase it. */
  note: string;
};

export type PrecedentGraph = {
  rootId: string;
  asOf: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalNodes: number;
  returned: number;
  /** THIS PAGE is short. Says nothing about how complete the graph is. */
  truncated: boolean;
  /**
   * ADDITIVE, LCC R12. Optional here because a client built against the
   * pre-G-3 server must not crash on its absence — but a surface that renders
   * the graph WITHOUT it is rendering an undeclared partial graph, which is the
   * defect G-3 names. Absent means: do not draw the graph.
   */
  coverage?: GraphCoverage;
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
  'good_law_then' | 'already_moved' | 'overruled_here' | 'moved_since' | 'unknown';

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
  /**
   * ALL FIVE ARE UNCONDITIONAL. `overruledHere` was optional here until
   * 11 Aug 2026 while `as-at.ts` sent it on every response — and the two test
   * fixtures that omitted it were therefore describing a payload production
   * never produces, the same fixture-drift that hid the missing judgment date
   * on a search row.
   *
   * The panel does not render this object and that is deliberate, not an
   * oversight — see `AuthoritiesPanel.tsx`, "a five-tile dashboard here would
   * read as a scorecard on the judgment". It recomputes what it needs from the
   * rows. The shape is still declared truthfully, because the next surface to
   * want a summary must not have to re-derive whether the field arrives.
   */
  counts: {
    goodLawThen: number;
    alreadyMoved: number;
    overruledHere: number;
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
  /**
   * WHO said the law moved — `services/api/src/arguments/counter.ts`, passed
   * straight through from `retrieve.ts` rather than re-derived, because two
   * derivations of one fact is how this screen and the search results end up
   * disagreeing about a single authority.
   *
   * Load-bearing HERE in particular: this is the screen an advocate reads
   * while preparing to argue AGAINST these authorities.
   */
  treatmentAttribution?: TreatmentAttribution;
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
  /**
   * ADDED 24 Aug 2026, `services/api/src/arguments/counter.ts`. `reason` above
   * stays the literal string `'set_aside'` for every row — LCC did not widen
   * that enum, and this client has not adopted a wider one — but which rows
   * land in this list changed: only those whose own decision is gone, OR whose
   * status nothing verified. `precedentialEffect` says which. Its one case that
   * changes what this screen should say is `review_required`: a stored
   * `set_aside` a verified edge only weakly supports, where "this authority has
   * been set aside" overclaims a certainty the server itself is refusing to
   * assert. `exclusionReason` below reads it for exactly that case.
   */
  precedentialEffect?: PrecedentialEffect;
  /**
   * Excluded rows carry it too, and the server says why: an authority kept
   * OUT of an argument on a reporter's editorial note is exactly the
   * exclusion an advocate might want to challenge, and they cannot
   * challenge what they cannot see.
   */
  treatmentAttribution?: TreatmentAttribution;
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

/* ------------------------------------------- statute-linked judgments · HELD */

/**
 * `GET /statutes/:statuteId/linked-judgments` — LCC R19 at `69d2a9bb`, NEW3 R16
 * `R16-RCC-08`. **HELD. There is no route to it, and there must not be one.**
 *
 * Transcribed from `services/api/src/statutes/linked-judgments.ts` — the route
 * source, not the handoff message and not the contract prose. Two of the fields
 * below are shaped differently from the way the handoff described them
 * (`resolutionState` is an ARRAY of the states aggregated into the row, and
 * `withheld.byResolutionState` is a MAP keyed by ground), and reading the
 * summary rather than the handler would have produced a client that compiles
 * and mis-renders.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE CLAIM THIS ROUTE MAKES, AND THE FOUR IT REFUSES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `relationship` is `cites_statute_reference` and that is the whole of it: a
 * judgment's TEXT carries a structurally extracted reference to this Act, or to
 * this section of it. It is a citation fact. It is NOT that the section
 * applied, was interpreted, was decided under, or that these are the good
 * judgments on it — and `semantics` carries the server's own sentence saying so
 * precisely so a client renders the server's words rather than a designer's.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFAULT TIER IS EMPTY, AND THAT IS THE ANSWER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured on the corpus 1 September 2026: of 905,944 rows in
 * `judgment_statute_refs`, 905,853 carry a NULL `resolution_state` and the only
 * 91 the resolver has ever written are REFUSALS — 49 `refused_pre_enactment`,
 * 42 `unresolved_pre_commencement`, and zero of either confirming state.
 * `SCHEMA_TRUTH.md` says NULL *"never"* means a confirmed link. So
 * `resolver_confirmed` — the default — returns an empty page for every input,
 * and the empty state is the PRIMARY state of this surface rather than its edge
 * case.
 *
 * `structural_unreviewed` is the other tier. It is DEVELOPMENT AND ACCEPTANCE
 * ONLY: it returns the unclassified population, labels every row it returns,
 * and vouches for none of it. It must never reach an advocate as a linked
 * judgment while this stands — see {@link StatuteLinkedEvidence}.
 */
export type StatuteLinkedEvidence = 'resolver_confirmed' | 'structural_unreviewed';

/**
 * Per-ROW evidence, which is not the same question as the per-REQUEST tier.
 *
 * A row is labelled `resolver_confirmed` only where the resolver wrote a
 * confirming state for EVERY Act spelling aggregated into it — the route's own
 * rule, and the strict direction: a mixed row inherits the WEAKER label, never
 * the stronger one. So a `structural_unreviewed` row can come back inside a
 * `resolver_confirmed` request's shape, and the row's own label is the one that
 * decides how it may be described.
 */
export type StatuteLinkEvidence = StatuteLinkedEvidence;

/** How this Act was reached, and therefore what the page is about. */
export type StatuteLinkedScope = 'section' | 'act';

/**
 * The link evidence for one judgment, aggregated over every spelling the court
 * used for the Act.
 *
 * `resolutionState` is `string[] | null` — NOT a single state. The route
 * `array_remove(array_agg(DISTINCT ...), NULL)`s the column and returns `null`
 * only when the resolver has said nothing at all about any of the rows. `null`
 * is ABSENCE OF A DECISION and renders as absence; it is never a state, and it
 * is never "unlinked".
 */
export type StatuteJudgmentLink = {
  /** How the court itself named the Act. Evidence about the link, not decoration. */
  actNamedInJudgment: string[];
  sectionNumbers: string[];
  /** How often the judgment names the provision. NOT relevance, authority or merit. */
  occurrences: number;
  firstOffset: number;
  resolutionState: string[] | null;
  resolutionReason: string[];
  resolvedAt: string | null;
  evidence: StatuteLinkEvidence;
};

/**
 * One judgment on the page. The currentness fields are the SAME ones `/search`
 * returns, derived live through `judgments/derived-effects.ts`, so a banner here
 * can never disagree with the same judgment's banner elsewhere.
 */
export type StatuteLinkedJudgment = {
  judgmentId: string;
  caseTitle: string;
  neutralCitation: string | null;
  court: string;
  judgmentDate: string;
  caseNumber: string | null;
  caseType: string | null;
  /** The DERIVED banner. */
  overruledStatus: OverruledStatus;
  /** The raw column beside it, exactly as `/search` carries it. */
  overruledStatusStored: OverruledStatus;
  /**
   * TYPED AS THE UNION, NOT AS `string`. The value set IS open-ended and the
   * contract says so — but it "widens HERE or not at all", and every other
   * consumer in this file takes {@link PrecedentialEffect}. A second, wider
   * shape for the same field would let a value reach a screen that the eight
   * declared consumers would have rejected.
   */
  precedentialEffect: PrecedentialEffect;
  canAddToMatter: boolean;
  unappliedTreatment: string | null;
  treatmentAttribution: TreatmentAttribution | null;
  link: StatuteJudgmentLink;
};

/**
 * WHAT THE TIER DECLINED TO SHOW, COUNTED AND NAMED — the silent-drop rule.
 *
 * A map keyed by resolution state, with `unclassified` for the NULL population.
 * `links: []` beside `{ unclassified: { references: 42697, judgments: 40134 } }`
 * and `links: []` beside `{}` are DIFFERENT SENTENCES: the first means we hold
 * references and vouch for none of them, the second means we hold none at all.
 * Rendering both as "no cases" is the defect this field exists to prevent.
 */
export type StatuteLinkedWithheld = {
  byResolutionState: Record<string, { references: number; judgments: number }>;
  /** Rows the chronology gate removed from THIS page. Never backfilled. */
  chronologyRefusedOnThisPage: number;
};

export type StatuteLinkedJudgmentsResponse = {
  act: {
    statuteId: string;
    shortTitle: string;
    hindiTitle: string | null;
    actNumber: string;
    actYear: number;
    enactmentDate: string | null;
    enforcementDate: string | null;
    sourceUrl: string;
    heldSectionCount: number;
    /**
     * `null`, NEVER `false`. `statutes` has no repeal column, so "is this Act in
     * force" is a question this database cannot answer, and `false` would be a
     * claim about the law. No surface may render it as "in force".
     */
    repealRecorded: null;
  };
  section: {
    sectionId: string;
    sectionNumber: string;
    heading: string | null;
    sourceUrl: string;
  } | null;
  scope: StatuteLinkedScope;
  /** `available` is `false` while `statute.old_new_correspondence` is DISABLED. */
  correspondence: { available: boolean; reason: string };
  evidence: StatuteLinkedEvidence;
  /** `cites_statute_reference` today. Rendered, never interpreted. */
  relationship: string;
  /** The server's own sentence about what the relation means. Rendered verbatim. */
  semantics: string;
  /** `occurrences_desc_then_judgment_id`. Stated because it reads as ranking otherwise. */
  ordering: string;
  links: StatuteLinkedJudgment[];
  page: { limit: number; offset: number; returned: number; hasMore: boolean };
  withheld: StatuteLinkedWithheld;
  coverage: { note: string };
  asOf: string;
};

/**
 * CATEGORIES, NEVER COURT NAMES. `judgments.court` holds printed strings like
 * `High Court  for State of Telangana`; expanding a category into the names
 * it covers is server-side, in `search/court-category.ts` — RCC bus 0046. A
 * client-side name mapping was refused deliberately: a wrong string returns
 * zero results silently, which reads as "no case on this point" rather than
 * "the filter was never applied".
 */
export type CourtCategory = 'sc' | 'hc' | 'district' | 'tribunal';

/** PD-10 — five filter sections. Judge and reporter were cut and have no key. */
export type SearchFilters = {
  courts: CourtCategory[];
  /**
   * STILL DISABLED. Bus 0046: bench strength needs a judge-count column that
   * does not exist. Half the corpus's `bench` was never about judges at all
   * (an ingest partition slug, fixed 11 Aug — see `JudgmentDetail.bench`); the
   * other half is free text with no count, and `judgment_judges` covers
   * Supreme Court rows only. Not "not yet" — no data to filter on.
   */
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
 * `POST /verify/ecourts` — THE WAY OUT OF AN UNVERIFIED CITATION.
 *
 * The client typed this inline as `{ ecourtsUrl, prefilledQuery }` until
 * 11 Aug 2026 and used only the first of the two. Two of the four fields the
 * server sends were undeclared, and the one that WAS declared was fetched and
 * discarded — which is the more expensive half.
 *
 * `prefilledQuery` IS THE POINT OF THE CALL. eCourts exposes no query parameter
 * we may rely on, so the URL alone lands the advocate on an empty search box —
 * standing in a court building, holding a citation they now have to retype from
 * memory, having left our app to do it. The server already built the exact
 * string to paste, and built it carefully: reporter punctuation is stripped
 * because eCourts matches poorly against it, and **digits and their order are
 * never touched**, because `(2019) 4 SCC 221` and `(2019) 4 SCC 212` are
 * different cases (`services/api/src/citations/verify.ts`).
 *
 * `instructions` IS THE SERVER'S SENTENCE AND IT CARRIES THE RULE — "We never
 * solve it for you." That is not decoration: `CLAUDE.md` §6 permits CAPTCHA
 * bypass ONLY for bulk cause-list harvesting under the registrar's grant, and
 * Tier 3 is expressly the other thing — a human solving it and vouching. The
 * sentence the advocate reads at the moment they are sent to eCourts is where
 * that distinction is visible, so it comes from the server rather than being
 * re-typed here where the two could drift apart.
 */
export type EcourtsPath = {
  ecourtsUrl: string;
  /** Paste-ready. Never rebuilt client-side — see above on digit order. */
  prefilledQuery: string;
  /** Always `true` today. Declared as sent, not assumed. */
  captchaRequired: boolean;
  instructions: string;
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
/**
 * WHERE A CITATION WAS COPIED FROM — the server's enum, not a free string.
 *
 * `copyRequest` in `services/api/src/citations/copies.ts` validates
 * `z.enum(['search', 'judgment_detail', 'briefing', 'draft', 'matter'])`, so a
 * value outside it is a `400`. This was typed `string`, which is the mirror
 * image of the defect this contract has been full of: too NARROW on what we
 * receive loses information; too WIDE on what we SEND turns a typo into a
 * runtime rejection the compiler could have caught.
 *
 * It matters more here than almost anywhere. The outbox never drops an entry,
 * so a copy the server keeps refusing is not lost quietly — it retries eight
 * times and then sits in the queue forever, counted. And a queued copy is,
 * in `SCHEMA_TRUTH.md`'s words, "an advocate the fan-out cannot see": if that
 * judgment is set aside next March, this row was the only reason we could have
 * told them.
 *
 * NARROW WHAT WE SEND, WIDE WHAT WE RECEIVE. `CitationCheck.surface` stays
 * `string` deliberately — that is a value read back out of the column, and a
 * client that refused an unfamiliar one would break the day a surface is added.
 */
export type CitationCopySurface = 'search' | 'judgment_detail' | 'briefing' | 'draft' | 'matter';

export type CitationCopy = {
  judgmentId: string;
  matterId?: string;
  citationCheckId?: string;
  surface: CitationCopySurface;
  copiedAt: string;
  clientKey: string;
};

/**
 * AN AUTHORITY SAVED TO A MATTER — `GET|POST|DELETE /matters/:id/authorities`,
 * live 11 Aug 2026, good-law status added 11 Aug 2026 (bus 0048/0049, LCC
 * `dd9871b`). Shape read from `services/api/src/matters/authorities.ts`,
 * not from the summary of it.
 *
 * REMOVAL IS A TIMESTAMP, NEVER A DELETE, mirroring `matter_shares`: a removed
 * row still comes back with `removedAt` set. A matter file that silently forgets
 * an authority was ever saved is a matter file that cannot answer "what did I
 * rely on in March", which is the question the workspace exists to answer.
 *
 * `verificationState`/`verifiedBySource` are `'verified'`/`'corpus'` BY
 * CONSTRUCTION, not columns — `judgment_id` is a NOT NULL FK into our own
 * corpus, so the row resolves to itself, exactly as a briefing authority does.
 * `overruled*` is joined LIVE from `judgments` on every request and never
 * copied onto `matter_authorities` — a status stored at save time is the
 * cached value the harness forbids.
 */
export type MatterAuthority = {
  authorityId: string;
  judgmentId: string;
  caseTitle: string;
  /** Nullable for the same reason it is everywhere else. Render via `citationDisplay`. */
  neutralCitation: string | null;
  /** Absent until bus 0049 — without it a reporter-only citation (pre-~2013 SC) read as uncitable. */
  reporterCitations: string[];
  addedBy: string;
  addedAt: string;
  /** Non-null once removed. The row is kept, not erased. */
  removedAt: string | null;
  verificationState: VerificationState;
  verifiedBySource: VerifiedBySource;
  overruledStatus: OverruledStatus;
  overruledByJudgmentId: string | null;
  /** The case name of the judgment that displaced it, joined server-side. */
  overruledByTitle: string | null;
  overruledParas: number[] | null;
  overruledNote: string | null;
  /**
   * R14 A6, released to RCC on 31 Aug 2026. These three fields are derived live
   * on each GET/POST response and are never copied onto the saved row. They
   * remain optional so an older local API keeps the conservative pre-A6 path.
   */
  precedentialEffect?: PrecedentialEffect;
  canAddToMatter?: boolean;
  citableForUntouchedPropositions?: boolean;
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
  /**
   * COURT CATEGORIES THE CORPUS HOLDS NO JUDGMENT FOR — `['district',
   * 'tribunal']` today. Bus 0046, LCC `1cefe6c`. Present only on the ordinary
   * (non-structured) search path, alongside `results`.
   *
   * An empty result from a category the corpus holds nothing in is
   * indistinguishable on screen from "your query matched nothing" — the same
   * silent-drop reasoning `CITATION_HARNESS.md` applies to a citation,
   * applied to a filter. Additive: a client that ignores it behaves exactly
   * as before.
   */
  unpopulatedCourtCategories?: CourtCategory[];
  /**
   * PRESENT ONLY WHEN A RANKER RAN OUT OF ITS STATEMENT BUDGET — additive,
   * 22 Aug 2026 (`services/api/src/search/route.ts`). `results` on a degraded
   * response is INCOMPLETE, not empty by proof: authorities the corpus holds
   * were never ranked, and this is the only signal that tells the advocate so.
   *
   * NEVER RENDER "no law found" WHEN THIS IS PRESENT, whatever `results.length`
   * is — that is the single most damaging false statement this product can
   * make (`docs/CURRENT_PLAN.md`, NEW1 bus 1010). Show a restrained neutral
   * state ("showing partial results"), never amber/red LAW MOVED styling —
   * this is system uncertainty about the SEARCH, not a legal-currentness fact.
   * NEVER auto-retry a degraded response: a retried 15s-timeout query is a
   * second full-cost query, not a cheap correction.
   */
  degraded?: DegradedArm[];
  /**
   * STRUCTURED SEARCH — a citation that legitimately identifies more than one
   * judgment. `total` is the true count; `results` is capped at the ordinary
   * page size (today's server-side `RESULT_LIMIT`), so `total > results.length`
   * is possible and must be stated rather than presented as the full set.
   * Every row in `results` here is real and verified — nothing invented — this
   * flag only says the list is a disambiguation, never an ordinary ranking.
   */
  ambiguous?: boolean;
  /**
   * PAGINATION — additive, `services/api/src/search/route.ts`. Absent means
   * treat as page 1 with no further pages (the response shape every caller
   * already handles), so an old client that ignores this field behaves
   * exactly as before.
   *
   * `hasMore` is OBSERVED server-side by over-fetching one extra result, never
   * inferred from a full page — a page of exactly `pageSize` results is
   * ambiguous on its own and the server does not make the client guess.
   * RESULT_LIMIT (5) is the server's default `pageSize`, not a hard cap:
   * requesting `page: 2` on the same query returns the next slice of the
   * SAME ranking, not a fresh search — the rankers re-run per page over a
   * corpus ingest is still writing to, so this is a page number, not a
   * cursor over a frozen set.
   */
  page?: { page: number; pageSize: number; hasMore: boolean };
  /**
   * PRESENT ONLY ON A REFUSAL. See `SearchEmptyBecause` — a response carrying
   * this is not an empty result and may never render as one.
   */
  emptyBecause?: SearchEmptyBecause;
  /**
   * THE RETRIEVAL LAYER'S OWN VERDICT ON ITS ANSWER. Optional — absent on parts
   * of the structured path and on any older server.
   */
  retrievalOutcome?: RetrievalOutcome;
  /**
   * How many distinct judgments an exact TITLE lookup matched. Sent alongside
   * `ambiguous: true` when it exceeds one. A candidate list, never a pin.
   */
  exactTitleCandidates?: number;
};

/**
 * `services/api/src/search/route.ts`'s `searchRequest` — `z.string().min(1).max(500)`.
 * A query over this is REJECTED (400) before retrieval ever runs. Enforced
 * client-side too so a long paste gets clear guidance before it is sent,
 * rather than a mysterious validation error after — NEW1 bus 1010: "Show a
 * counter; do not silently truncate, because a truncated legal passage is a
 * different question and returns different law."
 */
export const SEARCH_QUERY_MAX_CHARS = 500;

/**
 * THE FIVE WAYS AN ARM CAN FAIL TO ANSWER — `services/api/src/search/retrieve.ts`
 * (`DegradeReason`). None of them means the corpus was searched to completion,
 * and THREE OF THEM ARE NOT TIMEOUTS AT ALL, which is why the union grew from
 * two to four in R12 and to five in R14: a client that types only the timeouts
 * describes a refusal as a slow query, and then tells the advocate to retry
 * something retrying cannot fix.
 *
 *   · `sparse_timeout` / `dense_timeout` — an arm exceeded its statement budget.
 *     Retrying is a second full-cost query and may work.
 *   · `sparse_unbounded` — THE LEXICAL ARM REFUSED. The match set was unbounded
 *     at the corpus-wide document-frequency gate, so nothing was ranked. This is
 *     a REFUSAL, not a failure.
 *
 *     ITS REMEDY IS MORE TERMS **OR** A NARROWER FILTER — R14 A7, and the second
 *     half is a correction. R12 said `filters` is not consulted before the gate;
 *     R13 corrected the direction; R14 states the mechanism. When the
 *     corpus-wide gate refuses, the server checks for a narrowing filter
 *     (`court`, `courts`, `dateFrom`, `dateTo`, `caseType`), COUNTS the eligible
 *     population, and admits the query if that population is small enough to
 *     rank inside its budget (`narrowsPopulation` / `eligiblePopulation` in
 *     `services/api/src/search/retrieve.ts`).
 *
 *     TWO THINGS FOLLOW AND BOTH ARE BINDING. A court CATEGORY narrows and is
 *     counted, but every High Court together is a population far above the
 *     bound, so a category chip is a filter and never THE remedy for a refusal —
 *     offer ONE NAMED COURT and a SHORTER DATE RANGE. And the bound itself is an
 *     operational measurement on one box, not a product promise: never display
 *     it, never describe a threshold to an advocate, never predict admission
 *     client-side.
 *   · `pin_timeout` — the strongest. The answer an INDEX should have held was
 *     not computed in time.
 *   · `party_name_disabled` — NOT A FAILURE OF ANY KIND. The bare-party-name arm
 *     was switched off for this platform through the served capability registry
 *     (`search.party_name`), so the query was never routed to the case-title
 *     probe. Exact identity — case number, CNR, citation, full cause title — is a
 *     separate arm and is untouched, asserted by committed server tests.
 *
 *     THE ONE RULE FOR RENDERING IT: it may never be described as a timeout, a
 *     failure, or an empty corpus, and Retry may never be the remedy, because
 *     retrying an administratively disabled arm cannot ever succeed. R14 A4.9
 *     requires a VISIBLE degrade to the paths that still work. See
 *     `screens/search/searchTruth.ts`.
 */
export type DegradedArm =
  | 'sparse_timeout'
  | 'dense_timeout'
  | 'sparse_unbounded'
  | 'pin_timeout'
  | 'party_name_disabled';

/**
 * WHY ZERO RESULTS CAME BACK, WHEN THE SERVER KNOWS — additive,
 * `services/api/src/search/route.ts`. Present only where the lexical arm
 * REFUSED to rank (`degraded` includes `sparse_unbounded`) and nothing else
 * produced a row.
 *
 * A RESPONSE CARRYING THIS IS NOT AN EMPTY RESULT AND MAY NEVER RENDER AS ONE.
 * "No judgments matched" says the corpus does not hold the advocate's
 * authority. Here we never looked — the gate refused before ranking. Those are
 * different sentences with different consequences, and only one of them is true.
 *
 * `remedy` is the server's instruction, and the only correct one:
 * `add_more_terms` means MAKE THE QUERY MORE SPECIFIC. Offering a court or date
 * filter instead would be actively wrong — see `sparse_unbounded` above.
 */
export type SearchEmptyBecause = {
  /** `query_too_broad_to_rank` is the only reason the server sends today. */
  reason: string;
  /** `add_more_terms` is the only remedy the server sends today. */
  remedy: string;
};

/**
 * WHAT THE RETRIEVAL LAYER SAYS ABOUT ITS OWN ANSWER — R7 §7.1,
 * `services/api/src/search/outcome.ts`. Optional: the structured path omits it
 * on some responses, and an older server sends none at all.
 *
 * `state` is ordered by how much a consumer may rely on it, and the one that
 * matters most to this client is `coverage_unknown`: **we did not look, or
 * could not look properly, and we do not know what is out there. This may never
 * render as "no results."**
 *
 * `safeForGeneration` was FALSE on every response observed in R12. Nothing in
 * v1 generates from search results, so this client reads it only to refuse —
 * never to enable a surface.
 */
export type RetrievalOutcome = {
  state: 'answered' | 'abstained' | 'degraded' | 'coverage_unknown' | 'review_required';
  /** Every reason that applies, most specific first. Never empty unless `answered`. */
  reasons: string[];
  /** True only for `answered`. This client never turns a surface ON with it. */
  safeForGeneration: boolean;
  /** Exact-identity lookups survive a cold semantic arm; almost always true. */
  exactIdentityUsable: boolean;
  resultCount: number;
  /**
   * The document frequency of the rarest lexeme the lexical arm kept, when it
   * ran. A number, not a category — NEW1 bus 1222: query LENGTH is not the
   * driver, `min(df)` is. Internal diagnostics only; never rendered as a score.
   */
  rarestDf?: number;
  contractVersion: number;
};

export type SearchRequest = {
  query: string;
  language: 'en' | 'hi';
  filters?: {
    court?: string;
    /** Category codes, expanded to court names server-side. Bus 0046. */
    courts?: CourtCategory[];
    dateFrom?: string;
    dateTo?: string;
    caseType?: string;
  };
  matterId?: string;
  /**
   * 1-based, additive — `services/api/src/search/route.ts`. Omitted means
   * page 1, byte-identical to today's behaviour. NOT a cursor: the rankers
   * re-run per page over a corpus ingest is still writing to, so this
   * promises "the next slice of the current ranking", not a frozen result set.
   */
  page?: number;
  /** Server caps at 25; omitted means the server's own default (`RESULT_LIMIT`, 5 today). */
  pageSize?: number;
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
/**
 * `GET /corpus/freshness` — HOW CURRENT THE LAW WE HOLD ACTUALLY IS.
 *
 * Mounted since R8, consumed by nothing until 1 September 2026. Founder design
 * D-5; NEW3 R16 `R16-RCC-03`. Only the fields this client renders are declared
 * — the response also carries per-month grading, per-court failure activity and
 * an eCourts block, and declaring shapes nothing reads is how a type becomes a
 * promise about a wire nobody checked.
 *
 * ── TWO LAG NUMBERS, AND QUOTING ONE IS THE WHOLE HAZARD ────────────────────
 *
 * `V1_CAPABILITY_REGISTRY_R15.json` states it as a RULE, not a preference:
 * **quote both or neither.** `naive.lagDays` is `max(judgment_date)` and on
 * 25 August 2026 it read "eight days behind" on a corpus that was fifty-six —
 * August held 480 judgments against a 117,332/month baseline, so it had a newest
 * date and no coverage. `legalCurrency.lagDays` is a completeness ratio against
 * a trailing baseline and is the honest one.
 *
 * The naive number is carried and LABELLED rather than hidden, because it is
 * what anybody computes for themselves in one query, and the only way to stop it
 * being believed is to show it losing.
 */
export type CorpusFreshness = {
  computedAt: string;
  /**
   * THE NUMBER NOBODY SHOULD ACT ON, carried so it can be seen losing.
   * `lagDays` is null when the corpus holds no dated judgment at all.
   */
  naive: {
    newestJudgmentDate: string | null;
    lagDays: number | null;
    /** The server's own sentence about why this reading is wrong. Rendered verbatim. */
    reading: string;
  };
  /**
   * THE HONEST READING. `dataAsOf` is the last day of the newest month at or
   * above 60% of the trailing baseline — a claim about a whole month, because
   * nothing finer was measured. Null, with a null `lagDays`, when NO month
   * clears the floor: that is "we cannot state a currency", never "current".
   */
  legalCurrency: {
    dataAsOf: string | null;
    lagDays: number | null;
    honestFrontierMonth: string | null;
    baselineDocumentsPerMonth: number;
  };
  /**
   * THE SERVER'S OWN CAVEATS, RENDERED VERBATIM AND NEVER SUMMARISED. They
   * include the two facts a reader most needs and we have no basis to write
   * ourselves: the 0.6/0.1 thresholds are ours and are not validated against any
   * court's publication calendar, and `hc_ingest_ledger` holds failures only.
   */
  caveats: string[];
};

/**
 * `GET /corpus/freshness/object` — THE PUBLISHED UPSTREAM-PARITY OBSERVATION.
 *
 * A DIFFERENT QUESTION FROM THE ROUTE ABOVE, and the reason both are consumed.
 * `/corpus/freshness` measures what WE hold against our own trailing baseline;
 * this projects NEW2's walk of the SOURCE and can therefore say how far behind
 * the upstream we are, which nothing computed from our own rows ever could.
 *
 * `sourceUnavailableCount` is documents the source itself would not serve — a
 * gap that is not ours and is not recoverable by ingesting harder. It is stated
 * as its own number rather than folded into completeness, because "we have not
 * fetched it" and "it cannot be fetched" are different facts.
 */
export type CorpusFreshnessObject = {
  publicationGeneration: string;
  publishedAt: string;
  /** When NEW2 walked the source. NOT when we answered the request. */
  upstreamMeasuredAt: string;
  latestUpstreamDecisionDate: string | null;
  latestLocalDecisionDate: string | null;
  /** Null where the observation could not state one. Never rendered as zero. */
  sourceLagDays: number | null;
  upstreamLocalCompleteness: number | null;
  sourceUnavailableCount: number;
};

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

/**
 * `POST/GET /me/data-requests` — DPDP Act obligations with a visible clock.
 * `services/api/src/auth/data-requests.ts`'s own module note is the spec:
 * **requesting is not executing.** `POST { kind: 'erasure' }` creates a
 * REQUEST; an operator completes it from the admin side
 * (`POST /admin/data-requests/:id/erase`, `erasure.ts`). There is no route on
 * this surface that deletes anything — a mis-tapped button on a phone must
 * not be able to. Copy anywhere this type is rendered must say "request
 * received", never "your account has been deleted".
 *
 * Not documented in `docs/API_CONTRACTS.md` prior to 23 Aug 2026 — the server
 * route existed and the client had no method for it at all. Added here to
 * close that drift, not to change server behaviour.
 */
export type DataRequestKind = 'export' | 'correction' | 'erasure';
export type DataRequestStatus = 'received' | 'in_progress' | 'completed' | 'refused';

export type DataRequest = {
  id: string;
  kind: DataRequestKind;
  status: DataRequestStatus;
  /** Our own service commitment (`RESPONSE_DAYS`), never described as a statutory deadline. */
  dueAt: string;
  completedAt: string | null;
  refusalReason: string | null;
  createdAt: string;
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
  /**
   * THE MATTER'S LIFECYCLE STATE — narrowed from `string` 1 September 2026.
   * NEW3 R16 `R16-RCC-02`, founder design D-2.
   *
   * Three values and no more. `packages/db/src/schema.ts` declares
   * `matter_status` as a Postgres ENUM of exactly `{active, disposed,
   * archived}`, the column is `notNull`, and `patchMatterBody` accepts the
   * same three — so unlike `precedentialEffect` this is NOT an open-ended
   * server-widened field, and narrowing it cannot be outrun by a deploy. A
   * fourth value would be a migration and a contract change together.
   *
   * OPTIONAL because `shapeMatter()` sends it on every row but a matter
   * assembled from cache by an older build may not carry one. Absent is treated
   * as `active` at the one place that decides — `state/practice.ts`'s
   * `matterStatus()` — never at each call site.
   *
   * THERE IS NO "ON HOLD" AND NO DELETED STATE. The founder design shows an
   * "On hold" control; no enum value, column or route accepts it, and NEW3 R16
   * `R16-RCC-X02` holds it out of the build. Archiving is not deletion: the
   * row, its events, its saved authorities and its shares all survive.
   */
  status?: MatterStatus;
  source?: string;
  createdAt?: string;
};

/** `owner` writes; `shared` reads. `none` never reaches a client — it 404s. */
export type MatterStatus = 'active' | 'disposed' | 'archived';

export type MatterAccess = 'owner' | 'shared';

/**
 * `GET /matters/:id/premium-preview` — the deterministic, no-generation half
 * of NEW3's approved premium preview. The route is server-flagged OFF by
 * default, so a client may consume it without making the surface public.
 *
 * `stanceNotComputed: true` is load-bearing: the database stores no
 * supporting/contrary classification, and a client that split
 * `authorityCount` would fabricate paid value and legal meaning at once.
 */
export type PremiumPreview = {
  matterId: string;
  costClass: 'cheap';
  authorityCount: number;
  eventCount: number;
  adverseAuthorities: number;
  nextHearingDate: string | null;
  unresolvedFilings: number;
  stanceNotComputed: true;
  notComputed: readonly string[];
  asOf: string;
};

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
      /** OD-14's exact relationship. Absent means the client must not infer one. */
      precedentialEffect?: PrecedentialEffect;
      /** Additive replacement name; retained beside the original route field. */
      canAddToMatter?: boolean;
      /** Raw stored state is diagnostic only and must never drive rendered copy. */
      overruledStatusStored?: OverruledStatus;
      /** A verified treatment edge not yet applied to the row's banner. */
      unappliedTreatment?: string | null;
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
  /**
   * WHO said the law moved, for a citation attached to a draft —
   * `services/api/src/documents/route.ts`. That route sends a literal
   * `'UNKNOWN'` rather than omitting the key when nothing is recorded, so
   * absence here means an older server, not an absence of adverse treatment.
   */
  treatmentAttribution?: TreatmentAttribution;
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

/**
 * Vendor-agnostic. OD-1 is open, so BOTH branches of `handleCourtLookup` return
 * `available: false` today — one because the guard refused the fetch, one
 * because no adapter is implemented.
 *
 * THE UNAVAILABLE BRANCH CARRIES TWO FIELDS AND THIS TYPE DECLARED NEITHER
 * until 11 Aug 2026, while `client.ts` declared them inline with `expected`
 * typed `string` against a server that sends the boolean `true`. Three
 * descriptions of one endpoint, no two alike — and the mock was a fourth,
 * returning the bare `{ available: false }` this type used to promise.
 *
 * `reason` is named rather than merely false because an operator reading a log
 * needs to know WHICH refusal it was — nothing configured, the kill switch off,
 * the grant's hours passed, or no adapter yet. It stays `string`: it is a value
 * read back out, and a client that refused an unfamiliar reason would break the
 * day one is added.
 *
 * `manualEntry` is the PD-12 sentence, written server-side so it cannot drift:
 * typing the date from your own file is the ORDINARY path, not a fallback after
 * a failure, and the copy must not suggest otherwise.
 */
export type CourtLookupResult =
  | {
      available: false;
      reason: string;
      manualEntry: { expected: boolean; message: string };
    }
  | { available: true; matter: Omit<Matter, 'matterId'> };

/**
 * THE SIX MONITORING FIELDS — frozen by RCC_V1_API_CONTRACT_R12 §1.9 and served
 * as `null` / `never_attempted`. **There are zero eCourts observations and
 * there will be zero until a founder-level answer arrives.**
 *
 * TYPED, NOT SHOWN. Declaring the shape now means the day observations start
 * arriving is a rendering decision rather than a contract change — but until
 * then every one of these reads as "nothing has ever looked", and the client
 * renders that as **"you are keeping this date yourself"**, never as
 * "monitoring is on".
 *
 * WHAT MAY NEVER APPEAR ANYWHERE IN THIS CLIENT, per §6 and §1.9: a polling
 * frequency, an SLA, a promised next check, a simulated court update, or a
 * price attached to any of them — including onboarding copy, store screenshots
 * and marketing. `LISTED` is never rendered as `HEARING_OCCURRED`.
 *
 * Every field is optional because the server sends none of them today. A
 * client that requires one would break on the response it actually gets.
 */
export type MatterMonitoring = {
  /** `null` while nothing monitors. Never a frequency, and never an SLA. */
  monitoringPolicy?: string | null;
  lastObservedAt?: string | null;
  /**
   * NEVER RENDERED AS A PROMISE. A planned check the advocate can see is a
   * commitment about their hearing date, and this product makes none.
   */
  nextPlannedObservationAt?: string | null;
  observationSource?: string | null;
  /** `never_attempted` today, on every matter. */
  lastObservationOutcome?: string | null;
  monitoringDegradedReason?: string | null;
};

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

/* ------------------------------------------------ release capability registry */

/**
 * THE SERVER'S STATEMENT ABOUT ITSELF — `GET /release/capabilities`, serving
 * `RELEASE_CAPABILITIES_R8_3.3` (`services/api/src/release/capabilities.ts`).
 *
 * RCC_V1_API_CONTRACT_R12 §1.6: "RCC should read it at launch and hide any
 * surface whose capability is not ENABLED rather than hardcoding the list."
 * The reading happens in `state/capabilities.ts`, which ANDs this with the
 * product's own frozen v1 decision — this registry can close a surface and
 * never open one.
 *
 * The four states are the server's vocabulary, NOT the product's five-state
 * one. They are deliberately kept apart: conflating "the code runs" with "we
 * ship it" is how an EXPERIMENTAL_INTERNAL capability reaches an advocate.
 */
export type ReleaseCapabilityState = 'ENABLED' | 'LIMITED' | 'DISABLED' | 'EXPERIMENTAL_INTERNAL';

/**
 * Every name the registry serves, taken from `CapabilityName` in
 * `services/api/src/release/capabilities.ts`. Read from the server file, never
 * guessed — a name that does not exist there would gate a surface on a key that
 * is always `undefined`, which reads as "unknown" forever.
 */
export type ReleaseCapabilityName =
  | 'search.exact_identity'
  | 'search.structured_filters'
  /**
   * R14 A4.9. The bare-party-name arm, a DEDICATED row rather than a facet of
   * another capability — which is what makes the iOS kill switch a served
   * config change instead of an App Store release. When it is narrowed for a
   * platform, `/search` says so with `degraded: ['party_name_disabled']`; the
   * exact-identity paths are separate rows and stay untouched.
   */
  | 'search.party_name'
  | 'search.pagination'
  | 'judgment.reader'
  | 'judgment.exact_span'
  | 'statute.lookup'
  | 'statute.linked_judgments'
  | 'statute.old_new_correspondence'
  | 'matter.workspace'
  | 'matter.saved_authorities'
  | 'matter.briefing'
  | 'treatment.resolved_signals'
  | 'treatment.good_law_claim'
  | 'search.semantic.broad'
  | 'search.semantic.supporting_authority'
  | 'search.semantic.adverse_authority'
  | 'search.semantic.counterarguments'
  | 'search.semantic.long_input'
  | 'search.semantic.abstention'
  | 'generation.evidence_from_passages'
  | 'generation.premium_jobs'
  | 'language.hindi'
  | 'court.ecourts_live'
  | 'court.cause_list_harvest';

export type ReleaseCapability = {
  state: ReleaseCapabilityState;
  /** The server's own sentence about why. Internal-facing; never advocate copy. */
  reason: string;
  asOf: string;
  /** What would move this state, when the server names it. */
  unblockedBy?: string;
};

/**
 * WHICH CLIENT IS ASKING — R14 A4.2/A4.3, the optional platform selector.
 *
 * Sent as `X-Lawmind-Platform`. The server also accepts `?platform=`, and the
 * HEADER WINS when both are present, but the query parameter exists for
 * operators and diagnostics and this client does not use it.
 *
 * `unknown` is a RESOLVED RESULT, never a value to send: anything the server
 * does not recognise — including the literal string `unknown` — resolves to
 * `unknown` and yields the release-wide states, which is the widest honest
 * answer rather than an error. Nothing here fails closed on it.
 */
export type ClientPlatform = 'ios' | 'android' | 'web';

/**
 * `capabilities` is typed as a partial record rather than a full one: the server
 * may add a name before this client knows it, and an unknown key must read as
 * "nothing said" rather than crash a launch.
 *
 * THE STATES ARE ALREADY RESOLVED FOR THE PLATFORM THAT ASKED — R14 A4.6. There
 * is no `platforms` object to walk and no fallback to compute; R13 A3 specified
 * one and was WITHDRAWN precisely so two representations could not ship on one
 * route. Read `state` directly.
 *
 * `platform` and `platformOverrides` are ABSENT — not null, absent — from a
 * request that sent no selector, which is the compatibility guarantee that keeps
 * the wire integer at 1. Both are therefore optional here.
 */
export type ReleaseCapabilities = {
  registryVersion: string;
  asOf: string;
  capabilities: Partial<Record<ReleaseCapabilityName, ReleaseCapability>>;
  /** The platform the server RESOLVED, which may be `unknown`. Absent with no selector. */
  platform?: ClientPlatform | 'unknown';
  /**
   * The capability names narrowed for this platform, so the resolution is
   * auditable instead of implicit. R14 A4.7 is binding: this is a DIAGNOSTIC
   * and an AUDIT LIST. Never render it to an advocate and never derive a
   * user-facing message from a name appearing in it — the user-facing
   * consequence is the `state` and `reason` of the row itself.
   */
  platformOverrides?: string[];
};
