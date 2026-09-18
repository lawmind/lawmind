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
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

import { getEmbedder, toVectorLiteral } from '@lawmind/embed';
import { openDb } from '@lawmind/ingest/db-host';

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

type SecondaryFlag = 'EVIDENCE_WRONG' | 'TEXT_QUALITY_BAD' | 'CITATION_UNRESOLVED';

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

/**
 * Wall-clock budget for one query's embed+retrieve. **Measured, not
 * guessed**: the first timed version (30s) was itself measured wrong --
 * under the actual five-lane load on the shared DB proxy right now,
 * SUCCESSFUL queries were observed taking 30-70s+ (this run's own progress
 * log, `docs/CURRENT_PLAN.md`), so 30s was timing out genuinely-working
 * queries more often than catching stuck ones: 6 of the first 10 queries in
 * that run timed out, most of them not actually stuck, just slow. Raised to
 * 120s on that evidence. Still exists for the same reason as before -- a
 * ceiling that turns a truly stuck query into a visible, skippable failure
 * instead of an indefinite hang -- just calibrated to today's real
 * condition instead of an assumption about it.
 *
 * 13 Aug 2026, re-measured against the same straggler set repeatedly:
 * pulled one persistently-timing-out query (civil-e5de6bbd) out of the
 * batch loop and ran hybridSearch against it directly, unbounded --
 * completed cleanly in 65,978ms. Not stuck, just slower than 120s under
 * the ring's current "5x" throughput push (founder direction, bus 0264).
 * Tunable via CLASSIFY_TIMEOUT_MS for exactly this case: a small
 * straggler-only retry pass can afford real headroom per query since
 * there are few of them left, without raising the ceiling for a full
 * 288-query run where a genuinely stuck query should still fail fast.
 */
const QUERY_TIMEOUT_MS = Number(process.env['CLASSIFY_TIMEOUT_MS'] ?? 120_000);

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout after ${ms}ms: ${label}`)), ms),
    ),
  ]);
}

const CHECKPOINT_PATH = new URL('../../../failure-classify-checkpoint.jsonl', import.meta.url);

async function main(): Promise<void> {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const depthArg = process.argv.indexOf('--depth');
  const depth = depthArg === -1 ? 50 : Number(process.argv[depthArg + 1] ?? 50);

  const evalFx = loadFixture('queries.eval.json');
  const handFx = loadFixture('queries.hand.json');
  const derivedFx = loadFixture('queries.derived.json');
  const queries = [
    ...(evalFx.queries ?? []),
    ...(handFx.queries ?? []),
    ...(derivedFx.queries ?? []),
  ];
  // De-dupe by id -- queries.eval.json and queries.derived.json overlap by design.
  const byId = new Map(queries.map((q) => [q.id, q]));
  const unique = [...byId.values()];

  // Resumable: a checkpoint line is written after EVERY query (not batched),
  // so a killed or crashed run picks up at the next unprocessed id rather
  // than re-spending 30 minutes of DB load repeating work already done --
  // docs/LANE_PROTOCOL.md's "checkpoint everything" rule, taken literally.
  const already = new Map<string, Classification>();
  if (existsSync(CHECKPOINT_PATH)) {
    for (const line of readFileSync(CHECKPOINT_PATH, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const c = JSON.parse(line) as Classification;
      already.set(c.queryId, c);
    }
  }
  const pending = unique.filter((q) => !already.has(q.id));

  console.log('RETRIEVAL FAILURE CLASSIFICATION');
  console.log('='.repeat(78));
  console.log(
    `${unique.length} real gold queries, depth=${depth}, ` +
      `${already.size} already checkpointed, ${pending.length} pending`,
  );

  // openDb() -- LCC's actual DNS root-fix (bus 0169), adopted here the same
  // way as arms-cli.ts: connect_timeout alone does not cover a stalled DNS
  // lookup, which is what this run's own ENOTFOUND/ECONNRESET class was.
  const sql = await openDb(url, 4);
  try {
    const embedder = await getEmbedder();
    const results: Classification[] = [...already.values()];
    let timedOut = 0;

    let done = 0;
    const startedAt = Date.now();

    /**
     * Bounded concurrency, same fix and same reasoning as arms-cli.ts:
     * measured live 13 Aug 2026 that a sequential pass here spends nearly all
     * its wall time on the network round trip, not CPU -- 18 queries in 28
     * minutes against the current five-lane load. Unlike arms-cli.ts this
     * report is an unordered distribution (a histogram over 288 outcomes),
     * not a paired per-index comparison, so concurrent completion order is
     * fine -- there is no McNemar alignment to protect here. `done` and
     * `timedOut` are plain counters incremented between `await`s, which is
     * safe under JS's single-threaded event loop (no true parallelism, just
     * interleaving), and `appendFileSync` per classification is fine
     * concurrently for lines this size.
     */
    const CONCURRENCY = Number(process.env['CLASSIFY_CONCURRENCY'] ?? 6);
    let next = 0;
    async function worker(): Promise<void> {
      for (;;) {
        const i = next++;
        if (i >= pending.length) return;
        await classifyOne(pending[i]!);
      }
    }

    async function classifyOne(q: HarnessQuery): Promise<void> {
      done++;
      const thisDone = done;
      if (!q.query || q.goldJudgmentIds.length === 0) return;

      let classification: Classification;
      try {
        const [embedded] = await withTimeout(
          embedder.embed([q.query]),
          QUERY_TIMEOUT_MS,
          `embed ${q.id}`,
        );
        const vector = embedded ? toVectorLiteral(embedded.vector) : null;
        const excluded = q.provenance?.citingJudgmentId
          ? new Set([q.provenance.citingJudgmentId])
          : new Set<string>();

        const raw = await withTimeout(
          hybridSearch(sql, q.query, vector, {}, depth + excluded.size),
          QUERY_TIMEOUT_MS,
          `search ${q.id}`,
        );
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
          if (
            match.operativeParagraph.trim().length === 0 ||
            match.operativeParagraphNumber === null
          ) {
            secondary.push('EVIDENCE_WRONG');
          }
          if (match.neutralCitation === null && match.reporterCitations.length === 0) {
            secondary.push('CITATION_UNRESOLVED');
          }
        }

        classification = {
          queryId: q.id,
          group: q.group,
          query: q.query,
          goldJudgmentIds: q.goldJudgmentIds,
          primary,
          rank,
          secondary,
        };
      } catch (err) {
        timedOut++;
        console.log(
          `[${thisDone}/${pending.length}] ${q.id.padEnd(20)} TIMED OUT/FAILED after ${QUERY_TIMEOUT_MS}ms: ` +
            `${(err as Error).message} -- checkpointed as skipped, will retry on next run`,
        );
        // Not checkpointed as a Classification: a timeout is not a
        // measurement, and writing one in would make a future re-run treat
        // a stuck query as permanently resolved instead of retrying it.
        return;
      }

      results.push(classification);
      appendFileSync(CHECKPOINT_PATH, JSON.stringify(classification) + '\n');
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      console.log(
        `[${thisDone}/${pending.length}] ${q.id.padEnd(20)} ${classification.primary.padEnd(32)} ` +
          `rank=${classification.rank ?? '-'} elapsed=${elapsed}s`,
      );
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()),
    );

    if (timedOut > 0) {
      console.log(
        `\n${timedOut} quer${timedOut === 1 ? 'y' : 'ies'} timed out or failed -- re-run this command to retry only those.`,
      );
    }

    // TEXT_QUALITY_BAD: a second pass, batched, only for queries that found a
    // match -- avoids a per-row round trip inside the loop above.
    const foundIds = results
      .filter((r) => r.rank !== null)
      .map((r) => r.goldJudgmentIds)
      .flat();
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
    for (const r of results)
      for (const s of r.secondary) secondaryCounts.set(s, (secondaryCounts.get(s) ?? 0) + 1);
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
