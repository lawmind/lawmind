/**
 * Incremental, resumable chunk generation for embedding-eligible judgments.
 *
 *   pnpm --filter @lawmind/embed run chunk-incremental -- \
 *     [--tier A|A_CORE] [--batch 200] [--page 500] [--max 0] [--dry-run]
 *     [--embed-endpoint URL] [--reset] [--force]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NOT JUST RUN `cli.ts`, WHICH ALREADY CHUNKS AND EMBEDS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Because it selects its work like this:
 *
 *     SELECT j.id FROM judgments j
 *     WHERE NOT EXISTS (SELECT 1 FROM judgment_chunks c WHERE c.judgment_id = j.id)
 *     ORDER BY j.judgment_date DESC
 *     LIMIT $limit
 *
 * That was correct at 79,322 judgments. At 14,973,372 it is an unbounded
 * anti-join plus a sort of everything that survives it, executed BEFORE the
 * first chunk is written — the same shape as the `SELECT DISTINCT court` defect
 * on `POST /search`, which measured >8m56s. It also has no eligibility notion at
 * all: it will happily embed a procedural stub whose Devanagari was deleted.
 *
 * `cli.ts` is NOT replaced. It stays as the tool for a bounded, court-scoped run
 * and its chunking logic (`chunk.ts`) is imported here unchanged — the splitting
 * is good and re-deriving it would be two definitions of a chunk.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS DIFFERENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   keyset       `WHERE id > $cursor ORDER BY id LIMIT n`, one index descent per
 *                page at any depth. Never OFFSET: an offset walk re-reads every
 *                row it skips, so it slows down exactly as it gets further in,
 *                which is how a backfill comes to never finish.
 *   checkpoint   the cursor is committed to disk after every page, so a killed
 *                run resumes where it stopped rather than at the start. On this
 *                box that is not hypothetical — six postmaster deaths from
 *                console signals in four days.
 *   eligible     work comes from `judgment_embedding_eligibility`, so a stub, a
 *                reference, or known-corrupt text is never chunked.
 *   idempotent   one judgment's chunks in one transaction; a unique violation on
 *                (judgment_id, chunk_index) is SUCCESS — it means a previous
 *                attempt committed and only the acknowledgement was lost.
 *   gated        asks `scripts/resource-gate.mjs` before every batch.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `--dry-run` IS THE DEFAULT POSTURE, AND THE REASON IS A DECISION NOT MINE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The existing index carries **15.45 vectors per document** (NEW1, bus 0697).
 * Tier A is ~8.49M documents. Chunking all of it at that multiplier is ~131M
 * vectors, which is not an optimisation problem, it is a different product.
 *
 * So this tool MEASURES first: `--dry-run` walks the eligible population,
 * chunks it in memory, and reports the real multiplier and the projected vector
 * count without writing a row or calling an embedder. Turning that into a
 * population is the founder's call and NEW1's sizing, not a side effect of
 * running a CLI.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import postgres from 'postgres';

import type { JobClass } from '../../../scripts/resource-gate.d.mts';
import { chunkJudgment } from './chunk.ts';
import { sslFor } from './db-ssl.ts';
import { checkView, CONTRACT_VERSION, pagePending, TIERS, type Tier } from './eligibility.ts';
import { getRemoteEmbedder, toVectorLiteral } from './embed.ts';
import { textQuality } from './quality.ts';

const CHECKPOINT = join('services', 'embed', '.checkpoints', 'chunk-incremental.json');

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
function num(name: string, fallback: number): number {
  const v = flag(name);
  return v === undefined ? fallback : Number(v);
}
function has(name: string): boolean {
  return process.argv.includes(name);
}

type Checkpoint = {
  tier: Tier;
  contractVersion: string;
  definitionHash: string;
  cursor: string | null;
  documents: number;
  chunks: number;
  startedAt: string;
  updatedAt: string;
};

function readCheckpoint(): Checkpoint | null {
  if (!existsSync(CHECKPOINT)) return null;
  try {
    return JSON.parse(readFileSync(CHECKPOINT, 'utf8')) as Checkpoint;
  } catch {
    return null;
  }
}

function writeCheckpoint(c: Checkpoint): void {
  mkdirSync(dirname(CHECKPOINT), { recursive: true });
  writeFileSync(CHECKPOINT, JSON.stringify(c, null, 2) + '\n');
}

async function gate(jobClass: JobClass): Promise<{ allow: boolean; reasons: string[] }> {
  try {
    const mod = await import('../../../scripts/resource-gate.mjs');
    const v = await mod.check(jobClass);
    return { allow: v.allow, reasons: v.reasons };
  } catch (error) {
    return {
      allow: false,
      reasons: ['resource gate unavailable: ' + String((error as Error).message)],
    };
  }
}

type ChunkRow = {
  judgment_id: string;
  chunk_index: number;
  chunk_text: string;
  embedding: string;
  token_count: number;
  text_quality: number | null;
  char_offset: number | null;
  char_length: number | null;
};

/**
 * One judgment's chunks, one transaction, retried.
 *
 * Lifted deliberately from `cli.ts` rather than shared: that file is the bounded
 * tool and this is the incremental one, and a shared writer would couple two
 * things that are going to diverge — this one will grow a per-tier vector
 * budget and that one must not.
 */
async function writeJudgment(sql: postgres.Sql, rows: ChunkRow[], attempts = 4): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await sql.begin(async (tx) => {
        await tx`INSERT INTO judgment_chunks ${tx(rows)}`;
      });
      return;
    } catch (error) {
      const code = (error as { code?: string }).code;
      // 23505 means an earlier attempt committed and only the acknowledgement
      // was lost. The rows we wanted are there; that is success, not failure.
      if (code === '23505') return;
      if (attempt >= attempts) throw error;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

async function main(): Promise<number> {
  const tier = (flag('--tier') ?? 'A') as Tier;
  if (!TIERS.includes(tier)) {
    console.error('--tier must be one of ' + TIERS.join(', '));
    return 2;
  }
  const pageSize = num('--page', 500);
  const batchSize = num('--batch', 200);
  const max = num('--max', 0); // 0 = until the tier is exhausted
  const dryRun = has('--dry-run') || !has('--write');
  const endpoint = flag('--embed-endpoint') ?? process.env['EMBED_ENDPOINT'];

  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL unset');
    return 2;
  }

  const sql = postgres(url, { ssl: sslFor(url), max: 3, onnotice: () => {} });
  try {
    const view = await checkView(sql);
    if (!view.present) {
      console.error('REFUSED: ' + view.why);
      return 4;
    }

    let checkpoint = has('--reset') ? null : readCheckpoint();
    if (
      checkpoint &&
      (checkpoint.tier !== tier ||
        checkpoint.contractVersion !== CONTRACT_VERSION ||
        checkpoint.definitionHash !== view.definitionHash)
    ) {
      // Resuming across a changed DEFINITION would produce a population that is
      // half one selector and half another, and nothing downstream could tell.
      console.error(
        'REFUSED: checkpoint was written under ' +
          checkpoint.tier +
          '/' +
          checkpoint.contractVersion +
          '/' +
          checkpoint.definitionHash +
          ' and this run is ' +
          tier +
          '/' +
          CONTRACT_VERSION +
          '/' +
          view.definitionHash +
          '. ' +
          'Pass --reset to start this tier over; do not resume across a definition change.',
      );
      return 5;
    }

    checkpoint ??= {
      tier,
      contractVersion: CONTRACT_VERSION,
      definitionHash: view.definitionHash,
      cursor: null,
      documents: 0,
      chunks: 0,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!dryRun && !endpoint) {
      // Refuses honestly rather than falling back to the in-process embedder:
      // this tool's whole reason for existing is that the GPU is NEW1's lane,
      // and quietly loading a model onto this box would be the opposite.
      console.error('REFUSED: --write needs --embed-endpoint or EMBED_ENDPOINT.');
      return 2;
    }
    const embed = dryRun || !endpoint ? null : getRemoteEmbedder(endpoint);

    console.log(
      (dryRun ? 'DRY RUN — measuring only, nothing written' : 'WRITING') +
        ' · tier ' +
        tier +
        ' · contract ' +
        CONTRACT_VERSION +
        '/' +
        view.definitionHash +
        ' · resuming from ' +
        (checkpoint.cursor ?? 'the start'),
    );

    let documents = 0;
    let chunks = 0;
    let skippedNoChunks = 0;
    const bandCounts = new Map<string, { docs: number; chunks: number }>();

    for (;;) {
      if (max > 0 && documents >= max) break;

      const verdict = await gate(dryRun ? 'DB_SCAN' : 'GPU_EMBED');
      if (!verdict.allow && !has('--force')) {
        console.log('DEFER — stopping cleanly at cursor ' + checkpoint.cursor);
        for (const r of verdict.reasons) console.log('  - ' + r);
        break;
      }

      const want = max > 0 ? Math.min(pageSize, max - documents) : pageSize;
      const rows = await pagePending(sql, tier, checkpoint.cursor, want);
      if (rows.length === 0) {
        console.log('tier exhausted');
        break;
      }

      // Text is fetched a page at a time, never with the id list. Selecting
      // `full_text` alongside the ids pulled the whole corpus into memory in an
      // earlier tool — 2.9 GB resident and a ~13-minute stall before the first
      // chunk.
      const ids = rows.map((r) => r.id);
      const texts = await sql<{ id: string; full_text: string }[]>`
        SELECT id, full_text FROM judgments WHERE id = ANY(${ids})
      `;
      const byId = new Map(texts.map((t) => [t.id, t.full_text]));

      for (const row of rows) {
        const text = byId.get(row.id);
        if (!text) continue;
        const pieces = chunkJudgment(text);
        if (pieces.length === 0) {
          // Eligible by metadata, unchunkable in fact. Counted, never silently
          // dropped — a population that shrinks without saying so is the thing
          // that makes coverage figures untrustworthy.
          skippedNoChunks += 1;
          continue;
        }

        documents += 1;
        chunks += pieces.length;
        const band = bandCounts.get(row.valueBand) ?? { docs: 0, chunks: 0 };
        band.docs += 1;
        band.chunks += pieces.length;
        bandCounts.set(row.valueBand, band);

        if (!dryRun && embed) {
          const out: ChunkRow[] = [];
          for (let i = 0; i < pieces.length; i += batchSize) {
            const slice = pieces.slice(i, i + batchSize);
            const embedded = await embed.embed(slice.map((p) => p.text));
            slice.forEach((piece, k) => {
              const e = embedded[k];
              if (!e) throw new Error('embedding missing for chunk ' + piece.index);
              out.push({
                judgment_id: row.id,
                // The chunk's OWN index, never the loop position — the batch is
                // a slice and `i + k` is only accidentally equal to it.
                chunk_index: piece.index,
                chunk_text: piece.text,
                embedding: toVectorLiteral(e.vector),
                // From the attention mask, not the padded batch width.
                token_count: e.tokenCount,
                // Scored on exactly the text that gets embedded, overlap
                // included: if the carried tail is damaged, the vector carries
                // that damage and the score should say so.
                text_quality: textQuality(piece.text),
                // `-1` means chunkJudgment could not VERIFY the position. NULL,
                // never the literal -1 — the read path handles "unavailable",
                // and a negative number would reach a bounds check as a number.
                char_offset: piece.offset === -1 ? null : piece.offset,
                char_length: piece.offset === -1 ? null : piece.bodyLength,
              });
            });
          }
          await writeJudgment(sql, out);
        }
      }

      checkpoint.cursor = rows[rows.length - 1]!.id;
      checkpoint.documents += rows.length;
      checkpoint.chunks += chunks;
      checkpoint.updatedAt = new Date().toISOString();
      // After EVERY page, in-band, before the next one starts. A checkpoint
      // written on a timer is a checkpoint that is missing when the process dies
      // to a console signal, which is the way processes die on this box.
      if (!dryRun) writeCheckpoint(checkpoint);

      console.log(
        '  ' +
          documents.toLocaleString() +
          ' docs · ' +
          chunks.toLocaleString() +
          ' chunks · ' +
          (documents > 0 ? (chunks / documents).toFixed(2) : '0') +
          ' per doc · cursor ' +
          checkpoint.cursor,
      );
    }

    const multiplier = documents > 0 ? chunks / documents : 0;
    console.log(
      JSON.stringify(
        {
          mode: dryRun ? 'dry-run' : 'write',
          tier,
          contractVersion: CONTRACT_VERSION,
          definitionHash: view.definitionHash,
          documents,
          chunks,
          chunksPerDocument: Number(multiplier.toFixed(2)),
          eligibleButUnchunkable: skippedNoChunks,
          byValueBand: Object.fromEntries(
            [...bandCounts].map(([b, v]) => [
              b,
              { docs: v.docs, chunks: v.chunks, perDoc: Number((v.chunks / v.docs).toFixed(2)) },
            ]),
          ),
          cursor: checkpoint.cursor,
          // The number that decides whether the full population is affordable.
          // Stated per tier because the multiplier is length-driven and the
          // tiers are length bands.
          note:
            'NEW1 measured the EXISTING index at 15.45 vectors/document (bus 0697). ' +
            'Multiply the tier population by the figure above, not by 1.',
        },
        null,
        2,
      ),
    );
    return 0;
  } finally {
    await sql.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error.stack ?? error.message);
    process.exit(1);
  });
