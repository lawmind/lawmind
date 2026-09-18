/**
 * `pnpm --filter @lawmind/harness failure:taxonomy` — a real, bottom-up
 * taxonomy of the 238 non-SUCCESS cases from the closed `failure:classify`
 * run (Q1.41, `docs/CURRENT_PLAN.md`), not an assumed one.
 *
 * Reads the checkpoint failure:classify already wrote
 * (`failure-classify-checkpoint.jsonl`) rather than re-running retrieval —
 * this is pure analysis over already-measured results, adds zero DB load
 * beyond the enrichment join below.
 *
 * For every non-SUCCESS case: query shape (citation/section/case_name/
 * concept, `query-shape.ts` — the same classifier `retrieve.ts` uses, not a
 * new one), query length, whether the query text itself carries a
 * citation-shaped or section-shaped span, and the gold judgment's court,
 * `hc_document_class`, `case_type`, and citation-field presence. Then
 * cross-tabulated, not clustered by an invented category scheme — the
 * directive is explicit: do not invent categories before inspecting the
 * failures.
 */
import { readFileSync } from 'node:fs';

import { openDb } from '@lawmind/ingest/db-host';
import { classifyQuery } from '@lawmind/api/search/query-shape';
import { extractCitations } from '@lawmind/ingest/citations';

const CHECKPOINT_PATH = new URL('../../../failure-classify-checkpoint.jsonl', import.meta.url);

type Classification = {
  queryId: string;
  group: string;
  query: string;
  goldJudgmentIds: string[];
  primary:
    | 'SUCCESS'
    | 'AUTHORITY_RETRIEVED_BUT_BADLY_RANKED'
    | 'AUTHORITY_HELD_BUT_NOT_RETRIEVED'
    | 'NO_AUTHORITY_FOUND';
  rank: number | null;
  secondary: string[];
};

// Same shape SECTION_RE in query-shape.ts uses, duplicated here rather than
// imported because it is not exported -- this tool only needs to know
// PRESENCE, not the parsed section/act, so a looser local check is honest
// about being a presence probe, not a re-implementation of the classifier.
const SECTION_PRESENCE_RE = /\b(?:section|sec|s)\.?\s*\d{1,3}[A-Z]{0,3}\b/i;
const CASE_NAME_PRESENCE_RE = /\S+\s+(?:v|vs|versus)\.?\s+\S+/i;

async function main(): Promise<void> {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const lines = readFileSync(CHECKPOINT_PATH, 'utf8')
    .split('\n')
    .filter((l) => l.trim());
  const all = lines.map((l) => JSON.parse(l) as Classification);
  const failures = all.filter((c) => c.primary !== 'SUCCESS');

  console.log(
    `${all.length} total classified, ${failures.length} non-SUCCESS (the population this run covers)`,
  );

  // Success RATE by the benchmark's own build-time group (criminal/civil/
  // hindi), over ALL 288 -- not just failures. This is the fair comparison;
  // raw failure counts among the 238 alone cannot say whether one group
  // fails disproportionately, only how the failures happen to split.
  console.log('\nSUCCESS RATE BY BENCHMARK GROUP (all 288, not just failures)');
  const byGroup = new Map<string, { n: number; success: number }>();
  for (const c of all) {
    const cur = byGroup.get(c.group) ?? { n: 0, success: 0 };
    cur.n++;
    if (c.primary === 'SUCCESS') cur.success++;
    byGroup.set(c.group, cur);
  }
  for (const [g, { n, success }] of [...byGroup.entries()].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${g.padEnd(12)} ${success}/${n} = ${((success / n) * 100).toFixed(1)}% success`);
  }

  const sql = await openDb(url, 4);
  try {
    const goldIds = [
      ...new Set(failures.map((f) => f.goldJudgmentIds[0]).filter((id): id is string => !!id)),
    ];
    const rows = await sql<
      {
        id: string;
        case_title: string;
        court: string;
        case_type: string | null;
        hc_document_class: string | null;
        neutral_citation: string | null;
        reporter_citations: string[];
        judgment_date: string;
      }[]
    >`
      SELECT id, case_title, court, case_type::text, hc_document_class,
             neutral_citation, coalesce(reporter_citations, '{}') AS reporter_citations,
             judgment_date::text
      FROM judgments
      WHERE id = ANY(${goldIds})
    `;
    const byId = new Map(rows.map((r) => [r.id, r]));

    type Enriched = {
      c: Classification;
      shape: string;
      queryLen: number;
      hasCitationSpan: boolean;
      hasSectionSpan: boolean;
      hasCaseNameSpan: boolean;
      court: string;
      docClass: string;
      caseType: string;
      hasNeutralCitation: boolean;
      hasReporterCitation: boolean;
    };

    const enriched: Enriched[] = failures.map((c) => {
      const g = byId.get(c.goldJudgmentIds[0] ?? '');
      const shape = classifyQuery(c.query).shape;
      return {
        c,
        shape,
        queryLen: c.query.length,
        hasCitationSpan: extractCitations(c.query).length > 0,
        hasSectionSpan: SECTION_PRESENCE_RE.test(c.query),
        hasCaseNameSpan: CASE_NAME_PRESENCE_RE.test(c.query),
        court: g?.court ?? '(gold judgment not found)',
        docClass: g?.hc_document_class ?? (g ? '(null -- SC or unclassified)' : '(unknown)'),
        caseType: g?.case_type ?? '(null)',
        hasNeutralCitation: !!g?.neutral_citation,
        hasReporterCitation: (g?.reporter_citations.length ?? 0) > 0,
      };
    });

    const tally = <K extends string>(label: string, keyFn: (e: Enriched) => K): void => {
      console.log(`\n${label}`);
      const counts = new Map<string, { held: number; badly: number }>();
      for (const e of enriched) {
        const k = keyFn(e);
        const cur = counts.get(k) ?? { held: 0, badly: 0 };
        if (e.c.primary === 'AUTHORITY_HELD_BUT_NOT_RETRIEVED') cur.held++;
        else if (e.c.primary === 'AUTHORITY_RETRIEVED_BUT_BADLY_RANKED') cur.badly++;
        counts.set(k, cur);
      }
      const sorted = [...counts.entries()].sort(
        (a, b) => b[1].held + b[1].badly - (a[1].held + a[1].badly),
      );
      for (const [k, v] of sorted) {
        console.log(
          `  ${k.padEnd(40)} HELD_NOT_RETRIEVED ${String(v.held).padStart(3)}  BADLY_RANKED ${String(v.badly).padStart(3)}  total ${v.held + v.badly}`,
        );
      }
    };

    tally(
      'BY BENCHMARK GROUP (criminal/civil/hindi -- among failures only, raw counts)',
      (e) => e.c.group,
    );
    tally('BY QUERY SHAPE (query-shape.ts classifier)', (e) => e.shape);
    tally('BY GOLD JUDGMENT COURT', (e) => e.court);
    tally(
      'BY GOLD JUDGMENT hc_document_class (null = SC or not yet classified)',
      (e) => e.docClass,
    );
    tally('BY GOLD JUDGMENT case_type', (e) => e.caseType);
    tally('BY QUERY carries a citation-shaped span', (e) => (e.hasCitationSpan ? 'yes' : 'no'));
    tally('BY QUERY carries a section-shaped span', (e) => (e.hasSectionSpan ? 'yes' : 'no'));
    tally('BY QUERY carries a case-name-shaped span (X v Y)', (e) =>
      e.hasCaseNameSpan ? 'yes' : 'no',
    );
    tally('BY GOLD JUDGMENT has a neutral citation', (e) => (e.hasNeutralCitation ? 'yes' : 'no'));
    tally('BY GOLD JUDGMENT has a reporter citation', (e) =>
      e.hasReporterCitation ? 'yes' : 'no',
    );

    // Query length buckets -- fixed bucket edges chosen from the eval set's
    // own documented MIN/MAX_QUERY_CHARS (200/900, build-queries.ts), so the
    // buckets are the benchmark's own design bounds, not arbitrary round numbers.
    tally('BY QUERY LENGTH bucket', (e) => {
      if (e.queryLen < 300) return '200-299';
      if (e.queryLen < 500) return '300-499';
      if (e.queryLen < 700) return '500-699';
      return '700-900';
    });

    console.log('\nBADLY_RANKED rank distribution (how far past top-5)');
    const rankBuckets = new Map<string, number>();
    for (const e of enriched) {
      if (e.c.primary !== 'AUTHORITY_RETRIEVED_BUT_BADLY_RANKED' || e.c.rank === null) continue;
      const r = e.c.rank;
      const bucket = r <= 10 ? '6-10' : r <= 20 ? '11-20' : r <= 35 ? '21-35' : '36-50';
      rankBuckets.set(bucket, (rankBuckets.get(bucket) ?? 0) + 1);
    }
    for (const [k, v] of [...rankBuckets.entries()].sort())
      console.log(`  rank ${k.padEnd(10)} ${v}`);

    // Cross-tab most likely to reveal an actual cause: shape x court, since
    // that is where a systematic gap (e.g. "case-name queries against High
    // Court judgments specifically fail") would show up as a concentration.
    console.log('\nCROSS-TAB: shape x court (HELD_NOT_RETRIEVED + BADLY_RANKED combined)');
    const cross = new Map<string, number>();
    for (const e of enriched) {
      const k = `${e.shape} / ${e.court}`;
      cross.set(k, (cross.get(k) ?? 0) + 1);
    }
    for (const [k, v] of [...cross.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`  ${k.padEnd(45)} ${v}`);
    }

    // Investigating the group success-rate gap: does criminal fail
    // differently in SHAPE or in whether the query carries a citation span?
    console.log('\nCROSS-TAB: group x shape (among failures)');
    const groupShape = new Map<string, number>();
    for (const e of enriched) {
      const k = `${e.c.group} / ${e.shape}`;
      groupShape.set(k, (groupShape.get(k) ?? 0) + 1);
    }
    for (const [k, v] of [...groupShape.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(35)} ${v}`);
    }

    console.log('\nCROSS-TAB: group x has-citation-span (among failures)');
    const groupCitation = new Map<string, number>();
    for (const e of enriched) {
      const k = `${e.c.group} / ${e.hasCitationSpan ? 'has citation span' : 'no citation span'}`;
      groupCitation.set(k, (groupCitation.get(k) ?? 0) + 1);
    }
    for (const [k, v] of [...groupCitation.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(35)} ${v}`);
    }
  } finally {
    await sql.end();
  }
}

await main();
