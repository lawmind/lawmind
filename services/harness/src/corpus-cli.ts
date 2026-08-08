/**
 * `pnpm --filter @lawmind/harness corpus` — what the corpus can and cannot
 * answer, before anyone writes a query against it.
 *
 * Separate from the runner on purpose. The runner's job is to grade; this one's
 * job is to tell you whether grading would mean anything, and it is the thing
 * you run first when a harness number looks surprising.
 */
import postgres from 'postgres';

import { assessReadiness, countCorpus, explainRefusal } from './corpus-readiness.ts';

const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!url) {
  console.error('CORPUS_DATABASE_URL is not set. It must point at a populated corpus.');
  process.exit(2);
}

const sql = postgres(url, { ssl: url.includes('localhost') ? false : 'require', max: 2 });

try {
  const counts = await countCorpus(sql);
  const verdict = assessReadiness(counts);

  for (const [k, v] of Object.entries(counts)) {
    console.log(`${k.padEnd(20)} ${v.toLocaleString('en-IN')}`);
  }
  console.log('');
  console.log(verdict.ready ? 'READY — the harness can run against this database.' : '');
  if (!verdict.ready) console.log(explainRefusal(verdict));
} finally {
  await sql.end();
}
