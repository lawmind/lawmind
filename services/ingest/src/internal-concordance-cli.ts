/**
 * `pnpm --filter @lawmind/ingest concordance:internal` — the SAFE, DETERMINISTIC
 * half of `docs/ai/AUTHORITY_COVERAGE.md` §3a, made real rather than left as a
 * one-off measurement.
 *
 * Calls no model and makes no InferX request — this is name+year token-Jaccard
 * matching plus §3a's own adversarial-validation discipline
 * (`internal-concordance.ts`), which the study already measured resolves
 * ~155 of 1,277 High Court citation targets (12.1%) SAFELY, after refusing
 * near-ties, thin evidence, and same-judgment/different-citation collisions.
 *
 * Dry by default, like every other CLI in this repo. `--apply` writes to
 * `judgment_citation_aliases` (never to `external_citations.cited_judgment_id`
 * directly — `resolve --external` is the separate, explicit step that converts
 * a written alias into a resolved edge, mirroring how a `judgment_citations`
 * alias is never itself a resolution either).
 *
 * PDF fetch and context-window extraction reuse the exact mechanism
 * `concordance-adjudicate-cli.ts` already built and this run does not
 * duplicate: `unpdf` over the AWS High Court bucket, `nameBeforeCitation`
 * over a bounded window before the citation's own `char_offset`.
 */
import { extractText, getDocumentProxy } from 'unpdf';

import postgres from 'postgres';

import { nameBeforeCitation, yearFromCitationText } from './concordance-adjudicate.ts';
import {
  classifyMatch,
  detectCrossTargetCollisions,
  MIN_CORROBORATIONS,
  rankCandidatesReportingLag,
  reporterOf,
  type PromotionCandidate,
} from './internal-concordance.ts';
import { HC_BUCKET } from './harvest/hc-metadata.ts';
import { sslFor } from './db-ssl';

const APPLY = process.argv.includes('--apply');
const LIMIT = Number(process.env['INTERNAL_CONCORDANCE_LIMIT'] ?? '2000');
const SAMPLE_DOCS_PER_TARGET = 3;
const CONTEXT_WINDOW = 400;

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}

const sql = postgres(dbUrl, { ssl: sslFor(dbUrl), max: 3 });

console.log('INTERNAL CONCORDANCE — deterministic name+year matching, no model call');
console.log('='.repeat(74));
if (!APPLY) console.log('DRY RUN — nothing will be written. Re-run with --apply.\n');

/* ----------------------------------------------------- the candidate pool -- */
type Pool = { id: string; caseTitle: string; judgmentDate: string };
const pool = await sql<Pool[]>`
  SELECT id, case_title AS "caseTitle", judgment_date::text AS "judgmentDate"
  FROM judgments WHERE court = 'Supreme Court of India'`;
console.log(`candidate pool: ${pool.length.toLocaleString()} Supreme Court judgments`);

/* Existing aliases -- never re-derive or collide with what concordance.ts already wrote. */
const existingKeys = new Set(
  (await sql<{ alias_key: string }[]>`SELECT alias_key FROM judgment_citation_aliases`).map((r) => r.alias_key),
);
console.log(`existing aliases (skipped if re-encountered): ${existingKeys.size.toLocaleString()}`);

/* ------------------------------------------------------ the target queue -- */
type Target = { citation_key: string; citation_text: string; n: string; sample_source_keys: string[]; sample_offsets: number[] };

const targets = await sql<Target[]>`
  SELECT ec.citation_key,
         (array_agg(ec.citation_text ORDER BY ec.source_key))[1] AS citation_text,
         count(*) AS n,
         (array_agg(ec.source_key ORDER BY ec.source_key))[1:${SAMPLE_DOCS_PER_TARGET}] AS sample_source_keys,
         (array_agg(ec.char_offset ORDER BY ec.source_key))[1:${SAMPLE_DOCS_PER_TARGET}] AS sample_offsets
  FROM external_citations ec
  WHERE ec.cited_judgment_id IS NULL
    AND ec.citation_text ~* '\\y(AIR|SCC)\\y'
  GROUP BY ec.citation_key
  HAVING count(*) >= ${MIN_CORROBORATIONS}
  ORDER BY count(*) DESC
  LIMIT ${LIMIT}`;

console.log(`${targets.length} unresolved SCC/AIR targets with >= ${MIN_CORROBORATIONS} sightings\n`);

let fetched = 0;
let noContext = 0;
let noYear = 0;
const verdictCounts = { no_candidate: 0, ambiguous: 0, thin: 0, safe: 0 };
const safeCandidates: PromotionCandidate[] = [];

for (const t of targets) {
  if (existingKeys.has(t.citation_key)) continue;

  let context: string | null = null;
  let name: string | null = null;

  for (let i = 0; i < t.sample_source_keys.length; i++) {
    const key = t.sample_source_keys[i]!;
    const offset = t.sample_offsets[i]!;
    try {
      const res = await fetch(`${HC_BUCKET}/data/pdf/${key}`);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const pdf = await getDocumentProxy(bytes);
      const text = (await extractText(pdf, { mergePages: true })).text;
      const start = Math.max(0, offset - CONTEXT_WINDOW);
      const window = text.slice(start, offset);
      const foundName = nameBeforeCitation(window);
      if (foundName) {
        context = window;
        name = foundName;
        break;
      }
    } catch {
      continue;
    }
  }
  fetched++;

  if (!context || !name) {
    noContext++;
    continue;
  }

  const year = yearFromCitationText(t.citation_text);
  if (year === null) {
    noYear++;
    continue;
  }

  const ranked = rankCandidatesReportingLag(name, year, pool);
  const verdict = classifyMatch(ranked);
  verdictCounts[verdict.kind]++;

  if (verdict.kind !== 'safe') continue;

  const reporter = reporterOf(t.citation_text);
  if (!reporter) continue; // SQL filter already restricted to AIR|SCC; defensive only.

  safeCandidates.push({
    citationKey: t.citation_key,
    citationText: t.citation_text,
    aliasReporter: reporter,
    targetJudgmentId: verdict.top.judgmentId,
    targetCaseTitle: verdict.top.caseTitle,
    jaccard: verdict.top.jaccard,
    corroborations: Number(t.n),
    evidence: `${name} [${t.citation_text}]`,
  });
}

console.log(`fetched context for ${fetched}/${targets.length} targets`);
console.log(`  no case name in sampled context : ${noContext}`);
console.log(`  citation text has no parseable year : ${noYear}`);
console.log(
  `  classified: no_candidate ${verdictCounts.no_candidate} · ambiguous ${verdictCounts.ambiguous} · ` +
    `thin ${verdictCounts.thin} · safe ${verdictCounts.safe}`,
);

/* --------------------------------------------- cross-target collision check -- */
const { safe, collided } = detectCrossTargetCollisions(safeCandidates);
console.log(`\ncross-target collision check: ${safe.length} clear · ${collided.length} withheld (shared a target with another citation key)`);
if (collided.length > 0) {
  console.log('WITHHELD (same judgment, different citation keys -- §3a\'s exact failure mode, not guessed at):');
  for (const c of collided) {
    console.log(`  ${c.citationKey.padEnd(20)} ${c.citationText.padEnd(24)} -> ${c.targetJudgmentId} (${c.targetCaseTitle})`);
  }
}

console.log(`\n${safe.length} SAFE mappings ready for promotion:\n`);
for (const c of safe) {
  console.log(
    `  ${c.citationText.padEnd(24)} -> ${c.targetCaseTitle.slice(0, 60).padEnd(62)} ` +
      `jaccard=${c.jaccard.toFixed(3)} corrob=${c.corroborations}`,
  );
  console.log(`    evidence: ${c.evidence.slice(0, 140)}`);
}

if (!APPLY) {
  console.log('\nDRY RUN -- nothing written. Re-run with --apply once hand-checked.');
  await sql.end();
  process.exit(0);
}

/* ------------------------------------------------------------------ write -- */
let written = 0;
for (const c of safe) {
  const result = await sql`
    INSERT INTO judgment_citation_aliases (judgment_id, alias, alias_key, alias_reporter, corroborations, evidence)
    VALUES (${c.targetJudgmentId}, ${c.citationText}, ${c.citationKey}, ${c.aliasReporter}, ${c.corroborations}, ${c.evidence})
    ON CONFLICT (alias_key) DO NOTHING
    RETURNING id`;
  if (result.length > 0) written++;
}

console.log(`\nWROTE ${written} new aliases to judgment_citation_aliases.`);
console.log('Run `pnpm --filter @lawmind/ingest resolve --apply --external` next to convert them into resolved edges.');

await sql.end();
