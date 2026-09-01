/**
 * The derived precedential layers for a page of judgment ids, in ONE query.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MOVED HERE FROM `search/route.ts`, UNCHANGED — LCC R19
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It was written for `/search`'s structured path and its argument was already
 * general: *"the structured path rendered `overruled_status` raw while hybrid
 * search rendered it derived, so the SAME judgment carried different
 * currentness depending on how it was found."* A second surface that lists
 * judgments — `statutes/linked-judgments.ts` — makes that argument load-bearing
 * for a third time, and the only way to keep one judgment carrying one
 * currentness on every surface is for every surface to call the SAME function.
 *
 * So this is a MOVE, not a copy. `search/route.ts` now imports it and no logic
 * changed in the move: the query, the edge relationships, the policy call and
 * the returned shape are byte-identical to what it ran before. A hand-derived
 * second copy is exactly what `docs/CITATION_HARNESS.md` forbids — good-law
 * status is read live, from the row, through one policy layer.
 */
import type { Sql } from 'postgres';

import {
  precedentialPolicy,
  unappliedTreatment,
  type OverruledStatus,
  attributionOf,
  precedentialEffectFromEdges,
  type TreatmentEdge,
  type TreatmentAttribution,
  type TreatmentProvenance,
} from './precedential-effect.ts';

export type DerivedEffect = {
  banner: OverruledStatus;
  effect: string;
  canAdd: boolean;
  unapplied: string | null;
  /** WHO the adverse treatment came from. Governs wording, never the banner. */
  attribution: TreatmentAttribution;
};

/**
 * One batched, indexed read over at most a page of ids; never one per result.
 */
export async function derivedEffects(
  sql: Sql,
  hits: readonly { judgmentId: string; overruledStatus: string }[],
): Promise<Map<string, DerivedEffect>> {
  const out = new Map<string, DerivedEffect>();
  if (hits.length === 0) return out;
  const edges = await sql<
    { cited_judgment_id: string; relationship: string; treatment_provenance: string | null }[]
  >`
    SELECT DISTINCT cited_judgment_id, relationship, treatment_provenance
      FROM judgment_citations
     WHERE cited_judgment_id = ANY(${hits.map((h) => h.judgmentId)})
       AND relationship IN ('overruled', 'overruled_in_part', 'doubted')`;
  const byId = new Map<string, TreatmentEdge[]>();
  for (const e of edges) {
    const edge: TreatmentEdge = {
      relationship: e.relationship,
      provenance: e.treatment_provenance as TreatmentProvenance | null,
    };
    const list = byId.get(e.cited_judgment_id);
    if (list) list.push(edge);
    else byId.set(e.cited_judgment_id, [edge]);
  }
  for (const h of hits) {
    const inbound = byId.get(h.judgmentId) ?? [];
    const overruledStatus = h.overruledStatus as OverruledStatus;
    const effect = precedentialEffectFromEdges({ overruledStatus, edges: inbound });
    const policy = precedentialPolicy(effect);
    out.set(h.judgmentId, {
      banner: policy.bannerStatus,
      effect,
      canAdd: policy.addToMatter === 'allow',
      /* `unappliedTreatment` keeps taking bare relationships: it answers "is
       * there an adverse edge the corpus has NOT applied", and a defective edge
       * is still an edge somebody should look at. Narrowing it here would hide
       * the exact rows most worth reviewing. */
      unapplied: unappliedTreatment({
        overruledStatus,
        inboundRelationships: inbound.map((e) => e.relationship),
      }),
      attribution: attributionOf(inbound),
    });
  }
  return out;
}
