/**
 * NEW2 — R17 §1. THE 30 MEASURED EXTRACTION DEFECTS, REPRODUCED PER BEARER ROW.
 *
 * R16 classified 46 non-cohort keys; 30 came back
 * INGEST_WRONG_NEUTRAL_CITATION_EXTRACTION. That verdict is a KEY-level verdict.
 * The defect is a ROW: one judgment whose `neutral_citation` column holds a
 * citation the document never claimed as its own. This resolves the 30 keys into
 * the individual defective rows and asks, per row, the four questions the
 * correction depends on:
 *
 *   1. what citation did `neutralCitationFrom` assign,
 *   2. where does it sit in the retained text,
 *   3. does the document print ANY neutral citation of its own, anywhere,
 *   4. what exact structure does the wrongly-taken occurrence sit in.
 *
 * (3) is the one R16 asserted and did not measure per row. If a defective
 * document prints its own citation further in, the defect is a bad CHOICE among
 * candidates; if it prints none, the defect is a bad ACCEPTANCE of the only
 * candidate. Those want different fixes, so it is measured rather than assumed.
 *
 * No semantic similarity. Read-only. Database, no network.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-r17-defect-table.mts
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const CLASSIFICATION = join(ROOT, arg('classification', 'docs/ai/new2-r17/reproduce-noncohort-46.json'));
const OUT = join(ROOT, arg('out', 'docs/ai/new2-r17/defect-table-30.json'));

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

/** The extractor's own pattern, global, so every occurrence is visible. */
const NEUTRAL_G = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/g;
const CNR_G = /\b([A-Z]{2}HC[0-9]{12,14})\b/g;
const CNR_ONE = /\b([A-Z]{2}HC[0-9]{12,14})\b/;
const STAMP =
  /(digitally signed|downloaded from|Server on|Page \d+ of \d+|authenticity of the (?:order|judgment)|attest to the accuracy|Verified by|Signature Not Verified)/i;
const CITE_LEAD =
  /(\bv\.\s|\bvs\.?\s|\bversus\b|No\.\s*-?\s*\d|No\.\d|reported in|in the case of|covered (?:by|under)|in terms of|as held in|decided by this Court|passed by this Court|relied (?:up)?on|Cases Referred|while deciding)/i;

/** The row's own case number reduced to [serial, year]. `/2263/2023` -> ['2263','2023']. */
function ownNumber(cn: string | null): [string, string] | null {
  if (!cn) return null;
  const nums = String(cn)
    .split('/')
    .filter((p) => /^[0-9]+$/.test(p));
  if (nums.length < 2) return null;
  return [nums[nums.length - 2]!, nums[nums.length - 1]!];
}
function printsNumber(text: string, pair: [string, string] | null): boolean | null {
  if (!pair) return null;
  return new RegExp('\\b' + pair[0] + '\\b[^0-9]{0,40}\\b' + pair[1] + '\\b').test(text);
}

type Row = {
  judgment_id: string;
  court: string;
  jdate: string;
  case_number: string | null;
  cnr: string | null;
  neutral_citation: string;
  source_url: string | null;
  case_title: string | null;
  full_text: string | null;
};

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  const takenAt = new Date().toISOString();
  const cls = JSON.parse(readFileSync(CLASSIFICATION, 'utf8')) as {
    takenAt: string;
    cases: { citationKey: string; verdict: string; members: { judgmentId: string; role: string }[] }[];
  };
  const thirty = cls.cases.filter((c) => c.verdict === 'INGEST_WRONG_NEUTRAL_CITATION_EXTRACTION');
  if (thirty.length !== 30) throw new Error(`expected 30 extraction-defect keys, found ${thirty.length}`);

  /** The DEFECTIVE rows: the bearers whose role was not an own-claim. */
  const WRONG = new Set(['CITED_IN_PROSE', 'FURNITURE_OF_ANOTHER_ORDER', 'MASTHEAD_OF_ANOTHER_CASE']);
  const wanted = new Map<string, string>();
  const roleOf = new Map<string, string>();
  for (const c of thirty)
    for (const m of c.members)
      if (WRONG.has(m.role)) {
        wanted.set(m.judgmentId, c.citationKey);
        roleOf.set(m.judgmentId, m.role);
      }

  const ids = [...wanted.keys()];
  const rows = await sql<Row[]>`
    SELECT j.id AS judgment_id, j.court, to_char(j.judgment_date,'YYYY-MM-DD') AS jdate,
           j.case_number, j.cnr, j.neutral_citation, j.source_url, j.case_title, j.full_text
      FROM judgments j WHERE j.id = ANY(${ids}) ORDER BY j.court, j.judgment_date`;

  const defects = rows.map((r) => {
    const t = r.full_text ?? '';
    const assigned = r.neutral_citation;
    const at = t.indexOf(assigned);

    /** every neutral-citation occurrence in the WHOLE text, not just the window */
    NEUTRAL_G.lastIndex = 0;
    const occ: { citation: string; offset: number; year: number }[] = [];
    for (let m = NEUTRAL_G.exec(t); m; m = NEUTRAL_G.exec(t))
      occ.push({ citation: m[0], offset: m.index, year: Number(m[1]) });
    const distinct = [...new Set(occ.map((o) => o.citation))];

    /** the row's own CNR versus every CNR the document prints */
    CNR_G.lastIndex = 0;
    const cnrs = [...new Set(t.match(CNR_G) ?? [])];
    const foreignCnrs = cnrs.filter((c) => c !== r.cnr);

    const before = at < 0 ? '' : t.slice(Math.max(0, at - 320), at);
    const after = at < 0 ? '' : t.slice(at, at + 320);
    const own = ownNumber(r.case_number);

    /**
     * The structure the wrongly-taken occurrence sits in, read off the retained
     * text only. Ordered most specific first; the first that matches wins.
     */
    const near = before.slice(-160);
    let structure = 'body_unmarked';
    if (at < 0) structure = 'not_in_text';
    else if (/Cases?\s+(?:Referred|cited)/i.test(before.slice(-400))) structure = 'cases_referred_block';
    else if (
      /(covered (?:by|under)|passed by this Court|decided by this Court|judgement dated|judgment dated|order dated)/i.test(
        near,
      )
    )
      structure = 'followed_authority';
    else if (/(reported in|in the case of|as held in|relied (?:up)?on|\bv\.\s|\bvs\.?\s|\bversus\b)/i.test(near))
      structure = 'quoted_or_cited_authority';
    else if (STAMP.test(near) || STAMP.test(after.slice(0, 160))) structure = 'page_furniture';
    else if (at <= 250) structure = 'header';
    else if (at > t.length - 1200) structure = 'footer';

    const cnrLead = CNR_ONE.exec(near);

    return {
      citationKey: wanted.get(r.judgment_id)!,
      judgmentId: r.judgment_id,
      r16Role: roleOf.get(r.judgment_id)!,
      court: r.court,
      date: r.jdate,
      caseNumber: r.case_number,
      cnr: r.cnr,
      caseTitle: (r.case_title ?? '').replace(/\s+/g, ' ').slice(0, 120),
      assignedCitation: assigned,
      assignedOffset: at,
      textLength: t.length,
      neutralOccurrences: occ.length,
      distinctNeutralCitations: distinct.length,
      /** THE question R16 asserted rather than measured: is there another candidate at all? */
      documentPrintsAnyOtherNeutralCitation: distinct.filter((c) => c !== assigned).length > 0,
      otherNeutralCitations: distinct.filter((c) => c !== assigned),
      ownCaseNumberPrintedInDocument: printsNumber(t, own),
      foreignCnrsPrinted: foreignCnrs.length,
      foreignCnrImmediatelyBefore: cnrLead ? cnrLead[1] !== r.cnr : false,
      structure,
      citeLeadWithin160: at < 0 ? null : CITE_LEAD.test(near),
      evidence: (
        before.replace(/\s+/g, ' ').trim().slice(-200) +
        ' >>> ' +
        after.replace(/\s+/g, ' ').trim().slice(0, 160)
      ).trim(),
      sourceUrl: r.source_url,
    };
  });

  const tally = (vals: (string | number | boolean | null)[]): Record<string, number> =>
    vals.reduce<Record<string, number>>((a, v) => ((a[String(v)] = (a[String(v)] ?? 0) + 1), a), {});

  const artifact = {
    artifact: 'NEW2_R17_DEFECT_TABLE_30',
    lane: 'NEW2',
    takenAt,
    subject: {
      classification: 'docs/ai/new2-r17/reproduce-noncohort-46.json',
      classificationTakenAt: cls.takenAt,
      keys: thirty.length,
      extractorUnderTest: 'services/ingest/src/harvest/hc-load.ts neutralCitationFrom',
      note: 'a defect is a ROW, not a key; these are the bearer rows whose R16 role was not an own-claim',
    },
    results: {
      defectiveRows: defects.length,
      byStructure: tally(defects.map((d) => d.structure)),
      byR16Role: tally(defects.map((d) => d.r16Role)),
      documentPrintsAnyOtherNeutralCitation: tally(defects.map((d) => d.documentPrintsAnyOtherNeutralCitation)),
      distinctNeutralCitationsInDocument: tally(defects.map((d) => d.distinctNeutralCitations)),
      assignedOffsetBuckets: tally(
        defects.map((d) =>
          d.assignedOffset < 0
            ? 'not_in_text'
            : d.assignedOffset <= 250
              ? '0-250'
              : d.assignedOffset <= 1000
                ? '251-1000'
                : d.assignedOffset <= 3000
                  ? '1001-3000'
                  : '>3000',
        ),
      ),
      textLengthBuckets: tally(
        defects.map((d) =>
          d.textLength < 2000 ? '<2000' : d.textLength < 5000 ? '2000-4999' : d.textLength < 20000 ? '5000-19999' : '>=20000',
        ),
      ),
      citeLeadWithin160: tally(defects.map((d) => d.citeLeadWithin160)),
      ownCaseNumberPrintedInDocument: tally(defects.map((d) => d.ownCaseNumberPrintedInDocument)),
      foreignCnrImmediatelyBefore: tally(defects.map((d) => d.foreignCnrImmediatelyBefore)),
    },
    defects,
  };
  const body = JSON.stringify(artifact, null, 2);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, body + '\n');
  console.log('[defect30]', JSON.stringify(artifact.results, null, 1));
  console.log('[defect30] sha256', createHash('sha256').update(body).digest('hex'));
  console.log('[defect30] wrote', OUT);
} finally {
  await sql.end();
}
