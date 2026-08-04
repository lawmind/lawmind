import type { JudgmentDetail, SearchResult, Statute, StatuteSection } from './contract';

/**
 * FIXTURES. INVENTED DATA IN A DEVELOPMENT FILE.
 *
 * NO REAL CITATION APPEARS HERE, and none ever may. A plausible-looking fake
 * citation sitting in a repo is exactly the artefact this product exists to
 * prevent — the first person to copy one out of a screenshot would be copying a
 * hallucination we typed ourselves. Every citation is `MOCK`-prefixed, every
 * court is a "Mock" court, and every judgment is named for the party's role
 * rather than a person.
 *
 * The prose is written to exercise the renderer, not to state law. It refers to
 * the "Mock Code" precisely so no section number here can be mistaken for BNS,
 * BNSS or BSA. Real statutory text arrives from the corpus in S1 and is the
 * only thing an advocate ever reads.
 *
 * The SET is chosen to cover every branch of `citationRender()` in one list:
 * verified (silent) · unverified (dashed) · verified AND partly set aside
 * (amber) · verified AND set aside (danger, add-to-matter blocked) · doubted
 * (no band, one muted line) · failed (must render identically to unverified).
 */

const holding = (s: string) => s;

export const MOCK_RESULTS: SearchResult[] = [
  {
    judgmentId: 'jdg_mock_1',
    caseTitle: 'Mock Petitioner v. Mock State',
    neutralCitation: 'MOCK 2026 EXAMPLE 1',
    reporterCitations: ['MOCK (2026) 1 EX 1'],
    court: 'Mock SC · 2026',
    judgmentDate: '2026-02-11',
    holding: holding(
      'Bail is the rule where the accused was not arrested during the investigation and has cooperated throughout.'
    ),
    operativeParagraph:
      '"The appellant having cooperated at every stage, the refusal of bail cannot be sustained. The appeal is allowed."',
    verificationState: 'verified',
    verifiedBySource: 'corpus',
    overruledStatus: 'none',
  },
  {
    judgmentId: 'jdg_mock_2',
    caseTitle: 'Mock Applicant v. Mock Respondent',
    neutralCitation: 'MOCK 2026 EXAMPLE 2',
    reporterCitations: ['MOCK (2026) 2 EX 162'],
    court: 'Mock SC · 2026',
    judgmentDate: '2026-01-04',
    holding: holding(
      'Omnibus allegations against a spouse\'s relatives, unsupported by any specific instance, cannot sustain a prosecution under section 498 of the Mock Code.'
    ),
    operativeParagraph:
      '"Permitting the prosecution to continue would result in an abuse of the process of law. The proceedings against the appellants are quashed."',
    verificationState: 'verified',
    verifiedBySource: 'public_x2',
    overruledStatus: 'none',
  },
  {
    judgmentId: 'jdg_mock_3',
    caseTitle: 'Mock Complainant v. Mock Union',
    neutralCitation: 'MOCK 2024 EXAMPLE 9424',
    reporterCitations: [],
    court: 'Mock HC · 2024',
    judgmentDate: '2024-08-19',
    holding: holding(
      'Quashing where the complaint named eleven relatives without particulars.'
    ),
    operativeParagraph: 'Fixture operative paragraph. Not law.',
    /**
     * The dashed card. Its reason and its eCourts route live INSIDE the card —
     * with verified silent, the exception gets the whole room.
     */
    verificationState: 'unverified',
    verifiedBySource: 'none',
    overruledStatus: 'none',
    unconfirmedReason:
      'We could not confirm this judgment exists. Two secondary sources describe it; the Mock High Court portal has no record.',
  },
  {
    judgmentId: 'jdg_mock_4',
    caseTitle: 'Mock Appellant v. Mock Board',
    neutralCitation: 'MOCK 2019 EXAMPLE 273',
    reporterCitations: ['MOCK (2019) 8 EX 273'],
    court: 'Mock SC · 2019',
    judgmentDate: '2019-07-03',
    holding: holding('No automatic arrest; the statutory notice is mandatory.'),
    operativeParagraph: 'Fixture operative paragraph. Not law.',
    verificationState: 'verified',
    verifiedBySource: 'corpus',
    overruledStatus: 'none',
  },
  {
    /** Verified AND partly set aside — the case a single enum cannot express. */
    judgmentId: 'jdg_mock_5',
    caseTitle: 'Mock Directions v. Mock State of the Union',
    neutralCitation: 'MOCK 2017 EXAMPLE 746',
    reporterCitations: ['MOCK (2017) 8 EX 746'],
    court: 'Mock SC · 2017',
    judgmentDate: '2017-07-27',
    holding: holding(
      'Directions on committee scrutiny before arrest, since modified on appeal.'
    ),
    operativeParagraph: 'Fixture operative paragraph. Not law.',
    verificationState: 'verified',
    verifiedBySource: 'corpus',
    overruledStatus: 'partly_set_aside',
    overruledByJudgmentId: 'jdg_mock_6',
    overruledParas: [19, 20],
    overruledNote: 'The observations on misuse still stand.',
  },
  {
    /** Set aside. THE ONE CASE WHERE LAWMIND REFUSES TO LET AN AUTHORITY BE USED. */
    judgmentId: 'jdg_mock_6',
    caseTitle: 'Mock Review v. Mock State',
    neutralCitation: 'MOCK 2018 EXAMPLE 55',
    reporterCitations: ['MOCK (2018) 3 EX 55'],
    court: 'Mock SC · 2018',
    judgmentDate: '2018-09-14',
    holding: holding('Earlier committee directions set aside in their entirety.'),
    operativeParagraph: 'Fixture operative paragraph. Not law.',
    verificationState: 'verified',
    verifiedBySource: 'ecourts',
    overruledStatus: 'set_aside',
    overruledByJudgmentId: 'jdg_mock_7',
    overruledNote: 'Set aside in Mock Larger Bench (2021).',
  },
  {
    /** Doubted — no band, one muted line. Still binding. */
    judgmentId: 'jdg_mock_7',
    caseTitle: 'Mock Reference v. Mock Authority',
    neutralCitation: 'MOCK 2021 EXAMPLE 12',
    reporterCitations: [],
    court: 'Mock HC · 2021',
    judgmentDate: '2021-03-02',
    holding: holding('Reference answered; the earlier view is questioned but not displaced.'),
    operativeParagraph: 'Fixture operative paragraph. Not law.',
    verificationState: 'verified',
    verifiedBySource: 'public_x2',
    overruledStatus: 'doubted',
    overruledNote: 'Doubted in a later coordinate bench. Still binding.',
  },
  {
    /**
     * `failed` — a tier was unreachable. IT MUST RENDER IDENTICALLY TO
     * `unverified`. The advocate cannot act on the difference, and a provider
     * outage must never read as a gap in the corpus.
     */
    judgmentId: 'jdg_mock_8',
    caseTitle: 'Mock Interim v. Mock Registrar',
    neutralCitation: 'MOCK 2023 EXAMPLE 404',
    reporterCitations: [],
    court: 'Mock HC · 2023',
    judgmentDate: '2023-11-30',
    /**
     * EMPTY, as most of the real corpus is until a summarisation model is
     * wired. The card must read as an ordinary result with no summary, never
     * as a broken or half-loaded one.
     */
    holding: '',
    operativeParagraph: 'Fixture operative paragraph. Not law.',
    verificationState: 'failed',
    verifiedBySource: 'none',
    overruledStatus: 'none',
    unconfirmedReason:
      'We could not confirm this judgment exists. The check could not be completed just now, so it is shown to you unconfirmed rather than left out.',
  },
];

/** Fixture subject and court tags, so the filter sheet has something to bite on. */
type Facet = {
  court: 'sc' | 'hc';
  subject: string;
  year: number;
  /**
   * Derived on the server from the official case number. `null` where the case
   * number states no side — 139 of the 6,309 judgments in the corpus today.
   * NEVER GUESSED. `jdg_mock_8` carries that case on purpose, so the exclusion
   * path is exercised rather than assumed.
   */
  caseType: string | null;
};

export const MOCK_FACETS: Record<string, Facet> = {
  jdg_mock_1: { court: 'sc', subject: 'criminal', year: 2026, caseType: 'criminal' },
  jdg_mock_2: { court: 'sc', subject: 'matrimonial', year: 2026, caseType: 'criminal' },
  jdg_mock_3: { court: 'hc', subject: 'matrimonial', year: 2024, caseType: 'criminal' },
  jdg_mock_4: { court: 'sc', subject: 'criminal', year: 2019, caseType: 'criminal' },
  jdg_mock_5: { court: 'sc', subject: 'criminal', year: 2017, caseType: 'criminal' },
  jdg_mock_6: { court: 'sc', subject: 'criminal', year: 2018, caseType: 'criminal' },
  jdg_mock_7: { court: 'hc', subject: 'civil', year: 2021, caseType: 'civil' },
  jdg_mock_8: { court: 'hc', subject: 'civil', year: 2023, caseType: null },
};

/**
 * Paragraph text for the reading view. Numbered from 1, because an advocate
 * cites by paragraph and the number on screen must be the number in the report.
 *
 * Deliberately includes: a paragraph that cites another judgment (so the
 * cross-reference jump has something to jump to), a quoted passage opening with
 * a quotation mark (so hanging punctuation is exercised), a citation range with
 * a hyphen (so `legalText()` converts it to an en dash), and the word "section"
 * before a number (so the non-breaking space binding is visible).
 */
const paragraphs = (count: number, seed: string): JudgmentDetail['paragraphs'] =>
  Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    if (n === 11)
      return {
        number: n,
        text: 'Omnibus allegations against a spouse\'s relatives, unsupported by any specific instance of cruelty, cannot form the basis of a prosecution under section 498 of the Mock Code. This Court has repeatedly cautioned against the tendency to implicate every member of the family.',
      };
    if (n === 12)
      return {
        number: n,
        text: 'In Mock Earlier v. Mock State, MOCK 2012 EXAMPLE 741, this Court observed that the mere naming of a spouse\'s siblings in a matrimonial complaint would not justify their being put to trial.',
        citesJudgmentId: 'jdg_mock_4',
      };
    if (n === 17)
      return {
        number: n,
        text: 'Where omnibus allegations are levelled and no particulars are furnished, the proceeding is liable to be quashed.',
      };
    if (n === 23)
      return {
        number: n,
        text: '"Permitting the prosecution to continue would result in an abuse of the process of law. The proceedings against the appellants are quashed."',
        operative: true,
      };
    return {
      number: n,
      text: `Fixture paragraph ${n} of ${seed}. It carries enough prose to set a realistic measure at 17 on 1.68, so the reading view can be judged on the shape of a real column of text rather than on a single line. Sections 12-14 of the Mock Code were considered.`,
    };
  });

export const MOCK_JUDGMENTS: Record<string, JudgmentDetail> = Object.fromEntries(
  MOCK_RESULTS.map((r) => [
    r.judgmentId,
    {
      ...r,
      bench: 'Mock J. and Mock J., JJ',
      reliedOn: MOCK_RESULTS.filter((o) => o.judgmentId !== r.judgmentId)
        .slice(0, 2)
        .map((o) => ({
          judgmentId: o.judgmentId,
          caseTitle: o.caseTitle,
          neutralCitation: o.neutralCitation,
        })),
      operativeParagraphNumber: 23,
      holdingParagraphNumber: 11,
      paragraphs: paragraphs(28, r.neutralCitation),
    } satisfies JudgmentDetail,
  ])
);

/* ------------------------------------------------------------------ statutes */

/**
 * The three new criminal codes, with their real enactment and enforcement
 * dates from `DOMAIN_TRUTH.md`. These are facts about Indian law, not invented
 * fixtures: BNS, BNSS and BSA were enacted 2023-12-25 and came into force
 * 2024-07-01, replacing the IPC, CrPC and Evidence Act.
 *
 * SECTION TEXT IS NOT FIXTURED HERE. Government-published text is served
 * verbatim from the corpus; typing an approximation of a live section into a
 * mock is how a paraphrase ends up on a screen an advocate files from. The
 * fixture sections below carry a placeholder that says exactly that, and the
 * real text arrives from `GET /statutes/sections`.
 */
export const MOCK_STATUTES: Statute[] = [
  {
    statuteId: 'act_bns',
    shortTitle: 'Bharatiya Nyaya Sanhita',
    hindiTitle: 'भारतीय न्याय संहिता',
    actNumber: '45',
    actYear: 2023,
    enactmentDate: '2023-12-25',
    enforcementDate: '2024-07-01',
    ministry: 'Ministry of Home Affairs',
    sourceUrl: 'https://www.indiacode.nic.in/',
    sectionCount: 358,
  },
  {
    statuteId: 'act_bnss',
    shortTitle: 'Bharatiya Nagarik Suraksha Sanhita',
    hindiTitle: 'भारतीय नागरिक सुरक्षा संहिता',
    actNumber: '46',
    actYear: 2023,
    enactmentDate: '2023-12-25',
    enforcementDate: '2024-07-01',
    ministry: 'Ministry of Home Affairs',
    sourceUrl: 'https://www.indiacode.nic.in/',
    sectionCount: 531,
  },
  {
    statuteId: 'act_bsa',
    shortTitle: 'Bharatiya Sakshya Adhiniyam',
    hindiTitle: 'भारतीय साक्ष्य अधिनियम',
    actNumber: '47',
    actYear: 2023,
    enactmentDate: '2023-12-25',
    enforcementDate: '2024-07-01',
    ministry: 'Ministry of Home Affairs',
    sourceUrl: 'https://www.indiacode.nic.in/',
    sectionCount: 170,
  },
];

/**
 * Fixture sections. `orderIndex` deliberately runs 1, 2, 3 while the section
 * numbers run 2, 10, 63A — so any surface that sorts on `sectionNumber`
 * instead of `orderIndex` shows itself immediately rather than in production.
 */
export const MOCK_SECTIONS: StatuteSection[] = [
  {
    sectionId: 'sec_mock_1',
    statuteId: 'act_bns',
    shortTitle: 'Bharatiya Nyaya Sanhita',
    sectionNumber: '2',
    heading: 'Definitions',
    sectionText:
      'Fixture placeholder. Government-published section text is served verbatim from the corpus and is never typed into a mock — a paraphrase of a live section is the one thing that must not reach a screen an advocate files from.',
    footnote: null,
    orderIndex: 1,
    sourceUrl: 'https://www.indiacode.nic.in/',
  },
  {
    sectionId: 'sec_mock_2',
    statuteId: 'act_bns',
    shortTitle: 'Bharatiya Nyaya Sanhita',
    sectionNumber: '10',
    heading: 'Punishment of person guilty of one of several offences',
    sectionText: 'Fixture placeholder. Real text arrives from the corpus.',
    footnote: null,
    orderIndex: 2,
    sourceUrl: 'https://www.indiacode.nic.in/',
  },
  {
    sectionId: 'sec_mock_3',
    statuteId: 'act_bns',
    shortTitle: 'Bharatiya Nyaya Sanhita',
    sectionNumber: '63A',
    heading: 'Illustrative lettered section',
    sectionText: 'Fixture placeholder. Real text arrives from the corpus.',
    footnote: 'Fixture footnote.',
    orderIndex: 3,
    sourceUrl: 'https://www.indiacode.nic.in/',
  },
];
