/**
 * `pnpm --filter @lawmind/ingest treatment:link [--apply] [--only <citation>]`
 *
 * Closes `docs/TREATMENT_MANIFEST_V1.md` §1b — HELD_UNALIASED — by writing
 * `cited_judgment_id` on adverse citation edges whose target is already in the
 * corpus under a different reporter's name.
 *
 * **DRY BY DEFAULT.** `--apply` writes. A wrong resolution points an advocate at
 * the wrong authority and `overruled-cli` would then move the wrong judgment's
 * `overruled_status`, so the report a human reads comes first.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BOUNDED, NOT A CORPUS SCAN — `CLAUDE.md` §P13
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The driving population is the 33 rows of
 *
 *     relationship IN ('overruled','overruled_in_part','doubted')
 *     AND cited_judgment_id IS NULL AND citation_text <> ''
 *
 * and every subsequent read is a primary-key lookup or an index probe on
 * `lawmind_citation_keys(reporter_citations)`. `headnote-dispositions-cli.ts`
 * does the opposite — `full_text LIKE '%– overruled.%'` over 18.6M judgments —
 * which is why that report is not the thing to run while the fleet is up.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT WILL NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * - It never reads a DISPOSITION from the text. The relationship comes from the
 *   `judgment_citations` row that already exists. `headnote-dispositions.ts`'s
 *   own header says the pairing half is sound and the group-boundary half is
 *   not; this uses exactly the half that is.
 * - It never resolves a `(supra)` backreference. Those produce no pairing, so
 *   the Caritas row (`TREATMENT_MANIFEST_V1.md` §0) refuses itself rather than
 *   linking *Lisie Medical Institutions* to itself.
 * - It never overwrites a resolution some earlier pass made.
 * - It calls no model and fetches nothing over the network.
 */
import { writeFileSync } from 'node:fs';

import { openDb } from './db-host.ts';
import { citationKey, harvestPairings, nameAgrees, yearAgrees } from './treatment-link.ts';

const APPLY = process.argv.includes('--apply');
const only = (() => {
  const i = process.argv.indexOf('--only');
  return i === -1 ? undefined : process.argv[i + 1];
})();
const OUT = 'docs/ai/treatment-held-unaliased.json';

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set. Run with `npx tsx --env-file=.env`.');
  process.exit(2);
}

type Edge = {
  id: string;
  citation_text: string;
  normalised_citation: string;
  relationship: string;
  citing_judgment_id: string;
  citing_title: string;
  full_text: string | null;
};

type Outcome = {
  edgeId: string;
  citation: string;
  relationship: string;
  citingTitle: string;
  linked: boolean;
  targetId?: string;
  targetTitle?: string;
  scr?: string;
  printedName?: string;
  jaccard?: number;
  evidence?: string;
  refusal?: string;
};

const sql = await openDb(dbUrl, 2);

try {
  const edges = await sql<Edge[]>`
    SELECT c.id, c.citation_text, c.normalised_citation, c.relationship,
           c.citing_judgment_id, j.case_title AS citing_title, j.full_text
      FROM judgment_citations c
      JOIN judgments j ON j.id = c.citing_judgment_id
     WHERE c.relationship IN ('overruled','overruled_in_part','doubted')
       AND c.cited_judgment_id IS NULL
       AND c.citation_text <> ''
     ORDER BY c.citation_text`;

  console.log(`${edges.length} unresolved adverse edges.${APPLY ? '' : '  DRY RUN — nothing will be written.'}\n`);

  const outcomes: Outcome[] = [];

  for (const e of edges) {
    const key = citationKey(e.citation_text);
    if (only && citationKey(only) !== key) continue;

    const base: Outcome = {
      edgeId: e.id,
      citation: e.citation_text.replace(/\s+/g, ' '),
      relationship: e.relationship,
      citingTitle: e.citing_title,
      linked: false,
    };

    // GUARD 0 — the citing bench must have printed the equivalence itself.
    const pairing = harvestPairings(e.full_text ?? '').find((p) => citationKey(p.alt) === key);
    if (!pairing) {
      outcomes.push({ ...base, refusal: 'no printed SCR pairing for this citation in the citing judgment' });
      continue;
    }

    // GUARD 1 — exactly one target for the S.C.R. key.
    const scrKey = citationKey(pairing.scr);
    const targets = await sql<{ id: string; case_title: string; judgment_date: string | null }[]>`
      SELECT id, case_title, judgment_date::text
        FROM judgments
       WHERE lawmind_citation_keys(reporter_citations) @> ARRAY[${scrKey}::text]
       LIMIT 3`;
    if (targets.length !== 1) {
      outcomes.push({
        ...base,
        scr: pairing.scr,
        printedName: pairing.name,
        refusal: targets.length === 0 ? `target not held (${pairing.scr})` : `${targets.length} judgments carry ${pairing.scr}`,
      });
      continue;
    }
    const target = targets[0]!;

    // GUARD 2 — the name the bench printed must agree with the target's title.
    const verdict = nameAgrees(pairing.name, target.case_title);
    if (!verdict.agrees) {
      outcomes.push({
        ...base,
        scr: pairing.scr,
        printedName: pairing.name,
        targetId: target.id,
        targetTitle: target.case_title,
        jaccard: Number(verdict.jaccard.toFixed(3)),
        refusal: `name disagrees (jaccard ${verdict.jaccard.toFixed(2)}, shared ${verdict.sharedTokens})`,
      });
      continue;
    }

    // GUARD 3 — a report cannot carry a judgment decided after it.
    if (!yearAgrees(pairing.scrYear, target.judgment_date)) {
      outcomes.push({
        ...base,
        scr: pairing.scr,
        printedName: pairing.name,
        targetId: target.id,
        targetTitle: target.case_title,
        refusal: `year window (${pairing.scr} vs ${target.judgment_date})`,
      });
      continue;
    }

    // GUARD 4 — never overwrite. `cited_judgment_id IS NULL` is in the WHERE.
    if (APPLY) {
      await sql`
        UPDATE judgment_citations
           SET cited_judgment_id = ${target.id},
               evidence = coalesce(evidence, '') || ${'\n[treatment-link] ' + pairing.evidence}
         WHERE id = ${e.id} AND cited_judgment_id IS NULL`;
    }

    outcomes.push({
      ...base,
      linked: true,
      targetId: target.id,
      targetTitle: target.case_title,
      scr: pairing.scr,
      printedName: pairing.name,
      jaccard: Number(verdict.jaccard.toFixed(3)),
      evidence: pairing.evidence,
    });
  }

  const linked = outcomes.filter((o) => o.linked);
  for (const o of outcomes) {
    if (o.linked) {
      console.log(`LINK   ${o.citation.padEnd(22)} -> ${o.scr?.padEnd(24)} ${o.targetTitle?.slice(0, 46)}`);
      console.log(`       evidence: ${o.evidence}`);
    } else {
      console.log(`refuse ${o.citation.padEnd(22)} ${o.refusal}`);
    }
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`LINKED ${linked.length} · REFUSED ${outcomes.length - linked.length} of ${outcomes.length}`);
  console.log(APPLY ? 'Written. Run `pnpm --filter @lawmind/ingest overruled --confirm` next.' : 'Nothing written — re-run with --apply.');

  writeFileSync(
    OUT,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), applied: APPLY, total: outcomes.length, linked: linked.length, outcomes },
      null,
      2,
    ),
  );
  console.log(`artifact ${OUT}`);
} finally {
  await sql.end();
}
