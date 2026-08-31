/**
 * NEW2 R14 FOLLOW-UP — the evidence packet for the one pin R14 left unresolved.
 *
 * `(2010) 7 SCC 626` is cited in *Madhu S v. Travancore Devaswom Board* (Kerala
 * HC, 4 Jul 2023) as *Union of India v. National Confederation for Blind*. The
 * resolver pins the key to *Govt. of India v. Ravi Prakash Gupta* (SC,
 * 7 Jul 2010). R14 flagged the disagreement, hand-read six of forty-one such
 * flags, and could resolve five. This one it could not, and named it rather
 * than averaging it away.
 *
 * This file ASSEMBLES EVIDENCE. It resolves nothing, writes no edge, and makes
 * no semantic guess. It reads only sources already held and already approved:
 * our own judgment text, our own alias and citation-key rows.
 *
 * ## Why a machine cannot safely close this one
 *
 * The discriminating fact is a PAGE NUMBER IN A COMMERCIAL LAW REPORT. Supreme
 * Court Cases is Eastern Book Company's copy-edited edition, which `CLAUDE.md`
 * forbids this corpus from holding (*EBC v. D.B. Modak*), and every official
 * source we may use — the Court's own reports, India Code — paginates in SCR,
 * not SCC. So no primary source available to us states what is printed at
 * (2010) 7 SCC 626. What we can do is count what the courts themselves say
 * beside that citation, and show the count with its one dissenter.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-r14-followup-human-review-citation.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = join(ROOT, 'docs/ai/new2-r14-followup');
mkdirSync(OUTDIR, { recursive: true });

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}
const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 60, connect_timeout: 30 });

const KEY = '20107SCC626';
const NORMALISED = '(2010) 7 SCC 626';
const EDGE = 'e1b011f2-3ee8-4021-944a-321448d62415';
const TARGET = '80886516-ab4b-4805-b770-41e537ce065e';

/**
 * These texts are OCR'd and this corpus has a documented `s`-dropping defect —
 * "Ravi Praka h Gupta", "deci ion". Both matchers are written to survive it, so
 * the census counts what the page says rather than what the extractor kept.
 */
const NAMES_GUPTA = /RAVI\s*PRAKA\s*S?\s*H\s*GUPTA/i;
const NAMES_BLIND =
  /(CONFEDERATION|FEDERATION)[^.]{0,60}BLIND|BLIND[^.]{0,60}(CONFEDERATION|FEDERATION)/i;

type Ctx = {
  citingJudgmentId: string;
  court: string;
  caseTitle: string;
  judgmentDate: string | null;
  citationText: string;
  charOffset: number | null;
  window: string;
  namesGupta: boolean;
  namesBlind: boolean;
};

const clean = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim();

async function main() {
  const edge = await sql`
    SELECT c.id, c.citing_judgment_id, c.cited_judgment_id, c.citation_text,
           c.normalised_citation, c.char_offset, c.created_at,
           j.case_title, j.court, j.judgment_date, j.source_url
      FROM judgment_citations c JOIN judgments j ON j.id = c.citing_judgment_id
     WHERE c.id = ${EDGE}`;

  const citingCtx = await sql<{ ctx: string }[]>`
    SELECT substring(full_text from 17300 for 1500) AS ctx FROM judgments
     WHERE id = ${edge[0]!['citing_judgment_id']}`;

  const target = await sql`
    SELECT id, case_title, neutral_citation, reporter_citations, court, bench,
           judgment_date, case_number, case_type, petitioner, respondent,
           disposal_nature, source_url, overruled_status
      FROM judgments WHERE id = ${TARGET}`;

  const alias = await sql`
    SELECT alias, alias_key, alias_reporter, corroborations, evidence, created_at
      FROM judgment_citation_aliases WHERE alias_key = ${KEY}`;

  const keys = await sql`
    SELECT k.citation_key, k.source, k.source_text, k.years, j.case_title, j.id AS judgment_id
      FROM judgment_citation_keys k JOIN judgments j ON j.id = k.judgment_id
     WHERE k.citation_key = ${KEY}`;

  /**
   * Every Supreme Court judgment our corpus holds whose title names the blind.
   * Restricted to the Supreme Court because the candidate identity is asserted
   * to be an Apex Court decision; the High Court judgments carrying the phrase
   * are counted, not listed, so the packet stays readable.
   */
  const blindTitled = await sql`
    SELECT id, case_title, neutral_citation, reporter_citations, court, judgment_date
      FROM judgments
     WHERE court = 'Supreme Court of India'
       AND case_title ~* '(CONFEDERATION|FEDERATION).{0,40}BLIND'
     ORDER BY judgment_date`;
  const blindTitledOtherCourts = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM judgments
     WHERE court <> 'Supreme Court of India'
       AND case_title ~* '(CONFEDERATION|FEDERATION).{0,40}BLIND'`;

  /** The neighbouring citation in the same sentence, independently checkable. */
  const neighbour = await sql`
    SELECT a.alias, a.alias_key, a.corroborations, a.evidence, j.case_title,
           j.judgment_date, j.reporter_citations
      FROM judgment_citation_aliases a JOIN judgments j ON j.id = a.judgment_id
     WHERE a.alias_key IN ('201310SCC772', '201513SCC643')`;

  const rows = await sql<
    Array<{
      citing_judgment_id: string;
      court: string;
      case_title: string;
      judgment_date: Date | null;
      citation_text: string;
      char_offset: number | null;
      win: string;
    }>
  >`
    SELECT c.citing_judgment_id, j.court, j.case_title, j.judgment_date,
           c.citation_text, c.char_offset,
           substring(j.full_text from greatest(1, coalesce(c.char_offset, 1) - 400) for 900) AS win
      FROM judgment_citations c JOIN judgments j ON j.id = c.citing_judgment_id
     WHERE c.normalised_citation = ${NORMALISED}`;

  const contexts: Ctx[] = rows.map((r) => {
    const w = clean(r.win);
    return {
      citingJudgmentId: r.citing_judgment_id,
      court: r.court,
      caseTitle: r.case_title,
      judgmentDate: r.judgment_date ? new Date(r.judgment_date).toISOString().slice(0, 10) : null,
      citationText: r.citation_text,
      charOffset: r.char_offset,
      window: w,
      namesGupta: NAMES_GUPTA.test(w),
      namesBlind: NAMES_BLIND.test(w),
    };
  });

  const census = {
    edgesCarryingTheCitation: rows.length,
    windowNamesRaviPrakashGuptaOnly: contexts.filter((c) => c.namesGupta && !c.namesBlind).length,
    windowNamesBlindOnly: contexts.filter((c) => !c.namesGupta && c.namesBlind).length,
    windowNamesBoth: contexts.filter((c) => c.namesGupta && c.namesBlind).length,
    windowNamesNeither: contexts.filter((c) => !c.namesGupta && !c.namesBlind).length,
    distinctCourtsNamingGupta: new Set(contexts.filter((c) => c.namesGupta).map((c) => c.court))
      .size,
    distinctCourtsNamingBlind: new Set(
      contexts.filter((c) => !c.namesGupta && c.namesBlind).map((c) => c.court),
    ).size,
  };
  return {
    edge,
    citingCtx,
    target,
    alias,
    keys,
    blindTitled,
    blindTitledOtherCourts,
    neighbour,
    contexts,
    census,
  };
}

const r = await main();
const packet = {
  artifact: 'NEW2_R14_FOLLOWUP_HUMAN_REVIEW_CITATION',
  lane: 'NEW2',
  measuredAt: new Date().toISOString(),
  state: 'HUMAN_REVIEW_REQUIRED',
  citation: { raw: r.edge[0]!['citation_text'], normalised: NORMALISED, key: KEY },
  question:
    'Which Supreme Court judgment is reported at (2010) 7 SCC 626 — Govt. of India v. Ravi Prakash Gupta, which the resolver pins, or Union of India v. National Confederation for Blind, which the citing text names?',
  theEdge: {
    id: EDGE,
    citedJudgmentId: r.edge[0]!['cited_judgment_id'],
    note: 'cited_judgment_id is NULL: this pin is a candidate and has never been written. Bulk apply is on HOLD and nothing in this round changes that.',
    citingJudgment: {
      id: r.edge[0]!['citing_judgment_id'],
      caseTitle: r.edge[0]!['case_title'],
      court: r.edge[0]!['court'],
      judgmentDate: r.edge[0]!['judgment_date'],
      sourceUrl: r.edge[0]!['source_url'],
      charOffset: r.edge[0]!['char_offset'],
    },
    citingExtract: clean(r.citingCtx[0]?.ctx ?? ''),
  },
  candidateIdentities: [
    {
      identity: 'Govt. of India through Secretary & Anr. v. Ravi Prakash Gupta & Anr.',
      heldInCorpus: true,
      judgment: r.target[0],
      supportingEvidence: [
        'the alias row keying (2010) 7 SCC 626 to this judgment, with its own parallel-citation evidence string',
        'its reporter_citations carry [2010] 7 S.C.R. 851, which is the SCR half of that same evidence string',
        'the citing-window census below',
      ],
    },
    {
      identity: 'Union of India & Ors. v. National Confederation for Blind',
      heldInCorpus: r.blindTitled.length > 0,
      note: 'no judgment under this exact title is held. Every Supreme Court judgment we hold whose title names a federation or confederation of the blind is listed below; none is a 2010 decision.',
      supremeCourtJudgmentsHeldWithBlindInTitle: r.blindTitled,
      sameTitlePatternInOtherCourts: r.blindTitledOtherCourts[0]?.n ?? 0,
    },
  ],
  aliasEvidence: {
    rows: r.alias,
    note: 'evidence reads "(2010) 7 SCC 6266 : [2010] 7 SCR 851". The trailing digit is doubled — the same artefact appears on the independently checkable neighbour below, where the SCR half is verifiable against our own row, so the doubling is an extraction artefact rather than a different page.',
  },
  citationKeyRows: r.keys,
  neighbouringCitationsInTheSameSentence: {
    rows: r.neighbour,
    whyThisMatters:
      "the citing sentence attributes [2013 (10) SCC 772] to Popat Bahiru Govardhane v. Land Acquisition Officer. Our own alias rows key (2013) 10 SCC 772 to Union of India v. National Federation of the Blind, corroborated, with its SCR half verifiable against that judgment's own reporter_citations. At least one case-name-to-citation pairing in that sentence is therefore wrong in the citing text itself, which is why the sentence cannot settle the identity of the citation next to it.",
  },
  citingWindowCensus: {
    ...r.census,
    windowsNamingTheBlindAndNotGupta: r.contexts
      .filter((c) => c.namesBlind && !c.namesGupta)
      .map((c) => ({
        citingJudgmentId: c.citingJudgmentId,
        court: c.court,
        caseTitle: c.caseTitle,
        judgmentDate: c.judgmentDate,
        window: c.window,
      })),
    method:
      'every held edge whose normalised_citation is (2010) 7 SCC 626, with a 900-character window around the citation, tested for each candidate name. Matchers tolerate this corpus\'s documented OCR s-dropping ("Ravi Praka h Gupta").',
    note: 'This counts what citing courts SAY beside the citation. It is strong corroboration and it is not the report itself; a name repeated by many courts is still not the printed page.',
  },
  whyCurrentEvidenceCannotSafelyDecide: [
    "The discriminating fact is a page number in Supreme Court Cases, a commercial law report. CLAUDE.md forbids this corpus from holding a reporter's copy-edited edition (EBC v. D.B. Modak), so we do not hold it and may not acquire it for this purpose.",
    "Every official source we are authorised to use paginates in SCR, not SCC. India Code carries statutes, not law reports. The Supreme Court's own reports are SCR. Neither states what is printed at (2010) 7 SCC 626.",
    'Our alias for the key is DERIVED — extracted from a parallel-citation string in other judgments, not read off the report. Its SCR half is verifiable against our own row; its SCC half is not verifiable against anything we hold.',
    'The citing text that raised the conflict is itself internally inconsistent on a neighbouring citation, so it is evidence of a drafting error somewhere in that sentence rather than evidence about the target.',
    'Deciding this on party-name similarity is exactly the inference this lane refuses. Title resemblance has created no edge in this round and creates none here.',
  ],
  whatWouldSettleIt: [
    'a human with access to (2010) 7 SCC 626 reading the page',
    'or an official SCR-to-SCC concordance published by a source we are authorised to use',
  ],
  disposition: {
    state: 'HUMAN_REVIEW_REQUIRED',
    edgeWritten: false,
    resolverChanged: false,
    bulkApply: 'HOLD',
    note: 'The corpus evidence leans one way and the packet says so plainly. Leaning is not resolution, and this lane does not convert one into the other.',
  },
};
const out = join(OUTDIR, 'human-review-citation-2010-7-scc-626.json');
const body = JSON.stringify(packet, null, 1);
writeFileSync(out, body);
writeFileSync(
  join(OUTDIR, 'human-review-citation-2010-7-scc-626.sha256'),
  `${createHash('sha256').update(body).digest('hex')}  human-review-citation-2010-7-scc-626.json\n`,
);
console.log(JSON.stringify(r.census, null, 1));
console.log('blind-titled judgments held:', r.blindTitled.length);
console.log('artifact', out);
await sql.end();
