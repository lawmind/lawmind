/**
 * `pnpm --filter @lawmind/harness new3:gold` — NEW3's semantic-expansion gold
 * set: query→authority pairs biased toward High Court coverage NEW2 has
 * recently filled, for NEW1's expansion benchmark (bus 0806/0810/0814/0818)
 * to score once Tier-A reaches those courts. Every pair is a real judge's
 * citation, resolved to a held judgment — never an LLM's guess at what a
 * case stands for (`CLAUDE.md` §6: "the model never emits a citation from
 * memory").
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM build-queries.ts / tier-a-expansion-
 *    benchmark-cli.ts ────────────────────────────────────────────────────
 *
 * NEW1's 283-query CONTROLLED set and 120-pair expansion benchmark are both
 * scoped `courts=[sc]` or built from whichever documents happened to be
 * staged first (an id-ordered walk — bus 0770). Neither is built to answer
 * "can we now find law in the courts NEW2 just filled" (P3 of the NEW3
 * mission brief: Madras pre-2016, the seven courts that had NO historical
 * scope at all until this week, Bombay's just-recovered soft-404 population,
 * Rajasthan). This file targets exactly that population and nothing else —
 * it does not replace either NEW1 fixture and is not read by the frozen gate.
 *
 * ── LEAKAGE — reused, not reimplemented ─────────────────────────────────
 *
 * `redact`, `passageLooksLikeReasoning`, `snapToSentences`, `looksOcrDamaged`
 * are imported from `build-queries.ts` unmodified, same discipline
 * `tier-a-expansion-benchmark-cli.ts` already established: "a second
 * implementation of a leakage control is a second place for it to be subtly
 * weaker."
 *
 * ── QUERY TYPES (P4) ────────────────────────────────────────────────────
 *
 * Three types built here, all MECHANICALLY derived from the verified pair,
 * none LLM-paraphrased:
 *
 *   proposition   the redacted citing passage (build-queries.ts method) —
 *                 "a lawyer describing the legal problem"
 *   exact_citation the gold judgment's own neutral/reporter citation string —
 *                 "a lawyer typing the citation they already have"
 *   case_title     the gold judgment's own case_title —
 *                 "a lawyer typing the case name"
 *
 * `relationship` (cites/followed/distinguished/approved/doubted/overruled/
 * overruled_in_part) is carried through unredacted on every row, so a
 * consumer can build currentness/contrary-authority queries from the
 * non-`cites` rows without a second corpus pass.
 *
 * No proposition query is paraphrased. If a future pass adds an LLM
 * variant, it must be tagged `GENERATED` per the mission brief — none
 * exists yet in this file.
 *
 * Run: pnpm --filter @lawmind/harness exec tsx src/new3-semantic-expansion-gold-cli.ts [--target N]
 */
import { writeFileSync } from 'node:fs';
import postgres, { type Sql } from 'postgres';
import { sslFor } from './db-url.ts';
import {
  redact,
  passageLooksLikeReasoning,
  snapToSentences,
  looksOcrDamaged,
} from './build-queries.ts';

/**
 * Courts NEW2 has measurably moved this session (bus 0734/0739/0743/0781/
 * 0783/0798/0800) — either from zero historical scope to filled, or from a
 * soft-404 misclassification back into the fetchable/held population. Not
 * every High Court — deliberately biased toward the ones with a dated,
 * bus-sourced "this changed recently" claim behind them, per P3.
 */
const TARGET_COURTS = [
  'Madras High Court', // 33_10: 1 -> 185,589 pre-2016, one pass, bus 0739
  'Allahabad High Court', // 9_13: largest single remaining-ingest court, bus 0798; also largest resolved-citation population
  'High Court Of Rajasthan', // 8_9: Kruti Dev mixed-document finding, bus 0734/0781
  'Bombay High Court', // 27_1: 40% of remaining corpus-wide ingest, soft-404 recovery, bus 0798/0800
  'High Court Of Chhattisgarh', // 22_18: no historical scope until this session, bus 0739
  'High Court of Punjab and Haryana', // 3_22: no historical scope until this session, bus 0739
  'Patna High Court', // 10_8: no historical scope until this session, bus 0739
  'High Court of Jharkhand', // 20_7: no historical scope until this session, bus 0739
] as const;

const MIN_QUERY_CHARS = 200;
const MAX_QUERY_CHARS = 900;
const WINDOW = 700;
const MIN_INBOUND = 1; // HC inbound counts are far sparser than SC's; build-queries.ts's MIN_INBOUND=2 would exclude most of this population
const MAX_INBOUND = 200;

type Candidate = {
  citing_judgment_id: string;
  citing_title: string;
  citing_court: string;
  citing_date: string;
  citing_case_type: string | null;
  cited_judgment_id: string;
  cited_title: string;
  cited_court: string;
  cited_date: string;
  cited_neutral: string | null;
  cited_reporters: string[];
  citation_text: string;
  relationship: string;
  char_offset: number;
  inbound: number;
  passage: string;
};

async function fetchCandidates(sql: Sql, limit: number) {
  return sql<Candidate[]>`
    WITH inbound AS (
      SELECT cited_judgment_id, count(DISTINCT citing_judgment_id)::int AS n
      FROM judgment_citations
      WHERE cited_judgment_id IS NOT NULL
      GROUP BY 1
    )
    SELECT jc.citing_judgment_id,
           ci.case_title       AS citing_title,
           ci.court            AS citing_court,
           ci.judgment_date::text AS citing_date,
           ci.case_type::text  AS citing_case_type,
           jc.cited_judgment_id,
           cd.case_title       AS cited_title,
           cd.court            AS cited_court,
           cd.judgment_date::text AS cited_date,
           cd.neutral_citation AS cited_neutral,
           coalesce(cd.reporter_citations, '{}') AS cited_reporters,
           jc.citation_text,
           jc.relationship,
           jc.char_offset,
           inbound.n           AS inbound,
           substring(ci.full_text
                     FROM greatest(1, jc.char_offset - ${WINDOW})
                     FOR ${WINDOW * 2}) AS passage
      FROM judgment_citations jc
      JOIN judgments ci ON ci.id = jc.citing_judgment_id
      JOIN judgments cd ON cd.id = jc.cited_judgment_id
      JOIN inbound     ON inbound.cited_judgment_id = jc.cited_judgment_id
     WHERE jc.cited_judgment_id IS NOT NULL
       AND jc.citing_judgment_id <> jc.cited_judgment_id
       AND cd.court = ANY(${TARGET_COURTS})
       AND inbound.n BETWEEN ${MIN_INBOUND} AND ${MAX_INBOUND}
       AND jc.char_offset > ${WINDOW}
       AND length(ci.full_text) > ${WINDOW * 3}
     ORDER BY md5(jc.id::text)
     LIMIT ${limit}
  `;
}

type GoldRow = {
  id: string;
  queryType: 'proposition' | 'exact_citation' | 'case_title';
  query: string;
  goldJudgmentId: string;
  relationship: string;
  provenance: {
    method: 'citation-edge-verified' | 'own-citation-string' | 'own-case-title';
    citingJudgmentId: string;
    citingCase: string;
    citingCourt: string;
    citingDate: string;
    citedCase: string;
    citedCourt: string;
    citedDate: string;
    inboundCitations: number;
    redacted?: string[];
    tag: 'PRIMARY'; // never GENERATED — nothing here is LLM-paraphrased
  };
};

function buildProposition(c: Candidate): GoldRow | null {
  const { text, removed } = redact(c.passage, {
    citationText: c.citation_text,
    neutral: c.cited_neutral,
    reporters: c.cited_reporters,
    citedTitle: c.cited_title,
  });
  if (!removed.some((r) => r.startsWith('citation_text:'))) return null;
  if (text.length < MIN_QUERY_CHARS) return null;
  if (!passageLooksLikeReasoning(c.passage, text)) return null;
  if (looksOcrDamaged(text)) return null;
  const trimmed = snapToSentences(text);
  if (trimmed === null || trimmed.length < MIN_QUERY_CHARS || trimmed.length > MAX_QUERY_CHARS)
    return null;

  return {
    id: `prop-${c.cited_judgment_id.slice(0, 8)}`,
    queryType: 'proposition',
    query: trimmed,
    goldJudgmentId: c.cited_judgment_id,
    relationship: c.relationship,
    provenance: {
      method: 'citation-edge-verified',
      citingJudgmentId: c.citing_judgment_id,
      citingCase: c.citing_title,
      citingCourt: c.citing_court,
      citingDate: c.citing_date,
      citedCase: c.cited_title,
      citedCourt: c.cited_court,
      citedDate: c.cited_date,
      inboundCitations: c.inbound,
      redacted: removed,
      tag: 'PRIMARY',
    },
  };
}

function buildCitationQuery(c: Candidate): GoldRow | null {
  const cite = c.cited_neutral ?? c.cited_reporters[0];
  if (!cite || cite.length < 5) return null;
  return {
    id: `cite-${c.cited_judgment_id.slice(0, 8)}`,
    queryType: 'exact_citation',
    query: cite,
    goldJudgmentId: c.cited_judgment_id,
    relationship: c.relationship,
    provenance: {
      method: 'own-citation-string',
      citingJudgmentId: c.citing_judgment_id,
      citingCase: c.citing_title,
      citingCourt: c.citing_court,
      citingDate: c.citing_date,
      citedCase: c.cited_title,
      citedCourt: c.cited_court,
      citedDate: c.cited_date,
      inboundCitations: c.inbound,
      tag: 'PRIMARY',
    },
  };
}

function buildTitleQuery(c: Candidate): GoldRow | null {
  if (!c.cited_title || c.cited_title.length < 8) return null;
  return {
    id: `title-${c.cited_judgment_id.slice(0, 8)}`,
    queryType: 'case_title',
    query: c.cited_title,
    goldJudgmentId: c.cited_judgment_id,
    relationship: c.relationship,
    provenance: {
      method: 'own-case-title',
      citingJudgmentId: c.citing_judgment_id,
      citingCase: c.citing_title,
      citingCourt: c.citing_court,
      citingDate: c.citing_date,
      citedCase: c.cited_title,
      citedCourt: c.cited_court,
      citedDate: c.cited_date,
      inboundCitations: c.inbound,
      tag: 'PRIMARY',
    },
  };
}

async function main() {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) {
    console.error('CORPUS_DATABASE_URL is not set.');
    process.exit(2);
  }
  const targetArg = process.argv.indexOf('--target');
  const target = targetArg >= 0 ? Number(process.argv[targetArg + 1]) : 250;
  const sql = postgres(url, { ssl: sslFor(url), max: 3 });

  try {
    const candidates = await fetchCandidates(sql, Math.max(target * 8, 4000));
    console.log(
      `fetched ${candidates.length} candidates from ${TARGET_COURTS.length} target courts`,
    );

    const seenGold = new Set<string>();
    const rows: GoldRow[] = [];
    const byCourt = new Map<string, number>();
    const byRelationship = new Map<string, number>();

    for (const c of candidates) {
      if (rows.filter((r) => r.queryType === 'proposition').length >= target) break;
      if (seenGold.has(c.cited_judgment_id)) continue;

      const prop = buildProposition(c);
      if (!prop) continue; // proposition is the primary type; skip candidates that fail its stricter filters

      seenGold.add(c.cited_judgment_id);
      rows.push(prop);
      const cite = buildCitationQuery(c);
      if (cite) rows.push(cite);
      const title = buildTitleQuery(c);
      if (title) rows.push(title);

      byCourt.set(c.cited_court, (byCourt.get(c.cited_court) ?? 0) + 1);
      byRelationship.set(c.relationship, (byRelationship.get(c.relationship) ?? 0) + 1);
    }

    const doc = {
      version: 1,
      builtAt: new Date().toISOString(),
      builtBy: 'NEW3',
      method:
        'citation-edge (build-queries.ts redaction/rejection, reused not reimplemented), plus mechanical exact_citation/case_title variants — zero LLM paraphrase',
      targetCourts: TARGET_COURTS,
      selection: { MIN_INBOUND, MAX_INBOUND, WINDOW, MIN_QUERY_CHARS, MAX_QUERY_CHARS },
      distinctGoldAuthorities: seenGold.size,
      totalRows: rows.length,
      byCourt: Object.fromEntries(byCourt),
      byRelationship: Object.fromEntries(byRelationship),
      rows,
    };

    console.log(`\ndistinct gold authorities: ${seenGold.size}`);
    console.log(`total rows (proposition + exact_citation + case_title): ${rows.length}`);
    console.log('by court:', Object.fromEntries(byCourt));
    console.log('by relationship:', Object.fromEntries(byRelationship));

    const path = new URL('../../../docs/ai/new3-semantic-expansion-gold.json', import.meta.url);
    writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`\nwrote ${rows.length} rows -> docs/ai/new3-semantic-expansion-gold.json`);
  } finally {
    await sql.end();
  }
}

await main();
