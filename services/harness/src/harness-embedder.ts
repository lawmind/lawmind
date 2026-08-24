/**
 * NEW1 — the ONE place a harness experiment acquires an embedder.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `getEmbedder()` embeds **in-process on the CPU**, because `EMBED_DEVICE`
 * defaults to `cpu` and production has no GPU. That default is right for
 * production and wrong for this workstation, and nothing said so at the call
 * site: every harness CLI in this directory called `getEmbedder()` and every
 * harness experiment therefore burned CPU next to an idle CUDA sidecar. One
 * passage run reached **14,358 CPU-seconds** across ~8 cores, drove the resource
 * gate to `CPU 82.7%`, and pushed the Tier-A walk from 8,800 to ~7,500 tok/s.
 * The experiment was not wrong; the device was, and it was invisible.
 *
 * The sidecar (`services/embed/gpu/server.py`, the same process the walk feeds)
 * is a `POST /embed` away and is already loaded with the same BGE-M3 weights.
 * Using it costs the harness one HTTP hop and costs the CPU nothing.
 *
 * WHAT THIS DOES NOT CHANGE
 * -------------------------
 * The API never routes here. `getRemoteEmbedder` is deliberately not reachable
 * from `getEmbedder()`, and that stays true — a production request must not
 * depend on a machine in this room. This module is for harness processes only.
 *
 * THE VECTORS MUST AGREE, AND THAT IS CHECKED, NOT ASSUMED
 * --------------------------------------------------------
 * A query embedded in a different space from the corpus degrades retrieval
 * silently, with no error anywhere — `embed.ts` records that hazard for
 * quantisation and it applies identically here. So {@link getHarnessEmbedder}
 * does not merely trust the sidecar: on first use it embeds a probe string on
 * the sidecar and compares against the corpus contract (unit norm, 1024-d). A
 * sidecar that answers with the wrong dimensionality or an unnormalised vector
 * is REFUSED, loudly, rather than quietly producing a benchmark that measures
 * the wrong space.
 *
 * FAILURE POLICY: LOUD, NEVER SILENT FALLBACK
 * -------------------------------------------
 * If `EMBED_SIDECAR_URL` is set and the sidecar is unreachable, this THROWS. It
 * does not fall back to the CPU. A silent fallback is precisely the failure this
 * file was written to end: the run would still finish, still produce numbers,
 * and still starve the walk, and nobody would know which of those happened.
 * A caller that genuinely wants the CPU says so by leaving the variable unset.
 */
import {
  getEmbedder,
  getRemoteEmbedder,
  EMBEDDING_DIMENSIONS,
  type Embedder,
} from '@lawmind/embed';

/**
 * Default endpoint: the sidecar the Tier-A walk already runs on this box.
 *
 * Set `EMBED_SIDECAR_URL=` (empty) to opt OUT and take the CPU embedder — the
 * only way to get the old behaviour, and it has to be typed.
 */
export const DEFAULT_SIDECAR_URL = 'http://127.0.0.1:8799';

/** How the embedder was obtained, so a run can record it in its own artefact. */
export type EmbedderProvenance = {
  readonly device: 'gpu-sidecar' | 'cpu-in-process';
  readonly endpoint: string | null;
  /** L2 norm of the probe vector. ~1.0 or the sidecar is not speaking our contract. */
  readonly probeNorm: number | null;
  readonly probeMs: number | null;
};

let cached: { embedder: Embedder; provenance: EmbedderProvenance } | null = null;

/**
 * A short, boring, ASCII probe. Deliberately not legal text: this checks the
 * transport and the vector contract, not the model's opinion about law.
 */
const PROBE = 'the appellant filed a petition under section 482';

/**
 * Acquire the embedder every NEW1 experiment should be using.
 *
 * Cached per process — the sidecar handshake is one request, but a CLI that
 * embeds in a loop should not pay it per call.
 */
export async function getHarnessEmbedder(): Promise<{
  embedder: Embedder;
  provenance: EmbedderProvenance;
}> {
  if (cached) return cached;

  const raw = process.env['EMBED_SIDECAR_URL'];
  const endpoint = raw === undefined ? DEFAULT_SIDECAR_URL : raw.trim();

  if (endpoint.length === 0) {
    const embedder = await getEmbedder();
    cached = {
      embedder,
      provenance: { device: 'cpu-in-process', endpoint: null, probeNorm: null, probeMs: null },
    };
    return cached;
  }

  const embedder = getRemoteEmbedder(endpoint);
  const started = Date.now();
  let probe;
  try {
    probe = await embedder.embed([PROBE]);
  } catch (error) {
    throw new Error(
      `EMBED_SIDECAR_URL is ${endpoint} but the sidecar did not answer: ` +
        `${error instanceof Error ? error.message : String(error)}. ` +
        'Refusing to fall back to the CPU embedder — a silent fallback is how a ' +
        'harness run starves the Tier-A walk without anyone noticing. Start the ' +
        'sidecar, or set EMBED_SIDECAR_URL= (empty) to ask for the CPU on purpose.',
      { cause: error },
    );
  }
  const probeMs = Date.now() - started;

  const vector = probe[0]?.vector;
  if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `sidecar at ${endpoint} returned ${vector?.length ?? 0}-d vectors, corpus is ${EMBEDDING_DIMENSIONS}-d. ` +
        'A benchmark run against a different vector space measures nothing.',
    );
  }
  let sumSquares = 0;
  for (const component of vector) sumSquares += component * component;
  const probeNorm = Math.sqrt(sumSquares);
  if (!Number.isFinite(probeNorm) || Math.abs(probeNorm - 1) > 1e-3) {
    throw new Error(
      `sidecar at ${endpoint} returned a vector with L2 norm ${probeNorm.toFixed(6)}, expected 1.0. ` +
        'The corpus is stored unit-normalised and cosine is computed as an inner ' +
        'product; an unnormalised query silently changes every score.',
    );
  }

  cached = {
    embedder,
    provenance: { device: 'gpu-sidecar', endpoint, probeNorm, probeMs },
  };
  return cached;
}

/**
 * Convenience for the many call sites that only want the embedder.
 *
 * Prefer {@link getHarnessEmbedder} in anything that writes an artefact — the
 * provenance belongs in the artefact, because "which device produced these
 * vectors" is the first question asked of a surprising result.
 */
export async function harnessEmbedder(): Promise<Embedder> {
  return (await getHarnessEmbedder()).embedder;
}
