/**
 * GPU-ready manifests of VERIFIED legal objects — LEVEL B, for NEW1.
 *
 *   pnpm --filter @lawmind/embed run legal-object-manifest -- \
 *     [--kind holding|issue|proposition|all] [--batch 5000]
 *     [--out DIR] [--min-chars 40] [--force]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS SHIPS WHILE THE POPULATION IS STILL SMALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * There are hundreds of verified objects today, not millions. Building the
 * manifest now is the point: NEW1 cannot answer "what is the minimum useful
 * vector multiplier" without being able to compare
 *
 *     document vectors only
 *     document + holding
 *     document + holding + issue/proposition
 *
 * and that comparison needs the three populations to be independently
 * addressable from the day the first one exists. Waiting until millions exist
 * means measuring the multiplier after committing to it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONLY `verified: true` — WHICH IS SPAN VERIFICATION, AND NOT THE WHOLE LADDER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **This section previously called span verification "THE PROMOTION BOUNDARY".
 * It is a boundary, and it is not the only one.** Corrected 20 Aug 2026 against
 * a measurement, not against an opinion — everything below it still holds.
 *
 * DeepSeek generates candidates; evidence validation promotes them. A claim is
 * `verified` when its evidence span was found VERBATIM in the source text — not
 * when the model was confident, and not when the enrichment row as a whole
 * graded well.
 *
 * That defeats FABRICATION, which is what the rest of this header is about and
 * is the risk it was written to stop. It does **not** establish that the span
 * plays the ROLE it is filed under. Measured on this factory's own model, two
 * independent runs over one document agree on the role label **81.0%** of the
 * time — and only **87.6%** when both runs' spans verify
 * (`docs/ai/MODEL_CLASSIFICATION_1K_AUDIT.md`). A verified quotation filed as a
 * holding may be a party's contention, and it will read perfectly either way.
 *
 * Migration 0064 names the ladder: `MODEL_PROPOSED → SPAN_VERIFIED →
 * SEMANTIC_ROLE_VERIFIED → CANONICAL_TRUSTED`. **Nothing has passed the third
 * rung.** So `manifest.json` now stamps `trustLevel: 'SPAN_VERIFIED'` and says
 * in the artifact what that does and does not mean.
 *
 * **Why this still emits rows rather than zero.** These vectors feed RETRIEVAL
 * RANKING. A proposition filed under the wrong role is a slightly worse nearest
 * neighbour — recoverable and invisible to the advocate. The unrecoverable act
 * is showing such a span TO an advocate as the court's holding, and nothing
 * downstream of this manifest does that. Emitting zero would end the
 * vector-multiplier comparison this file exists for and buy no safety on the
 * path that actually carries risk. The stamp is what keeps the two uses apart.
 *
 * The unit is the CLAIM, never the enrichment row. A `partial` row can hold six
 * verified claims and one fabricated one; taking the row would embed the
 * fabrication, and rejecting the row would discard six sound objects. Measured
 * on this corpus, claim-level verification runs at ~50-84% depending on the
 * pool, so the difference between the two policies is most of the data.
 *
 * `docs/ai/CITATION_CONCORDANCE_EVALUATION.md` is why the boundary is not
 * negotiable: the same model, asked to answer where the corpus was silent,
 * invented an authority 10.8% of the time and was confident about half of them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY LINE CARRIES ITS EVIDENCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `evidence` is the exact span from the judgment that justified the object, and
 * `judgmentId` says which judgment. A vector whose provenance stops at "a model
 * said so" cannot be audited after it starts influencing what an advocate reads.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import postgres, { type Sql } from 'postgres';

import type { JobClass } from '../../../scripts/resource-gate.d.mts';
import { sslFor } from './db-ssl.ts';
import { CONTRACT_VERSION } from './eligibility.ts';

/**
 * Claim `kind` → the staging `representation_type` it becomes.
 *
 * EXPLICIT, and anything absent is SKIPPED rather than guessed into the nearest
 * bucket. `relief_granted`, `fact`, `procedural_history`, `argument_respondent`
 * and the rest are real objects and are not Level B semantic units — filing them
 * under `proposition` because the map had no better slot would put procedural
 * chatter into the population whose whole purpose is to carry legal meaning.
 *
 * `reasoning` maps to `proposition`: a reasoning step IS a legal proposition,
 * and `document_vector_staging` has no separate `reasoning` type. When it
 * acquires one, this line is where it changes.
 */
const KIND_TO_REPRESENTATION: Readonly<Record<string, 'holding' | 'issue' | 'proposition'>> = {
  holding: 'holding',
  issue: 'issue',
  proposition: 'proposition',
  reasoning: 'proposition',
  reasoning_proposition: 'proposition',
};

const KINDS = ['holding', 'issue', 'proposition'] as const;
type Representation = (typeof KINDS)[number];

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

type ObjectRow = {
  enrichmentId: string;
  judgmentId: string;
  claimIndex: number;
  kind: string;
  text: string;
  evidence: string | null;
  label: string | null;
  task: string;
  model: string;
  promptVersion: string;
  sourceTextHash: string | null;
  court: string | null;
  judgmentYear: number | null;
  createdAt: string;
};

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

/**
 * One keyset page of verified claims.
 *
 * `jsonb_array_elements WITH ORDINALITY` gives each claim a stable index within
 * its enrichment, which is what makes `(enrichmentId, claimIndex)` a durable
 * identity — a claim has no id of its own, and using its text as the key would
 * merge two genuinely different objects that happen to be worded identically.
 *
 * Keyset on `e.id`, so the walk is one index descent per page. The claim index
 * is not part of the cursor because pages break on enrichment boundaries: an
 * enrichment's claims are all emitted together or not at all.
 */
async function page(
  sql: Sql,
  cursor: string | null,
  limit: number,
  minChars: number,
): Promise<ObjectRow[]> {
  return sql<ObjectRow[]>`
    SELECT
      e.id                                   AS "enrichmentId",
      e.judgment_id                          AS "judgmentId",
      (c.ord - 1)::int                       AS "claimIndex",
      c.claim->>'kind'                       AS kind,
      c.claim->>'value'                      AS text,
      c.claim->>'evidence'                   AS evidence,
      c.claim->'extra'->>'label'             AS label,
      e.task,
      e.model,
      e.prompt_version                       AS "promptVersion",
      e.source_text_hash                     AS "sourceTextHash",
      j.court,
      EXTRACT(YEAR FROM j.judgment_date)::int AS "judgmentYear",
      e.created_at                           AS "createdAt"
    FROM document_enrichments e
    JOIN judgments j ON j.id = e.judgment_id
    CROSS JOIN LATERAL jsonb_array_elements(e.parsed_output->'claims') WITH ORDINALITY AS c(claim, ord)
    WHERE e.status = 'ok'
      AND e.parsed_output ? 'claims'
      -- The promotion boundary, and the only one. Claim-level, never row-level.
      AND (c.claim->>'verified')::boolean IS TRUE
      AND c.claim->>'kind' = ANY(${Object.keys(KIND_TO_REPRESENTATION)})
      -- A three-word "holding" is not a semantic unit; it is a fragment that
      -- will sit near everything in vector space. Bounded rather than dropped
      -- silently: the threshold is a flag and the count of what it removed is
      -- reported.
      AND length(coalesce(c.claim->>'value', '')) >= ${minChars}
      ${cursor ? sql`AND e.id > ${cursor}::uuid` : sql``}
    ORDER BY e.id, c.ord
    LIMIT ${limit}
  `;
}

async function main(): Promise<number> {
  const want = (flag('--kind') ?? 'all') as Representation | 'all';
  if (want !== 'all' && !KINDS.includes(want)) {
    console.error('--kind must be one of ' + KINDS.join(', ') + ', or all');
    return 2;
  }
  const batchSize = num('--batch', 5000);
  const minChars = num('--min-chars', 40);
  const outDir = flag('--out') ?? join('docs', 'ai', 'embedding-manifests', 'legal-objects');

  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL unset');
    return 2;
  }

  // The verified population is small and the walk is bounded by it, so this is
  // LIGHT rather than DB_SCAN — it never touches `full_text`.
  const verdict = await gate('LIGHT');
  if (!verdict.allow && !has('--force')) {
    console.error('DEFER LIGHT — not running.');
    for (const r of verdict.reasons) console.error('  - ' + r);
    return 3;
  }

  const sql = postgres(url, { ssl: sslFor(url), max: 2, onnotice: () => {}, idle_timeout: 0 });
  try {
    /** One accumulator per representation. They are separate POPULATIONS. */
    const buckets = new Map<Representation, string[]>(KINDS.map((k) => [k, []]));
    const counts = new Map<Representation, number>(KINDS.map((k) => [k, 0]));
    const judgmentsSeen = new Map<Representation, Set<string>>(KINDS.map((k) => [k, new Set()]));

    let cursor: string | null = null;
    let scanned = 0;
    let skippedShort = 0;

    for (;;) {
      const rows = await page(sql, cursor, batchSize, minChars);
      if (rows.length === 0) break;
      scanned += rows.length;

      for (const r of rows) {
        const rep = KIND_TO_REPRESENTATION[r.kind];
        if (!rep) continue;
        if (want !== 'all' && rep !== want) continue;
        const text = (r.text ?? '').trim();
        if (text.length < minChars) {
          skippedShort += 1;
          continue;
        }
        buckets.get(rep)!.push(
          JSON.stringify({
            // Durable identity for a thing that has no id of its own.
            objectId: r.enrichmentId + ':' + r.claimIndex,
            enrichmentId: r.enrichmentId,
            claimIndex: r.claimIndex,
            representationType: rep,
            // What gets embedded.
            text,
            // The exact span from the judgment that justified it. A vector whose
            // provenance stops at "a model said so" cannot be audited later.
            evidence: r.evidence,
            label: r.label,
            judgmentId: r.judgmentId,
            court: r.court,
            year: r.judgmentYear,
            // Model/prompt provenance, carried per object rather than per run:
            // a manifest can span several prompt versions as the factory moves.
            sourceTask: r.task,
            model: r.model,
            promptVersion: r.promptVersion,
            sourceTextHash: r.sourceTextHash,
          }),
        );
        counts.set(rep, counts.get(rep)! + 1);
        judgmentsSeen.get(rep)!.add(r.judgmentId);
      }

      cursor = rows[rows.length - 1]!.enrichmentId;
      if (rows.length < batchSize) break;
    }

    mkdirSync(outDir, { recursive: true });
    const written: Record<string, unknown> = {};

    for (const rep of KINDS) {
      if (want !== 'all' && rep !== want) continue;
      const lines = buckets.get(rep)!;
      const file = join(outDir, rep + 's.jsonl');
      writeFileSync(file, lines.length > 0 ? lines.join('\n') + '\n' : '');
      written[rep] = {
        rows: lines.length,
        distinctJudgments: judgmentsSeen.get(rep)!.size,
        // Over the lines IN ORDER. Reproducible against unchanged data, which is
        // what lets a measured figure name the population it was measured on.
        contentHash: createHash('sha256').update(lines.join('\n')).digest('hex'),
        file,
      };
    }

    const summary = {
      kind: 'legal_object_manifest',
      contractVersion: CONTRACT_VERSION,
      /**
       * Level B. Level A is `document-vector-batch-cli.ts`; Level C (SELECTED
       * paragraphs, never all of them) does not exist yet.
       */
      level: 'B',
      /**
       * **The trust level of every object in this manifest — stamped, so no
       * consumer can mistake what it is holding.**
       *
       * `SPAN_VERIFIED` (migration 0064) means the quoted evidence occurs
       * verbatim in the source judgment. It does **not** mean the span is the
       * holding, the issue, or the proposition it is filed under. Measured on
       * this factory's own model, two independent runs over one document produce
       * the same role label only **81.0%** of the time — and only 87.6% even
       * when both runs' spans verify. Span verification defeats FABRICATION,
       * which is what this file's header was written about and remains true. It
       * does not establish ROLE, which is a separate question nothing has
       * answered yet.
       *
       * **Why the manifest ships at SPAN_VERIFIED rather than emitting zero.**
       * These vectors feed RETRIEVAL RANKING. A proposition filed under the
       * wrong role makes a slightly worse nearest neighbour — recoverable, and
       * invisible to the advocate. The unrecoverable act is presenting such a
       * span TO an advocate as the court's holding, and nothing downstream of
       * this manifest does that. Emitting zero today would end NEW1's
       * vector-multiplier comparison — the reason this file ships early — and
       * buy no safety on the path that actually carries risk.
       *
       * The stamp is what keeps those two uses separable. A consumer that wants
       * to ASSERT a holding must wait for `SEMANTIC_ROLE_VERIFIED` and can now
       * tell, from the manifest itself, that it is not looking at one.
       */
      trustLevel: 'SPAN_VERIFIED',
      trustLevelMeans:
        'The evidence span occurs verbatim in the source judgment. NOT that the span ' +
        'is the holding/issue/proposition it is filed under — same-document role ' +
        'agreement across two independent model runs is 81.0%. Safe for retrieval ' +
        'ranking; NEVER sufficient to assert a holding to a user.',
      claimsScanned: scanned,
      skippedTooShort: skippedShort,
      minChars,
      populations: written,
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(summary, null, 2) + '\n');

    console.log('LEGAL OBJECT MANIFEST — trustLevel SPAN_VERIFIED');
    console.log(
      '  the span is real; the ROLE is not verified. Retrieval ranking only —\n' +
        '  never sufficient to assert a holding to a user. See manifest.json.',
    );
    console.log('claims scanned      ' + scanned.toLocaleString());
    console.log(
      'skipped, too short  ' + skippedShort.toLocaleString() + '  (< ' + minChars + ' chars)',
    );
    for (const rep of KINDS) {
      const w = written[rep] as { rows: number; distinctJudgments: number } | undefined;
      if (w)
        console.log(
          rep.padEnd(20) +
            String(w.rows).padStart(7) +
            '  over ' +
            w.distinctJudgments +
            ' judgments',
        );
    }
    console.log('wrote ' + outDir);
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
