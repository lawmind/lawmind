/**
 * BGE-M3 dense embeddings — OD-4's choice, self-hosted, MIT.
 *
 * ONE implementation, used for BOTH the corpus and the query. That is not tidiness:
 * cosine similarity between vectors produced by different builds or precisions of
 * the same model is not meaningful, so a separate "query embedder" would quietly
 * degrade every search. `docs/OSS_STACK.md` puts the batch run on a rented GPU and
 * query-time on Railway CPU — same code, same weights, different hardware.
 *
 * "Different hardware" is why the dtype below is fp32. A quantised build does not
 * survive the trip between those two machines: its vectors depend on the batch it
 * was in and the CPU that computed it. The measurements are recorded at the dtype.
 *
 * Verified against the model, not from memory: `config.json` gives hidden_size
 * 1024 and `1_Pooling/config.json` sets CLS pooling, and a forward pass returns
 * only `last_hidden_state` with dims [batch, tokens, 1024]. So pooling and
 * normalisation happen here.
 */
import { mkdirSync } from 'node:fs';
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
const cacheDir = process.env['MODEL_CACHE_DIR'] ?? defaultCacheDir;

/**
 * Execution provider. **Defaults to CPU, and production must stay there** —
 * Railway has no GPU, so the API's query path has no other option.
 *
 * `dml` (DirectML) drives a local GPU on Windows and is **bundled with
 * `onnxruntime-node`** — `listSupportedBackends()` reports `cpu`, `dml`,
 * `webgpu` with nothing to install. It is for the workstation: corpus
 * re-embedding, harness runs, reranker experiments.
 *
 * **Measured 9 Aug 2026 on an RTX 4060 Ti:** 13.1 ms/chunk against 36.6 ms on
 * CPU — **2.2 hours for all 616,197 chunks instead of 6.3.**
 *
 * **Safe because the vectors agree exactly.** The same three texts, including
 * Devanagari, embedded on both devices at fp32 give **cosine 1.00000000**. That
 * check is the whole reason this is a switch rather than a hazard: `embed.ts`
 * already warns that quantisation makes a vector depend on which processor
 * computed it, and a query landing in a different space from the corpus would
 * degrade retrieval silently, with no error anywhere.
 *
 * **Re-run that comparison before ever changing `dtype` alongside this.** fp32
 * agreement says nothing about fp16 or q8 agreement.
 */
export function embedDevice(): 'cpu' | 'dml' | 'webgpu' {
  const d = process.env['EMBED_DEVICE'];
  return d === 'dml' || d === 'webgpu' ? d : 'cpu';
}

/**
 * Create the cache directory before handing it to transformers.js.
 *
 * **It does not create this itself, and the failure is silent and instant.** With
 * a missing directory it throws "Unable to get model file path or buffer" in
 * under a second — no download attempted, no mention of the path — which reads
 * like a network or model-availability problem and is neither.
 *
 * This cost a production outage. `.models` used to be uploaded with every deploy,
 * so the directory always happened to exist; excluding it from the deploy (right
 * on its own merits — it is 3.8GB the container re-fetches anyway) removed the
 * thing the loader was silently depending on. Dense retrieval then failed on
 * every request while search quietly degraded to lexical-only.
 */
mkdirSync(cacheDir, { recursive: true });
env.cacheDir = cacheDir;

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
      // fp32, not q8. Corpus and query must use the same dtype — see the note at
      // the top of this file — and q8 turned out to be incapable of that.
      //
      // Measured on 48 real corpus chunks, cosine against the same text embedded
      // the other way:
      //   q8, batch 1 vs batch 8, same machine   0.976  <- batch composition
      //   q8, Railway vs Windows, both batch 1   0.977  <- platform
      //   fp16, batch 1 vs batch 4, same machine 0.9999998
      // q8 here is DYNAMIC quantisation: onnxruntime derives activation scales
      // from the observed tensor range at runtime, and that tensor spans the whole
      // batch. So a chunk's vector depends on its neighbours, and on which CPU
      // computed it. A query is embedded alone on Railway; the corpus is embedded
      // in batches on the GPU box. Under q8 those two never agree.
      //
      // fp32 has neither problem and costs nothing at the gate: query-embedding
      // p95 on the Railway CPU is 1200ms for fp32 against 1210ms for q8. fp16 was
      // rejected for the CPU side — it hits a known onnxruntime graph-fusion crash
      // (microsoft/onnxruntime#15531) and is slower than fp32 there anyway,
      // because CPUs cast fp16 up to fp32 to compute (#25824).
      AutoModel.from_pretrained(MODEL_ID, { dtype: 'fp32', device: embedDevice() }),
    ]);
    return { tokenizer, model };
  })();

  /**
   * **A failed load must not be cached forever.**
   *
   * `loading ??=` memoises the promise, which is right for the success case — the
   * model is ~2.2GB and must load once per process. But a REJECTED promise is
   * just as sticky: one transient failure at boot and every later call returns
   * that same rejection, so dense retrieval can never recover without a restart.
   *
   * That is exactly what happened in production. The boot warm failed once while
   * the cache directory was still empty, and search stayed lexical-only
   * afterwards even though the model had since downloaded successfully and was
   * sitting on disk. The next request could have fixed it and never got the
   * chance.
   *
   * Clearing the slot on rejection makes the failure transient rather than
   * terminal: the next caller retries, and a model that becomes reachable is
   * used the moment it does.
   */
  loading.catch(() => {
    loading = undefined;
  });

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

/**
 * Embedder backed by the GPU sidecar in `services/embed/gpu/server.py`.
 *
 * Used ONLY by the batch CLI, and only when `--embed-endpoint` is passed. It is
 * deliberately not reachable from `getEmbedder()`: the API must never acquire a
 * remote embedder by way of a stray environment variable, because a query
 * embedded somewhere other than where the corpus was embedded is the failure this
 * whole module exists to prevent.
 *
 * The sidecar returns vectors already CLS-pooled and L2-normalised. That it agrees
 * with the path serving queries is verified, not assumed — `gpu/verify.py`.
 */
export function getRemoteEmbedder(endpoint: string): Embedder {
  return {
    dimensions: EMBEDDING_DIMENSIONS,
    embed: async (texts: string[]): Promise<Embedded[]> => {
      if (texts.length === 0) return [];
      // Bounded, because an unbounded fetch is how a long run dies quietly: a
      // socket that stalls without erroring leaves the promise pending forever
      // and the process eventually exits with nothing written and no message.
      // Generous enough for the largest judgment in the corpus — 2.9M characters
      // is ~1,200 chunks, well under a minute on the GPU.
      const response = await fetch(`${endpoint.replace(/\/$/, '')}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
        signal: AbortSignal.timeout(Number(process.env['EMBED_TIMEOUT_MS'] ?? 300_000)),
      });
      if (!response.ok) {
        throw new Error(
          `embed sidecar ${response.status}: ${(await response.text()).slice(0, 200)}`,
        );
      }
      const body = (await response.json()) as { vectors: number[][]; tokenCounts: number[] };
      if (body.vectors.length !== texts.length) {
        throw new Error(
          `sidecar returned ${body.vectors.length} vectors for ${texts.length} texts`,
        );
      }
      return body.vectors.map((vector, i) => {
        if (vector.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(
            `expected ${EMBEDDING_DIMENSIONS}-d vectors, sidecar gave ${vector.length}`,
          );
        }
        return { vector: Float32Array.from(vector), tokenCount: body.tokenCounts[i] ?? 0 };
      });
    },
  };
}

/** pgvector literal form: `[0.1,0.2,...]`. */
export function toVectorLiteral(vector: Float32Array): string {
  return `[${Array.from(vector).join(',')}]`;
}
