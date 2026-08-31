/**
 * LCC R15-F1 — MEASUREMENT ONLY. After the correction, 294 of NEW2's 472
 * would-be-`UNIQUE` rows still declare zero matters. A residual that is not
 * looked at is a residual that gets described from memory next round, so this
 * prints the cause titles themselves, grouped by court.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

import { CAUSE_TITLE_CHARS, declaredCohort } from '../services/api/src/citations/cohort.ts';

const sql = postgres(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20, connect_timeout: 20 });

const rows = readFileSync('docs/ai/new2-r15/falsifier-adjudicated.jsonl', 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l) as { resolverState: string; pinned: string | null })
  .filter((r) => r.resolverState === 'UNIQUE' && r.pinned);

const ids = [...new Set(rows.map((r) => r.pinned!))];
const heads = new Map<string, { court: string; head: string | null }>();
for (let i = 0; i < ids.length; i += 200) {
  const got = await sql<{ id: string; court: string; head: string | null }[]>`
    SELECT id::text, court, left(full_text, ${CAUSE_TITLE_CHARS}) AS head
      FROM judgments WHERE id = ANY(${ids.slice(i, i + 200)}::uuid[])`;
  for (const g of got) heads.set(g.id, { court: g.court, head: g.head });
}

const byCourt = new Map<string, { zero: number; read: number; samples: string[] }>();
for (const id of ids) {
  const h = heads.get(id);
  if (!h) continue;
  const d = declaredCohort(h.head);
  const e = byCourt.get(h.court) ?? { zero: 0, read: 0, samples: [] };
  if (d.declaredMatters === 0) {
    e.zero++;
    if (e.samples.length < 3) {
      e.samples.push((h.head ?? '').split(/\r?\n/).slice(0, 6).join(' | '));
    }
  } else e.read++;
  byCourt.set(h.court, e);
}

const sorted = [...byCourt.entries()].sort((a, b) => b[1].zero - a[1].zero);
for (const [court, e] of sorted) {
  console.log(`\n${court}   zero ${e.zero}  read ${e.read}`);
  for (const s of e.samples) console.log('   ', s.slice(0, 190));
}

mkdirSync('docs/ai/lcc-r15f1', { recursive: true });
writeFileSync(
  'docs/ai/lcc-r15f1/residual-blind.json',
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      distinctPinnedJudgments: ids.length,
      byCourt: Object.fromEntries(sorted.map(([c, e]) => [c, { zero: e.zero, read: e.read, samples: e.samples }])),
    },
    null,
    2,
  ) + '\n',
);
console.log('\nwrote docs/ai/lcc-r15f1/residual-blind.json');
await sql.end();
