export {
  getEmbedder,
  // Additive re-export. `getRemoteEmbedder` already existed and was reachable
  // only by deep path, so every harness experiment silently fell to the CPU
  // embedder while a CUDA sidecar sat idle beside it — 14,358 CPU-seconds on one
  // run, which is what starved the walk. The API still never calls it: choosing
  // the sidecar is an explicit act by a caller that has one.
  getRemoteEmbedder,
  toVectorLiteral,
  EMBEDDING_DIMENSIONS,
  MODEL_ID,
  embedDevice,
} from './embed.ts';
export type { Embedder, Embedded } from './embed.ts';
export { chunkJudgment, defaultChunkOptions } from './chunk.ts';
export { textQuality } from './quality.ts';
export type { Chunk, ChunkOptions } from './chunk.ts';
export { getReranker, RERANKER_MODEL_ID, rerankDevice } from './rerank.ts';
export type { Reranker } from './rerank.ts';
