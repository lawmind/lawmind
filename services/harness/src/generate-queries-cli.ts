/**
 * `pnpm --filter @lawmind/harness generate:queries` — enlarge the TEST SPACE
 * with DeepSeek, without letting it near the truth.
 *
 *   generate:queries --kind query_expansion --limit 20
 *   generate:queries --kind adversarial --limit 20
 *   generate:queries --kind difficulty_label --source failures
 *   generate:queries --kind case_name_variation --limit 20   # reads the corpus
 *   generate:queries --validate                              # corpus-check what exists
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CONTRACT, RESTATED WHERE IT IS EXECUTED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Founder direction, 14 Aug 2026: DeepSeek is **not** the gold-label authority.
 * It may produce *query expansion candidates, terminology/synonym candidates,
 * alternate citation phrasing, case-name variation candidates, adversarial
 * queries and a difficult-query taxonomy* — every one of which is a way of
 * ASKING, not a claim about the answer.
 *
 * `generated-queries.ts` holds the mechanism and the reasoning. This file is
 * the runner, and it adds exactly three things: where the source text comes
 * from, the cache-before-network order, and the corpus validation pass.
 *
 * **Output goes to `generated-queries.jsonl` at the repo root, deliberately NOT
 * into `src/fixtures/`.** The fixture directory is where gold lives, and
 * `generated-queries.test.ts` sweeps it asserting no `GENERATED` marker ever
 * appears there. Writing generated material anywhere near it — even in a
 * clearly-named file — is how the two eventually get globbed together by a
 * future loader.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT "VALIDATED" MEANS HERE, AND WHAT IT CANNOT MEAN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Only two kinds make a claim the corpus can settle. A `case_name_variation`
 * says *"this string names the same judgment"* — so look it up: if the variant
 * resolves, in this corpus, to the judgment it was derived from, it is
 * `corpusValidated: true`; if it resolves to a DIFFERENT judgment or to
 * nothing, `false`. Same for `citation_phrasing` against the normalised
 * citation key.
 *
 * **A `false` is not a failure of the run — it is the most valuable row in the
 * file.** A model-proposed case-name variant that resolves to the wrong
 * judgment is exactly the fabrication mode
 * `docs/ai/CITATION_CONCORDANCE_EVALUATION.md` measured at 10.8%, caught here
 * by a lookup rather than by trust, and it never reaches the benchmark.
 *
 * Everything else stays `corpusValidated: null` forever. `null` is UNKNOWN, and
 * a run that turned UNKNOWN into a tick would be worth less than no run.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

import { openDb } from '@lawmind/ingest/db-host';

import { callModel } from '@lawmind/api/llm/call';
import { DEEPSEEK_V4_FLASH } from '@lawmind/api/llm/route';

import {
  type GeneratedItem,
  type GeneratedKind,
  isCorpusCheckable,
  parseStringArray,
  promptFor,
  readCache,
  toItems,
  writeCache,
} from './generated-queries.ts';

type HarnessQuery = {
  id: string;
  group: string;
  query: string;
  goldJudgmentIds: string[];
};

const OUT_PATH = new URL('../../../generated-queries.jsonl', import.meta.url);
const CLASSIFY_CHECKPOINT = new URL('../../../failure-classify-checkpoint.jsonl', import.meta.url);

function loadFixture(name: string): { queries?: HarnessQuery[] } {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as never;
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

function readExisting(): GeneratedItem[] {
  if (!existsSync(OUT_PATH)) return [];
  return readFileSync(OUT_PATH, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as GeneratedItem);
}

/**
 * Source queries. Two populations, and which one you want depends on the kind:
 *
 * - `all` — the whole gold set. Right for `query_expansion`: robustness is a
 *   property of the system, measured over everything it handles.
 * - `failures` — only the queries retrieval currently gets wrong. Right for
 *   `difficulty_label` and `adversarial`: labelling why a SUCCESS was hard
 *   produces a taxonomy of nothing.
 */
function sourceQueries(which: string): HarnessQuery[] {
  const all = [
    ...(loadFixture('queries.eval.json').queries ?? []),
    ...(loadFixture('queries.hand.json').queries ?? []),
    ...(loadFixture('queries.derived.json').queries ?? []),
  ];
  const unique = [...new Map(all.map((q) => [q.id, q])).values()];
  if (which !== 'failures') return unique;

  if (!existsSync(CLASSIFY_CHECKPOINT)) {
    throw new Error(
      '--source failures needs failure-classify-checkpoint.jsonl, which is absent. ' +
        'Run `failure:classify` first rather than silently falling back to the full set.',
    );
  }
  const failed = new Set(
    readFileSync(CLASSIFY_CHECKPOINT, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { queryId: string; primary: string })
      .filter((c) => c.primary !== 'SUCCESS')
      .map((c) => c.queryId),
  );
  return unique.filter((q) => failed.has(q.id));
}

async function generate(): Promise<void> {
  const kind = arg('kind', 'query_expansion') as GeneratedKind;
  const limit = Number(arg('limit', '20'));
  const source = arg(
    'source',
    kind === 'difficulty_label' || kind === 'adversarial' ? 'failures' : 'all',
  );

  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set — the llm_calls ledger is not optional');

  const queries = sourceQueries(source).slice(0, limit);
  const existingKeys = new Set(readExisting().map((i) => `${i.kind}:${i.sourceQueryId}`));

  console.log('GENERATED QUERY EXPANSION — GENERATED, NEVER GOLD');
  console.log('='.repeat(78));
  console.log(`kind=${kind} source=${source} queries=${queries.length} model=${DEEPSEEK_V4_FLASH}`);

  const sql = await openDb(url, 2);
  try {
    /**
     * Corpus-driven kinds need a real title or citation to vary, and the
     * source of BOTH is the gold judgment row — not the model. The model is
     * handed a title it did not choose and asked to reword it.
     */
    const titles = new Map<string, string>();
    const citations = new Map<string, string>();
    if (kind === 'case_name_variation' || kind === 'citation_phrasing') {
      const ids = [...new Set(queries.flatMap((q) => q.goldJudgmentIds))];
      const rows = await sql<
        {
          id: string;
          case_title: string;
          neutral_citation: string | null;
          reporter_citations: string[];
        }[]
      >`SELECT id, case_title, neutral_citation, reporter_citations
          FROM judgments WHERE id = ANY(${ids})`;
      for (const r of rows) {
        titles.set(r.id, r.case_title);
        const cite = r.neutral_citation ?? r.reporter_citations[0] ?? null;
        if (cite) citations.set(r.id, cite);
      }
    }

    let generated = 0;
    let cached = 0;
    let refused = 0;
    let skipped = 0;

    for (const q of queries) {
      if (existingKeys.has(`${kind}:${q.id}`)) {
        skipped++;
        continue;
      }

      // What the model is shown. Never a judgment id, never a gold label.
      let input: string | null = q.query;
      if (kind === 'case_name_variation') input = titles.get(q.goldJudgmentIds[0] ?? '') ?? null;
      if (kind === 'citation_phrasing') input = citations.get(q.goldJudgmentIds[0] ?? '') ?? null;
      if (!input) {
        skipped++;
        continue;
      }

      let raw = readCache(kind, input, DEEPSEEK_V4_FLASH);
      if (raw !== null) {
        cached++;
      } else {
        const res = await callModel(sql, {
          // Judgments and statutes are already published. `CLAUDE.md` §5.
          dataClass: 'public',
          feature: 'search',
          prompt: promptFor(kind, input),
          userId: null,
        });
        if (!res.ok) {
          /**
           * **Not an error, and not a stop.** Founder: *"Continue the current
           * retrieval program independently of model availability."* An
           * unavailable model means fewer stress queries this run, which is a
           * smaller test space, not a wrong one. The InferX free pool 429s
           * under burst and `deepseek-v4-flash` vs `-0731` is a known 401
           * trap — both land here and both are survivable.
           */
          refused++;
          console.log(`  ${q.id.padEnd(20)} model unavailable: ${res.reason}`);
          continue;
        }
        raw = res.text;
        writeCache(kind, input, DEEPSEEK_V4_FLASH, raw);
      }

      const items = toItems(kind, parseStringArray(raw), q, DEEPSEEK_V4_FLASH);
      for (const it of items) appendFileSync(OUT_PATH, JSON.stringify(it) + '\n');
      generated += items.length;
      console.log(`  ${q.id.padEnd(20)} +${items.length} ${cached ? '(cache)' : ''}`);
    }

    console.log('\n' + '='.repeat(78));
    console.log(
      `generated ${generated} items · ${cached} served from cache · ${refused} model-unavailable · ` +
        `${skipped} skipped (already present, or no source text)`,
    );
    console.log(
      'Every item carries provenance=GENERATED and inherits its gold from the source query. ' +
        'None of it is gold. None of it may be moved into src/fixtures/.',
    );
  } finally {
    await sql.end();
  }
}

/**
 * The corpus check. Runs over what is already on disk, so it can be re-run
 * after a generation pass without re-spending a single model call.
 */
async function validate(): Promise<void> {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const items = readExisting();
  const checkable = items.filter((i) => isCorpusCheckable(i.kind));

  console.log('CORPUS VALIDATION OF GENERATED ITEMS');
  console.log('='.repeat(78));
  console.log(
    `${items.length} items on disk · ${checkable.length} make a claim the corpus can settle`,
  );

  const sql = await openDb(url, 2);
  try {
    const out: GeneratedItem[] = [];
    let pass = 0;
    let fail = 0;
    for (const item of items) {
      if (!isCorpusCheckable(item.kind)) {
        out.push(item);
        continue;
      }
      let resolved: string[] = [];
      if (item.kind === 'case_name_variation') {
        const rows = await sql<{ id: string }[]>`
          SELECT id FROM judgments
          WHERE lower(btrim(regexp_replace(case_title, '\\s+', ' ', 'g'))) =
                lower(btrim(regexp_replace(${item.text}, '\\s+', ' ', 'g')))
          LIMIT 5`;
        resolved = rows.map((r) => r.id);
      } else {
        const key = item.text.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const rows = await sql<{ id: string }[]>`
          SELECT id FROM judgments
          WHERE upper(regexp_replace(coalesce(neutral_citation, ''), '[^A-Za-z0-9]', '', 'g')) = ${key}
             OR EXISTS (SELECT 1 FROM unnest(reporter_citations) rc
                        WHERE upper(regexp_replace(rc, '[^A-Za-z0-9]', '', 'g')) = ${key})
          LIMIT 5`;
        resolved = rows.map((r) => r.id);
      }
      /**
       * Validated only when it resolves to EXACTLY the judgment it was derived
       * from. Resolving to nothing is not "probably fine" — the variant may be
       * a phrasing this corpus genuinely does not carry, in which case using it
       * as a test query would measure the corpus, not retrieval. Resolving to a
       * DIFFERENT judgment is the fabrication case, and it is the one worth
       * catching.
       */
      const ok = resolved.length === 1 && item.inheritedGoldJudgmentIds.includes(resolved[0]!);
      if (ok) pass++;
      else fail++;
      out.push({ ...item, corpusValidated: ok });
      if (!ok && resolved.length > 0) {
        console.log(
          `  MISRESOLVED  ${item.kind} "${item.text.slice(0, 50)}" -> ${resolved.join(',')} ` +
            `(expected ${item.inheritedGoldJudgmentIds.join(',')})`,
        );
      }
    }
    writeFileSync(OUT_PATH, out.map((i) => JSON.stringify(i)).join('\n') + '\n');
    console.log(
      `\nvalidated ${pass} · rejected ${fail} · ${items.length - pass - fail} left UNKNOWN (null)`,
    );
    console.log(
      'A rejection is a result. Rejected items stay on disk, marked false, and are never used as queries.',
    );
  } finally {
    await sql.end();
  }
}

if (process.argv.includes('--validate')) await validate();
else await generate();
