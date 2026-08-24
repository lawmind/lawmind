/**
 * NEW1 — P3. TWO-STAGE RETRIEVAL: MEASURE CANDIDATE RECALL BEFORE ANYTHING ELSE.
 *
 *   pnpm --filter @lawmind/harness stage1:candidates
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DISCRIMINATOR, AND WHY IT COMES FIRST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A reranker cannot recover a target that never entered the candidate set. So
 * the only honest order is: measure how often each cheap, broad generator puts
 * the right authority in the pool AT ALL, and only then ask whether the ordering
 * inside that pool is worth improving.
 *
 * If candidate recall is poor, a reranking sprint is wasted work against an
 * empty set. If candidate recall is strong and top ranks are weak, THEN
 * reranking is the indicated work. This file exists to tell those two apart, and
 * it deliberately does no reranking of its own.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STRATUM LCC ASKED FOR, AND WHY IT IS THE IMPORTANT ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * LCC shipped the rarest-3 AND as the ONLY sparse pass on this lane's evidence —
 * 2.1x recall, 18x faster p50, 9x fewer timeouts — and then measured something
 * this lane's gold could not see (bus 1041): on five short doctrinal probes,
 * *"anticipatory bail twin conditions"*, *"dying declaration corroboration"*,
 * **the concept class did not move**. p50 stayed at the 15,013 ms ceiling with
 * 3 of 5 degraded.
 *
 * The explanation LCC offered is query SHAPE, and it is testable: this lane's
 * gold queries are verbatim passages carrying genuinely rare terms, so "the
 * three rarest" really are rare. A four-word doctrinal phrase has no rare term
 * to grab — its three rarest lexemes are still common legal vocabulary, the AND
 * match set is enormous, and `ORDER BY ts_rank` reads every matching tsvector.
 *
 * **That is the shape an advocate types into a phone.** So both strata are run,
 * never pooled:
 *
 *   LONG_FULL      the ADVOCATE-100 query verbatim — a sentence or a paragraph
 *   SHORT_FAMILY   3–5 words built from the proposition-family LABEL
 *
 * SHORT_FAMILY is built from NEW2's `proposition_family` slug and NOT from the
 * target's text. That matters: the slug is a topic label an author wrote, so
 * using it cannot leak the target's own language into the query, which is the
 * construction rule this lane sent NEW2 in bus 1026 and must therefore obey.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GENERATORS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   G1_RAREST3_AND   what production ships today
 *   G2_RAREST2_AND   one term looser
 *   G3_RAREST1       the loosest lexical shape that is still bounded
 *   G4_DENSE_ANN     HNSW over `new1_probe_half_250k`, ef_search 200
 *   G5_UNION         G1 ∪ G4 — the cheapest hybrid, and the one that would ship
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO DENOMINATORS, NEVER POOLED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The lexical generators run over the WHOLE corpus. The dense generator runs
 * over a 256,998-row probe index — 1.4% of the corpus. Comparing them on the
 * same denominator would be a straight lie about dense recall, in dense's
 * favour or against it depending on which way the gold happens to fall.
 *
 * So every dense number is `CONDITIONAL_RECALL` over targets confirmed present
 * in the probe index, and a MATCHED comparison is reported separately in which
 * every generator is scored on exactly that subset. The matched table is the
 * only one from which a generator may be preferred over another.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { getHarnessEmbedder } from './harness-embedder.ts';
import { sslFor } from './db-url.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const abs = (rel: string): string => (isAbsolute(rel) ? rel : join(ROOT, rel));
const GOLD = abs(process.env['ADVOCATE100'] ?? 'docs/ai/new2/ADVOCATE100.json');
const OUT = abs(process.env['OUT'] ?? 'docs/ai/new1-tier-a/two-stage-candidates.json');

/** Production's own statement bound. A generator that needs longer has failed. */
const STATEMENT_MS = Number(process.env['STATEMENT_MS'] ?? 15_000);
const CANDIDATE_DEPTH = Number(process.env['CANDIDATE_DEPTH'] ?? 500);

const CONCEPT_CLASSES = new Set([
  'doctrine',
  'fact_pattern',
  'supporting_authority',
  'adverse_authority',
  'current_law',
  'statute',
]);

type Task = {
  task_id: string;
  query_class: string;
  query: string;
  targets: string[];
  expected?: string;
  proposition_family?: string;
};

type Stratum = 'LONG_FULL' | 'SHORT_FAMILY';
type Generator = 'G1_RAREST3_AND' | 'G2_RAREST2_AND' | 'G3_RAREST1' | 'G4_DENSE_ANN' | 'G5_UNION';

type Probe = {
  taskId: string;
  queryClass: string;
  stratum: Stratum;
  query: string;
  queryChars: number;
  queryTerms: number;
  targets: string[];
  targetsInProbeIndex: string[];
};

type Measurement = {
  taskId: string;
  stratum: Stratum;
  generator: Generator;
  /** Rank of the first target inside the candidate list. null = not a candidate. */
  rank: number | null;
  candidateCount: number;
  ms: number;
  timedOut: boolean;
  /** The terms the generator actually used — the whole SHORT_FAMILY story is here. */
  termsUsed: string[];
  termDocumentFrequencies: number[];
};

const STOP = new Set(
  (
    'the a an and or of in to for on by with is are was were be been being that this these those it its as at from ' +
    'not no any all such which who whom whose he she they them his her their shall may can under upon after before ' +
    'against between whether would could should has have had must does do did what when where why how'
  ).split(/\s+/),
);

const tokenise = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

/** `lalita-kumari-fir-registration` → `lalita kumari fir registration`. */
const familyToQuery = (slug: string): string => slug.replace(/[-_]+/g, ' ').trim();

const quantile = (xs: number[], q: number): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};
const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`);

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const gold = JSON.parse(readFileSync(GOLD, 'utf8')) as {
    tasks: Task[];
    gold_set_version?: string;
  };
  const tasks = gold.tasks.filter(
    (t) =>
      CONCEPT_CLASSES.has(t.query_class) &&
      t.targets.length > 0 &&
      !(t.expected ?? '').includes('REFUSE'),
  );

  const sql = postgres(url, {
    max: 3,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { statement_timeout: STATEMENT_MS },
  });

  console.log('TWO_STAGE_CANDIDATE_RECALL');
  console.log(
    `  ${tasks.length} concept tasks · candidate depth ${CANDIDATE_DEPTH} · statement bound ${STATEMENT_MS}ms`,
  );

  // ── which targets are reachable by the dense generator at all ──────────────
  const allTargets = [...new Set(tasks.flatMap((t) => t.targets))];
  const inProbe = new Set<string>();
  for (let i = 0; i < allTargets.length; i += 200) {
    const ids = allTargets.slice(i, i + 200);
    const rows = await sql<{ judgment_id: string }[]>`
      SELECT DISTINCT judgment_id FROM judgment_chunks WHERE judgment_id = ANY(${ids}::uuid[])`;
    for (const r of rows) inProbe.add(r.judgment_id);
  }
  console.log(`  targets in the dense probe index: ${inProbe.size}/${allTargets.length}`);
  console.log(
    '  Dense numbers are CONDITIONAL_RECALL over that subset. The matched table is the comparable one.\n',
  );

  const probes: Probe[] = [];
  for (const t of tasks) {
    const targetsInProbeIndex = t.targets.filter((id) => inProbe.has(id));
    probes.push({
      taskId: t.task_id,
      queryClass: t.query_class,
      stratum: 'LONG_FULL',
      query: t.query,
      queryChars: t.query.length,
      queryTerms: tokenise(t.query).length,
      targets: t.targets,
      targetsInProbeIndex,
    });
    if (t.proposition_family) {
      const short = familyToQuery(t.proposition_family);
      probes.push({
        taskId: t.task_id,
        queryClass: t.query_class,
        stratum: 'SHORT_FAMILY',
        query: short,
        queryChars: short.length,
        queryTerms: tokenise(short).length,
        targets: t.targets,
        targetsInProbeIndex,
      });
    }
  }
  console.log(
    `  probes: ${probes.filter((p) => p.stratum === 'LONG_FULL').length} LONG_FULL · ` +
      `${probes.filter((p) => p.stratum === 'SHORT_FAMILY').length} SHORT_FAMILY`,
  );

  /** Corpus document frequency — the same table `retrieve.ts` reads. Absent means rare. */
  const dfCache = new Map<string, number>();
  const documentFrequencies = async (words: string[]): Promise<Map<string, number>> => {
    const missing = words.filter((w) => !dfCache.has(w));
    if (missing.length > 0) {
      try {
        const rows = await sql<{ word: string; document_count: string }[]>`
          WITH w(word) AS (SELECT unnest(${missing}::text[]))
          SELECT w.word, coalesce(l.document_count, 0)::text AS document_count
          FROM w
          LEFT JOIN lexeme_document_frequency l
            ON l.lexeme = (SELECT lexeme FROM unnest(to_tsvector('english', w.word)) AS lexeme LIMIT 1)`;
        for (const r of rows) dfCache.set(r.word, Number(r.document_count));
      } catch {
        for (const w of missing) dfCache.set(w, 0);
      }
    }
    return new Map(words.map((w) => [w, dfCache.get(w) ?? 0]));
  };

  const embedder = (await getHarnessEmbedder()).embedder;
  const provenance = (await getHarnessEmbedder()).provenance;
  console.log(`  embedder: ${provenance.device}\n`);

  const measurements: Measurement[] = [];

  const lexicalCandidates = async (
    terms: string[],
  ): Promise<{ ids: string[]; ms: number; timedOut: boolean }> => {
    const t0 = Date.now();
    if (terms.length === 0) return { ids: [], ms: 0, timedOut: false };
    try {
      /**
       * `full_text_tsv`, THE STORED COLUMN, not `to_tsvector(full_text)`.
       *
       * The first version computed the tsvector on the fly. That expression
       * matches no index — `judgments_full_text_idx` is a GIN over the STORED
       * `full_text_tsv` column — so every generator did a sequential scan of
       * 18.7M rows and timed out at 15 s. It would have measured my SQL and
       * reported it as the generator's recall: all five arms at zero, and a
       * confident wrong conclusion that lexical candidate generation is hopeless.
       */
      const rows = await sql<{ id: string }[]>`
        SELECT j.id
        FROM judgments j
        WHERE j.full_text_tsv @@ plainto_tsquery('english', ${terms.join(' ')})
        LIMIT ${CANDIDATE_DEPTH}`;
      return { ids: rows.map((r) => r.id), ms: Date.now() - t0, timedOut: false };
    } catch {
      return { ids: [], ms: Date.now() - t0, timedOut: true };
    }
  };

  const denseCandidates = async (
    query: string,
  ): Promise<{ ids: string[]; ms: number; timedOut: boolean }> => {
    const t0 = Date.now();
    try {
      const [embedded] = await embedder.embed([query]);
      if (!embedded) return { ids: [], ms: Date.now() - t0, timedOut: false };
      const literal = `[${Array.from(embedded.vector).join(',')}]`;
      /**
       * `judgment_chunks`, THE INDEX PRODUCTION ACTUALLY SEARCHES — and inside a
       * TRANSACTION, which is what `SET LOCAL` requires.
       *
       * The first version pointed at `new1_probe_half_250k` and put `SET LOCAL`
       * and the SELECT in ONE template. Both were wrong and each hid the other:
       * `SET LOCAL` outside a transaction is a no-op with a warning, and
       * postgres.js sends a multi-statement string as a simple query, which
       * cannot carry the vector parameter — so every one of the 39 probes
       * "timed out" with zero candidates. Reported as-is that would have read as
       * "dense candidate generation is hopeless" when nothing had been asked.
       *
       * The probe index was also the wrong target on its own merits: it holds
       * 2 of the 19 concept-task targets, so its ceiling is 10.5% before a
       * single query runs. `judgment_chunks` holds 11 of 27 and is what
       * `retrieve.ts` reads.
       */
      // DISTINCT ON is deliberately NOT used: `ORDER BY judgment_id, distance`
      // is what DISTINCT ON requires and it defeats the HNSW index completely —
      // the plan becomes a full scan and sort of 620,300 chunks. The ANN order
      // has to be the ONLY ordering, so chunks are collapsed to judgments HERE,
      // in insertion order, which is also how `retrieve.ts` collapses them.
      const rows = await sql.begin(async (tx) => {
        await tx`SET LOCAL hnsw.ef_search = 200`;
        return tx`
          SELECT judgment_id
          FROM judgment_chunks
          ORDER BY embedding <=> ${literal}::vector
          LIMIT ${CANDIDATE_DEPTH * 4}`;
      });
      const seenDense = new Set<string>();
      const ids: string[] = [];
      for (const r of rows as unknown as { judgment_id: string }[]) {
        if (seenDense.has(r.judgment_id)) continue;
        seenDense.add(r.judgment_id);
        ids.push(r.judgment_id);
        if (ids.length >= CANDIDATE_DEPTH) break;
      }
      return { ids, ms: Date.now() - t0, timedOut: false };
    } catch {
      return { ids: [], ms: Date.now() - t0, timedOut: true };
    }
  };

  const rankOf = (ids: string[], targets: string[]): number | null => {
    const want = new Set(targets);
    for (let i = 0; i < ids.length; i += 1) if (want.has(ids[i] ?? '')) return i + 1;
    return null;
  };

  let n = 0;
  for (const p of probes) {
    n += 1;
    const words = [...new Set(tokenise(p.query))];
    const df = await documentFrequencies(words);
    const byRarity = [...words].sort((a, b) => (df.get(a) ?? 0) - (df.get(b) ?? 0));

    const record = (
      generator: Generator,
      res: { ids: string[]; ms: number; timedOut: boolean },
      termsUsed: string[],
      targets: string[],
    ): void => {
      measurements.push({
        taskId: p.taskId,
        stratum: p.stratum,
        generator,
        rank: rankOf(res.ids, targets),
        candidateCount: res.ids.length,
        ms: res.ms,
        timedOut: res.timedOut,
        termsUsed,
        termDocumentFrequencies: termsUsed.map((w) => df.get(w) ?? 0),
      });
    };

    const t3 = byRarity.slice(0, 3);
    const t2 = byRarity.slice(0, 2);
    const t1 = byRarity.slice(0, 1);

    const g1 = await lexicalCandidates(t3);
    record('G1_RAREST3_AND', g1, t3, p.targets);
    const g2 = await lexicalCandidates(t2);
    record('G2_RAREST2_AND', g2, t2, p.targets);
    const g3 = await lexicalCandidates(t1);
    record('G3_RAREST1', g3, t1, p.targets);
    const g4 = await denseCandidates(p.query);
    record('G4_DENSE_ANN', g4, [], p.targetsInProbeIndex);
    // The union is interleaved, not concatenated: a hybrid that appends dense
    // after 500 lexical rows would report dense's contribution at rank 501+ and
    // conclude, wrongly, that dense adds nothing.
    const union: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < Math.max(g1.ids.length, g4.ids.length); i += 1) {
      for (const id of [g1.ids[i], g4.ids[i]]) {
        if (id && !seen.has(id)) {
          seen.add(id);
          union.push(id);
        }
      }
    }
    record(
      'G5_UNION',
      {
        ids: union.slice(0, CANDIDATE_DEPTH),
        ms: g1.ms + g4.ms,
        timedOut: g1.timedOut || g4.timedOut,
      },
      t3,
      p.targets,
    );

    if (n % 10 === 0) console.log(`  [${n}/${probes.length}] ${p.stratum} ${p.taskId}`);
  }

  // ── report ────────────────────────────────────────────────────────────────
  const summarise = (sub: Measurement[]): Record<string, unknown> => {
    const at = (k: number): number => sub.filter((m) => m.rank !== null && m.rank <= k).length;
    const ms = sub.map((m) => m.ms);
    return {
      n: sub.length,
      recallAt20: at(20),
      recallAt20Pct: pct(at(20), sub.length),
      recallAt100: at(100),
      recallAt100Pct: pct(at(100), sub.length),
      recallAt500: at(CANDIDATE_DEPTH),
      recallAt500Pct: pct(at(CANDIDATE_DEPTH), sub.length),
      timeouts: sub.filter((m) => m.timedOut).length,
      emptyCandidateSets: sub.filter((m) => m.candidateCount === 0).length,
      candidatesP50: quantile(
        sub.map((m) => m.candidateCount),
        0.5,
      ),
      msP50: quantile(ms, 0.5),
      msP95: quantile(ms, 0.95),
      medianRarestDf: quantile(
        sub.flatMap((m) => m.termDocumentFrequencies),
        0.5,
      ),
    };
  };

  const generators: Generator[] = [
    'G1_RAREST3_AND',
    'G2_RAREST2_AND',
    'G3_RAREST1',
    'G4_DENSE_ANN',
    'G5_UNION',
  ];
  const byStratum: Record<string, Record<string, unknown>> = {};

  for (const stratum of ['LONG_FULL', 'SHORT_FAMILY'] as Stratum[]) {
    console.log('');
    console.log(`── ${stratum} ${'─'.repeat(60 - stratum.length)}`);
    console.log(
      'GENERATOR          n   r@20    r@100   r@500   timeouts  empty  cands50   p50ms    p95ms  medianDf',
    );
    for (const g of generators) {
      const sub = measurements.filter((m) => m.stratum === stratum && m.generator === g);
      const s = summarise(sub);
      byStratum[`${stratum}__${g}`] = s;
      console.log(
        g.padEnd(18) +
          String(s['n']).padStart(3) +
          String(s['recallAt20Pct']).padStart(8) +
          String(s['recallAt100Pct']).padStart(8) +
          String(s['recallAt500Pct']).padStart(8) +
          String(s['timeouts']).padStart(10) +
          String(s['emptyCandidateSets']).padStart(7) +
          String(s['candidatesP50']).padStart(9) +
          String(s['msP50']).padStart(9) +
          String(s['msP95']).padStart(9) +
          String(s['medianRarestDf']).padStart(10),
      );
    }
  }

  // ── the matched table: every generator on the dense-reachable subset only ──
  const denseReachable = new Set(
    probes.filter((p) => p.targetsInProbeIndex.length > 0).map((p) => p.taskId),
  );
  console.log('');
  console.log(
    `── MATCHED (targets present in the probe index: ${denseReachable.size} tasks) ${'─'.repeat(20)}`,
  );
  console.log('STRATUM       GENERATOR          n   r@20    r@100   r@500');
  const matched: Record<string, Record<string, unknown>> = {};
  for (const stratum of ['LONG_FULL', 'SHORT_FAMILY'] as Stratum[]) {
    for (const g of generators) {
      const sub = measurements.filter(
        (m) => m.stratum === stratum && m.generator === g && denseReachable.has(m.taskId),
      );
      if (sub.length === 0) continue;
      const s = summarise(sub);
      matched[`${stratum}__${g}`] = s;
      console.log(
        stratum.padEnd(14) +
          g.padEnd(18) +
          String(s['n']).padStart(3) +
          String(s['recallAt20Pct']).padStart(8) +
          String(s['recallAt100Pct']).padStart(8) +
          String(s['recallAt500Pct']).padStart(8),
      );
    }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        kind: 'new1_two_stage_candidate_recall',
        generatedAt: new Date().toISOString(),
        goldSetVersion: gold.gold_set_version ?? null,
        origin:
          'LCC bus 1041: the rarest-3 AND shipped as the only sparse pass and did NOT move the concept class on short doctrinal probes. This measures that stratum.',
        bounds: { statementMs: STATEMENT_MS, candidateDepth: CANDIDATE_DEPTH },
        denseIndex: {
          table: 'judgment_chunks',
          rows: 620300,
          targetsPresent: inProbe.size,
          targetsTotal: allTargets.length,
          note: 'Dense generator numbers are CONDITIONAL_RECALL over targets present in this 1.4%-of-corpus index. Only the MATCHED table compares generators on one denominator.',
        },
        byStratum,
        matched,
        measurements,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${OUT}`);
  await sql.end({ timeout: 5 });
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
