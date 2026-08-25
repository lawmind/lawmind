/**
 * NEW1 — 100k PASSAGE TRANCHE EMBEDDER. §7 NEW1-2 (T2.5/T2.6).
 *
 * Design: docs/ai/new1-tier-a/TRANCHE_100K_DESIGN.md
 * Input:  docs/ai/new1-tier-a/TRANCHE_100K_MANIFEST.json
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS WRITES TO ITS OWN TABLE AND NOT TO `judgment_chunks`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `chunk-incremental-cli.ts` already chunks and embeds, resumably, into
 * `judgment_chunks` — and `judgment_chunks` is what the production dense path
 * reads. Adding ~339,000 experimental passages to it would silently change
 * LCC's search behaviour in the middle of a sprint, with no announcement and no
 * way to undo it cleanly.
 *
 * A validation tranche must be droppable. So the vectors land in
 * `new1_tranche_passages`, the ANN index built over it is temporary, and
 * deleting the table returns the box to exactly where it started.
 *
 * What IS reused is the part that must not diverge: `chunkJudgment` for
 * segmentation and `getRemoteEmbedder` for the GPU client. A second
 * segmentation implementation would make the tranche measure something other
 * than what production would ship, which is the whole failure this experiment
 * exists to avoid.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RESUMABLE, AND CHECKPOINTED WHERE IT ACTUALLY MATTERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 160 of 283 queries were lost once on this project because a long run wrote its
 * artifact at the end. This commits per batch and skips documents already
 * present, so a kill costs at most one batch and a restart costs nothing.
 *
 * USAGE
 *   DATABASE_URL=... pnpm --filter @lawmind/embed exec tsx src/tranche-embed-cli.ts
 *   TRANCHE_BATCH=200 EMBED_GPU_URL=http://127.0.0.1:8799 tsx src/tranche-embed-cli.ts
 */
import { appendFileSync, readFileSync } from 'node:fs';
import postgres from 'postgres';
import { chunkJudgment } from './chunk.ts';
import { sslFor } from './db-ssl.ts';
import { getRemoteEmbedder, toVectorLiteral, EMBEDDING_DIMENSIONS } from './embed.ts';

const ROOT = new URL('../../../', import.meta.url);
const MANIFEST = new URL('docs/ai/new1-tier-a/TRANCHE_100K_MANIFEST.json', ROOT);
const LOG = new URL('docs/ai/new1-tier-a/tranche-embed.log', ROOT);

/**
 * The sidecar BASE, not its route.
 *
 * `getRemoteEmbedder` appends `/embed` itself. The previous default here was
 * `http://127.0.0.1:8799/embed`, which made the request `/embed/embed` and the
 * run died on its first batch with `embed sidecar 404: {"ok": false}` — a
 * healthy sidecar, a correct route, and a 404 anyway.
 *
 * The confusion is real and shared: `doc-vector-embed.mjs` reads the SAME env
 * var and `fetch`es it directly, so `EMBED_GPU_URL` legitimately carries the
 * full route for the walk. Rather than demand that every caller remember which
 * convention it is under, a trailing `/embed` is stripped here.
 */
const GPU_URL = (process.env['EMBED_GPU_URL'] ?? 'http://127.0.0.1:8799').replace(/\/embed\/?$/, '');
/** Documents fetched and embedded per transaction. Small enough that a kill is cheap. */
const BATCH = Number(process.env['TRANCHE_BATCH'] ?? 200);
/** Chunks handed to the GPU in one request. The sidecar batches by chars internally. */
const EMBED_SLICE = Number(process.env['TRANCHE_EMBED_SLICE'] ?? 64);
const LIMIT = Number(process.env['TRANCHE_LIMIT'] ?? Infinity);

/**
 * The segmentation identity, recorded on every row.
 *
 * V3's winning arm was `F_ALL_CHUNKS` — every passage of the document, at
 * `chunk.ts`'s default settings. Recording the version per row means a later
 * reader can tell whether two passages were produced by the same rule, which a
 * table-level note cannot survive a re-run.
 */
const SEGMENTATION = process.env['TRANCHE_SEGMENTATION'] ?? 'chunk.ts/defaults@F_ALL_CHUNKS';

function note(line: string): void {
  const stamped = `${new Date().toISOString()}  ${line}\n`;
  appendFileSync(LOG, stamped);
  process.stdout.write(stamped);
}

/**
 * ONE TRANSIENT TIMEOUT MUST NOT COST FIVE HOURS.
 *
 * This run died at 46,200/81,720 documents — 18,480 seconds of GPU — on a single
 * uncaught `DOMException [TimeoutError]: The operation was aborted due to timeout`.
 * That is `AbortSignal.timeout()` inside `getRemoteEmbedder`, and the bound is
 * correct: its own comment says an unbounded fetch is how a long run dies quietly.
 * The bound was never the problem. **Letting the rejection reach the top of the
 * process was.** The purpose of the timeout is to SURFACE a stalled socket, and a
 * surfaced stall should cost one slice and a retry, not the whole tranche.
 *
 * Retried here rather than in `embed.ts` on purpose. `getRemoteEmbedder` is shared
 * with the document walk and with incremental chunking; changing its failure
 * semantics would change two other lanes' jobs without asking them. This wrapper
 * is local to the tranche CLI and changes nothing outside it.
 *
 * Bounded, and it gives up. Four attempts, then the run stops — a sidecar that is
 * genuinely dead must halt the job, not spin against it forever writing nothing.
 * Every retry is written to the durable log, because a retry nobody can see turns
 * a degraded run into one that merely looks healthy and slow.
 */
const EMBED_ATTEMPTS = Number(process.env['TRANCHE_EMBED_ATTEMPTS'] ?? 4);
const RETRY_BACKOFF_MS = [5_000, 15_000, 45_000];

async function embedWithRetry(
  embed: { embed: (texts: string[]) => Promise<{ vector: Float32Array; tokenCount: number }[]> },
  texts: string[],
  batchNo: number,
  sliceNo: number,
): Promise<{ vector: Float32Array; tokenCount: number }[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= EMBED_ATTEMPTS; attempt += 1) {
    try {
      const out = await embed.embed(texts);
      if (attempt > 1)
        note(`  embed RECOVERED on attempt ${attempt}/${EMBED_ATTEMPTS} · batch ${batchNo} slice ${sliceNo}`);
      return out;
    } catch (error) {
      lastError = error;
      const name = error instanceof Error ? error.name : 'unknown';
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === EMBED_ATTEMPTS) break;
      const wait = RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1] ?? 45_000;
      note(
        `  embed FAILED attempt ${attempt}/${EMBED_ATTEMPTS} · batch ${batchNo} slice ${sliceNo} · ${name}: ${message.slice(0, 160)} · retrying in ${wait / 1000}s`,
      );
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  const name = lastError instanceof Error ? lastError.name : 'unknown';
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  note(
    `  embed EXHAUSTED ${EMBED_ATTEMPTS} attempts · batch ${batchNo} slice ${sliceNo} · ${name}: ${message.slice(0, 200)} · stopping. Progress is committed per batch; a restart resumes from the last committed document.`,
  );
  throw lastError;
}

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL is not set. Export it — an unreadable gate and a busy one print the same word.');
    process.exit(2);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
    actualSize: number;
    eligibilityViewSha256: string;
    contentSha256: string;
    documents: { id: string; priority: string; inProductionStage: boolean }[];
    gold: { forcedIds: string[]; naturalIds: string[] };
  };

  /**
   * FORCED GOLD IS EMBEDDED TOO, AND IT IS EMBEDDED FIRST.
   *
   * The manifest's `documents` array is the NATURAL draw only — 81,510 ids. The
   * 210 gold targets that did not land naturally live in `gold.forcedIds` and
   * appear nowhere in `documents`. Embedding `documents` alone would leave every
   * one of them out of the index, which does not just weaken END_TO_END (they are
   * MISSES by rule anyway) — it makes CONDITIONAL **impossible to compute at
   * all**, because CONDITIONAL asks how a target ranks GIVEN that it is in the
   * index. Two hundred and ten of 213 targets absent means the one metric that
   * measures ranking quality would have three data points.
   *
   * Putting them first costs 210 documents of a ~450,000-passage build and makes
   * the ranking metric available from the first hour. It cannot flatter the
   * result: `forced` is recorded in the manifest, and a forced target is an
   * END_TO_END MISS however early it was embedded.
   */
  const forced = manifest.gold.forcedIds;

  /**
   * THE NATURAL TRANCHE IS EMBEDDED IN GLOBAL PRIORITY-HASH ORDER, NOT CELL ORDER.
   *
   * `documents` arrives grouped by stratum cell — all of Supreme Court PRE_1990,
   * then all of Supreme Court ERA_1990S, and so on. A build interrupted at any
   * point would then hold a tranche made of whole early cells and none of the
   * late ones, and every metric computed on it would be a statement about the
   * Supreme Court's older docket rather than about the corpus.
   *
   * Measured, not hypothetical: the first 200 documents in cell order averaged
   * 35,500 characters and 14.6 chunks each, against a tranche-wide mean of
   * 10,648 characters. Cell order front-loads the longest documents in the
   * corpus, so it also makes the early throughput number a lie about the rest.
   *
   * `priority` is SHA256(seed | judgmentId), already frozen into the manifest.
   * Sorting on it globally is a uniform random permutation of the tranche that
   * is identical on every re-run, so ANY prefix of this build is a valid
   * stratified sample of the whole tranche and its cell mix matches the
   * tranche's own in expectation. That makes stopping early an honest,
   * reportable choice rather than a biased one.
   */
  const natural = [...manifest.documents].sort((a, b) => (a.priority < b.priority ? -1 : a.priority > b.priority ? 1 : 0)).map((d) => d.id);

  const ids = [...forced, ...natural];
  note(
    `TRANCHE EMBED START — ${ids.length.toLocaleString()} documents (${forced.length} forced gold first, then ${natural.length.toLocaleString()} natural in priority order) · manifest ${manifest.contentSha256.slice(0, 16)} · segmentation ${SEGMENTATION}`,
  );

  const sql = postgres(url, { max: 4, idle_timeout: 30, connect_timeout: 30, ssl: sslFor(url) });
  const embed = getRemoteEmbedder(GPU_URL);

  try {
    // Its own table: droppable, and invisible to the production dense path.
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS new1_tranche_passages (
        judgment_id   uuid    NOT NULL,
        chunk_index   int     NOT NULL,
        -- -1 means the offset could not be VERIFIED. Stored as -1, never as 0:
        -- chunk.ts is explicit that downstream must read it as "no position".
        char_offset   int     NOT NULL,
        body_length   int     NOT NULL,
        text_chars    int     NOT NULL,
        token_count   int     NOT NULL,
        segmentation  text    NOT NULL,
        embedding     vector(${EMBEDDING_DIMENSIONS}) NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (judgment_id, chunk_index)
      )`);

    // Resume: whatever is already in there is done. Idempotent by primary key.
    const done = await sql<{ judgment_id: string }[]>`
      SELECT DISTINCT judgment_id::text AS judgment_id FROM new1_tranche_passages`;
    const doneSet = new Set(done.map((r) => r.judgment_id));
    const todo = ids.filter((id) => !doneSet.has(id)).slice(0, LIMIT === Infinity ? undefined : LIMIT);
    note(`already embedded ${doneSet.size.toLocaleString()} · remaining ${todo.length.toLocaleString()}`);

    let docs = 0;
    let chunksWritten = 0;
    let charsEmbedded = 0;
    let tokensEmbedded = 0;
    let noText = 0;
    const started = Date.now();

    for (let i = 0; i < todo.length; i += BATCH) {
      const slice = todo.slice(i, i + BATCH);

      const rows = await sql<{ id: string; full_text: string | null }[]>`
        SELECT id::text AS id, full_text FROM judgments WHERE id::text = ANY(${slice})`;

      const pending: {
        judgmentId: string;
        chunkIndex: number;
        offset: number;
        bodyLength: number;
        text: string;
      }[] = [];

      for (const r of rows) {
        if (!r.full_text || r.full_text.trim().length === 0) {
          noText += 1;
          continue;
        }
        for (const c of chunkJudgment(r.full_text)) {
          pending.push({
            judgmentId: r.id,
            // The chunk's OWN index, never the loop position. `chunk.ts` assigns
            // it, and a later slice makes the two only accidentally equal.
            chunkIndex: c.index,
            // `-1` means the position could not be VERIFIED and must never be
            // treated as a literal offset — chunk.ts is explicit about this, and
            // storing it as 0 would invent a span the text does not have.
            offset: c.offset,
            bodyLength: c.bodyLength,
            text: c.text,
          });
        }
      }

      // Embed in slices so one oversized document cannot make a giant request.
      const embedded: { vector: Float32Array; tokenCount: number }[] = [];
      for (let s = 0; s < pending.length; s += EMBED_SLICE) {
        const part = pending.slice(s, s + EMBED_SLICE);
        const out = await embedWithRetry(embed, part.map((p) => p.text), i / BATCH, s / EMBED_SLICE);
        if (out.length !== part.length) {
          throw new Error(
            `embedder returned ${out.length} vectors for ${part.length} chunks — refusing to write a misaligned slice`,
          );
        }
        for (const e of out) embedded.push(e);
        for (const p of part) charsEmbedded += p.text.length;
      }

      if (pending.length > 0) {
        const insertRows = pending.map((p, idx) => {
          const e = embedded[idx];
          if (!e) throw new Error(`embedding missing for chunk ${p.chunkIndex} of ${p.judgmentId}`);
          tokensEmbedded += e.tokenCount;
          return {
            judgment_id: p.judgmentId,
            chunk_index: p.chunkIndex,
            char_offset: p.offset,
            body_length: p.bodyLength,
            text_chars: p.text.length,
            token_count: e.tokenCount,
            segmentation: SEGMENTATION,
            embedding: toVectorLiteral(e.vector),
          };
        });
        // Committed per batch: a kill costs one batch, never the run.
        await sql`INSERT INTO new1_tranche_passages ${sql(insertRows)} ON CONFLICT DO NOTHING`;
        chunksWritten += insertRows.length;
      }

      docs += slice.length;
      const secs = (Date.now() - started) / 1000;
      note(
        `docs ${docs}/${todo.length}  chunks ${chunksWritten.toLocaleString()}  noText ${noText}  ` +
          `${(charsEmbedded / 1e6).toFixed(1)}M chars  ${secs.toFixed(0)}s  ${(tokensEmbedded / secs).toFixed(0)} tok/s`,
      );
    }

    const totals = await sql<{ n: string; d: string }[]>`
      SELECT count(*)::bigint AS n, count(DISTINCT judgment_id)::bigint AS d
      FROM new1_tranche_passages`;
    const n = Number(totals[0]?.n ?? 0);
    const d = Number(totals[0]?.d ?? 0);
    note(
      `TRANCHE EMBED DONE — ${n.toLocaleString()} passages over ${d.toLocaleString()} documents ` +
        `(${(n / Math.max(1, d)).toFixed(2)} chunks/doc) · ${((Date.now() - started) / 3600_000).toFixed(2)} GPU-hours ` +
        `· ${(tokensEmbedded / 1e6).toFixed(1)}M tokens`,
    );
  } finally {
    await sql.end({ timeout: 15 });
  }
}

await main();
