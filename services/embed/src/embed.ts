/**
 * BGE-M3 dense embeddings — OD-4's choice, self-hosted, MIT.
 *
 * ONE implementation, used for BOTH the corpus and the query. That is not tidiness:
 * cosine similarity between vectors produced by different builds or precisions of
 * the same model is not meaningful, so a separate "query embedder" would quietly
 * degrade every search. `docs/OSS_STACK.md` puts the batch run on a rented GPU and
 * query-time on Railway CPU — same code, same weights, different hardware.
 *
 * Verified against the model, not from memory: `config.json` gives hidden_size
 * 1024 and `1_Pooling/config.json` sets CLS pooling, and a forward pass returns
 * only `last_hidden_state` with dims [batch, tokens, 1024]. So pooling and
 * normalisation happen here.
 */
import { fileURLToPath } from 'node:url';

import { AutoModel, AutoTokenizer, env } from '@huggingface/transformers';

/** Matches `judgment_chunks.embedding vector(1024)` in `docs/SCHEMA_TRUTH.md`. */
export const EMBEDDING_DIMENSIONS = 1024;

export const MODEL_ID = 'Xenova/bge-m3';

/**
 * Cache outside `node_modules`, which the default would use — a reinstall would
 * otherwise silently re-download 569MB, and on Railway it would happen on every
 * cold start.
 */
const defaultCacheDir = fileURLToPath(new URL('../../../.models', import.meta.url));
env.cacheDir = process.env['MODEL_CACHE_DIR'] ?? defaultCacheDir;

export type Embedded = {
  vector: Float32Array;
  /**
   * Real token count for this text, from the attention mask — NOT the padded
   * width of the batch. `judgment_chunks.token_count` is NOT NULL and a padded
   * number would be silently wrong for every row in a mixed-length batch.
   */
  tokenCount: number;
};

export type Embedder = {
  embed: (texts: string[]) => Promise<Embedded[]>;
  dimensions: number;
};

type Loaded = {
  tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  model: Awaited<ReturnType<typeof AutoModel.from_pretrained>>;
};

let loading: Promise<Loaded> | undefined;

/** Loaded once per process — the model is ~569MB and load costs seconds. */
async function load(): Promise<Loaded> {
  loading ??= (async () => {
    const [tokenizer, model] = await Promise.all([
      AutoTokenizer.from_pretrained(MODEL_ID),
      // q8: the CPU-servable build. Corpus and query must use the SAME dtype —
      // see the note at the top of this file.
      AutoModel.from_pretrained(MODEL_ID, { dtype: 'q8' }),
    ]);
    return { tokenizer, model };
  })();
  return loading;
}

/** CLS pooling then L2 normalisation — what BGE-M3 dense retrieval expects. */
export function poolAndNormalise(hidden: Float32Array, dims: readonly number[]): Float32Array[] {
  const [batch, , width] = dims as [number, number, number];
  const out: Float32Array[] = [];
  for (let b = 0; b < batch; b++) {
    // CLS is token 0 of each sequence.
    const start = b * dims[1]! * width;
    const vec = new Float32Array(width);
    let sumSquares = 0;
    for (let i = 0; i < width; i++) {
      const v = hidden[start + i] ?? 0;
      vec[i] = v;
      sumSquares += v * v;
    }
    const norm = Math.sqrt(sumSquares);
    if (norm > 0) for (let i = 0; i < width; i++) vec[i] = vec[i]! / norm;
    out.push(vec);
  }
  return out;
}

export async function getEmbedder(): Promise<Embedder> {
  const { tokenizer, model } = await load();
  return {
    dimensions: EMBEDDING_DIMENSIONS,
    embed: async (texts: string[]): Promise<Embedded[]> => {
      if (texts.length === 0) return [];
      const inputs = await tokenizer(texts, { padding: true, truncation: true });
      const output = await model(inputs);
      const hidden = output['last_hidden_state'];
      if (!hidden) throw new Error('model returned no last_hidden_state');
      const vectors = poolAndNormalise(hidden.data as Float32Array, hidden.dims as number[]);
      const width = vectors[0]?.length;
      if (width !== EMBEDDING_DIMENSIONS) {
        // Loud, because a silently wrong width would be caught only by the
        // vector(1024) column, and only after a long batch run.
        throw new Error(`expected ${EMBEDDING_DIMENSIONS}-d vectors, model gave ${String(width)}`);
      }

      const mask = inputs['attention_mask'];
      const maskData = mask?.data as BigInt64Array | Int32Array | undefined;
      const perRow = mask ? (mask.dims as number[])[1]! : 0;
      return vectors.map((vector, i) => {
        let tokenCount = 0;
        if (maskData) {
          for (let t = 0; t < perRow; t++) tokenCount += Number(maskData[i * perRow + t] ?? 0);
        }
        return { vector, tokenCount };
      });
    },
  };
}

/** pgvector literal form: `[0.1,0.2,...]`. */
export function toVectorLiteral(vector: Float32Array): string {
  return `[${Array.from(vector).join(',')}]`;
}
