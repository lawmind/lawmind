/**
 * NEW2 — R8.3 §8.4 / §11 N2-7. The WIDENED top-k role census.
 *
 * ## Why the existing number could not be frozen
 *
 * Correction 3: the 10% `REPORTER_EDITORIAL` figure came from 20 queries and 200
 * passages. NEW1's own interval on it, at an effective n of 20 queries, is
 * [0%, 23.1%]. That is a direction, not a rate.
 *
 * This widens the query set to the **48 frozen common-query cases** — 12
 * concepts x 4 phrasings, from NEW1's `COMMON_QUERY_BENCHMARK.json`, which is a
 * published artifact rather than anything sealed — and reports per-concept as
 * well as pooled, so a rate driven by one concept is visible as such.
 *
 * ## The half that is deliberately NOT run
 *
 * §8.4 also asks for a stratified subset of the 295-task evaluation. **The query
 * texts for those tasks are not in `PASSAGE_100K_METRICS.json`** — it carries
 * task ids, classes and arm results only — because that set is in FIFTH's
 * hidden-eval custody. §13 F-10 says the broad hidden semantic holdout is not to
 * be consumed, and going to find those queries in order to widen a census would
 * consume it. So that half is `NOT_RUN` with a reason, not attempted quietly.
 *
 * ## The four wrong-domain queries are a control, not padding
 *
 * If the reporter rate is a property of retrieval rather than of legal queries,
 * an off-domain query should show it too. If it does not, the enrichment is
 * about legal-sounding text specifically. Either answer is informative and it
 * costs four queries to have it.
 *
 * Read-only. Writes one artifact and nothing to the corpus.
 *
 * Usage: services/ingest/node_modules/.bin/tsx scripts/n2-role-census-widened.mts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/ai/new2-r83/role-census-widened.json';
const BENCH = 'docs/ai/new1-tier-a/COMMON_QUERY_BENCHMARK.json';

const ENDPOINT = process.env['N2_EMBED_ENDPOINT'] ?? 'http://127.0.0.1:8799';
const K = Number(process.env['N2_TOPK'] ?? 10);
/**
 * Production's value, from `services/api/src/search/retrieve.ts`. pgvector's
 * built-in default is 40, and at 40 roughly two thirds of the exact top-100 is
 * lost — the first version of the earlier census left it unset and classified a
 * ranking nobody ships.
 */
const EF_SEARCH = Number(process.env['HNSW_EF_SEARCH'] ?? 200);

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type Role =
  | 'SPAN_UNVERIFIABLE' | 'DAMAGED_OR_OCR_SUSPECT' | 'REPORTER_EDITORIAL' | 'CASE_HEADER'
  | 'PARTY_SUBMISSION' | 'QUOTED_PRECEDENT' | 'PROCEDURAL_HISTORY' | 'HOLDING_OPERATIVE'
  | 'COURT_REASONING' | 'FACTS' | 'OTHER_UNKNOWN';

const UNSAFE = new Set<Role>(['SPAN_UNVERIFIABLE', 'DAMAGED_OR_OCR_SUSPECT', 'REPORTER_EDITORIAL', 'PARTY_SUBMISSION', 'QUOTED_PRECEDENT']);
// eslint-disable-next-line no-control-regex -- detecting control characters is the job
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/;
const COLLAPSED_GLYPH = /([A-Za-z]\s){12,}/;

/** Identical rules to the prevalence study, so the two numbers are comparable. */
function classify(text: string, spanOk: boolean): Role {
  if (!spanOk) return 'SPAN_UNVERIFIABLE';
  const t = text.trim();
  if (t.length === 0) return 'SPAN_UNVERIFIABLE';
  const ctrl = (t.match(new RegExp(CONTROL_CHARS, 'g')) ?? []).length;
  if (ctrl / t.length > 0.002 || COLLAPSED_GLYPH.test(t)) return 'DAMAGED_OR_OCR_SUSPECT';
  if (/\bheadnote\b|\bHELD\s*:|editorial note|\bsyllabus\b|running head/i.test(t)) return 'REPORTER_EDITORIAL';
  if (/^\s*(IN THE (HIGH COURT|SUPREME COURT)|BEFORE\b|CORAM\b)|versus\s|\bPetitioner\b.*\bRespondent\b/i.test(t.slice(0, 400))) return 'CASE_HEADER';
  if (/learned counsel (for|appearing)|it is (submitted|contended|argued) (by|on behalf)|\bMr\.\s+\w+,?\s+learned/i.test(t)) return 'PARTY_SUBMISSION';
  if (/^\s*["“]|\bthe (Supreme Court|Apex Court) (has )?(held|observed) (in|that)\b.*[:：]\s*["“]/i.test(t)) return 'QUOTED_PRECEDENT';
  if (/\blisted (on|for)\b|\bregistry\b|\bnotice (be )?issued\b|\badjourn/i.test(t)) return 'PROCEDURAL_HISTORY';
  if (/\b(appeal|petition|application) is (hereby )?(allowed|dismissed|disposed)\b|\bimpugned (order|judgment) is (set aside|quashed)\b/i.test(t)) return 'HOLDING_OPERATIVE';
  if (/\b(I|we) am (of the view|satisfied)\b|\bin my (considered )?(view|opinion)\b|\bwe are of the (considered )?opinion\b/i.test(t)) return 'COURT_REASONING';
  if (/\bprosecution case\b|\bFIR (was )?(registered|lodged)\b|\bbriefly stated,? the facts\b/i.test(t)) return 'FACTS';
  return 'OTHER_UNKNOWN';
}

const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 120, connect_timeout: 30 });

async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${ENDPOINT}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`embed sidecar ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { vectors: number[][] }).vectors;
}

async function main(): Promise<void> {
  const bench = JSON.parse(readFileSync(join(ROOT, BENCH), 'utf8')) as {
    concepts: { id: string; concept: string; queries: { query: string; terms: number }[] }[];
    wrongDomain?: { query: string }[] | string[];
  };

  type Q = { id: string; concept: string; query: string; terms: number; kind: 'LEGAL' | 'WRONG_DOMAIN' };
  const queries: Q[] = [];
  for (const c of bench.concepts) {
    for (const q of c.queries) queries.push({ id: c.id, concept: c.concept, query: q.query, terms: q.terms, kind: 'LEGAL' });
  }
  const wrong = (bench.wrongDomain ?? []).map((w) => (typeof w === 'string' ? w : (w as { query: string }).query)).filter(Boolean);
  for (const w of wrong) queries.push({ id: 'WD', concept: 'wrong-domain', query: w, terms: w.split(/\s+/).length, kind: 'WRONG_DOMAIN' });

  console.log(`queries        ${queries.length} (${queries.filter((q) => q.kind === 'LEGAL').length} legal over ${bench.concepts.length} concepts, ${wrong.length} wrong-domain control)`);
  console.log(`k=${K}  ef_search=${EF_SEARCH}\n`);

  const vectors = await embed(queries.map((q) => q.query));
  if (vectors.length !== queries.length) throw new Error(`embed returned ${vectors.length} vectors for ${queries.length} queries`);

  const counts: Record<string, number> = {};
  const wdCounts: Record<string, number> = {};
  const perConcept = new Map<string, { n: number; roles: Record<string, number> }>();
  const perQuery: { id: string; concept: string; query: string; kind: string; hits: number; roles: Record<string, number> }[] = [];
  let total = 0;
  let wdTotal = 0;

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i]!;
    const lit = `[${vectors[i]!.join(',')}]`;
    const hits = (await sql.begin(async (tx) => {
      await tx.unsafe(`set local hnsw.ef_search = ${EF_SEARCH}`);
      return tx.unsafe(
        `select p.judgment_id, p.chunk_index, p.body_length, j.court,
                substr(j.full_text, p.char_offset + 1, p.body_length) as slice
           from new1_tranche_passages p
           join judgments j on j.id = p.judgment_id
          order by p.embedding <=> $1::vector
          limit ${K}`,
        [lit],
      );
    })) as { body_length: number; court: string | null; slice: string | null }[];

    const roles: Record<string, number> = {};
    for (const h of hits) {
      const spanOk = h.slice !== null && h.body_length > 0 && h.slice.length === h.body_length;
      const role = classify(h.slice ?? '', spanOk);
      roles[role] = (roles[role] ?? 0) + 1;
      if (q.kind === 'LEGAL') {
        counts[role] = (counts[role] ?? 0) + 1;
        total += 1;
        const pc = perConcept.get(q.concept) ?? { n: 0, roles: {} };
        pc.n += 1;
        pc.roles[role] = (pc.roles[role] ?? 0) + 1;
        perConcept.set(q.concept, pc);
      } else {
        wdCounts[role] = (wdCounts[role] ?? 0) + 1;
        wdTotal += 1;
      }
    }
    perQuery.push({ id: q.id, concept: q.concept, query: q.query, kind: q.kind, hits: hits.length, roles });
    if ((i + 1) % 12 === 0) console.log(`  ${i + 1}/${queries.length} queries, ${total + wdTotal} passages classified`);
  }

  const pct = (n: number, d: number): string => ((n / (d || 1)) * 100).toFixed(2);
  console.log(`\nWIDENED TOP-K over ${total} passages from ${queries.filter((q) => q.kind === 'LEGAL').length} legal queries:`);
  for (const [role, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${role.padEnd(24)} ${String(n).padStart(5)}  ${pct(n, total).padStart(6)}%${UNSAFE.has(role as Role) ? ' UNSAFE' : ''}`);
  }
  const unsafeN = Object.entries(counts).filter(([r]) => UNSAFE.has(r as Role)).reduce((a, [, n]) => a + n, 0);
  console.log(`  unsafe-as-court-reasoning  ${unsafeN}  ${pct(unsafeN, total)}%`);

  console.log(`\nWRONG-DOMAIN control, ${wdTotal} passages:`);
  for (const [role, n] of Object.entries(wdCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${role.padEnd(24)} ${String(n).padStart(5)}  ${pct(n, wdTotal).padStart(6)}%`);
  }

  // Per concept, because a pooled rate driven by one concept is a fact about
  // that concept. The earlier 20-query number could not show this at all.
  console.log('\nREPORTER_EDITORIAL by concept:');
  const conceptRows = [...perConcept.entries()]
    .map(([concept, v]) => ({ concept, n: v.n, reporter: v.roles['REPORTER_EDITORIAL'] ?? 0, rate: (v.roles['REPORTER_EDITORIAL'] ?? 0) / v.n }))
    .sort((a, b) => b.rate - a.rate);
  for (const r of conceptRows) console.log(`  ${r.concept.padEnd(26)} ${String(r.reporter).padStart(3)}/${String(r.n).padStart(3)}  ${(r.rate * 100).toFixed(1).padStart(5)}%`);

  mkdirSync(join(ROOT, dirname(OUT)), { recursive: true });
  writeFileSync(
    join(ROOT, OUT),
    JSON.stringify(
      {
        artifact: 'NEW2_ROLE_CENSUS_WIDENED',
        lane: 'NEW2',
        protocol: 'LAWMIND_FINAL_R8_3_LIMITED_FREEZE_ORCHESTRATION_2026-08-26.md §8.4',
        generated_at: new Date().toISOString(),
        supersedes: 'the 20-query / 200-passage point estimate in docs/ai/new2-r8/TRANCHE_PASSAGE_SAFETY_V1.md §5',
        query_source: BENCH,
        k: K,
        ef_search: EF_SEARCH,
        legal_queries: queries.filter((q) => q.kind === 'LEGAL').length,
        concepts: bench.concepts.length,
        passages_classified: total,
        topk_role_counts: counts,
        topk_unsafe: unsafeN,
        wrong_domain_control: { passages: wdTotal, role_counts: wdCounts },
        per_concept: conceptRows,
        per_query: perQuery,
        not_run: [
          'the stratified 295-task subset §8.4 also names: PASSAGE_100K_METRICS.json carries task ids, classes and arm results but NOT query texts, because that set is in FIFTH hidden-eval custody. §13 F-10 forbids consuming it, and going to find those queries in order to widen a census would consume it.',
        ],
        caveats: [
          'the role rules are LEXICAL and their precision is NOT_MEASURED — FIFTH F-5 blind labelling is what will establish it (docs/ai/new2-r83/role-blind-packet.json)',
          'this is top-k composition, not corpus prevalence; the pool rate lives in docs/ai/new2-r8/tranche-passage-safety.json',
          'four phrasings of one concept are not four independent observations, so the effective n is closer to the concept count than the query count',
        ],
      },
      null,
      1,
    ) + '\n',
  );
  console.log(`\nwrote ${OUT}`);
}

try {
  await main();
} finally {
  await sql.end();
}
