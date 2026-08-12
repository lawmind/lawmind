/**
 * Retrieval failure classification — separates "the corpus doesn't hold
 * this" from "we have it but didn't find/rank/present it well."
 *
 *   pnpm --filter @lawmind/harness failure:classify [--depth 50]
 *
 * The directive this exists for is explicit: only ONE of six failure shapes
 * is a data-acquisition problem, and claiming "missing" for any of the
 * other five sends the acquisition lane chasing documents already sitting
 * in the corpus. This tool exists to stop that from happening by guesswork.
 *
 *   NO_AUTHORITY_FOUND                    -- acquisition's problem
 *   AUTHORITY_HELD_BUT_NOT_RETRIEVED      -- ours: recall
 *   AUTHORITY_RETRIEVED_BUT_BADLY_RANKED  -- ours: ranking
 *   AUTHORITY_CORRECT_BUT_EVIDENCE_WRONG  -- ours: paragraph location
 *   AUTHORITY_CORRECT_BUT_TEXT_QUALITY_BAD -- ours: OCR/extraction
 *   AUTHORITY_CORRECT_BUT_CITATION_UNRESOLVED -- ours: citation resolution
 *
 * **Run against the real gold benchmark** (`queries.eval.json` +
 * `queries.hand.json`, `run-cli.ts`'s own fixtures — no new gold invented).
 * Every gold judgment here was drawn from the corpus's own citation edges,
 * so it is DEFINITIONALLY held. `NO_AUTHORITY_FOUND` therefore cannot fire
 * for this query set, by construction — stated as the honest boundary of
 * what this run proves, not hidden. Classifying a genuinely unseen live
 * query (no known gold) as `NO_AUTHORITY_FOUND` would require confirming
 * absence, which this cannot do mechanically and does not attempt: that
 * category is reserved for a human-confirmed miss, not an automated guess.
 *
 * Any `NO_AUTHORITY_FOUND` case IS written to `NEW3_ACQUISITION_QUEUE.json`
 * (append-only, never overwritten) with the evidence for why the authority
 * appears missing -- empty after this run, for the reason above, and that
 * emptiness is itself the finding: the acquisition queue has nothing
 * legitimate to receive from this session's evidence.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import postgres from 'postgres';

import { hybridSearch, type RetrievedJudgment } from '@lawmind/api/search/retrieve';

type HarnessQuery = {
  id: string;
  group: string;
  language: string;
  query: string;
  goldJudgmentIds: string[];
  provenance?: { citingJudgmentId?: string };
};

type FailureClass =
  | 'NO_AUTHORITY_FOUND'
  | 'AUTHORITY_HELD_BUT_NOT_RETRIEVED'
  | 'AUTHORITY_RETRIEVED_BUT_BADLY_RANKED'
  | 'SUCCESS';

type SecondaryFlag =
  | 'EVIDENCE_WRONG'
  | 'TEXT_QUALITY_BAD'
  | 'CITATION_UNRESOLVED';

type Classification = {
  queryId: string;
  group: string;
  query: string;
  goldJudgmentIds: string[];
  primary: FailureClass;
  rank: number | null;
  secondary: SecondaryFlag[];
};

function loadFixture(name: string): { queries?: HarnessQuery[] } {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as never;
}

const NEW3_QUEUE_PATH = new URL('../../../NEW3_ACQUISITION_QUEUE.json', import.meta.url);

type New3QueueEntry = {
  queryId: string;
  query: string;
  group: string;
  evidence: string;
  foundAt: string;
};

async function main(): Promise<void> {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const depthArg = process.argv.indexOf('--depth');
  const depth = depthArg === -1 ? 50 : Number(process.argv[depthArg + 1] ?? 50);

  const evalFx = loadFixture('queries.eval.json');
  const handFx = loadFixture('queries.hand.json');
  const derivedFx = loadFixture('queries.derived.json');
  const queries = [...(evalFx.queries ?? []), ...(handFx.queries ?? []), ...(derivedFx.queries ?? [])];
  // De-dupe by id -- queries.eval.json and queries.derived.json overlap by design.
  const byId = new Map(queries.map((q) => [q.id, q]));
  const unique = [...byId.values()];

  console.log('RETRIEVAL FAILURE CLASSIFICATION');
  console.log('='.repeat(78));
  console.log(`${unique.length} real gold queries, depth=${depth}`);

  const sql = postgres(url, { max: 4, ssl: url.includes('localhost') ? false : 'require' });
  try {
    const embedder = await getEmbedder();
    const results: Classification[] = [];

    for (const q of unique) {
      if (!q.query || q.goldJudgmentIds.length === 0) continue;
      const [embedded] = await embedder.embed([q.query]);
      const vector = embedded ? toVectorLiteral(embedded.vector) : null;
      const excluded = q.provenance?.citingJudgmentId
        ? new Set([q.provenance.citingJudgmentId])
        : new Set<string>();

      const raw = await hybridSearch(sql, q.query, vector, {}, depth + excluded.size);
      const retrieved = raw.filter((r) => !excluded.has(r.judgmentId)).slice(0, depth);

      let rank: number | null = null;
      let match: RetrievedJudgment | undefined;
      for (let i = 0; i < retrieved.length; i++) {
        if (q.goldJudgmentIds.includes(retrieved[i]!.judgmentId)) {
          rank = i + 1;
          match = retrieved[i];
          break;
        }
      }

      let primary: FailureClass;
      if (rank === null) {
        // Gold is definitionally held (drawn from this corpus's own citation
        // edges) -- so a miss at this depth is a RECALL problem, never an
        // acquisition one. See the module docstring for why NO_AUTHORITY_FOUND
        // cannot fire here.
        primary = 'AUTHORITY_HELD_BUT_NOT_RETRIEVED';
      } else if (rank <= 5) {
        primary = 'SUCCESS';
      } else {
        primary = 'AUTHORITY_RETRIEVED_BUT_BADLY_RANKED';
      }

      const secondary: SecondaryFlag[] = [];
      if (match) {
        if (match.operativeParagraph.trim().length === 0 || match.operativeParagraphNumber === null) {
          secondary.push('EVIDENCE_WRONG');
        }
        if (match.neutralCitation === null && match.reporterCitations.length === 0) {
          secondary.push('CITATION_UNRESOLVED');
        }
      }

      results.push({
        queryId: q.id,
        group: q.group,
        query: q.query,
        goldJudgmentIds: q.goldJudgmentIds,
        primary,
        rank,
        secondary,
      });
    }

    // TEXT_QUALITY_BAD: a second pass, batched, only for queries that found a
    // match -- avoids a per-row round trip inside the loop above.
    const foundIds = results.filter((r) => r.rank !== null).map((r) => r.goldJudgmentIds).flat();
    if (foundIds.length > 0) {
      const quality = await sql<{ judgment_id: string; min_quality: string | null }[]>`
        SELECT judgment_id, min(text_quality)::text AS min_quality
        FROM judgment_chunks WHERE judgment_id = ANY(${foundIds}) GROUP BY judgment_id
      `;
      const qualityById = new Map(quality.map((r) => [r.judgment_id, r.min_quality]));
      for (const r of results) {
        if (r.rank === null) continue;
        const q = qualityById.get(r.goldJudgmentIds[0] ?? '');
        if (q !== undefined && q !== null && Number(q) < 0.7) r.secondary.push('TEXT_QUALITY_BAD');
      }
    }

    console.log('\nBY PRIMARY CLASS');
    console.log('='.repeat(78));
    const byClass = new Map<FailureClass, number>();
    for (const r of results) byClass.set(r.primary, (byClass.get(r.primary) ?? 0) + 1);
    for (const cls of [
      'SUCCESS',
      'AUTHORITY_RETRIEVED_BUT_BADLY_RANKED',
      'AUTHORITY_HELD_BUT_NOT_RETRIEVED',
      'NO_AUTHORITY_FOUND',
    ] as FailureClass[]) {
      console.log(`  ${cls.padEnd(38)} ${byClass.get(cls) ?? 0} / ${results.length}`);
    }

    console.log('\nBADLY-RANKED DETAIL (found, but past top 5)');
    console.log('='.repeat(78));
    for (const r of results.filter((x) => x.primary === 'AUTHORITY_RETRIEVED_BUT_BADLY_RANKED')) {
      console.log(`  ${r.queryId.padEnd(20)} rank ${r.rank}  "${r.query.slice(0, 60)}..."`);
    }

    console.log('\nNOT RETRIEVED AT ALL (recall problem, not acquisition)');
    console.log('='.repeat(78));
    for (const r of results.filter((x) => x.primary === 'AUTHORITY_HELD_BUT_NOT_RETRIEVED')) {
      console.log(`  ${r.queryId.padEnd(20)} "${r.query.slice(0, 60)}..."`);
    }

    const secondaryCounts = new Map<SecondaryFlag, number>();
    for (const r of results) for (const s of r.secondary) secondaryCounts.set(s, (secondaryCounts.get(s) ?? 0) + 1);
    console.log('\nSECONDARY FLAGS (on found authorities -- correct case, other problem)');
    console.log('='.repeat(78));
    for (const [flag, n] of secondaryCounts) console.log(`  ${flag.padEnd(20)} ${n}`);

    // NEW3 acquisition queue: only NO_AUTHORITY_FOUND entries, ever. This run
    // produces none, by construction -- the write path exists and is exercised
    // (the file is touched with an empty array if absent) so it is real
    // infrastructure, not a promise, for the day a confirmed-absent live query
    // needs to reach it.
    const acquisitionCandidates = results.filter((r) => r.primary === 'NO_AUTHORITY_FOUND');
    const existing: New3QueueEntry[] = existsSync(NEW3_QUEUE_PATH)
      ? (JSON.parse(readFileSync(NEW3_QUEUE_PATH, 'utf8')) as New3QueueEntry[])
      : [];
    const newEntries: New3QueueEntry[] = acquisitionCandidates.map((r) => ({
      queryId: r.queryId,
      query: r.query,
      group: r.group,
      evidence: `Gold judgment(s) ${r.goldJudgmentIds.join(', ')} not found -- but this query's gold is drawn from this corpus's own citation edges, so this should never occur; investigate before trusting it.`,
      foundAt: new Date().toISOString(),
    }));
    writeFileSync(NEW3_QUEUE_PATH, JSON.stringify([...existing, ...newEntries], null, 2));
    console.log(
      `\nNEW3_ACQUISITION_QUEUE.json: ${newEntries.length} new entries this run (${existing.length + newEntries.length} total).`,
    );
    if (newEntries.length === 0) {
      console.log(
        '  Empty, as expected for a gold set drawn from the corpus itself -- see the module docstring.',
      );
    }
  } finally {
    await sql.end();
  }
}

await main();
