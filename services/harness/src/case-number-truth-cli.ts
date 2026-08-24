/**
 * CASE-NUMBER SEARCH — WHAT THE REAL API ACTUALLY SUPPORTS TODAY.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Reports across rounds disagree about whether Lawmind can look a judgment up by
 * its case number. The master plan (§5 P0A.3, LCC-3) records the contradiction
 * and refuses to accept either side: *"old 'case number green' is not accepted
 * while current API inspection contradicts it."*
 *
 * So this asks the product, not the archive. Every probe goes through the real
 * `POST /search` route on the real corpus, and the only inputs are values read
 * out of `judgments` — a case number we know exists, in a judgment we know the
 * id of. A miss here is a miss on a case that is definitely in the corpus, which
 * is the only kind of miss that means anything.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FOUR SPELLINGS, AND WHY ALL FOUR ARE PROBED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgments.case_number` is stored in the eCourts normalised form —
 * `CWJC/2231/2006`, `WP(C)/4097/2009`, `CRM-M/22875/2013`. **An advocate does
 * not type that.** They type what is printed on the order: *"W.P.(C) 4097 of
 * 2009"*, *"CRM-M-22875-2013"*, *"Crl.M.C. 999/2021"*.
 *
 * A probe that only tries the stored form measures the database and calls it a
 * product. So each sampled judgment is asked for four ways:
 *
 *   STORED_OPERATOR   caseno:"CWJC/2231/2006"     the form the parser wants
 *   STORED_BARE       CWJC/2231/2006              the same string, no operator
 *   TYPED_OF          CWJC 2231 of 2006           how it is written in an order
 *   CNR_OPERATOR      cnr:"BRHC010328902006"      the other identifier entirely
 *
 * The gap between the first two is the routing question. The gap between the
 * first and the third is the normalisation question. `CNR_OPERATOR` is the
 * control: if it resolves and the case number does not, the corpus is not the
 * problem.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS MEASURED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * For each probe: HTTP status, wall-clock ms, how many results came back,
 * whether the KNOWN target was among them, at what rank, and how many distinct
 * courts the results span. That last one is the ambiguity signal — a case number
 * is a registry's serial number and is only ever unique WITHIN a court, so a
 * result set spanning courts is the false-pin risk stated as a number.
 *
 * Bounded by construction: `--limit` judgments, four requests each, one at a
 * time. Nothing here scans the corpus; the sample is drawn from one keyset
 * window and every probe is served by an index the route already uses.
 */
import { setTimeout as delay } from 'node:timers/promises';

import { createApp } from '../../api/src/app.ts';
import postgres from 'postgres';

type Sampled = {
  id: string;
  court: string;
  caseNumber: string;
  cnr: string | null;
  caseTitle: string;
};

type ProbeName = 'STORED_OPERATOR' | 'STORED_BARE' | 'TYPED_OF' | 'CNR_OPERATOR';

type ProbeResult = {
  probe: ProbeName;
  query: string;
  status: number;
  ms: number;
  results: number;
  targetRank: number | null;
  distinctCourts: number;
  /** The route's own refusal/ambiguity code, when it gave one. */
  errorCode: string | null;
  /**
   * Did the route SAY it could not pin? A registry serial matching several
   * judgments is normal; presenting one of them as the answer is the failure.
   */
  ambiguous: boolean;
};

type Row = { judgmentId: string; caseTitle: string; court: string };

/**
 * `CWJC/2231/2006` → `CWJC 2231 of 2006`.
 *
 * The spelling an advocate reads off the cause list. Deliberately NOT a
 * normaliser — this is the input side of the problem, not a proposed fix.
 */
function typedForm(caseNumber: string): string | null {
  const parts = caseNumber.split('/');
  if (parts.length !== 3) return null;
  const [type, serial, year] = parts;
  if (!type || !serial || !year) return null;
  return `${type} ${serial} of ${year}`;
}

async function probe(
  app: ReturnType<typeof createApp>,
  name: ProbeName,
  query: string,
  targetId: string,
): Promise<ProbeResult> {
  const started = Date.now();
  const res = await app.request('/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, language: 'en' }),
  });
  const ms = Date.now() - started;
  const body = (await res.json()) as {
    ok: boolean;
    data?: { results?: Row[]; ambiguous?: boolean };
    error?: { code?: string };
  };
  const results = body.data?.results ?? [];
  const rank = results.findIndex((r) => r.judgmentId === targetId);
  return {
    probe: name,
    query,
    status: res.status,
    ms,
    results: results.length,
    targetRank: rank === -1 ? null : rank + 1,
    distinctCourts: new Set(results.map((r) => r.court)).size,
    errorCode: body.error?.code ?? null,
    ambiguous: body.data?.ambiguous === true,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (n: string, d: string) => {
    const i = argv.indexOf(`--${n}`);
    return i === -1 ? d : (argv[i + 1] ?? d);
  };
  const limit = Number(arg('limit', '40'));

  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');
  const sql = postgres(url, { max: 4, onnotice: () => {} });
  const app = createApp({ ping: async () => {}, search: { sql, embedQuery: async () => null } });

  /**
   * One keyset window, not `ORDER BY random()`. A random sort is a full scan of
   * a 151 GB relation and the resource gate would refuse it; a window at a fixed
   * id offset is an index range read. It is a CONVENIENCE SAMPLE and is reported
   * as one — uuids are random so the window is not court-biased, but it is not a
   * probability sample of the corpus and no confidence interval is claimed.
   */
  const sample = await sql<Sampled[]>`
    SELECT id, court, case_number AS "caseNumber", cnr, case_title AS "caseTitle"
      FROM judgments
     WHERE id > '80000000-0000-0000-0000-000000000000'::uuid
       AND case_number IS NOT NULL
       AND case_number <> ''
     ORDER BY id
     LIMIT ${limit}`;

  const out: { target: Sampled; probes: ProbeResult[] }[] = [];

  for (const s of sample) {
    const probes: ProbeResult[] = [];
    probes.push(await probe(app, 'STORED_OPERATOR', `caseno:"${s.caseNumber}"`, s.id));
    probes.push(await probe(app, 'STORED_BARE', s.caseNumber, s.id));
    const typed = typedForm(s.caseNumber);
    if (typed) probes.push(await probe(app, 'TYPED_OF', typed, s.id));
    if (s.cnr) probes.push(await probe(app, 'CNR_OPERATOR', `cnr:"${s.cnr}"`, s.id));
    out.push({ target: s, probes });
    // The box is shared with four other lanes. One probe at a time, with a
    // pause, so a measurement never becomes the contention it is measuring.
    await delay(50);
  }

  const byProbe = new Map<ProbeName, ProbeResult[]>();
  for (const r of out) {
    for (const p of r.probes) {
      const list = byProbe.get(p.probe);
      if (list) list.push(p);
      else byProbe.set(p.probe, [p]);
    }
  }

  const pct = (n: number, d: number) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`);
  const median = (xs: number[]) => {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  };

  console.log(`\nsample: ${sample.length} judgments, one keyset window\n`);
  console.log(
    'probe             n    found  rank1   p50ms   p95ms   0-result  multi-court  ambiguous  non-200',
  );
  for (const [name, list] of byProbe) {
    const found = list.filter((p) => p.targetRank !== null);
    const rank1 = list.filter((p) => p.targetRank === 1);
    const ms = list.map((p) => p.ms).sort((a, b) => a - b);
    const p95 = ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] ?? 0;
    console.log(
      name.padEnd(17),
      String(list.length).padStart(3),
      pct(found.length, list.length).padStart(7),
      pct(rank1.length, list.length).padStart(6),
      String(median(ms)).padStart(7),
      String(p95).padStart(7),
      pct(list.filter((p) => p.results === 0).length, list.length).padStart(10),
      pct(list.filter((p) => p.distinctCourts > 1).length, list.length).padStart(12),
      pct(list.filter((p) => p.ambiguous).length, list.length).padStart(10),
      String(list.filter((p) => p.status !== 200).length).padStart(8),
    );
  }

  console.log(JSON.stringify({ sampledAt: new Date().toISOString(), sample: out }, null, 2));
  await sql.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
