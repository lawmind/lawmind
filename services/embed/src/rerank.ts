/**
 * Cross-encoder reranking — `BAAI/bge-reranker-v2-m3`, Apache-2.0, self-hosted.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A RERANKER IS FOR, AND THE NUMBER THAT SAYS WE NEED ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A bi-encoder — `embed.ts`, BGE-M3 — turns the query and every chunk into
 * vectors independently, so it never compares them directly. That is what makes
 * it fast enough to run over 616,197 chunks, and it is also its ceiling: the
 * query is summarised into 1024 numbers before it ever meets the passage.
 *
 * A cross-encoder reads the query AND the passage together in one forward pass
 * and scores the pair. Far more accurate, hopelessly too slow for a corpus, and
 * exactly right for reordering twenty candidates.
 *
 * **The Gate S2 baseline says how much room there is.** 8 Aug 2026:
 * success@5 = 24.0% against recall@20 = 44.0%. Twenty points of gold answers
 * are already being retrieved and then ranked 6th to 20th, where no advocate
 * looks. That band is precisely what a reranker recovers, and it bounds the
 * gain honestly: this can move success@5 toward 44%, and it cannot touch the
 * 56% of queries whose answer never appears at all. Those need recall work.
 *
 * **It ships only if it moves that number on our own corpus.**
 * `docs/DATA_ADVANTAGE.md` §1d, recorded before any of this was written.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY QUANTISED HERE WHEN `embed.ts` REFUSES TO BE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `embed.ts` runs fp32 and says why: cosine similarity between vectors produced
 * by different builds or precisions is not meaningful, and the corpus is
 * embedded on a rented GPU while queries are embedded on Railway CPU. Two
 * machines, one vector space.
 *
 * A cross-encoder has no such space. It emits one score per pair, every score
 * in a request is produced by the same process on the same machine in the same
 * batch, and the scores are used only to sort those candidates against each
 * other — never stored, never compared across runs. Quantisation error that
 * would corrupt an embedding is, here, a small perturbation of an ordering.
 *
 * So the default is `q8`. The reason `embed.ts` gives does not apply, and the
 * fp32 build is ~2.2 GB of weights on a container that also holds BGE-M3.
 * `RERANK_DTYPE` overrides it if a measurement ever says otherwise.
 */
import { AutoModelForSequenceClassification, AutoTokenizer } from '@huggingface/transformers';

/** The ONNX conversion. Weights are the Apache-2.0 BAAI model. */
export const RERANKER_MODEL_ID = 'onnx-community/bge-reranker-v2-m3-ONNX';

/**
 * Tokens per (query, passage) pair. The model accepts 8192; this is far lower
 * on purpose — a cross-encoder's cost is quadratic in sequence length, and the
 * candidate passages here are single paragraphs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS THE DOMINANT LATENCY LEVER — MEASURED 9 Aug 2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * On q8/CPU, scoring 20 candidates against a realistic 2,530-character passage:
 *
 *   max_length 512 → **3,613 ms**  (181 ms each) — over Gate S1's 3 s budget
 *   max_length 256 → **1,647 ms**  ( 82 ms each) — inside
 *   max_length 128 → **786 ms**    ( 39 ms each) — comfortably inside
 *
 * **Nothing else came close.** DirectML made it worse (fp32 on a 4060 Ti took
 * 30,539 ms on real passages and nearly exhausted the card), and q8 on DML is
 * slower still because int8 kernels are poorly accelerated there.
 *
 * **The default stays 512 because the ACCURACY cost of truncating is
 * unmeasured.** A cross-encoder that sees half a paragraph may rank it worse,
 * and reranking exists to be accurate — trading that away to hit a latency
 * number would be optimising the wrong thing. **Run the A/B at 256 against the
 * 512 baseline (success@5 23.7%) before changing this.**
 */
const MAX_LENGTH = Number(process.env['RERANK_MAX_LENGTH'] ?? '512');

export type Reranker = {
  /** One score per passage, in the order given. Higher is more relevant. */
  score: (query: string, passages: readonly string[]) => Promise<number[]>;
};

let cached: Promise<Reranker> | null = null;

export function getReranker(): Promise<Reranker> {
  cached ??= load();
  return cached;
}

/**
 * Execution provider for the cross-encoder. **Defaults to CPU.**
 *
 * The reranker is the heaviest CPU burst in an A/B run — it scores 50
 * query-passage pairs per query — and moving it to DirectML both frees the CPU
 * and may lift the memory ceiling: `CURRENT_PLAN` records that **fp32 OOMs**
 * on this machine, and an 8 GB card is a different budget from the ONNX CPU
 * arena.
 *
 * **Default stays CPU deliberately, and MEASUREMENT AGREES — 9 Aug 2026.**
 *
 * Two reasons, and the second was a surprise:
 *
 * 1. The recorded baseline — q8, +6.0 points, McNemar p = 0.210 — was measured
 *    on CPU. A device change can move scores, and switching the default would
 *    silently compare a new arm against an old control.
 * 2. **q8 on DirectML is SLOWER, not faster: 230 ms per passage, 11.5 s to
 *    score one query's 50 candidates.** Int8 kernels are poorly accelerated on
 *    DML — the quantisation that makes this model fit on a CPU is exactly what
 *    stops the GPU helping it. **The opposite of the embedder**, which is fp32
 *    and gains 2.8× on the same card.
 *
 * **So the useful split is: embeddings on DML, reranking on CPU.** Set this to
 * `dml` only alongside `RERANK_DTYPE=fp32`, and only after re-measuring.
 *
 * **fp32 does not currently load at all, and it is NOT the OOM `CURRENT_PLAN`
 * records.** It fails on a missing `onnx/model.onnx_data` — the fp32 build uses
 * ONNX external-data format and only `model.onnx` was ever cached. The
 * companion file exists on the Hub and is fetchable; until it is fetched, fp32
 * is untested rather than broken.
 */
export function rerankDevice(): 'cpu' | 'dml' | 'webgpu' {
  const d = process.env['RERANK_DEVICE'];
  return d === 'dml' || d === 'webgpu' ? d : 'cpu';
}

async function load(): Promise<Reranker> {
  const dtype = (process.env['RERANK_DTYPE'] ?? 'q8') as 'q8' | 'fp32' | 'fp16';
  const device = rerankDevice();

  const [tokenizer, model] = await Promise.all([
    AutoTokenizer.from_pretrained(RERANKER_MODEL_ID),
    AutoModelForSequenceClassification.from_pretrained(RERANKER_MODEL_ID, { dtype, device }),
  ]);

  return {
    async score(query, passages) {
      if (passages.length === 0) return [];

      const inputs = tokenizer(
        passages.map(() => query),
        {
          text_pair: passages as string[],
          padding: true,
          truncation: true,
          max_length: MAX_LENGTH,
        },
      );

      const { logits } = await model(inputs);

      /**
       * One logit per pair, raw. **Deliberately not squashed through a
       * sigmoid.** A sigmoid would produce a number between 0 and 1 that reads
       * like a probability and is not one, and the first thing anyone does with
       * a number like that is threshold it — "show results above 0.5" — which
       * is a relevance judgement the model was never calibrated to make. These
       * scores order candidates against each other and mean nothing alone.
       */
      return Array.from(logits.data as Float32Array);
    },
  };
}
