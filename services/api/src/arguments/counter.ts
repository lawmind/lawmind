/**
 * `POST /arguments/counter` — `docs/API_CONTRACTS.md` §Counter-arguments.
 *
 * Backs screen 07. An advocate states their position; this returns the
 * authorities the other side is likely to reach for, and what answers them.
 *
 * **Grounded only.** Candidate authorities come from hybrid retrieval over our
 * own corpus, so every one carries a `judgment_id` that resolves. Nothing here
 * invents a citation, and when generation is added in S2 the model will receive
 * these IDs in context and may reference only them — `docs/CITATION_HARNESS.md`
 * step 2. In S1 the endpoint returns the retrieved authorities themselves, which
 * is the honest half: real opposing authority, no manufactured argument text.
 *
 * **`set_aside` authorities are EXCLUDED and shown as excluded, with the
 * reason.** Silently dropping them would be a silent drop, measured at a zero
 * threshold. An advocate needs to know an authority exists and is dead — that
 * is often the strongest answer to it.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';
import { hybridSearch } from '../search/retrieve.ts';

export const counterRequest = z.object({
  position: z.string().min(1).max(2000),
  matterId: z.string().uuid().optional(),
  language: z.enum(['en', 'hi']).default('en'),
});

export type CounterDeps = {
  /**
   * The CORE handle. Used for the citation_checks writes and nothing expensive.
   */
  sql: Sql;
  /**
   * The pool the RANKER runs on, and the reason this type gained a field.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * P1's ISOLATION WAS WIRED INTO ONE CALLER, AND THIS WAS THE OTHER ONE
   * ─────────────────────────────────────────────────────────────────────────
   *
   * `/search` acquires an admission slot and runs its rankers on
   * `deps.researchSql` — `search/route.ts` §"The pool the rankers run on", and
   * `pools.ts` §"The core statement ceiling", which says in as many words that
   * *nothing on the core path should take ten seconds*.
   *
   * **This route ran the SAME `hybridSearch` on the core pool with no admission
   * slot.** So a counter-argument request took a connection out of the pool that
   * `P1.3` protects for auth, save-to-matter, exact citation and judgment reads
   * — the exact starvation `P1.4` measured (core p95 2,809 ms → 69 ms) and fixed
   * for `/search` only. And because it never touched the admission gate, any
   * number of them could be in flight at once.
   *
   * It is the same failure family as OD-14 being wired into one caller, and as
   * NEW2's date states having zero consumers: a rule implemented at one call
   * site is a rule the second call site does not have.
   *
   * Optional, and it falls back to `sql`, so every existing caller — tests, the
   * harness, the benchmark — keeps working unchanged. Production passes both.
   */
  researchSql?: Sql | undefined;
  /**
   * The same concurrency gate `/search` uses. Optional for the same reason.
   * When present and full, this route REFUSES rather than queueing behind an
   * unknown wait, which is what `startJob` does for generation and what an
   * advocate can actually act on.
   */
  admission?: { acquire: () => Promise<{ release: () => void } | null> } | undefined;
  embedQuery: (text: string) => Promise<string | null>;
};

const CANDIDATES = 12;

export async function handleCounter(
  c: Context,
  deps: CounterDeps,
  body: z.infer<typeof counterRequest>,
): Promise<Response> {
  const asOf = new Date().toISOString();

  // Refused, never queued invisibly — see `admission` on CounterDeps.
  const slot = deps.admission ? await deps.admission.acquire() : null;
  if (deps.admission && slot === null) {
    return fail(
      c,
      'RESEARCH_BUSY',
      'Research capacity is full. This is a deliberate bound, not an outage — nothing ' +
        'was charged and the request can be retried.',
      429,
    );
  }

  let retrieved;
  try {
    const queryVector = await deps.embedQuery(body.position);
    // The RESEARCH pool, falling back to core for callers that pass only one.
    retrieved = await hybridSearch(
      deps.researchSql ?? deps.sql,
      body.position,
      queryVector,
      {},
      CANDIDATES,
    );
  } finally {
    slot?.release();
  }

  const usable = retrieved.filter((r) => r.overruledStatus !== 'set_aside');
  const excluded = retrieved.filter((r) => r.overruledStatus === 'set_aside');

  // One citation_checks row per citation per surface, for BOTH lists. The
  // excluded ones are rendered too — as exclusions — so they are shown to the
  // user and must be recorded, or silent-drop rate stops measuring anything.
  const all = [...usable, ...excluded];
  if (all.length > 0) {
    await deps.sql`
      INSERT INTO citation_checks ${deps.sql(
        all.map((r) => ({
          search_id: null,
          citation_claimed: r.neutralCitation ?? r.reporterCitations[0] ?? r.caseTitle,
          judgment_id_matched: r.judgmentId,
          verification_state: 'verified',
          verified_by_source: 'corpus',
          shown_to_user: true,
          overruled_status_shown: r.overruledStatus,
          surface: 'draft',
        })),
      )}
    `;
  }

  return ok(c, {
    position: body.position,
    asOf,
    /**
     * Authorities the opposing side can reach for. `argument` and `rebuttal` are
     * absent in S1 rather than filled with generated prose — a manufactured
     * argument beside a real citation is exactly the contamination the harness
     * exists to prevent, and generation waits for S2.
     */
    authorities: usable.map((r) => ({
      judgmentId: r.judgmentId,
      caseTitle: r.caseTitle,
      neutralCitation: r.neutralCitation,
      court: r.court,
      judgmentDate: r.judgmentDate,
      operativeParagraph: r.operativeParagraph,
      operativeParagraphNumber: r.operativeParagraphNumber,
      operativeParagraphVerified: r.operativeParagraphVerified,
      exactSpan: r.exactSpan,
      // P0. `evidenceWithheld` means the passage fields above are empty BY
      // REFUSAL, not by absence — this judgment's body text is convicted, so
      // nothing in it may be handed to an advocate as evidence or to a model as
      // grounding. The authority is still named: its identity fields are
      // undamaged. `state` is the contract's own vocabulary and never says
      // "clean", because nothing in this corpus ever proved that.
      bodyText: r.bodyText,
      verificationState: 'verified' as const,
      verifiedBySource: 'corpus' as const,
      overruledStatus: r.overruledStatus,
      overruledParas: r.overruledParas,
      // Found missing 11 Aug 2026 (RCC bus 0037): retrieve.ts selects both on
      // every row, `excluded[]` already carried them, but `authorities[]` did
      // not — so a partly_set_aside authority here rendered its headline with
      // no "what still stands" line, the half renderState.ts says must come
      // first for the advocate about to argue against it.
      overruledByJudgmentId: r.overruledByJudgmentId,
      overruledNote: r.overruledNote,
      asOf,
    })),
    /** Named, never dropped. `set_aside` is the one state that disables use. */
    excluded: excluded.map((r) => ({
      judgmentId: r.judgmentId,
      caseTitle: r.caseTitle,
      neutralCitation: r.neutralCitation,
      reason: 'set_aside' as const,
      overruledByJudgmentId: r.overruledByJudgmentId,
      overruledNote: r.overruledNote,
      asOf,
    })),
    // Never empty-by-omission. Nothing can be unresolved in S1 because results
    // ARE corpus rows, but the key is always present so the client never has to
    // distinguish "absent" from "none".
    unverifiedReferences: [],
  });
}
