/**
 * NEW2 — R16 §4. THE 46 NON-COHORT HOLDOUT KEYS, CLASSIFIED FROM RETAINED TEXT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE QUESTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LCC's R15 holdout split 226 material false uniques into 180 that a
 * connected-matter cohort gate can withhold and **46 that it cannot**: a
 * judgment carrying ANOTHER judgment's neutral citation in
 * `judgments.neutral_citation`, either at a different date in the same court
 * (43) or in a different court entirely (3). LCC handed those 46 to NEW2 rather
 * than absorbing them into a resolver gate that would then look better than it
 * is (`docs/ai/lcc-r15/LCC_R15_COHORT_GATE.md` §6).
 *
 * "A judgment carrying another's citation" is a description of a symptom. This
 * asks which of five different things actually happened, per key, from evidence
 * the repository already holds.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE INSTRUMENT, AND THE THREE THINGS THAT MADE THE FIRST VERSION WRONG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every bearer's retained text is asked ONE question: what ROLE does the
 * citation play in this document — its own masthead, its own page stamp, the
 * furniture of some other order, or an authority it relies on. The key-level
 * verdict follows from the roles. `neutral_citation` for High Court rows is
 * `neutralCitationFrom` in `services/ingest/src/harvest/hc-load.ts`: the FIRST
 * regex match in the opening 3,000 characters, accepted when the citation's year
 * is the partition year or the one before it. That rule is the suspect, so
 * nothing here consults it.
 *
 *  1. **A negative identity claim needs readable text.** Four Punjab & Haryana
 *     bearers looked like they held another case's document because their own
 *     case number appeared nowhere in them. Their extracted text is a CID glyph
 *     dump — `132  ! " #$ %& &$ #` — at an English-token density of 0.07 against
 *     0.73 for a healthy row. `text_quality` certifies those; control-char and
 *     English density do not. A damaged document can only ever be UNTESTABLE.
 *  2. **The masthead does not always carry the case number.** Allahabad's
 *     `Neutral Citation No. - X / Court No. 75 / HIGH COURT OF JUDICATURE` form
 *     prints the parties instead, so the own-number test reads the whole
 *     document and position alone decides only WHERE the citation sits.
 *  3. **A CNR beside the citation outranks position.** The Uttarakhand order
 *     sheet for HABC 16 of 2023 carries `D1- 23 UKHC010088392026
 *     2026:UHC:4224-DB` 160 characters in — the CNR *and* the citation of the
 *     connected 2026 petition. Read by position that is a masthead; read by CNR
 *     it is plainly another matter's furniture.
 *
 * Read-only. Database, no network. Writes one artifact.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-noncohort-46-classify.mts \
 *     [--out docs/ai/new2-r16/noncohort-46-classification.json]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const OUT = join(ROOT, arg('out', 'docs/ai/new2-r16/noncohort-46-classification.json'));
const HOLDOUT = join(ROOT, arg('holdout', 'docs/ai/lcc-r15/cohort-gate.json'));

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The row's own case number reduced to [serial, year]. `/2263/2023` -> ['2263','2023']. */
function ownNumber(cn: string | null): [string, string] | null {
  if (!cn) return null;
  const nums = String(cn)
    .split('/')
    .filter((p) => /^[0-9]+$/.test(p));
  if (nums.length < 2) return null;
  return [nums[nums.length - 2]!, nums[nums.length - 1]!];
}

/** Does `text` print `<serial> … <year>` in one of the Indian cause-title forms? */
function printsNumber(text: string, pair: [string, string] | null): boolean | null {
  if (!pair) return null;
  return new RegExp('\\b' + pair[0] + '\\b[^0-9]{0,40}\\b' + pair[1] + '\\b').test(text);
}

/**
 * Control-char density and English-token density, not `text_quality`.
 * `text-quality-certifies-garbage`: 1,187 of 1,187 unreadable rows scored above
 * the 0.85 floor. A private-use-area glyph dump has ~0.07 English density.
 */
function damage(t: string): { ctrl: number; english: number; damaged: boolean } {
  if (!t.length) return { ctrl: 1, english: 0, damaged: true };
  let ctrl = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || (c >= 0xe000 && c <= 0xf8ff)) ctrl++;
  }
  const words = t.match(/[A-Za-z]{3,}/g) ?? [];
  const english = words.length / Math.max(1, t.length / 6);
  return { ctrl: ctrl / t.length, english, damaged: ctrl / t.length > 0.02 || english < 0.35 };
}

/** A reference to SOME case immediately before the citation. */
const CITE_LEAD =
  /(\bv\.\s|\bvs\.?\s|\bversus\b|No\.\s*-?\s*\d|No\.\d|reported in|in the case of|covered (?:by|under)|in terms of|as held in|decided by this Court|passed by this Court|relied (?:up)?on|Cases Referred|while deciding|Neutral Citation No\.?\s*-?\s*$|Neutral Citation:?\s*\[?\s*$)/i;
/** The page furniture Delhi and Punjab & Haryana stamp on every sheet. */
const STAMP =
  /(digitally signed|downloaded from|Server on|Page \d+ of \d+|authenticity of the (?:order|judgment)|attest to the accuracy)/i;
const CNR = /\b([A-Z]{2}HC[0-9]{12,14})\b/;
/**
 * Observed on this population: mastheads sit at offsets 0–160 and the first
 * cited occurrence is at 387. The gap is real and wide; the threshold sits in it
 * rather than on either edge.
 */
const MASTHEAD_MAX = 250;

type Row = {
  citation_key: string;
  judgment_id: string;
  court: string;
  jdate: string;
  case_number: string | null;
  cnr: string | null;
  neutral_citation: string;
  source_url: string | null;
  content_hash: string | null;
  case_title: string | null;
  full_text: string | null;
};

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  const takenAt = new Date().toISOString();
  const holdout = JSON.parse(readFileSync(HOLDOUT, 'utf8')) as {
    measuredAt: string;
    t0: string;
    positives: number;
    positivesRecoverable: number;
    positivesOutOfScope: number;
    outOfScope: { citationKey: string; sameCourt: boolean; sameDate: boolean }[];
  };
  const keys = holdout.outOfScope.map((o) => o.citationKey);
  if (keys.length !== 46) throw new Error(`expected 46 out-of-scope keys, found ${keys.length}`);

  const rows = await sql<Row[]>`
    SELECT k.citation_key, k.judgment_id, j.court, to_char(j.judgment_date,'YYYY-MM-DD') AS jdate,
           j.case_number, j.cnr, j.neutral_citation, j.source_url, j.content_hash,
           j.case_title, j.full_text
      FROM judgment_citation_keys k JOIN judgments j ON j.id = k.judgment_id
     WHERE k.citation_key = ANY(${keys}) AND k.source = 'neutral'
     ORDER BY k.citation_key, j.judgment_date`;

  const bearers = rows.map((r) => {
    const t = r.full_text ?? '';
    const nc = r.neutral_citation;
    const at = t.indexOf(nc);
    const before = t.slice(Math.max(0, at - 320), at);
    const after = t.slice(at, at + 320);
    const own = ownNumber(r.case_number);
    const dmg = damage(t);
    const ownAnywhere = printsNumber(t, own);
    const cnrBefore = CNR.exec(before.slice(-140));
    const foreignCnr = cnrBefore !== null && r.cnr !== null && cnrBefore[1] !== r.cnr;
    const furnitureRef = /([A-Z]{2,6}[-\s]?\d{2,6}[-/]\d{4})/.exec(before.slice(-120));

    let role: string;
    if (at < 0) role = 'CITATION_NOT_IN_TEXT';
    else if (dmg.damaged && !ownAnywhere) role = 'TEXT_TOO_DAMAGED_TO_TEST';
    else if (foreignCnr) role = 'FURNITURE_OF_ANOTHER_ORDER';
    else if (at <= MASTHEAD_MAX) role = ownAnywhere === false ? 'MASTHEAD_OF_ANOTHER_CASE' : 'OWN_MASTHEAD';
    else if (STAMP.test(before.slice(-160)) || STAMP.test(after.slice(0, 160)))
      role =
        furnitureRef && !printsNumber(furnitureRef[1]!.replace(/-/g, ' '), own)
          ? 'FURNITURE_OF_ANOTHER_ORDER'
          : 'OWN_PAGE_STAMP';
    else if (CITE_LEAD.test(before)) role = 'CITED_IN_PROSE';
    else role = 'UNRESOLVED_ROLE';

    return {
      key: r.citation_key,
      judgmentId: r.judgment_id,
      court: r.court,
      date: r.jdate,
      caseNumber: r.case_number,
      cnr: r.cnr,
      neutralCitation: nc,
      contentHash: r.content_hash,
      sourceUrl: r.source_url,
      pdfBasename: String(r.source_url ?? '').split('/').pop() ?? '',
      caseTitle: (r.case_title ?? '').replace(/\s+/g, ' ').slice(0, 140),
      textLength: t.length,
      citationOffset: at,
      role,
      ownCaseNumberPrintedInDocument: ownAnywhere,
      controlCharDensity: Number(dmg.ctrl.toFixed(4)),
      englishTokenDensity: Number(dmg.english.toFixed(3)),
      textDamaged: dmg.damaged,
      mastheadFingerprint: norm(t.slice(0, 600).split(nc).join(' ')).slice(0, 200),
      evidence: (before.replace(/\s+/g, ' ').trim().slice(-160) +
        ' >>> ' +
        after.replace(/\s+/g, ' ').trim().slice(0, 160)).trim(),
    };
  });

  const byKey = new Map<string, typeof bearers>();
  for (const b of bearers) {
    if (!byKey.has(b.key)) byKey.set(b.key, []);
    byKey.get(b.key)!.push(b);
  }

  const cases = [...byKey.keys()].sort().map((key) => {
    const g = byKey.get(key)!;
    const owners = g.filter((b) => b.role === 'OWN_MASTHEAD' || b.role === 'OWN_PAGE_STAMP');
    const cited = g.filter((b) => b.role === 'CITED_IN_PROSE' || b.role === 'FURNITURE_OF_ANOTHER_ORDER');
    const foreignDoc = g.filter((b) => b.role === 'MASTHEAD_OF_ANOTHER_CASE');
    const untestable = g.filter((b) => b.role === 'TEXT_TOO_DAMAGED_TO_TEST' || b.role === 'UNRESOLVED_ROLE');

    /** distinct DOCUMENTS among the owners, by masthead */
    const docs: { fp: string; members: typeof bearers }[] = [];
    for (const b of owners) {
      const hit = docs.find((d) => d.fp.slice(0, 140) === b.mastheadFingerprint.slice(0, 140));
      if (hit) hit.members.push(b);
      else docs.push({ fp: b.mastheadFingerprint, members: [b] });
    }
    const duplicated = docs.filter((d) => d.members.length > 1);

    let verdict: string;
    let why: string;
    if (untestable.length > 0 && owners.length + cited.length + foreignDoc.length === 0) {
      verdict = 'UNTESTABLE';
      why = `all ${g.length} bearers hold text this instrument cannot read (English token density ${g.map((b) => b.englishTokenDensity).join(', ')})`;
    } else if (docs.length > 1) {
      verdict = 'SOURCE_DOCUMENT_GENUINELY_PRINTS_FOREIGN_NEUTRAL_CITATION';
      why = `${docs.length} different documents each print this citation as their own masthead or page stamp; the court issued one number to more than one matter`;
    } else if (foreignDoc.length > 0) {
      verdict = 'INGEST_WRONG_DOCUMENT_IDENTITY';
      why = `${foreignDoc.length} row(s) hold a document whose masthead names a different case number than the row claims`;
    } else if (duplicated.length > 0 && cited.length === 0) {
      verdict = 'DUPLICATE_DOCUMENT_IDENTITY';
      why = `${duplicated.reduce((a, d) => a + d.members.length, 0)} rows carry the same document under different identities`;
    } else if (cited.length > 0) {
      verdict = 'INGEST_WRONG_NEUTRAL_CITATION_EXTRACTION';
      why = `${cited.length} of ${g.length} bearers only ever mention this citation as an authority they rely on, or in another order's furniture; the document prints no citation of its own and neutralCitationFrom takes the first match in the opening 3,000 characters`;
    } else {
      verdict = 'AMBIGUOUS';
      why = 'no single role explains the multi-claim';
    }

    const secondary: string[] = [];
    if (duplicated.length > 0 && verdict !== 'DUPLICATE_DOCUMENT_IDENTITY')
      secondary.push('DUPLICATE_DOCUMENT_IDENTITY');
    if (foreignDoc.length > 0 && verdict !== 'INGEST_WRONG_DOCUMENT_IDENTITY')
      secondary.push('INGEST_WRONG_DOCUMENT_IDENTITY');
    if (untestable.length > 0 && verdict !== 'UNTESTABLE') secondary.push('PARTIALLY_UNTESTABLE');
    const basenames = new Map<string, number>();
    for (const b of g) basenames.set(b.pdfBasename, (basenames.get(b.pdfBasename) ?? 0) + 1);
    const sharedObject = [...basenames].filter(([, n]) => n > 1);
    if (sharedObject.length > 0) secondary.push('SAME_PDF_OBJECT_UNDER_TWO_ROWS');

    return {
      citationKey: key,
      sameCourt: holdout.outOfScope.find((o) => o.citationKey === key)!.sameCourt,
      bearers: g.length,
      verdict,
      why,
      secondary,
      ownerHeld: owners.length > 0,
      distinctOwnerDocuments: docs.length,
      duplicateRows: duplicated.reduce((a, d) => a + d.members.length, 0),
      sharedPdfObjects: sharedObject.map(([basename, n]) => ({ basename, rows: n })),
      roles: g.reduce<Record<string, number>>((a, b) => ((a[b.role] = (a[b.role] ?? 0) + 1), a), {}),
      members: g,
    };
  });

  /**
   * The corpus-wide shape of the same population, so the 46 are read against a
   * denominator rather than on their own. Measured, not extrapolated: this is
   * the SHAPE split (LCC's cohort criterion), not a claim about how many of
   * those 35,132 keys carry each defect — that would need this instrument run
   * over a sample of them, and it has not been.
   */
  const shape = await sql<{ shape: string; keys: number; rows: number }[]>`
    WITH k AS (
      SELECT k.citation_key,
             count(DISTINCT k.judgment_id)   AS claimants,
             count(DISTINCT j.court)         AS courts,
             count(DISTINCT j.judgment_date) AS dates
        FROM judgment_citation_keys k
        JOIN judgments j ON j.id = k.judgment_id
       WHERE k.source = 'neutral'
       GROUP BY 1
      HAVING count(DISTINCT k.judgment_id) > 1)
    SELECT CASE WHEN courts > 1 THEN 'cross_court'
                WHEN dates  > 1 THEN 'same_court_different_dates'
                ELSE 'same_court_same_date' END AS shape,
           count(*)::int AS keys, sum(claimants)::int AS rows
      FROM k GROUP BY 1 ORDER BY 2 DESC`;
  const [totals] = await sql<{ keys_total: number; keys_multi: number }[]>`
    WITH k AS (
      SELECT citation_key, count(DISTINCT judgment_id) AS claimants
        FROM judgment_citation_keys WHERE source = 'neutral' GROUP BY 1)
    SELECT count(*)::int AS keys_total, count(*) FILTER (WHERE claimants > 1)::int AS keys_multi FROM k`;
  const [contention] = await sql<{ active: number }[]>`
    SELECT count(*)::int AS active FROM pg_stat_activity WHERE state = 'active'`;

  const tally = cases.reduce<Record<string, number>>((a, c) => ((a[c.verdict] = (a[c.verdict] ?? 0) + 1), a), {});
  const secondaryTally = cases.reduce<Record<string, number>>((a, c) => {
    for (const s of c.secondary) a[s] = (a[s] ?? 0) + 1;
    return a;
  }, {});

  const artifact = {
    artifact: 'NEW2_R16_NONCOHORT_46_CLASSIFICATION',
    lane: 'NEW2',
    takenAt,
    subject: {
      holdout: 'docs/ai/lcc-r15/cohort-gate.json',
      holdoutMeasuredAt: holdout.measuredAt,
      t0: holdout.t0,
      positives: holdout.positives,
      recoverableByCohortGate: holdout.positivesRecoverable,
      outOfScopeForAnyResolverGate: holdout.positivesOutOfScope,
      extractorUnderTest: 'services/ingest/src/harvest/hc-load.ts neutralCitationFrom',
      note: 'the resolver is not consulted; every verdict is a function of retained document text and the row identity fields',
    },
    method: {
      roles: 'OWN_MASTHEAD · OWN_PAGE_STAMP · FURNITURE_OF_ANOTHER_ORDER · CITED_IN_PROSE · MASTHEAD_OF_ANOTHER_CASE · TEXT_TOO_DAMAGED_TO_TEST · UNRESOLVED_ROLE',
      mastheadMaxOffset: MASTHEAD_MAX,
      observedOffsetGap: 'mastheads 0-160, first cited occurrence 387',
      damageScreen: 'control-char density > 0.02 or English token density < 0.35; text_quality is not consulted',
      cnrRule: 'a CNR within 140 characters before the citation that is not the row own CNR makes the citation another matter furniture, whatever its offset',
      contention: `pg_stat_activity active: ${contention!.active}`,
    },
    results: { casesTotal: cases.length, verdicts: tally, secondary: secondaryTally,
      keysWithNoOwnerHeld: cases.filter((c) => !c.ownerHeld).length,
      bearerRoles: bearers.reduce<Record<string, number>>((a, b) => ((a[b.role] = (a[b.role] ?? 0) + 1), a), {}),
      bearersTotal: bearers.length },
    corpusWide: {
      note: 'the SHAPE of the same population corpus-wide. A shape is not a defect count; this instrument has not been run over a sample of these keys.',
      neutralCitationKeys: totals!.keys_total,
      keysWithMoreThanOneClaimant: totals!.keys_multi,
      byShape: shape,
    },
    cases,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(artifact, null, 1), 'utf8');
  console.log(`[noncohort46] ${cases.length} cases · ${JSON.stringify(tally)}`);
  console.log(`[noncohort46] wrote ${OUT}`);
} finally {
  await sql.end({ timeout: 5 });
}
