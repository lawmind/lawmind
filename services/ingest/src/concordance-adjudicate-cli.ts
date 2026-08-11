/**
 * `pnpm --filter @lawmind/ingest concordance:adjudicate` — the live pass over
 * unresolved High Court citation targets, `docs/ai/
 * CITATION_CONCORDANCE_PROGRAM.md`.
 *
 * Reads the highest-frequency unresolved targets from `external_citations`
 * (`docs/HC_CITATION_RUN.md`'s own output — this pass is downstream of that
 * one, not a replacement for it), re-fetches a small, bounded number of the
 * PDFs that already sighted each target (their `source_key`s and
 * `char_offset`s are already stored — nothing is re-extracted blind), pulls
 * the case-name context around the citation, generates deterministic
 * candidates from the Supreme Court corpus, and — only when at least one
 * candidate exists — asks DeepSeek to adjudicate.
 *
 * **Writes only to `citation_concordance_resolutions`.** Never to
 * `judgment_citation_aliases`, never to `cited_judgment_id`. Promotion is a
 * separate, later, explicit step gated on the gold-set precision measured in
 * `docs/ai/CITATION_CONCORDANCE_EVALUATION.md` — this file does not decide
 * what counts as safe enough to promote.
 *
 * Dry by default, like every other CLI in this repo. `--apply` writes.
 * `CONCORDANCE_LIMIT` caps how many distinct targets are attempted in one run
 * — deliberately small by default, because each target costs a PDF fetch plus
 * a model call and the InferX free pool has measured, real capacity limits
 * (`inferx.ts`'s own docstring).
 */
import { extractText, getDocumentProxy } from 'unpdf';

import postgres from 'postgres';

import {
  type Candidate,
  adjudicationInputHash,
  adjudicationOutputHash,
  buildAdjudicationPrompt,
  nameBeforeCitation,
  parseAdjudicationResponse,
  rankCandidates,
  resolveConfidenceTier,
  yearFromCitationText,
} from './concordance-adjudicate.ts';
import { HC_BUCKET } from './harvest/hc-metadata.ts';
import { callInferx } from './inferx.ts';

const SOURCE = 'aws_high_court';
const APPLY = process.argv.includes('--apply');
const LIMIT = Number(process.env['CONCORDANCE_LIMIT'] ?? '15');
const MIN_CITING = Number(process.env['CONCORDANCE_MIN_CITING'] ?? '5');
const SAMPLE_DOCS_PER_TARGET = 2;
const CONTEXT_WINDOW = 400;

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const apiKey = process.env['INFERX_API_KEY'];
if (!apiKey) {
  console.error('INFERX_API_KEY is not set. Refusing rather than running a pass that cannot adjudicate anything.');
  process.exit(2);
}

const sql = postgres(dbUrl, { ssl: dbUrl.includes('localhost') ? false : 'require', max: 3 });

console.log('CITATION CONCORDANCE — DEEPSEEK ADJUDICATION PASS');
console.log('='.repeat(74));
console.log(`limit ${LIMIT} targets · min citing docs ${MIN_CITING}`);
if (!APPLY) console.log('DRY RUN — nothing will be written. Re-run with --apply.');

/* ----------------------------------------------------- the candidate pool -- */
type Pool = { id: string; caseTitle: string; judgmentDate: string };
const pool = await sql<Pool[]>`
  SELECT id, case_title AS "caseTitle", judgment_date::text AS "judgmentDate"
  FROM judgments WHERE court = 'Supreme Court of India'`;
console.log(`candidate pool: ${pool.length.toLocaleString()} Supreme Court judgments`);

/* ------------------------------------------------------ the target queue -- */
type Target = {
  citation_key: string;
  citation_text: string;
  n: string;
  sample_source_keys: string[];
  sample_offsets: number[];
};

const targets = await sql<Target[]>`
  SELECT ec.citation_key,
         (array_agg(ec.citation_text ORDER BY ec.source_key))[1] AS citation_text,
         count(*) AS n,
         (array_agg(ec.source_key ORDER BY ec.source_key))[1:${SAMPLE_DOCS_PER_TARGET}] AS sample_source_keys,
         (array_agg(ec.char_offset ORDER BY ec.source_key))[1:${SAMPLE_DOCS_PER_TARGET}] AS sample_offsets
  FROM external_citations ec
  WHERE ec.cited_judgment_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM citation_concordance_resolutions r
      WHERE r.source = ${SOURCE} AND r.citation_key = ec.citation_key
    )
  GROUP BY ec.citation_key
  HAVING count(*) >= ${MIN_CITING}
  ORDER BY count(*) DESC
  LIMIT ${LIMIT}`;

console.log(`${targets.length} unresolved targets in scope (already-adjudicated targets skipped)`);
console.log('');

let attempted = 0;
let candidatesGenerated = 0;
let modelCalled = 0;
let written = 0;

for (const t of targets) {
  attempted++;
  process.stdout.write(`[${attempted}/${targets.length}] ${t.citation_text.replace(/\s+/g, ' ')} (${t.n} sightings) ... `);

  let context: string | null = null;
  let name: string | null = null;

  for (let i = 0; i < t.sample_source_keys.length; i++) {
    const key = t.sample_source_keys[i]!;
    const offset = t.sample_offsets[i]!;
    try {
      const url = `${HC_BUCKET}/data/pdf/${key}`;
      const res = await fetch(url);
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

  if (!context || !name) {
    console.log('no case name found in sampled context');
    if (APPLY) {
      await sql`
        INSERT INTO citation_concordance_resolutions
          (source, citation_key, citation_text, citation_year, context_evidence, candidates,
           candidate_judgment_id, decision, confidence, model_used, model_input_hash,
           needs_human_review, validation_status)
        VALUES
          (${SOURCE}, ${t.citation_key}, ${t.citation_text}, ${yearFromCitationText(t.citation_text)},
           ${context ?? ''}, '[]'::jsonb, NULL, 'no_candidate_generated', 'unresolved', 'none',
           ${`no-context:${t.citation_key}`}, true, 'unvalidated')
        ON CONFLICT (source, citation_key, model_input_hash) DO NOTHING`;
      written++;
    }
    continue;
  }

  const year = yearFromCitationText(t.citation_text);
  if (year === null) {
    console.log('citation text has no parseable year');
    continue;
  }

  const candidates: Candidate[] = rankCandidates(name, year, pool);
  if (candidates.length === 0) {
    console.log(`case name "${name}" found, but no candidate within the year window`);
    if (APPLY) {
      await sql`
        INSERT INTO citation_concordance_resolutions
          (source, citation_key, citation_text, citation_year, context_evidence, candidates,
           candidate_judgment_id, decision, confidence, model_used, model_input_hash,
           needs_human_review, validation_status)
        VALUES
          (${SOURCE}, ${t.citation_key}, ${t.citation_text}, ${year}, ${context}, '[]'::jsonb,
           NULL, 'no_candidate_generated', 'unresolved', 'none', ${`no-candidates:${t.citation_key}`},
           true, 'unvalidated')
        ON CONFLICT (source, citation_key, model_input_hash) DO NOTHING`;
      written++;
    }
    continue;
  }
  candidatesGenerated++;

  const input = { citationText: t.citation_text, citationKey: t.citation_key, contextEvidence: context, candidates };
  const inputHash = adjudicationInputHash(input);
  const prompt = buildAdjudicationPrompt(input);

  const result = await callInferx(prompt, { apiKey: apiKey! });
  modelCalled++;
  if (!result.ok) {
    console.log(`MODEL CALL FAILED: ${result.reason} (not written — retry a later run)`);
    continue;
  }

  const parsed = parseAdjudicationResponse(result.text, candidates);
  const decision = parsed
    ? parsed.decision
    : ('impossible_to_determine' as const);
  const tier = parsed ? resolveConfidenceTier(parsed, candidates) : 'unresolved';
  const outputHash = adjudicationOutputHash(result.text);

  console.log(
    parsed
      ? `${parsed.decision}${parsed.candidateId ? ` -> ${parsed.candidateId.slice(0, 8)}` : ''} (${tier})`
      : `UNPARSEABLE response, recorded as impossible_to_determine`,
  );

  if (APPLY) {
    await sql`
      INSERT INTO citation_concordance_resolutions
        (source, citation_key, citation_text, citation_year, context_evidence, candidates,
         candidate_judgment_id, decision, confidence, deterministic_top_score,
         deterministic_runner_up_score, model_used, model_input_hash, model_output_hash,
         model_reasoning, contradictions, signals_used, needs_human_review, validation_status)
      VALUES
        (${SOURCE}, ${t.citation_key}, ${t.citation_text}, ${year}, ${context},
         ${JSON.stringify(candidates)}::jsonb,
         ${parsed?.candidateId ?? null}, ${decision}, ${tier},
         ${candidates[0]!.jaccard}, ${candidates[1]?.jaccard ?? null},
         'deepseek/deepseek-v4-flash', ${inputHash}, ${outputHash},
         ${parsed?.reason ?? `UNPARSEABLE: ${result.text.slice(0, 1000)}`},
         ${parsed?.contradictions ?? null},
         ${parsed?.signalsUsed ?? []},
         ${parsed?.needsHumanReview ?? true}, 'unvalidated')
      ON CONFLICT (source, citation_key, model_input_hash) DO NOTHING`;

    await sql`
      INSERT INTO llm_calls
        (user_id, feature, model, input_tokens, output_tokens, cost_usd, latency_ms, data_class, pseudonymised)
      VALUES
        (NULL, 'concordance', 'deepseek/deepseek-v4-flash', ${result.inputTokens}, ${result.outputTokens},
         0, 0, 'public', false)`;
    written++;
  }
}

console.log('');
console.log(`targets attempted        ${attempted}`);
console.log(`candidates generated for ${candidatesGenerated}`);
console.log(`model calls made         ${modelCalled}`);
console.log(`rows written             ${written}`);
if (!APPLY) console.log('\nDRY RUN — nothing was written.');

await sql.end();
