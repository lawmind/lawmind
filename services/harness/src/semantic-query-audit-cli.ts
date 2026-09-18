/**
 * `pnpm --filter @lawmind/harness gold:queryaudit` — is the semantic gold's
 * QUERY capable of identifying its own answer?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `dense:decompose` established what the ~13–15% success@5 is NOT:
 *
 *   - not the index      — ANN_MISS 21 of 571 (3.7%); exact rank and ANN rank
 *                          agree everywhere else
 *   - not a broken
 *     document vector    — self-retrieval 68 of 68 sampled misses at rank 1
 *   - not HEAD:4800
 *     truncation         — 42.2% of the worst-miss family's gold documents are
 *                          WHOLLY inside 4,800 chars, against 49.2% of the
 *                          successes: near-identical exposure, so truncation
 *                          cannot be what separates them
 *   - not query length   — queryChars p50 197 (miss) vs 237 (hit)
 *
 * Reading actual misses pointed somewhere else. Four of the first eight are
 * sentences that name no legal question at all —
 *
 *   "Since the issues arising in all the three petitions are the same,
 *    therefore, all the three cases are being disposed of by a common order."
 *
 * — and one is OCR wreckage ("the ancillary notilication dated 10.1 1 .201 1").
 * Meanwhile the top-3 the index returns for a natural-justice query ARE natural
 * justice cases. That is a gold that asks for one specific judgment where the
 * query cannot possibly single one out, not a ranker that fails to find it.
 *
 * The prompt's rule for this is explicit: those labels may be applied ONLY when
 * measured from actual misses. So this measures four properties per query, and
 * marks anything it cannot measure UNMEASURED rather than guessing it:
 *
 *   QUERY_TEXT_DAMAGED     control/odd-character density and vowel-less token
 *                          share — the corpus-damage signals this lane already
 *                          uses, pointed at the QUERY instead of the document
 *   QUERY_TOO_FACT_HEAVY   share of tokens that are docket numbers, dates or
 *                          bare digits — text about one file, not one question
 *   QUERY_NOT_IN_GOLD      the query phrase does not occur in the judgment it
 *                          is gold for; the answer does not contain the words
 *                          the question is made of
 *   QUERY_IS_BOILERPLATE   the phrase occurs in MANY judgments (bounded count,
 *                          capped) — no ranking can prefer one of them
 *
 * None of these are labels about the retrieval system. They are labels about
 * what the benchmark is entitled to conclude.
 */
import { writeFileSync } from 'node:fs';

import postgres from 'postgres';

import { sslFor } from './db-url.js';
import { buildLaunchGold } from './launch-gold.js';

const OUT = new URL('../../../docs/ai/new1-tier-a/semantic-query-audit.json', import.meta.url);
/** How many judgments a phrase may occur in before it cannot identify one. */
const BOILERPLATE_AT = 20;
/** The bounded probe never counts past this. */
const PHRASE_CAP = 200;
/** Sample size for the corpus-wide phrase probe, which is the expensive half. */
const PHRASE_SAMPLE = Number(process.env['PHRASE_SAMPLE'] ?? 120);

/** Odd-character density: anything outside what an English legal sentence uses. */
function damageScore(q: string): { odd: number; vowelless: number } {
  const odd =
    (q.match(/[^A-Za-z0-9\s.,;:()'"@/&%₹°\-–—[\]]/g) ?? []).length / Math.max(1, q.length);
  const tokens = q.split(/\s+/).filter((t) => /[A-Za-z]/.test(t));
  const vowelless =
    tokens.filter((t) => t.length >= 4 && !/[aeiouAEIOU]/.test(t)).length /
    Math.max(1, tokens.length);
  return { odd, vowelless };
}

/** Docket/date/number density — a query about one file rather than one question. */
function factHeaviness(q: string): number {
  const tokens = q.split(/\s+/).filter((t) => t.length > 0);
  const numeric = tokens.filter(
    (t) =>
      /^\W*\d/.test(t) || /\d{2,}/.test(t) || /(No\.|Nos\.|App\.|W\.P\.|C\.R\.|S\.L\.P\.)/i.test(t),
  ).length;
  return numeric / Math.max(1, tokens.length);
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url.length === 0) throw new Error('DATABASE_URL is not set');
  const gold = buildLaunchGold();
  const rows0 = gold.rows.filter(
    (r) => r.launchClass === 'nl_doctrine' || r.launchClass === 'fact_passage',
  );
  const sql = postgres(url, {
    max: 2,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { statement_timeout: 20_000 },
  });

  type Row = {
    queryId: string;
    launchClass: string;
    goldId: string;
    chars: number;
    oddCharDensity: number;
    vowellessTokenShare: number;
    factHeaviness: number;
    queryInGold: boolean | null;
    phraseJudgments: number | null;
    phraseCapped: boolean;
    labels: string[];
  };
  const rows: Row[] = [];

  for (const [i, g] of rows0.entries()) {
    const d = damageScore(g.query);
    const r: Row = {
      queryId: g.queryId,
      launchClass: g.launchClass,
      goldId: g.goldAuthorityId,
      chars: g.query.length,
      oddCharDensity: Number(d.odd.toFixed(4)),
      vowellessTokenShare: Number(d.vowelless.toFixed(4)),
      factHeaviness: Number(factHeaviness(g.query).toFixed(4)),
      queryInGold: null,
      phraseJudgments: null,
      phraseCapped: false,
      labels: [],
    };

    // Does the answer contain the words of the question? One row, by primary key.
    try {
      const [hit] = await sql<{ inside: boolean }[]>`
        SELECT (regexp_replace(coalesce(full_text, ''), '\\s+', ' ', 'g')
                ILIKE '%' || regexp_replace(${g.query.slice(0, 120)}, '\\s+', ' ', 'g') || '%') AS inside
          FROM judgments WHERE id = ${g.goldAuthorityId}`;
      r.queryInGold = hit?.inside ?? null;
    } catch {
      r.queryInGold = null;
    }

    // How many judgments contain this phrase at all — bounded, sampled, capped.
    if (i < PHRASE_SAMPLE) {
      const words = g.query
        .replace(/[^A-Za-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(0, 8)
        .join(' ');
      if (words.length > 0) {
        try {
          const [c] = await sql<{ n: string }[]>`
            SELECT count(*)::text AS n FROM (
              SELECT 1 FROM judgments
               WHERE full_text_tsv @@ phraseto_tsquery('english', ${words})
               LIMIT ${PHRASE_CAP}
            ) s`;
          r.phraseJudgments = Number(c!.n);
          r.phraseCapped = r.phraseJudgments >= PHRASE_CAP;
        } catch {
          r.phraseJudgments = null; // UNMEASURED — the probe exceeded its budget
        }
      }
    }

    if (r.oddCharDensity >= 0.02 || r.vowellessTokenShare >= 0.15)
      r.labels.push('QUERY_TEXT_DAMAGED');
    if (r.factHeaviness >= 0.2) r.labels.push('QUERY_TOO_FACT_HEAVY');
    if (r.queryInGold === false) r.labels.push('QUERY_NOT_IN_GOLD');
    if (r.phraseJudgments !== null && r.phraseJudgments >= BOILERPLATE_AT)
      r.labels.push('QUERY_IS_BOILERPLATE');
    if (r.labels.length === 0) r.labels.push('QUERY_LOOKS_ANSWERABLE');
    rows.push(r);
    if ((i + 1) % 50 === 0) process.stdout.write(`  ${i + 1}/${rows0.length}\n`);
  }

  const byLabel: Record<string, number> = {};
  for (const r of rows) for (const l of r.labels) byLabel[l] = (byLabel[l] ?? 0) + 1;
  const probed = rows.filter((r) => r.phraseJudgments !== null);
  const summary = {
    kind: 'new1_semantic_query_audit',
    measuredAt: new Date().toISOString(),
    frozenHash: gold.frozenHash,
    thresholds: {
      BOILERPLATE_AT,
      PHRASE_CAP,
      oddCharDensity: 0.02,
      vowellessTokenShare: 0.15,
      factHeaviness: 0.2,
    },
    queries: rows.length,
    byLabel,
    phraseProbe: {
      attempted: Math.min(PHRASE_SAMPLE, rows.length),
      measured: probed.length,
      unmeasuredBudgetExceeded: Math.min(PHRASE_SAMPLE, rows.length) - probed.length,
      atOrAboveCap: probed.filter((r) => r.phraseCapped).length,
      median:
        probed.length === 0
          ? null
          : [...probed.map((r) => r.phraseJudgments!)].sort((a, b) => a - b)[
              Math.floor(probed.length / 2)
            ],
    },
    queryNotInGold: rows.filter((r) => r.queryInGold === false).length,
    rows,
  };
  writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(
    `\n${JSON.stringify({ byLabel, phraseProbe: summary.phraseProbe, queryNotInGold: summary.queryNotInGold }, null, 2)}\n`,
  );
  await sql.end();
}

await main();
