/**
 * NEW3 — the deterministic 10-matter product regression fixture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The 23 August walkthrough (`docs/product/PREMIUM_10_MATTER_WALKTHROUGH_V1.md`)
 * found a P0 and a wrong-domain retrieval miss, and then **threw its own evidence
 * away**: the driver and the raw JSON were scratch files, the ten matters were
 * chosen by legal topic, and the accounts were `crypto.randomUUID()`. None of it
 * could be re-run. A product test that cannot be re-run is a report, and a report
 * cannot catch a regression.
 *
 * The V2 sprint plan §10 NEW3-1 asks for the opposite: a PERMANENT deterministic
 * fixture with retained raw artifacts. This file is the fixture half.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT "DETERMINISTIC" MEANS HERE, PRECISELY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every matter is pinned to a **judgment id observed in the live corpus**, not to
 * a search that might rank differently tomorrow. The ids below were read out of
 * `judgments` and `judgment_citations` on 25 Aug 2026 and each carries the
 * property its scenario is named for. The runner RE-ASSERTS that property before
 * scoring anything — if `overruled_status` or `treatment_provenance` moves, the
 * matter reports `FIXTURE_DRIFT` and its score is withheld rather than silently
 * measuring a different thing under the same name.
 *
 * That is the difference between a regression test and a benchmark that quietly
 * re-baselines itself.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE TEN AND NOT TEN AREAS OF LAW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The previous run picked bail / murder / writ / commercial / arbitration and so
 * on. That samples the CORPUS. It does not sample the ways this product can hurt
 * an advocate, which is what an acceptance test is for. Nine of the ten below are
 * selected for a **failure mode**, and the tenth is the control:
 *
 *   partial overruling      does a half-moved authority read as fully moved?
 *   reporter treatment      do we assert a court said something a headnote said?
 *   court treatment         the one provenance where strong wording is allowed
 *   modality defect         a real judgment refused add-to-matter on a subjunctive
 *   ambiguous identifier    one citation, two judgments — is either auto-opened?
 *   wrong-domain retrieval  the known commercial-breach -> robbery miss
 *   no-authority            does the product abstain, or return its nearest guess?
 *   fixture leak            can a test row reach an advocate's search results?
 *   monitoring              does the alert path exist end to end?
 *   normal matter           the control: an ordinary day must still work
 *
 * `PRODUCT_BRIEF.md`'s four features and `CLAUDE.md` §2's one rule are what these
 * are scored against — not feature coverage.
 */

/** The nine axes the sprint plan §10 NEW3-1 requires, in its order. */
export const SCORE_AXES = [
  'research_usefulness',
  'source_grounding',
  'currentness_correctness',
  'matter_workflow',
  'counterargument_quality',
  'briefing_quality',
  'monitoring',
  'time_saved',
  'advocate_would_prefer',
] as const;

export type ScoreAxis = (typeof SCORE_AXES)[number];

/**
 * Four values, and `N/A` is load-bearing.
 *
 * A surface that is deliberately switched off (every premium flag defaults OFF)
 * must not score FAIL — that would make the safe configuration look like a
 * defect and create pressure to turn it on. `N/A` carries its reason.
 */
export type Verdict = 'PASS' | 'PARTIAL' | 'FAIL' | 'N/A';

/**
 * A property the runner re-asserts against the live DB before it scores.
 *
 * `column` is read from `judgments` unless `table` says otherwise. A mismatch is
 * FIXTURE_DRIFT, never a quiet re-baseline.
 */
export type Invariant =
  | { kind: 'judgment_column'; judgmentId: string; column: string; equals: string | null }
  | { kind: 'treatment_edge'; edgeId: string; relationship: string; provenance: string | null }
  /** Exactly N judgments share this neutral citation. The ambiguity itself. */
  | { kind: 'neutral_citation_count'; neutralCitation: string; equals: number }
  /** The ONLY non-`cites` edge driving this judgment's badge is the one named. */
  | { kind: 'sole_treatment_driver'; judgmentId: string; edgeId: string };

export type Scenario =
  | 'partial_overruling'
  | 'reporter_treatment_signal'
  | 'court_treatment_signal'
  | 'modality_defect'
  | 'ambiguous_identifier'
  | 'wrong_domain_retrieval'
  | 'no_authority'
  | 'fixture_leak'
  | 'monitoring'
  | 'normal';

export type MatterFixture = {
  /** Stable across runs. The artifact is keyed on it; never renumber. */
  key: string;
  scenario: Scenario;
  /** What an advocate is actually trying to do. Written in their words. */
  advocateIntent: string;
  /** The search an advocate would plausibly type. Under 500 chars, always. */
  query: string;
  /**
   * The judgment this matter is ABOUT, when the scenario names one.
   *
   * `null` for scenarios whose point is that no particular authority is the
   * right answer (`no_authority`, `wrong_domain_retrieval`) — pinning one there
   * would smuggle in an assumption the test exists to check.
   */
  anchorJudgmentId: string | null;
  /** Human-readable, for the artifact. Not used for matching. */
  anchorTitle: string | null;
  /** The matter an advocate would create around it. */
  matter: {
    caseTitle: string;
    court: string;
    caseType: 'criminal' | 'civil';
    clientName: string;
    ourSide: 'petitioner' | 'respondent' | 'accused' | 'complainant' | 'other';
    parties: Record<string, unknown>;
  };
  /** The position fed to `POST /arguments/counter`. */
  counterPosition: string;
  /** Re-asserted before scoring. Empty is allowed; drift is not. */
  invariants: Invariant[];
  /**
   * What this matter is FOR, in one sentence, and what would make it FAIL.
   *
   * Read by a human in the artifact. The runner records outcomes; a person
   * applies this. That division is deliberate — an automated verdict on
   * "would an advocate prefer this" would be fiction.
   */
  acceptance: string;
};

/**
 * The hearing date every matter gets.
 *
 * Fixed, not `today + 7`, because a briefing sweep's behaviour depends on the
 * window and a moving date makes two runs incomparable. Far enough out that the
 * matter is always "upcoming" for any run before it.
 */
export const FIXTURE_HEARING_DATE = '2027-03-01';

export const TEN_MATTERS: MatterFixture[] = [
  {
    key: 'M01-partial-overruling',
    scenario: 'partial_overruling',
    advocateIntent:
      'I want to rely on Kharak Singh for the surveillance point. Is it still good law, and how much of it survived?',
    query: 'Kharak Singh v State of Uttar Pradesh surveillance',
    anchorJudgmentId: 'b6d43715-db3a-4c32-9790-5865f24cc793',
    anchorTitle: 'KHARAK SINGH versus THE STATE OF U. P. & OTHERS (1962 INSC 389)',
    matter: {
      caseTitle: 'Rakesh Mohanty v. State of Odisha',
      court: 'Orissa High Court',
      caseType: 'criminal',
      clientName: 'Rakesh Mohanty',
      ourSide: 'petitioner',
      parties: { petitioner: 'Rakesh Mohanty', respondent: 'State of Odisha' },
    },
    counterPosition:
      'Routine police surveillance of a previously convicted person violates the right to privacy under Article 21.',
    invariants: [
      {
        kind: 'judgment_column',
        judgmentId: 'b6d43715-db3a-4c32-9790-5865f24cc793',
        column: 'overruled_status',
        equals: 'partly_set_aside',
      },
      {
        kind: 'treatment_edge',
        edgeId: 'e80baf8f-dbc1-47e9-a8b1-c812a983b54b',
        relationship: 'overruled_in_part',
        provenance: 'REPORTER_EDITORIAL_ANNOTATION',
      },
    ],
    acceptance:
      'Kharak Singh is PARTLY set aside by Puttaswamy and the product must say partly, on every surface, ' +
      'and must still allow add-to-matter (only set_aside disables it). FAIL if any surface renders it as ' +
      'fully overruled, as good law with no mark, or refuses the save.',
  },
  {
    key: 'M02-reporter-treatment',
    scenario: 'reporter_treatment_signal',
    advocateIntent:
      'Synthetics & Chemicals is my lead authority on State excise power. Has it moved, and who says so?',
    query: '1989 INSC 321',
    anchorJudgmentId: 'deacdf12-5bb9-49b7-b7ac-a8bec74ee877',
    anchorTitle: 'SYNTHETICS & CHEMICALS LTD. versus STATE OF U.P. (1989 INSC 321)',
    matter: {
      caseTitle: 'Deccan Distilleries Pvt. Ltd. v. State of Telangana',
      court: 'Telangana High Court',
      caseType: 'civil',
      clientName: 'Deccan Distilleries Pvt. Ltd.',
      ourSide: 'petitioner',
      parties: { petitioner: 'Deccan Distilleries Pvt. Ltd.', respondent: 'State of Telangana' },
    },
    counterPosition:
      'A State legislature has no competence to levy duty on industrial alcohol not fit for human consumption.',
    invariants: [
      {
        kind: 'judgment_column',
        judgmentId: 'deacdf12-5bb9-49b7-b7ac-a8bec74ee877',
        column: 'overruled_status',
        equals: 'set_aside',
      },
      {
        kind: 'treatment_edge',
        edgeId: '1d2d05a2-76f0-4514-b063-c954b1612b76',
        relationship: 'overruled',
        provenance: 'REPORTER_EDITORIAL_ANNOTATION',
      },
      {
        kind: 'sole_treatment_driver',
        judgmentId: 'deacdf12-5bb9-49b7-b7ac-a8bec74ee877',
        edgeId: '1d2d05a2-76f0-4514-b063-c954b1612b76',
      },
    ],
    acceptance:
      'The badge here rests on a LAW REPORTER’S HEADNOTE, not the court’s own words — NEW2 bus 1102 ' +
      'measured 95.62% of all LAW MOVED edges that way. The mark must show; generated or fixed copy must NOT ' +
      'assert "the Supreme Court overruled X" as bare fact. FAIL if any copy states court authorship for this edge.',
  },
  {
    key: 'M03-court-treatment',
    scenario: 'court_treatment_signal',
    advocateIntent:
      'Is S. N. Dutt still good on the notice point, and did a court actually say so in its own words?',
    query: '1961 INSC 117',
    anchorJudgmentId: 'ced822e7-0762-4d38-9109-e51a719f15f0',
    anchorTitle: 'S. N. DUTT versus UNION OF INDIA (1961 INSC 117)',
    matter: {
      caseTitle: 'Ganpat Rai Contractors v. Union of India',
      court: 'Delhi High Court',
      caseType: 'civil',
      clientName: 'Ganpat Rai Contractors',
      ourSide: 'petitioner',
      parties: { petitioner: 'Ganpat Rai Contractors', respondent: 'Union of India' },
    },
    counterPosition:
      'A notice under Section 80 CPC signed by counsel rather than the claimant is fatally defective.',
    invariants: [
      {
        kind: 'judgment_column',
        judgmentId: 'ced822e7-0762-4d38-9109-e51a719f15f0',
        column: 'overruled_status',
        equals: 'set_aside',
      },
      {
        kind: 'treatment_edge',
        edgeId: '8473a5ca-f146-4a99-8368-0d3ee2e2dfba',
        relationship: 'overruled',
        provenance: 'COURT_REASONING_EXPLICIT',
      },
    ],
    acceptance:
      'The CONTROL for M02. This is one of only FIVE edges in the whole corpus where the court overruled in ' +
      'its own words ("does not accord with the view expressed by us and is therefore overruled"). If the ' +
      'product renders M02 and M03 identically, provenance is not reaching the surface — that is the finding.',
  },
  {
    key: 'M04-modality-defect',
    scenario: 'modality_defect',
    advocateIntent:
      'I want to cite T. R. Challappan on departmental action after acquittal. Can I save it to my matter?',
    query: '1975 INSC 212',
    anchorJudgmentId: 'f83d0700-eaf5-4075-9744-2e20faacedc9',
    anchorTitle:
      'DIVISIONAL PERSONNEL OFFICER, SOUTHERN RAILWAY versus T. R. CHALLAPPAN (1975 INSC 212)',
    matter: {
      caseTitle: 'K. Ramasamy v. Southern Railway',
      court: 'Madras High Court',
      caseType: 'civil',
      clientName: 'K. Ramasamy',
      ourSide: 'petitioner',
      parties: { petitioner: 'K. Ramasamy', respondent: 'Southern Railway' },
    },
    counterPosition:
      'A departmental penalty imposed on a railway employee after an honourable acquittal in a criminal trial cannot stand.',
    invariants: [
      {
        kind: 'judgment_column',
        judgmentId: 'f83d0700-eaf5-4075-9744-2e20faacedc9',
        column: 'overruled_status',
        equals: 'set_aside',
      },
      {
        kind: 'treatment_edge',
        edgeId: '9de8fd68-e248-4e0d-8cef-cfa79220e735',
        relationship: 'overruled',
        provenance: 'MODALITY_DEFECT',
      },
      {
        kind: 'sole_treatment_driver',
        judgmentId: 'f83d0700-eaf5-4075-9744-2e20faacedc9',
        edgeId: '9de8fd68-e248-4e0d-8cef-cfa79220e735',
      },
    ],
    acceptance:
      'THE SHARPEST SCENARIO IN THE SET. This judgment’s `set_aside` rests on ONE edge, whose evidence is a ' +
      'DISSENT in Tulsiram Patel saying the case "is sought to be overruled by the judgment proposed to be ' +
      'delivered by my learned Brother" — a subjunctive, not a holding. ' +
      'MEASURED 25 Aug, and it corrected this row’s own first draft: the save is ALLOWED (201), not refused. ' +
      'OD-14 as resolved 21 Aug derives `precedentialEffect` from the EDGE, and an `overruled` edge maps to ' +
      '`addToMatter: allow` — only an unexplained bare `set_aside` refuses. So the harm here is not a blocked ' +
      'save; it is that a real 1975 Supreme Court authority carries a LAW MOVED mark generated by a ' +
      'grammatical mood. Record what happens; do not fix it here (NEW2 owns adjudication).',
  },
  {
    key: 'M05-ambiguous-identifier',
    scenario: 'ambiguous_identifier',
    advocateIntent: 'Opposing counsel cited 2023:AHC:169979 at me. Pull it up.',
    query: '2023:AHC:169979',
    anchorJudgmentId: null,
    anchorTitle: 'TWO judgments share this neutral citation (Allahabad, both 16 Aug 2023)',
    matter: {
      caseTitle: 'Shivendra Pratap Singh v. State of U.P.',
      court: 'Allahabad High Court',
      caseType: 'civil',
      clientName: 'Shivendra Pratap Singh',
      ourSide: 'petitioner',
      parties: { petitioner: 'Shivendra Pratap Singh', respondent: 'State of U.P.' },
    },
    counterPosition:
      'A compassionate appointment claim cannot be rejected solely on the ground of delay in applying.',
    invariants: [
      { kind: 'neutral_citation_count', neutralCitation: '2023:AHC:169979', equals: 2 },
    ],
    acceptance:
      'One citation, two different judgments (MANOJ KUMAR KATIYAR and DHRUV LAL), same court, same date. ' +
      'The product must show BOTH and must never auto-open one as if it were unique. A single confident ' +
      'result here is the worst outcome in the whole fixture — worse than nothing — because the advocate ' +
      'walks into court with the wrong case and no signal that a choice was made for them.',
  },
  {
    key: 'M06-wrong-domain',
    scenario: 'wrong_domain_retrieval',
    advocateIntent:
      'My client is being sued for breaching a supply contract. Find me the law on consequential damages.',
    query: 'breach of supply agreement consequential damages liability',
    anchorJudgmentId: null,
    anchorTitle: null,
    matter: {
      caseTitle: 'Ganga Traders v. Om Industries',
      court: 'Bombay High Court',
      caseType: 'civil',
      clientName: 'Om Industries',
      ourSide: 'respondent',
      parties: { petitioner: 'Ganga Traders', respondent: 'Om Industries' },
    },
    counterPosition:
      'Om Industries breached the supply agreement and is liable for consequential damages.',
    invariants: [],
    acceptance:
      'The reproduction of the 23 Aug miss: this exact position returned an IPC §394 ROBBERY conviction as ' +
      'its counter-authority. NEW1 (bus 1093) confirms civil/commercial concept classes score ZERO for every ' +
      'representation tested, so this is the measured baseline, not an outlier. PASS requires either a ' +
      'contract-law authority or an honest abstention. Returning a criminal judgment with no confidence ' +
      'signal is FAIL, and it is the single strongest argument against marketing concept search.',
  },
  {
    key: 'M07-no-authority',
    scenario: 'no_authority',
    advocateIntent:
      'Is there any Indian authority on the doctrine I half-remember from a seminar?',
    query: 'doctrine of anticipatory estoppel by silent acquiescence in tribunal proceedings',
    anchorJudgmentId: null,
    anchorTitle: null,
    matter: {
      caseTitle: 'Meher Textiles v. Textile Tribunal',
      court: 'Gujarat High Court',
      caseType: 'civil',
      clientName: 'Meher Textiles',
      ourSide: 'petitioner',
      parties: { petitioner: 'Meher Textiles', respondent: 'Textile Tribunal' },
    },
    counterPosition:
      'A party who stays silent through tribunal proceedings is anticipatorily estopped from later challenging jurisdiction.',
    invariants: [],
    acceptance:
      'There is no such doctrine. The right product behaviour is to say so — "No sufficiently relevant ' +
      'authority found" (plan §9 RCC-4). Returning a plausible nearest neighbour with no confidence signal ' +
      'is the abstention failure the plan names, and it is how an advocate ends up citing something that does ' +
      'not stand for what the app implied. PASS = abstains or returns nothing. FAIL = confident nearest guess.',
  },
  {
    key: 'M08-fixture-leak',
    scenario: 'fixture_leak',
    advocateIntent: '(not an advocate action — a corpus-integrity probe run as a matter)',
    query: 'SYNTHETIC Set Aside Fixture',
    anchorJudgmentId: '00d958ce-6d32-4599-8516-5a6cc0379bc3',
    anchorTitle: 'SYNTHETIC — Set Aside Fixture (Test Court)',
    matter: {
      caseTitle: 'Corpus integrity probe',
      court: 'Delhi High Court',
      caseType: 'civil',
      clientName: 'Internal',
      ourSide: 'other',
      parties: { petitioner: 'Internal', respondent: 'Internal' },
    },
    counterPosition: 'A synthetic test fixture is a citable authority.',
    invariants: [],
    acceptance:
      'Leaked test rows live in the production `judgments` table — 6 on 23 Aug (docs/ops/lcc/' +
      'TEST_COURT_ROWS_FINDING.md), and this lane counted 16 on 25 Aug, so the leak is CUMULATIVE and growing. ' +
      'PASS requires that none of them is reachable through `POST /search`. An advocate who sees ' +
      '"SYNTHETIC — Still Good Law For Now" in a result list has seen a fabricated authority in a product ' +
      'whose entire licence rests on never doing that.',
  },
  {
    key: 'M09-monitoring',
    scenario: 'monitoring',
    advocateIntent:
      'I saved this authority two months ago. Tell me if it moves before my hearing.',
    query: '2007 INSC 390',
    anchorJudgmentId: 'ddd29e26-8e9d-4711-af96-b0671f5c645e',
    anchorTitle: 'MOHD. SHAFI versus MOHD. RAFIQ & ANR. (2007 INSC 390)',
    matter: {
      caseTitle: 'Abdul Rahim v. Nazir Ahmed',
      court: 'Jammu & Kashmir High Court',
      caseType: 'civil',
      clientName: 'Abdul Rahim',
      ourSide: 'respondent',
      parties: { petitioner: 'Nazir Ahmed', respondent: 'Abdul Rahim' },
    },
    counterPosition:
      'An ex parte decree may be set aside without showing sufficient cause where service was irregular.',
    invariants: [
      {
        kind: 'judgment_column',
        judgmentId: 'ddd29e26-8e9d-4711-af96-b0671f5c645e',
        column: 'overruled_status',
        equals: 'doubted',
      },
    ],
    acceptance:
      'The `doubted` state is the third LAW MOVED value and the one most likely to be dropped by a surface ' +
      'that only handles set_aside. This matter also exercises the alert PATH (settings, list). The alerts ' +
      'table holds ZERO rows corpus-wide, so a fired alert cannot be observed without mutating ' +
      '`overruled_status`, which this test will not do — record ALERT_PATH_ONLY and say so, never infer ' +
      'that monitoring works because the endpoints answered.',
  },
  {
    key: 'M10-normal',
    scenario: 'normal',
    advocateIntent:
      'Ordinary Tuesday. Anticipatory bail application, find me something usable and put it in the file.',
    query: 'anticipatory bail',
    anchorJudgmentId: null,
    anchorTitle: null,
    matter: {
      caseTitle: 'State v. Rakesh Kumar',
      court: 'Patna High Court',
      caseType: 'criminal',
      clientName: 'Rakesh Kumar',
      ourSide: 'accused',
      parties: { petitioner: 'State', respondent: 'Rakesh Kumar' },
    },
    counterPosition:
      'Anticipatory bail should be refused where custodial interrogation is genuinely required.',
    invariants: [],
    acceptance:
      'THE CONTROL. No trap, no known defect, the single most common thing an Indian criminal advocate does. ' +
      'If this matter is anything other than PASS end to end, the fixture is not telling you about edge ' +
      'cases — it is telling you the product does not work.',
  },
];

/**
 * Deterministic, collision-proof, and greppable.
 *
 * Every row this fixture writes is discoverable by one predicate. The 23 August
 * run used `crypto.randomUUID()` and had to remember what it had made; a
 * cleanup that depends on memory is the reason 16 Test Court rows are sitting in
 * the production corpus right now (M08).
 */
export const FIXTURE_TAG = 'new3-ten-matter';
export const authIdFor = (key: string): string => `${FIXTURE_TAG}-${key.toLowerCase()}`;
export const emailFor = (key: string): string => `${authIdFor(key)}@lawmind.test`;
