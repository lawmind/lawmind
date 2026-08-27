/**
 * NEW2 — R9 §1. Collect the RESULTS block of every delta scope into one tally.
 *
 * `a-loud-hang-beats-a-silent-one` and `row-growth-hides-a-dead-scope` both say
 * the same thing: a fleet total is not evidence about any individual scope. So
 * this reports PER SCOPE and refuses to hide a scope that produced no RESULTS
 * block at all — that scope is `NO_RESULTS`, which is a different fact from
 * `WRITTEN 0` and must never read the same.
 *
 * Reads the last 64 KB of each log, for the reason the launcher does: these logs
 * carry raw PDF-extractor bytes and reach tens of MB.
 */
import { openSync, readSync, closeSync, fstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const delta = JSON.parse(readFileSync(join(ROOT, 'docs/ai/new2-r9/delta-scopes.json'), 'utf8'));
const scopes = delta.scopes.map((s) => s.scope);

function tail(path, bytes = 200_000) {
  let fd;
  try {
    fd = openSync(path, 'r');
  } catch {
    return null;
  }
  try {
    const size = fstatSync(fd).size;
    const want = Math.min(bytes, size);
    const buf = Buffer.alloc(want);
    readSync(fd, buf, 0, want, size - want);
    return buf.toString('latin1');
  } finally {
    closeSync(fd);
  }
}

const num = (s) => Number(String(s).replace(/,/g, ''));

const rows = [];
for (const scope of scopes) {
  const t = tail(join(ROOT, `${scope}.log`));
  if (t == null) {
    rows.push({ scope, state: 'NO_LOG' });
    continue;
  }
  /**
   * A fixed window after the sentinel, not a lazy match to `$`. With the `m`
   * flag `$` matches at the end of EVERY line, so `[\s\S]*?(?=\n\n|$)` matched
   * the empty string and every field read null while the log plainly carried
   * them. Same failure family as `unbounded-parquet-read-returns-wrong-rows`:
   * no error, a plausible shape, wrong content.
   */
  const idx = t.lastIndexOf('RESULTS');
  const last = idx === -1 ? null : t.slice(idx, idx + 400);
  if (!last) {
    rows.push({ scope, state: 'NO_RESULTS' });
    continue;
  }
  const seen = /DOCUMENTS SEEN\s+([\d,]+)/.exec(last)?.[1];
  const mapped = /MAPPED\s+([\d,]+)/.exec(last)?.[1];
  const written = /WRITTEN\s+([\d,]+)/.exec(last)?.[1];
  const ledger = /LEDGER FAILURES\s+([\d,]+)/.exec(last)?.[1];
  const outcomes = {};
  for (const m of t.matchAll(/^\s{4,}(\d+)\s+([a-z_]+)$/gm)) outcomes[m[2]] = num(m[1]);
  rows.push({
    scope,
    state: 'RESULTS',
    seen: seen ? num(seen) : null,
    mapped: mapped ? num(mapped) : null,
    written: written ? num(written) : null,
    ledgerFailures: ledger ? num(ledger) : null,
    outcomes,
  });
}

const tot = { seen: 0, mapped: 0, written: 0, ledgerFailures: 0 };
const outTot = {};
for (const r of rows) {
  if (r.state !== 'RESULTS') continue;
  tot.seen += r.seen ?? 0;
  tot.mapped += r.mapped ?? 0;
  tot.written += r.written ?? 0;
  tot.ledgerFailures += r.ledgerFailures ?? 0;
  for (const [k, v] of Object.entries(r.outcomes)) outTot[k] = (outTot[k] ?? 0) + v;
}

console.log('scope                        state       seen   mapped  written  ledgerFail');
for (const r of rows) {
  if (r.state !== 'RESULTS') {
    console.log(`${r.scope.padEnd(26)} ${r.state}`);
    continue;
  }
  console.log(
    `${r.scope.padEnd(26)} RESULTS ${String(r.seen).padStart(9)} ${String(r.mapped).padStart(8)} ${String(r.written).padStart(8)} ${String(r.ledgerFailures).padStart(11)}`,
  );
}
console.log('');
console.log(`TOTAL  seen ${tot.seen.toLocaleString()} · mapped ${tot.mapped.toLocaleString()} · WRITTEN ${tot.written.toLocaleString()} · ledger failures ${tot.ledgerFailures.toLocaleString()}`);
console.log(`scopes with a RESULTS block: ${rows.filter((r) => r.state === 'RESULTS').length}/${rows.length}`);
console.log(`aggregate outcomes: ${JSON.stringify(outTot)}`);

writeFileSync(join(ROOT, 'docs/ai/new2-r9/delta-results.json'), JSON.stringify({ takenAt: new Date().toISOString(), totals: tot, aggregateOutcomes: outTot, scopes: rows }, null, 2));
console.log('written: docs/ai/new2-r9/delta-results.json');
