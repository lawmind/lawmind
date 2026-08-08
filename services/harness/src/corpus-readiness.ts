/**
 * Can this database answer the harness at all?
 *
 * **The failure this exists to prevent is a passing run.** Every ceiling metric
 * is zero, and zero over an empty set is zero. Point the runner at a scratch
 * database with no judgments in it and it will report a flawless
 * hallucination rate, a flawless silent-drop rate, and a gate that has never
 * asked a question. `metrics.ts` §`rate` states the rule — *an absent check is
 * not a negative result* — and this is the rule applied one level up, to the
 * corpus rather than to a single metric.
 *
 * So the run refuses before it starts, and says which requirement is missing.
 * Refusing is not a failure of the gate; **reporting a number nobody measured
 * is.**
 */
import type { Sql } from 'postgres';

/**
 * What the harness needs on the other end of `CORPUS_DATABASE_URL`.
 *
 * Not "a healthy corpus" — that is Gate S1's question. These are strictly the
 * preconditions for the six metrics to mean anything:
 *
 * - **judgments** — without them precision@5 has no candidates.
 * - **embedded chunks** — hybrid search is half lexical and half vector. A
 *   corpus with chunks but no embeddings still returns results, so this cannot
 *   be inferred from a non-empty result set; it has to be asked.
 * - **resolved citation edges** — ground truth is derived from them
 *   (`queries.json` provenance). Zero edges means every gold answer in the
 *   fixture was asserted rather than derived, which is the thing A1.1 forbids.
 * - **at least one overruled judgment** — `staleOverruledRate` and
 *   `overruledLeakage` are the two metrics that cannot be exercised by a corpus
 *   where the law has never moved. Both would report a perfect 0 having tested
 *   nothing.
 */
export type CorpusRequirement = {
  key: string;
  what: string;
  min: number;
  why: string;
};

export const REQUIREMENTS: readonly CorpusRequirement[] = [
  {
    key: 'judgments',
    what: 'judgments',
    min: 1000,
    why: 'precision@5 over a handful of documents measures the fixture, not the retriever',
  },
  {
    key: 'embeddedChunks',
    what: 'judgment chunks carrying an embedding',
    min: 1000,
    why: 'hybrid search degrades silently to lexical-only when embeddings are absent — it still returns results',
  },
  {
    key: 'resolvedCitations',
    what: 'resolved judgment_citations edges',
    min: 100,
    why: 'ground truth is derived from citation edges; with none, every gold answer was asserted rather than derived',
  },
  {
    key: 'overruledJudgments',
    what: 'judgments where the law has moved',
    min: 1,
    why: 'staleOverruledRate and overruledLeakage cannot be exercised by a corpus that has never had an overruling; both would report a perfect 0 having tested nothing',
  },
];

export type CorpusCounts = Record<string, number>;

export async function countCorpus(sql: Sql): Promise<CorpusCounts> {
  const [row] = await sql<
    {
      judgments: number;
      embedded_chunks: number;
      resolved_citations: number;
      overruled_judgments: number;
      hindi_judgments: number;
      criminal_judgments: number;
      civil_judgments: number;
    }[]
  >`
    SELECT (SELECT count(*) FROM judgments)::int                                   AS judgments,
           (SELECT count(*) FROM judgment_chunks WHERE embedding IS NOT NULL)::int AS embedded_chunks,
           (SELECT count(*) FROM judgment_citations
             WHERE cited_judgment_id IS NOT NULL)::int                             AS resolved_citations,
           (SELECT count(*) FROM judgments WHERE overruled_status <> 'none')::int  AS overruled_judgments,
           (SELECT count(*) FROM judgments WHERE language = 'hi')::int             AS hindi_judgments,
           (SELECT count(*) FROM judgments WHERE case_type = 'criminal')::int      AS criminal_judgments,
           (SELECT count(*) FROM judgments WHERE case_type = 'civil')::int         AS civil_judgments
  `;
  return {
    judgments: row!.judgments,
    embeddedChunks: row!.embedded_chunks,
    resolvedCitations: row!.resolved_citations,
    overruledJudgments: row!.overruled_judgments,
    hindiJudgments: row!.hindi_judgments,
    criminalJudgments: row!.criminal_judgments,
    civilJudgments: row!.civil_judgments,
  };
}

export type ReadinessVerdict = {
  ready: boolean;
  counts: CorpusCounts;
  unmet: (CorpusRequirement & { actual: number })[];
};

export function assessReadiness(counts: CorpusCounts): ReadinessVerdict {
  const unmet = REQUIREMENTS.filter((r) => (counts[r.key] ?? 0) < r.min).map((r) => ({
    ...r,
    actual: counts[r.key] ?? 0,
  }));
  return { ready: unmet.length === 0, counts, unmet };
}

/** What the runner prints when it refuses. Names the requirement AND the reason. */
export function explainRefusal(v: ReadinessVerdict): string {
  const lines = [
    'The harness refused to run: this database cannot answer the questions the gate asks.',
    '',
    'Reporting a metric over a corpus that cannot exercise it is worse than not running —',
    'every ceiling here is zero, and zero over an empty set looks exactly like a pass.',
    '',
  ];
  for (const r of v.unmet) {
    lines.push(`  ${r.what}: ${r.actual} — need at least ${r.min}`);
    lines.push(`    ${r.why}`);
  }
  lines.push('');
  lines.push('Point CORPUS_DATABASE_URL at a database holding the real corpus.');
  return lines.join('\n');
}
