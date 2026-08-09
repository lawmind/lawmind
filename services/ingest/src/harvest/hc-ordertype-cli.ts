/**
 * `pnpm --filter @lawmind/ingest hc:ordertypes` — how much of the High Court
 * bucket is a **judgment** rather than a procedural order.
 *
 * `docs/DATASETS.md` answered this by sampling PDF text length and concluding
 * *"most of it is not an authority"*. The bucket labels it directly, in the
 * `order_type` column — but **only on the `metadata-mobile.parquet` variant**,
 * which four of twenty-five courts publish.
 *
 * **The generalisation this does NOT support, stated before the numbers rather
 * than after:** the plain and mobile files share **zero CNRs**, so they are
 * disjoint record sets and a rate measured on one is not a rate for the other.
 * What this CLI produces is a labelled measurement over 8% of the corpus, and a
 * lower bound on how badly document count overstates judgment count. It is not
 * a corpus-wide judgment count and must never be quoted as one.
 */
import { writeFile } from 'node:fs/promises';

import { listMetadataKeys, mapConcurrent, orderTypeTally, parsePartitions } from './hc-metadata.ts';

const CONCURRENCY = Number(process.env['HC_SURVEY_CONCURRENCY'] ?? '6');
const OUT_PATH = new URL('../../../../docs/HC_ORDER_TYPES.json', import.meta.url);

console.log('HIGH COURT `order_type` TALLY — mobile-variant files only');
console.log('='.repeat(74));

const keys = await listMetadataKeys();
const mobile = keys
  .map(({ key }) => ({ key, p: parsePartitions(key) }))
  .filter((x) => x.p?.variant === 'mobile');

console.log(`${mobile.length} mobile-variant files of ${keys.length} objects`);
console.log(`reading the order_type column at concurrency ${CONCURRENCY} ...`);

const total = new Map<string, number>();
const byCourt = new Map<string, Map<string, number>>();
const failures: string[] = [];
let done = 0;

await mapConcurrent(mobile, CONCURRENCY, async ({ key, p }) => {
  try {
    const tally = await orderTypeTally(key);
    const court = byCourt.get(p!.courtCode) ?? new Map<string, number>();
    for (const [type, n] of tally) {
      total.set(type, (total.get(type) ?? 0) + n);
      court.set(type, (court.get(type) ?? 0) + n);
    }
    byCourt.set(p!.courtCode, court);
  } catch (error) {
    failures.push(`${key}: ${String((error as Error)?.message ?? error)}`);
  }
  if (++done % 20 === 0) console.log(`  ... ${done}/${mobile.length}`);
});

if (failures.length > 0) {
  console.log(`FAILED: ${failures.length} files, NOT counted below`);
  for (const f of failures.slice(0, 5)) console.log(`  ${f}`);
}

const sorted = [...total.entries()].sort((a, b) => b[1] - a[1]);
const grand = sorted.reduce((s, [, n]) => s + n, 0);

console.log('');
console.log(`${grand.toLocaleString()} labelled rows`);
console.log('');
for (const [type, n] of sorted) {
  console.log(
    `  ${n.toLocaleString().padStart(11)}  ${((n / grand) * 100).toFixed(2).padStart(6)}%  ${type}`,
  );
}

/**
 * **Three buckets, not two, and the middle one is why.**
 *
 * A first pass matched `/judgment|judgement/` and reported **18.64%**. That
 * number was wrong in the way this repo keeps catching: `View Judgement/Order`
 * — 231,067 rows, 17.89% — says *judgment **or** order* and is almost the whole
 * of that 18.64%. Folding an ambiguous label into the confident bucket produces
 * a number that looks measured and is a guess.
 *
 * So the honest output is a **range**: 0.75% if every ambiguous row is an
 * order, 18.64% if every one is a judgment. Narrowing it means opening PDFs,
 * which is §A3.3's job, not this one's.
 */
const AMBIGUOUS = /judg(?:e)?ment\s*\/\s*order/i;
const JUDGMENT = /judg(?:e)?ment/i;

const bucketOf = (type: string): 'judgment' | 'ambiguous' | 'other' =>
  AMBIGUOUS.test(type) ? 'ambiguous' : JUDGMENT.test(type) ? 'judgment' : 'other';

const bucketTotal = (want: string) =>
  sorted.filter(([type]) => bucketOf(type) === want).reduce((s, [, n]) => s + n, 0);

const confident = bucketTotal('judgment');
const ambiguous = bucketTotal('ambiguous');
const pct = (n: number) => `${((n / grand) * 100).toFixed(2)}%`;

console.log('');
console.log(`  unambiguously a judgment   ${confident.toLocaleString().padStart(11)}  ${pct(confident)}`);
console.log(`  "Judgement/Order" — either ${ambiguous.toLocaleString().padStart(11)}  ${pct(ambiguous)}`);
console.log(`  everything else            ${(grand - confident - ambiguous).toLocaleString().padStart(11)}  ${pct(grand - confident - ambiguous)}`);
console.log('');
console.log(`JUDGMENT SHARE IS A RANGE: ${pct(confident)} .. ${pct(confident + ambiguous)}`);
console.log('The spread is one label — `View Judgement/Order` — which the bucket does');
console.log('not disambiguate. Narrowing it means reading PDFs (§A3.3), not metadata.');
console.log('');
console.log('CAVEAT, and it is load-bearing: this covers the mobile variant only,');
console.log('which shares ZERO CNRs with the plain files holding the other 92% of');
console.log('the corpus. It is a labelled measurement of 8%, NOT a corpus-wide rate.');

await writeFile(
  OUT_PATH,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      scope: 'metadata-mobile.parquet only — 4 of 25 courts, disjoint from the plain files',
      filesRead: mobile.length - failures.length,
      failures,
      labelledRows: grand,
      judgmentRowsConfident: confident,
      judgmentRowsAmbiguous: ambiguous,
      judgmentShareRange: [confident / grand, (confident + ambiguous) / grand],
      ambiguityNote:
        '`View Judgement/Order` does not distinguish the two. The range is that label; narrowing it needs PDF text, not metadata.',
      byType: Object.fromEntries(sorted),
      byCourt: Object.fromEntries(
        [...byCourt].map(([code, t]) => [
          code,
          Object.fromEntries([...t].sort((a, b) => b[1] - a[1])),
        ]),
      ),
    },
    null,
    2,
  ),
);
console.log('');
console.log('written: docs/HC_ORDER_TYPES.json');
