/**
 * `pnpm paired:arms` — one arm against itself across two runs, paired.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY AGGREGATES ARE NOT ENOUGH, AND THIS IS NOT A STYLE PREFERENCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Post-0055 the sparse arm's `recall@20` read 18.0% against 17.0% before. Quoted
 * alone that is "a point better". Paired, it is **+11 / -8 with McNemar exact
 * p = 0.6476** — nineteen queries changed state in opposite directions and the
 * net is noise. The aggregate and the pairing tell different stories from the
 * same rows, and only one of them is true.
 *
 * The reverse case is just as important. The dense arm read 40.6% before and
 * after, which could be two different sets of queries coincidentally summing the
 * same. It is not: **zero discordant pairs across 283 queries.** "Unchanged" and
 * "the same 115 queries, one of which moved rank" are very different claims, and
 * only the second justifies reusing a four-day-old failure decomposition.
 *
 * Both readings needed the per-query rows, which the checkpoint has always had.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT WILL AND WILL NOT COMPARE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The SAME arm in the SAME pass across two checkpoints. Comparing two different
 * arms is `arms-cli.ts`'s own paired block; comparing across a changed gold set
 * is not a comparison at all, so the query ids are intersected and the count of
 * pairs is printed rather than assumed.
 *
 * McNemar's exact test, two-sided, on the discordant pairs only — a query both
 * runs got right, or both got wrong, carries no information about which run is
 * better, and averaging over it is what makes an unpaired comparison weak.
 *
 * Offline. Reads two checkpoint files. No database, no embedder, no model.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

type Arm = 'sparse' | 'dense' | 'hybrid';
type Row = { top5: boolean; any: boolean; best: number | null };

const [, , oldPath, newPath] = process.argv;
const ARM = (process.env['ARMS_MODES'] ?? 'dense').trim().toLowerCase() as Arm;
const PASS = (process.env['ARMS_PASS'] ?? 'CONTROLLED').toUpperCase();

if (!oldPath || !newPath) {
  console.error('usage: paired:arms <old-checkpoint.jsonl> <new-checkpoint.jsonl>');
  console.error('  ARMS_MODES=dense|sparse|hybrid   ARMS_PASS=CONTROLLED|UNCONTROLLED');
  process.exit(2);
}

async function load(path: string): Promise<Map<string, Row>> {
  const out = new Map<string, Row>();
  const rl = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = JSON.parse(line) as {
      pass: string;
      mode: Arm;
      row: { id: string; goldRanks?: number[]; foundAtAnyRank?: number | null };
    };
    if (c.mode !== ARM || c.pass.toUpperCase() !== PASS) continue;
    out.set(c.row.id, {
      top5: (c.row.goldRanks ?? []).length > 0,
      any: (c.row.foundAtAnyRank ?? null) !== null,
      best: c.row.foundAtAnyRank ?? null,
    });
  }
  return out;
}

/**
 * Two-sided exact binomial on the discordant pairs. Exact rather than the
 * chi-square approximation because the discordant counts here are single digits,
 * which is exactly where the approximation misleads.
 */
function mcnemarExactP(b: number, c: number): number | null {
  const n = b + c;
  if (n === 0) return null;
  const logFact = (k: number): number => {
    let s = 0;
    for (let i = 2; i <= k; i++) s += Math.log(i);
    return s;
  };
  const pmf = (k: number): number => Math.exp(logFact(n) - logFact(k) - logFact(n - k) - n * Math.log(2));
  const target = pmf(Math.min(b, c)) * (1 + 1e-9);
  let p = 0;
  for (let k = 0; k <= n; k++) if (pmf(k) <= target) p += pmf(k);
  return Math.min(1, p);
}

const before = await load(oldPath);
const after = await load(newPath);
const ids = [...after.keys()].filter((k) => before.has(k));

console.log(`arm ${ARM} · pass ${PASS}`);
console.log(`  old ${oldPath}  ${before.size} rows`);
console.log(`  new ${newPath}  ${after.size} rows`);
console.log(`  paired on ${ids.length} queries\n`);
if (ids.length === 0) {
  console.error('No shared query ids. These checkpoints do not describe the same set.');
  process.exit(1);
}

for (const [label, key] of [
  ['success@5', 'top5'],
  ['recall@20', 'any'],
] as const) {
  let gained = 0;
  let lost = 0;
  let both = 0;
  let neither = 0;
  const gainedIds: string[] = [];
  const lostIds: string[] = [];
  for (const id of ids) {
    const o = before.get(id)![key];
    const n = after.get(id)![key];
    if (n && !o) {
      gained++;
      gainedIds.push(id);
    } else if (o && !n) {
      lost++;
      lostIds.push(id);
    } else if (o && n) both++;
    else neither++;
  }
  const p = mcnemarExactP(gained, lost);
  console.log(
    `${label}: gained ${gained} · lost ${lost} · both ${both} · neither ${neither}` +
      (p === null ? '  (no discordant pairs — the runs agree on every query)' : `  McNemar exact p=${p.toFixed(4)}`),
  );
  if (gainedIds.length) console.log(`   gained: ${gainedIds.join(', ')}`);
  if (lostIds.length) console.log(`   lost:   ${lostIds.join(', ')}`);
}

/**
 * State changes are not the whole story: an arm can keep the same queries and
 * still rank gold systematically worse inside them, which is a real regression
 * that both tables above would score as no change.
 */
let moved = 0;
let improved = 0;
let worsened = 0;
const deltas: number[] = [];
for (const id of ids) {
  const o = before.get(id)!.best;
  const n = after.get(id)!.best;
  if (o === null || n === null || o === n) continue;
  moved++;
  deltas.push(n - o);
  if (n < o) improved++;
  else worsened++;
}
deltas.sort((a, b) => a - b);
const median = deltas.length > 0 ? deltas[Math.floor(deltas.length / 2)]! : 0;
console.log(
  `\ngold rank moved on ${moved} of the queries BOTH runs found` +
    ` · improved ${improved} · worsened ${worsened}` +
    ` · median delta ${median >= 0 ? '+' : ''}${median}`,
);
