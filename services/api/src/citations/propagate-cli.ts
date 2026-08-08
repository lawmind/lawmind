/**
 * `pnpm --filter @lawmind/api propagate [--apply]`
 *
 * Dry by default. It writes the corpus and notifies advocates, so the default
 * has to be the one that does neither, and the evidence phrase for every
 * candidate is printed so a human can read what a regex concluded before a
 * badge is put in front of a lawyer.
 */
import postgres from 'postgres';

import { findUnappliedTreatment, propagateTreatment } from './propagate-treatment.ts';

const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('CORPUS_DATABASE_URL or DATABASE_URL must point at the corpus.');
  process.exit(2);
}

const apply = process.argv.includes('--apply');
const sql = postgres(url, { ssl: url.includes('localhost') ? false : 'require', max: 2 });

try {
  const candidates = await findUnappliedTreatment(sql);

  console.log(
    `${candidates.length} judgments the citation graph says have moved and the corpus still calls good law`,
  );
  console.log('='.repeat(78));

  for (const c of candidates) {
    console.log('');
    console.log(`  ${c.caseTitle}`);
    console.log(`    ${c.relationship} → ${c.toStatus ?? 'SKIPPED'}`);
    console.log(`    by: ${c.citingTitle} (${c.citingDate})`);
    console.log(`    evidence: ${c.evidence ?? '(none recorded)'}`);
    if (c.skipReason) console.log(`    SKIPPED: ${c.skipReason}`);
  }

  console.log('');
  if (!apply) {
    console.log('DRY RUN — nothing written, nobody notified.');
    console.log(
      'Read the evidence above before applying. A wrong `set_aside` disables\n' +
        'add-to-matter and tells an advocate the law moved when it did not.',
    );
    console.log('Re-run with --apply to write.');
  } else {
    const result = await propagateTreatment(sql, { apply: true });
    console.log(
      `applied ${result.applied} · skipped ${result.skipped} · failed ${result.failed} ` +
        `of ${result.found} found`,
    );
    for (const o of result.outcomes) {
      if (o.error) console.log(`  FAILED ${o.caseTitle}: ${o.error}`);
      else if (o.applied) console.log(`  ${o.toStatus}  ${o.caseTitle} (notified ${o.notified})`);
    }
  }
} finally {
  await sql.end();
}
