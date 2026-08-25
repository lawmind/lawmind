/**
 * NEW2 — INDEPENDENT AUDIT OF MY OWN "72 OF 76" CLAIM.
 *
 * NEW3 (bus 1151) says the add-to-matter refusal count is 3, not 76, and that
 * all three are leaked `SYNTHETIC` test fixtures. That directly contradicts the
 * headline of `TREATMENT_PROVENANCE_CONSUMER_CONTRACT_V1`, which I sent to three
 * lanes. A report is a claim, not a fact, so it is re-derived here rather than
 * accepted — and if it holds, three bus messages and a contract need correcting.
 *
 * MY LIKELY ERROR, stated before measuring so the measurement can refute it:
 * I counted `judgments.overruled_status = 'set_aside'` and CALLED it "add-to-
 * matter refusals", because `CLAUDE.md` says `set_aside` disables add-to-matter.
 * But OD-14 resolved on 21 Aug, and the refusal is computed by
 * `precedentialEffectFromEdges` + `precedentialPolicy` from the EDGE, not from
 * the stored column. I asserted a product behaviour from a rule I remembered
 * instead of from the function that implements it.
 *
 * READ ONLY.
 */
import { writeFileSync } from 'node:fs';

import postgres from 'postgres';

import {
  precedentialEffectFromEdges,
  precedentialPolicy,
  type TreatmentEdge,
} from '../../api/src/judgments/precedential-effect.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', {
  max: 1,
  prepare: false,
  statement_timeout: 600_000,
  onnotice: () => {},
});

const COURT_CLASSES = ['COURT_REASONING_EXPLICIT', 'COURT_ORDER_DISPOSITIVE', 'OFFICIAL_REGISTRY_STATUS'];

type Judgment = {
  id: string;
  case_title: string | null;
  court: string | null;
  overruled_status: string;
};

async function main() {
  const badged = await sql<Judgment[]>`
    SELECT id::text, case_title, court, overruled_status
      FROM judgments
     WHERE overruled_status IS NOT NULL AND overruled_status <> 'none'
     ORDER BY id`;
  console.log(`badge-bearing judgments: ${badged.length}`);

  const rows: Record<string, unknown>[] = [];
  for (const j of badged) {
    const edgeRows = await sql<{ relationship: string; treatment_provenance: string | null }[]>`
      SELECT relationship, treatment_provenance
        FROM judgment_citations
       WHERE cited_judgment_id = ${j.id}::uuid AND relationship IS NOT NULL`;
    /* The SHIPPED function, with the SHIPPED edge shape. Restating the policy
     * here in a local switch is how a second wrong number gets made. */
    const edges = edgeRows as unknown as TreatmentEdge[];
    const effect = precedentialEffectFromEdges({
      overruledStatus: j.overruled_status as never,
      edges,
    });
    const policy = precedentialPolicy(effect);
    rows.push({
      id: j.id,
      case_title: j.case_title,
      court: j.court,
      synthetic: (j.case_title ?? '').startsWith('SYNTHETIC'),
      overruled_status: j.overruled_status,
      edges: edgeRows.length,
      adverse_edges: edgeRows.filter((e) =>
        ['overruled', 'overruled_in_part', 'doubted'].includes(e.relationship),
      ).length,
      court_class_edges: edgeRows.filter(
        (e) =>
          ['overruled', 'overruled_in_part', 'doubted'].includes(e.relationship) &&
          e.treatment_provenance !== null &&
          COURT_CLASSES.includes(e.treatment_provenance),
      ).length,
      effect,
      add_to_matter: policy.addToMatter,
      banner_status: policy.bannerStatus,
    });
  }

  const refusals = rows.filter((r) => r['add_to_matter'] === 'refuse');
  const realRefusals = refusals.filter((r) => r['synthetic'] !== true);
  const courtBacked = refusals.filter((r) => (r['court_class_edges'] as number) > 0);

  const byPath = rows.reduce<Record<string, number>>((a, r) => {
    const k = `${String(r['overruled_status']).padEnd(17)} -> ${String(r['effect']).padEnd(18)} -> ${String(r['add_to_matter'])}`;
    a[k] = (a[k] ?? 0) + 1;
    return a;
  }, {});

  console.log('\nstatus -> effect -> add_to_matter:');
  for (const [k, v] of Object.entries(byPath).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }

  console.log('\nADD-TO-MATTER REFUSALS');
  console.log(`  total                                  ${refusals.length}`);
  console.log(`  of those, SYNTHETIC test fixtures      ${refusals.length - realRefusals.length}`);
  console.log(`  REAL judgments refused                 ${realRefusals.length}`);
  console.log(`  refusals backed by a court-class edge  ${courtBacked.length}`);
  for (const r of refusals) {
    console.log(
      `    ${String(r['id']).slice(0, 8)}  ${String(r['case_title']).slice(0, 44).padEnd(44)} ` +
        `status=${r['overruled_status']} effect=${r['effect']} edges=${r['edges']} adverse=${r['adverse_edges']}`,
    );
  }

  const setAsideColumn = rows.filter((r) => r['overruled_status'] === 'set_aside').length;
  console.log(`\nMY CLAIM RE-EXAMINED`);
  console.log(`  overruled_status = 'set_aside'                 ${setAsideColumn}   <- what I counted`);
  console.log(`  add_to_matter = 'refuse'                       ${refusals.length}   <- what the product does`);
  console.log(`  REAL judgments an advocate could be refused    ${realRefusals.length}`);

  writeFileSync(
    'docs/ai/new2/add-to-matter-refusal-audit.json',
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        method:
          'every badge-bearing judgment through the SHIPPED precedentialEffectFromEdges + precedentialPolicy with its real inbound edges',
        badged: badged.length,
        set_aside_column: setAsideColumn,
        refusals: refusals.length,
        refusals_synthetic: refusals.length - realRefusals.length,
        refusals_real: realRefusals.length,
        refusals_court_backed: courtBacked.length,
        by_path: byPath,
        refusal_rows: refusals,
      },
      null,
      2,
    ),
  );
  console.log('\nwrote docs/ai/new2/add-to-matter-refusal-audit.json');
}

try {
  await main();
} finally {
  await sql.end({ timeout: 10 });
}
