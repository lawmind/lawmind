/**
 * Classifier frontier vs embedding frontier — measured the way that does not lie.
 *
 * NEW2 classifies ahead of the GPU walk so the walk can refuse a document before
 * spending a token on it. The question is how much runway is left.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MISTAKE THIS FILE EXISTS TO PREVENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A NULL `hc_document_class` is the UNION of two populations that want opposite
 * work:
 *
 *   hc_class_method IS NULL                  the classifier never reached the row
 *   method set, hc_document_class IS NULL    it reached the row and DECLINED
 *
 * Only the first is a frontier gap. On 21 Aug 2026 NEW1 measured the union,
 * reported it as the first, and told NEW2 that "~45% has never been looked at"
 * (bus 0944). The real split on the same batches was 0.5-0.8% never-looked-at
 * against 42.7-47.3% looked-and-declined — NEW2's frontier was 41 hours ahead
 * and widening the whole time (bus 0946, corrected in 0953).
 *
 * A wrong reading here asks another lane to spend CPU it does not need to spend,
 * so this tool always reports BOTH columns and never a single "unclassified"
 * figure.
 *
 * Reads only the batches the walk reaches NEXT, in worklist order — coverage,
 * not a batch number.
 *
 *   POS=<worklist position> AHEAD=<n> SAMPLE=<n> node services/harness/src/frontier-coupling-cli.mjs
 */
import postgres from 'postgres';
import { readFileSync, createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const url = readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = postgres(url, { ssl: false, max: 1, onnotice: () => {}, idle_timeout: 30 });

const DIR = 'docs/ai/embedding-manifests/document-vectors/';
const worklist = readFileSync('docs/ai/new1-tier-a/.worklist.txt', 'utf8').trim().split(/\r?\n/);

/** Default to the runner's own last-reported worklist position, not a guess. */
const runnerLog = readFileSync('docs/ai/new1-tier-a/stage-runner.log', 'utf8');
const lastPos = [...runnerLog.matchAll(/worklist (\d+)\/(\d+)/g)].pop();
const POS = Number(process.env.POS ?? (lastPos ? lastPos[1] : 1));
const AHEAD = Number(process.env.AHEAD ?? 6);
const SAMPLE = Number(process.env.SAMPLE ?? 1200);

async function idsOf(file) {
  const ids = [];
  const rl = createInterface({ input: createReadStream(DIR + file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      const id = o.judgment_id ?? o.judgmentId ?? o.id;
      if (id) ids.push(id);
    } catch {
      /* a malformed manifest line is not a frontier fact; skip it */
    }
  }
  return ids;
}

const out = {
  kind: 'new1_frontier_coupling',
  measuredAt: new Date().toISOString(),
  worklistPos: POS,
  worklistLen: worklist.length,
  note: 'neverLookedAt is the ONLY frontier figure. lookedButDeclined is vocabulary coverage and no classifier throughput touches it.',
  batches: [],
};

for (let k = 0; k < AHEAD; k++) {
  const file = worklist[POS - 1 + k];
  if (!file) break;
  const all = await idsOf(file);
  const step = Math.max(1, Math.floor(all.length / SAMPLE));
  const ids = all.filter((_, i) => i % step === 0).slice(0, SAMPLE);
  const r = (
    await sql`
      select
        count(*)::int total,
        count(*) filter (where hc_class_method is null)::int never_looked_at,
        count(*) filter (where hc_class_method is not null and hc_document_class is null)::int looked_declined,
        count(*) filter (where hc_document_class is not null)::int classified
      from judgments where id = any(${ids}::uuid[])`
  )[0];
  const pct = (n) => +((n / r.total) * 100).toFixed(1);
  const row = {
    lead: k,
    file,
    sampled: r.total,
    neverLookedAtPct: pct(r.never_looked_at),
    lookedButDeclinedPct: pct(r.looked_declined),
    classifiedPct: pct(r.classified),
  };
  out.batches.push(row);
  console.log(
    `lead +${k}  ${file}  neverLookedAt ${row.neverLookedAtPct}%  ` +
      `lookedButDeclined ${row.lookedButDeclinedPct}%  classified ${row.classifiedPct}%`,
  );
}

await sql.end();
const worst = Math.max(...out.batches.map((b) => b.neverLookedAtPct));
out.verdict =
  worst < 5
    ? `CLASSIFIER COMFORTABLY AHEAD — worst never-looked-at is ${worst}%. Do not ask NEW2 for more concurrency.`
    : `CLASSIFIER FRONTIER AT RISK — never-looked-at reaches ${worst}%. Notify NEW2 with measured lead and time-to-catch.`;
console.log('\n' + out.verdict);
writeFileSync('docs/ai/new1-tier-a/frontier-coupling.json', JSON.stringify(out, null, 2));
