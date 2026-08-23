/**
 * ONE READ THAT ANSWERS "WHAT IS THIS AUTHORITY'S STANDING", FOR ANY CALLER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `precedential-effect.ts` already centralises the DECISION. What it could not
 * centralise is the READ — the two-query shape that gets you the inputs:
 *
 *   1. `judgments.overruled_status` (+ the paragraphs, + the title for copy),
 *   2. every inbound `judgment_citations.relationship` that changes standing.
 *
 * So every surface wrote that pair itself, and OD-14 had to be applied to each
 * of them separately. It reached `judgments/route.ts`, `matters/authorities.ts`,
 * `search/retrieve.ts` and (later, on NEW3's bus 1018) `briefings/route.ts` —
 * and did NOT reach four more:
 *
 *   * `briefings/assemble.ts` — the generated checklist, which told the
 *     advocate to drop an authority every render surface says is usable;
 *   * `judgments/annotations.ts` — annotating INTO a matter, which is
 *     add-to-matter by another route and refused what `POST
 *     /matters/:id/authorities` allows;
 *   * `documents/route.ts` — citing into a draft;
 *   * `arguments/counter.ts` — which filtered on the BANNER, and the banner for
 *     an overruling is deliberately `set_aside`.
 *
 * Four surfaces, one rule, four answers. The fix is not a fifth copy of the
 * `if`; it is removing the reason to write one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **It does not decide anything.** Every verdict comes from
 * `precedential-effect.ts`, unchanged and unwrapped. This file is a query and a
 * `Map`.
 *
 * **It does not store or cache.** `CITATION_HARNESS.md`: verification is
 * permanent, good-law status is not. Every caller reads it live, every time,
 * including the nightly sweep — a status frozen at 23:00 is the stale-overruled
 * failure the harness grades as severely as a hallucination.
 *
 * **It does not widen the wire.** It returns the three layers as they already
 * are; what each surface sends is that surface's contract.
 *
 * **It does not invent an affected paragraph.** `overruledParas` is passed
 * through exactly as stored, and `scope` is `UNRESOLVED` when nothing was
 * recorded — never a guess at which propositions fell.
 */
import type { Sql } from 'postgres';

import {
  precedentialEffect,
  precedentialPolicy,
  treatmentScope,
  unappliedTreatment,
  type OverruledStatus,
  type PrecedentialEffect,
  type PrecedentialPolicy,
  type TreatmentRelationship,
  type TreatmentScope,
} from './precedential-effect.ts';

/** The relationships that change standing. The only ones worth reading. */
const STANDING_RELATIONSHIPS = ['overruled', 'overruled_in_part', 'doubted'] as const;

export type PrecedentialState = {
  judgmentId: string;
  caseTitle: string;
  /** The raw column. Admin, telemetry and the `basis` line — never a decision. */
  storedStatus: OverruledStatus;
  /** Layer 2 — what actually happened, in five values rather than four. */
  effect: PrecedentialEffect;
  /** Layer 3 — what the product does. The only thing a caller should branch on. */
  policy: PrecedentialPolicy;
  /** How much of the judgment the treatment reached. Never invented. */
  scope: TreatmentScope;
  /** Exactly as stored. Null and empty both mean "nothing was recorded". */
  overruledParas: number[] | null;
  /** A verified adverse edge the corpus has not applied. Reported, never acted on. */
  unapplied: TreatmentRelationship | null;
};

/**
 * Every id you asked about, or fewer.
 *
 * A judgment that has no row is ABSENT from the map rather than defaulted to
 * `none`. The two are different facts and only the caller knows which of its
 * surfaces may show a missing authority and which must refuse — `briefings/
 * route.ts` renders it as unavailable and explicitly does not drop it, which is
 * a decision a shared loader has no business making on its behalf.
 */
export async function loadPrecedentialState(
  sql: Sql,
  judgmentIds: readonly string[],
): Promise<Map<string, PrecedentialState>> {
  const out = new Map<string, PrecedentialState>();
  const ids = [...new Set(judgmentIds)];
  if (ids.length === 0) return out;

  const rows = await sql<
    {
      id: string;
      case_title: string;
      overruled_status: string;
      overruled_paras: number[] | null;
    }[]
  >`
    SELECT id, case_title, overruled_status, overruled_paras
      FROM judgments
     WHERE id = ANY(${ids}::uuid[])`;

  /* One batched edge read for the whole set, the same shape and for the same
   * reason as `search/route.ts`: a per-authority round trip inside a request
   * that already re-read every judgment is how a wedge screen gets slow. */
  const edges = await sql<{ cited_judgment_id: string; relationship: string }[]>`
    SELECT DISTINCT cited_judgment_id, relationship
      FROM judgment_citations
     WHERE cited_judgment_id = ANY(${ids}::uuid[])
       AND relationship IN ${sql(STANDING_RELATIONSHIPS)}`;

  const inboundById = new Map<string, string[]>();
  for (const e of edges) {
    const list = inboundById.get(e.cited_judgment_id);
    if (list) list.push(e.relationship);
    else inboundById.set(e.cited_judgment_id, [e.relationship]);
  }

  for (const r of rows) {
    const input = {
      overruledStatus: r.overruled_status as OverruledStatus,
      inboundRelationships: inboundById.get(r.id) ?? [],
    };
    const effect = precedentialEffect(input);
    out.set(r.id, {
      judgmentId: r.id,
      caseTitle: r.case_title,
      storedStatus: input.overruledStatus,
      effect,
      policy: precedentialPolicy(effect),
      scope: treatmentScope({ effect, overruledParas: r.overruled_paras }),
      overruledParas: r.overruled_paras,
      unapplied: unappliedTreatment(input),
    });
  }

  return out;
}

/** The single-judgment case, so a caller does not build a one-element array. */
export async function loadOnePrecedentialState(
  sql: Sql,
  judgmentId: string,
): Promise<PrecedentialState | undefined> {
  return (await loadPrecedentialState(sql, [judgmentId])).get(judgmentId);
}
