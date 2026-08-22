/**
 * P7 — a small REAL-PATH benchmark: HTTP POST /search against the running API,
 * the same code path the mobile client will use. Not a library call.
 *
 * Latency here is LOCAL_CONTENDED unless the caller states otherwise; it is a
 * localhost number on a box also running the ingest fleet, and it is NOT a
 * prediction of mobile production latency.
 */
const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:3077';
const REPEATS = Number(process.env.REPEATS ?? 3);
const BUDGET = Number(process.env.BUDGET_MS ?? 120000);

const GROUPS = {
  citation: ['1995 INSC 227', '2007 INSC 263', '1971 INSC 2', 'cite:"1995 INSC 227"'],
  case_name: ['Garware Nylons v Pimpri Chinchwad', 'Allen Berry & Co v Union of India', 'Mishrilal Jain v District Magistrate'],
  concept: ['when can anticipatory bail be granted in an NDPS case', 'principles governing quashing of an FIR', 'what is the test for granting an interim injunction'],
  long_passage: [
    'The question that arises for consideration is whether the High Court was justified in exercising its inherent jurisdiction to quash the criminal proceedings at the stage of the charge sheet, when the allegations in the first information report, taken at their face value and accepted in their entirety, do not prima facie constitute any offence or make out a case against the accused, and whether the settled principles laid down by this Court require the court to refrain from embarking upon an enquiry as to the reliability or genuineness of the allegations made in the first information report or the complaint.',
  ],
  statute_bns: ['section 302 IPC', 'section 103 BNS', 'section 482 BNSS', 'section 63 BSA', 'section 138 NI Act', 'section 482 CrPC'],
};

const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : null;

const results = {};
for (const [group, queries] of Object.entries(GROUPS)) {
  const lat = [], rows = [];
  let ok = 0, timeouts = 0, errors = 0, empty = 0, degradedN = 0;
  for (let r = 0; r < REPEATS; r++) {
    for (const q of queries) {
      const t0 = Date.now();
      try {
        const res = await fetch(`${BASE}/search`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: q, language: 'en' }),
          signal: AbortSignal.timeout(BUDGET),
        });
        const ms = Date.now() - t0;
        const body = await res.json();
        const d = body?.data;
        if (res.status !== 200) { errors++; continue; }
        ok++; lat.push(ms); rows.push(d?.results?.length ?? 0);
        if ((d?.results?.length ?? 0) === 0) empty++;
        if (d?.degraded?.length) degradedN++;
      } catch (e) {
        const ms = Date.now() - t0;
        if (e.name === 'TimeoutError') { timeouts++; lat.push(ms); } else errors++;
      }
    }
  }
  results[group] = {
    n: ok + timeouts + errors, ok, timeouts, errors,
    empty_results: empty, degraded_responses: degradedN,
    p50: pct(lat, 0.5), p95: pct(lat, 0.95), max: lat.length ? Math.max(...lat) : null,
    mean_results: rows.length ? +(rows.reduce((a, b) => a + b, 0) / rows.length).toFixed(2) : null,
  };
  const s = results[group];
  console.log(`${group.padEnd(14)} ok ${String(s.ok).padStart(2)}/${s.n}  timeouts ${s.timeouts}  errors ${s.errors}  empty ${s.empty_results}  degraded ${s.degraded_responses}  p50 ${s.p50}ms  p95 ${s.p95}ms  max ${s.max}ms  meanRows ${s.mean_results}`);
}
import('fs').then(m=>m.writeFileSync('.agents/tmp-lcc/bench-result.json', JSON.stringify(results,null,2)));

/**
 * P7 REAL-PATH SEARCH BENCHMARK — kept because the numbers in
 * `docs/CURRENT_PLAN.md` (22 Aug 2026, LCC) came from this file and nothing
 * else can reproduce them.
 *
 *   node docs/ops/lcc/search-benchmark.mjs            # 3 repeats
 *   REPEATS=1 PROBE_BASE=http://127.0.0.1:3077 node docs/ops/lcc/search-benchmark.mjs
 *
 * It drives HTTP `POST /search` — the same path the mobile client uses — not a
 * library call, because a library call does not exercise validation, the
 * envelope, `citation_checks` writes or the connection pool, and those are
 * where three of this session's defects lived.
 *
 * ALWAYS LABEL THE RESULT `LOCAL_CONTENDED` or `LOCAL_QUIET`. Every figure
 * recorded so far is LOCAL_CONTENDED: localhost, on a box simultaneously
 * running the ingest fleet, the GPU embed server, the classifier and at times
 * an autovacuum of `judgments`. It is the floor the server contributes and it
 * is NOT a prediction of mobile production latency.
 *
 * KNOWN: the `long_passage` group reports 2 errors by design — those queries
 * exceed the 500-character cap in `searchRequest`, which is itself the finding.
 * The pathological long-passage sparse query cannot be submitted through the
 * real API at all. A 499-character passage is the reachable worst case and cost
 * 15,127-20,218 ms, bounded, degrading honestly.
 */
