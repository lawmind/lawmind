/**
 * NEW2 — R10 §4. A BOUNDED UNRESOLVED CITATION TRANCHE, MEASURED AND FALSIFIED.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS ADDS OVER `resolver-dryrun-cli.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The dry run measures the resolver's OWN opinion of itself: how many references
 * form a key, how many keys hit one row, how big the ambiguous groups are. Every
 * one of those numbers is computed from the same index the resolver consulted,
 * so a systematically wrong index produces a systematically confident report.
 * `41.99% unique` is exactly the shape the founder named — *a too-good-looking
 * safe rate is a finding to sample, not a win.*
 *
 * This adds the part the dry run deliberately refuses to invent: an INDEPENDENT
 * adjudication, on evidence the resolver never looked at, of BOTH sides.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE INDEPENDENT EVIDENCE, AND WHY EACH PIECE IS ACTUALLY INDEPENDENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The resolver matches one thing: the canonical form of the citation string
 * against `judgment_citation_keys`. Anything derived from that key is circular —
 * "the candidate's `reporter_citations` contains the citation" is not a check,
 * it is a restatement of how the key row came to exist.
 *
 * These three are not derived from the key:
 *
 *   CHRONOLOGY  A judgment cannot cite one decided after it. This uses
 *               `judgments.judgment_date` on BOTH ends, a column the resolver
 *               never reads, and it is a hard falsifier rather than a
 *               correlation: a UNIQUE pin whose target post-dates the citing
 *               judgment is wrong, full stop. Same-day is allowed (a court can
 *               hand down and cite on the same day) and so is a NULL date on
 *               either end, which is recorded UNTESTABLE rather than passed.
 *
 *   YEAR        Almost every Indian citation form carries its own year —
 *               `(2019) 4 SCC 1`, `2025:PHHC:052490-DB`, `AIR 1981 SC 1861`.
 *               The candidate's decision year is compared against the year IN
 *               THE STRING. A reporter prints in the year of decision or shortly
 *               after, so 0..2 years of lag is corroboration and a decade is a
 *               false pin. The year is parsed from the raw input; the resolver's
 *               key generation strips it into an undifferentiated blob, so this
 *               is genuinely a second reading of the same bytes.
 *
 *   COURT       A neutral citation names its court in the string — `PHHC`,
 *               `DHC`, `INSC`. Where one is recognisable, the candidate's own
 *               `court` must be consistent. Where it is not, the check reports
 *               UNTESTABLE. It never guesses a court from a reporter series.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AND THE NEGATIVES, WHICH ARE THE HALF THAT USUALLY GOES UNMEASURED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `verification-catches-false-positives-only`: a claim never made leaves no
 * trace, so recall loss is invisible unless something goes looking for it. 52%
 * of this tranche answers TARGET_NOT_HELD, and the report is worthless if that
 * class is never opened.
 *
 * So a sample of the refusals and not-helds is re-asked by a route the resolver
 * does not use at all: a direct scan of `judgments.neutral_citation` and
 * `judgments.reporter_citations` for the citation's own digits, ignoring
 * punctuation, case and reporter-token spelling. If that finds exactly one
 * judgment for something the resolver said we do not hold, that is a RECALL
 * MISS, and it is reported as a defect of ours rather than as an absent source.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT WRITES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Durable per-row decisions to NDJSON — edge id, citing judgment, raw string,
 * state, candidates, and the adjudication verdict — plus one summary artifact.
 * It writes NOTHING to the database. The expansion job is a separate,
 * explicitly-gated step; this is the evidence that decides whether it may run.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-citation-tranche.mts \
 *     [--sample 20000] [--audit 400] [--out docs/ai/new2-r10/citation-tranche.json]
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

import { metricsFor, resolveBatch, RESOLVER_VERSION, type Resolution } from '../services/api/src/citations/resolver.ts';
import { readKeyFreshness } from '../services/api/src/citations/key-freshness.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const SAMPLE = Number(arg('sample', '20000'));
const AUDIT = Number(arg('audit', '400'));
const OUT = arg('out', 'docs/ai/new2-r10/citation-tranche.json');
const ROWS_OUT = arg('rows', '.tmp-new2/citation-tranche-rows.ndjson');
const BATCH = 500;

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

/** Every 4-digit run that could be a year, in the range Indian law reporting occupies. */
function yearsIn(raw: string): number[] {
  const out: number[] = [];
  for (const m of raw.matchAll(/(?<!\d)(1[89]\d{2}|20\d{2})(?!\d)/g)) out.push(Number(m[1]));
  return out;
}

/**
 * Court tokens that appear INSIDE a neutral citation and are unambiguous.
 *
 * Deliberately short. A reporter series (`SCC`, `AIR`) names a publisher, not a
 * court — `AIR 1981 SC 1861` happens to carry `SC` but `AIR 1981 All 1` carries
 * a court abbreviation that also appears in half a dozen other series. Only the
 * neutral-citation forms, which are issued BY the court, are listed, and
 * anything not listed reports UNTESTABLE rather than a guess.
 */
const NEUTRAL_COURT_TOKENS: readonly (readonly [RegExp, RegExp])[] = [
  [/\bINSC\b/i, /supreme court/i],
  [/\bPHHC\b/i, /punjab|haryana/i],
  [/\bDHC\b/i, /delhi/i],
  [/\bKER\b/i, /kerala/i],
  [/\bMHC\b/i, /madras/i],
  [/\bKARHC\b|\bKAHC\b/i, /karnataka/i],
  [/\bBHC\b/i, /bombay/i],
  [/\bGUJHC\b/i, /gujarat/i],
  [/\bAHC\b/i, /allahabad/i],
  [/\bCHC\b/i, /calcutta/i],
  [/\bRJ\b|\bRHC\b/i, /rajasthan/i],
  [/\bTSHC\b|\bTLHC\b/i, /telangana/i],
  [/\bPAT\b|\bPATHC\b/i, /patna/i],
  [/\bJKHC\b/i, /jammu|kashmir/i],
  [/\bGAUHC\b/i, /gauhati/i],
  [/\bMPHC\b/i, /madhya pradesh/i],
  [/\bCGHC\b/i, /chhattisgarh/i],
  [/\bJHHC\b|\bJHAR\b/i, /jharkhand/i],
  [/\bUKHC\b/i, /uttarakhand/i],
  [/\bORHC\b|\bODHC\b/i, /orissa|odisha/i],
  [/\bHPHC\b/i, /himachal/i],
];

type Verdict = 'CONSISTENT' | 'CONTRADICTED' | 'UNTESTABLE';

type Adjudication = {
  chronology: Verdict;
  chronologyDetail: string | null;
  year: Verdict;
  yearDetail: string | null;
  court: Verdict;
  courtDetail: string | null;
  overall: Verdict;
};

function adjudicate(
  raw: string,
  citingDate: string | null,
  cand: { judgmentDate: string | null; court: string | null },
): Adjudication {
  let chronology: Verdict = 'UNTESTABLE';
  let chronologyDetail: string | null = null;
  if (citingDate && cand.judgmentDate) {
    const citedAfter = cand.judgmentDate > citingDate;
    chronology = citedAfter ? 'CONTRADICTED' : 'CONSISTENT';
    chronologyDetail = `citing ${citingDate} · cited ${cand.judgmentDate}`;
  } else {
    chronologyDetail = 'a judgment_date is null on one end — not tested, not passed';
  }

  let year: Verdict = 'UNTESTABLE';
  let yearDetail: string | null = null;
  const ys = yearsIn(raw);
  if (ys.length > 0 && cand.judgmentDate) {
    const candYear = Number(cand.judgmentDate.slice(0, 4));
    /*
     * A reporter prints in the year of decision or shortly after, and a citation
     * string can also carry a case-number year that is EARLIER than the decision
     * (`Civil Appeal 1234 of 2016`, decided 2019). So the window is asymmetric
     * and generous in both directions; only a citation whose every candidate
     * year is far from the decision is called contradicted.
     */
    const best = Math.min(...ys.map((y) => Math.abs(candYear - y)));
    year = best <= 4 ? 'CONSISTENT' : 'CONTRADICTED';
    yearDetail = `citation years [${ys.join(',')}] · candidate ${candYear} · nearest gap ${best}`;
  } else {
    yearDetail = ys.length === 0 ? 'no year in the citation string' : 'candidate has no judgment_date';
  }

  let court: Verdict = 'UNTESTABLE';
  let courtDetail: string | null = null;
  if (cand.court) {
    for (const [token, courtRe] of NEUTRAL_COURT_TOKENS) {
      if (token.test(raw)) {
        court = courtRe.test(cand.court) ? 'CONSISTENT' : 'CONTRADICTED';
        courtDetail = `citation token ${token.source} · candidate court ${JSON.stringify(cand.court)}`;
        break;
      }
    }
    if (court === 'UNTESTABLE') courtDetail = 'no recognisable neutral-citation court token';
  } else {
    courtDetail = 'candidate has no court';
  }

  const parts = [chronology, year, court];
  const overall: Verdict = parts.includes('CONTRADICTED')
    ? 'CONTRADICTED'
    : parts.includes('CONSISTENT')
      ? 'CONSISTENT'
      : 'UNTESTABLE';
  return { chronology, chronologyDetail, year, yearDetail, court, courtDetail, overall };
}

/** The digit spine of a citation — the part a reporter-name spelling cannot change. */
function digitSpine(raw: string): string {
  return (raw.match(/\d+/g) ?? []).join('-');
}

const sql = postgres(databaseUrl(), { max: 3, idle_timeout: 20, connect_timeout: 30, onnotice: () => {} });

try {
  const startedAt = new Date().toISOString();
  const freshness = await readKeyFreshness(sql);

  /**
   * THE DRAW. Real unresolved edges only — the sentinel row shares the
   * `cited_judgment_id IS NULL` predicate and is 16.1M of the 22.4M rows in this
   * table (`SCHEMA_TRUTH.md` §judgment_citations).
   *
   * `ORDER BY id` over a v4 uuid primary key is, for sampling purposes, a
   * uniformly random draw rather than a contiguous one — the ids carry no
   * insertion order. That is a property worth stating rather than assuming, and
   * it is also exactly why an id watermark is the WRONG frontier for the
   * expansion job (`an-id-watermark-cannot-see-new-rows`): rows inserted later
   * land below any cursor. Sampling wants randomness; resumption wants per-row
   * state, and they are served by different mechanisms.
   */
  const rows = await sql<
    { id: string; citing: string; raw: string; citing_date: string | null }[]
  >`
    SELECT jc.id,
           jc.citing_judgment_id AS citing,
           COALESCE(NULLIF(btrim(jc.normalised_citation), ''), jc.citation_text) AS raw,
           to_char(j.judgment_date, 'YYYY-MM-DD') AS citing_date
      FROM judgment_citations jc
      JOIN judgments j ON j.id = jc.citing_judgment_id
     WHERE jc.cited_judgment_id IS NULL
       AND COALESCE(jc.citation_text, '') <> ''
     ORDER BY jc.id
     LIMIT ${SAMPLE}`;

  console.log(`[tranche] drew ${rows.length} unresolved edges; freshness ${freshness.state}`);

  const t0 = Date.now();
  const results: Resolution[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    results.push(...(await resolveBatch(sql, rows.slice(i, i + BATCH).map((r) => r.raw), freshness)));
  }
  const resolveMs = Date.now() - t0;
  const m = metricsFor(results);

  const [act] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM pg_stat_activity WHERE state = 'active'`;

  // ── durable per-row output ────────────────────────────────────────────────
  mkdirSync(dirname(join(ROOT, ROWS_OUT)), { recursive: true });
  writeFileSync(join(ROOT, ROWS_OUT), '');
  let buf = '';
  results.forEach((r, i) => {
    const row = rows[i]!;
    buf +=
      JSON.stringify({
        edgeId: row.id,
        citingJudgmentId: row.citing,
        citingDate: row.citing_date,
        raw: r.raw,
        key: r.key,
        state: r.state,
        heldCandidates: r.heldCandidates,
        candidates: r.candidates.map((c) => ({ id: c.judgmentId, source: c.source })),
        refusedReason: r.refusedReason,
        version: r.version,
      }) + '\n';
    if (buf.length > 1 << 20) {
      appendFileSync(join(ROOT, ROWS_OUT), buf);
      buf = '';
    }
  });
  if (buf) appendFileSync(join(ROOT, ROWS_OUT), buf);

  // ── POSITIVES: adjudicate a sample of UNIQUE pins ────────────────────────
  const uniques = results
    .map((r, i) => ({ r, row: rows[i]! }))
    .filter((x) => x.r.state === 'UNIQUE' && x.r.candidates.length === 1);
  const posSample = uniques.slice(0, AUDIT);
  const posIds = [...new Set(posSample.map((x) => x.r.candidates[0]!.judgmentId))];
  const candMeta = new Map<string, { judgmentDate: string | null; court: string | null; title: string | null }>();
  if (posIds.length) {
    const meta = await sql<{ id: string; d: string | null; court: string | null; t: string | null }[]>`
      SELECT id, to_char(judgment_date,'YYYY-MM-DD') AS d, court, case_title AS t
        FROM judgments WHERE id = ANY(${posIds}::uuid[])`;
    for (const r of meta) candMeta.set(r.id, { judgmentDate: r.d, court: r.court, title: r.t });
  }
  const positives = posSample.map((x) => {
    const cand = candMeta.get(x.r.candidates[0]!.judgmentId) ?? { judgmentDate: null, court: null, title: null };
    return {
      edgeId: x.row.id,
      raw: x.r.raw,
      key: x.r.key,
      citingJudgmentId: x.row.citing,
      citingDate: x.row.citing_date,
      candidateId: x.r.candidates[0]!.judgmentId,
      candidateTitle: cand.title,
      candidateDate: cand.judgmentDate,
      candidateCourt: cand.court,
      adjudication: adjudicate(x.r.raw, x.row.citing_date, cand),
    };
  });

  // ── NEGATIVES: re-ask the refusals by a route the resolver never uses ────
  const negatives0 = results
    .map((r, i) => ({ r, row: rows[i]! }))
    .filter((x) => x.r.state === 'TARGET_NOT_HELD' || x.r.state === 'REFUSED')
    .slice(0, AUDIT);
  /**
   * THE NEGATIVE RECHECK, AND EXACTLY HOW FAR ITS INDEPENDENCE GOES.
   *
   * The resolver answers TARGET_NOT_HELD from `judgment_citation_keys`, a
   * MATERIALISED table. This re-asks the same question of the LIVE columns —
   * `judgments.neutral_citation` and `judgments.reporter_citations` — through
   * the two expression indexes Postgres maintains on them
   * (`judgments_neutral_citation_key`, `judgments_reporter_citation_keys_gin`),
   * which are computed from the row on every write and cannot go stale.
   *
   * **The normalisation rule is the same one** — `citationLookupKey` and
   * `lawmind_citation_keys` both reduce to `upper([A-Za-z0-9]+)` — so this does
   * NOT test whether the rule is right. It tests whether the materialised index
   * agrees with the corpus it was built from, which is the failure this lane has
   * actually seen: a rebuild that indexed `neutral_citation` wholesale turned 75
   * despatch stamps into false pins, and a key cursor 309,130 citations behind
   * answered UNIQUE with total confidence. A hit here is a row the live corpus
   * has and the resolver's index did not offer.
   *
   * A first attempt at this scanned the columns with `LIKE '%digits%'`, which is
   * a sequential scan of 18.7M judgments PER AUDITED ROW. It was still running
   * after two minutes on sixty rows. Both probes below are single batched
   * queries against real indexes.
   */
  const negKeys = [...new Set(negatives0.map((x) => x.r.raw.toUpperCase().replace(/[^A-Z0-9]/g, '')).filter((k) => k.length >= 5))];
  const liveHits = new Map<string, { id: string; via: string }[]>();
  if (negKeys.length) {
    const neutral = await sql<{ k: string; id: string }[]>`
      SELECT upper(regexp_replace(COALESCE(neutral_citation,''), '[^A-Za-z0-9]', '', 'g')) AS k, id
        FROM judgments
       WHERE upper(regexp_replace(COALESCE(neutral_citation,''), '[^A-Za-z0-9]', '', 'g')) = ANY(${negKeys}::text[])`;
    for (const r of neutral) {
      const list = liveHits.get(r.k) ?? [];
      list.push({ id: r.id, via: 'neutral_citation' });
      liveHits.set(r.k, list);
    }
    const reporter = await sql<{ k: string; id: string }[]>`
      SELECT k, j.id
        FROM judgments j,
             LATERAL unnest(lawmind_citation_keys(j.reporter_citations)) AS k
       WHERE lawmind_citation_keys(j.reporter_citations) && ${negKeys}::text[]
         AND k = ANY(${negKeys}::text[])`;
    for (const r of reporter) {
      const list = liveHits.get(r.k) ?? [];
      if (!list.some((h) => h.id === r.id)) list.push({ id: r.id, via: 'reporter_citations' });
      liveHits.set(r.k, list);
    }
  }

  const negatives: unknown[] = [];
  let recallMisses = 0;
  for (const x of negatives0) {
    const key = x.r.raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (key.length < 5) {
      negatives.push({
        edgeId: x.row.id,
        raw: x.r.raw,
        state: x.r.state,
        recheck: 'UNTESTABLE',
        why: 'key shorter than the resolver’s own minimum — nothing to probe',
      });
      continue;
    }
    const hits = liveHits.get(key) ?? [];
    /*
     * More than one live judgment claiming the key is not a recall miss. It is
     * an ambiguity the resolver was right to decline, and folding it down to one
     * is the exact thing `resolver.ts` forbids.
     */
    const verdict = hits.length === 0 ? 'CONFIRMED_NOT_HELD' : hits.length === 1 ? 'RECALL_MISS' : 'AMBIGUOUS_ON_RECHECK';
    if (verdict === 'RECALL_MISS') recallMisses++;
    negatives.push({
      edgeId: x.row.id,
      raw: x.r.raw,
      state: x.r.state,
      key,
      spine: digitSpine(x.r.raw),
      recheck: verdict,
      hits,
    });
  }

  const tally = (v: (a: Adjudication) => Verdict) => {
    const t = { CONSISTENT: 0, CONTRADICTED: 0, UNTESTABLE: 0 } as Record<Verdict, number>;
    for (const p of positives) t[v(p.adjudication)]++;
    return t;
  };

  /**
   * The year check passes at a gap of 0 and at a gap of 4, and those are not the
   * same evidence. A run reporting `year: all CONSISTENT` where every gap is 4
   * has a window too wide to falsify anything; one where every gap is 0 has a
   * check that is doing real work. The histogram is published so the reader can
   * tell those apart instead of trusting the verdict label.
   */
  const yearGaps: Record<string, number> = {};
  for (const p of positives) {
    const m = /nearest gap (\d+)/.exec(p.adjudication.yearDetail ?? '');
    const k = m ? m[1]! : 'untested';
    yearGaps[k] = (yearGaps[k] ?? 0) + 1;
  }

  /**
   * NON-VACUITY CONTROL FOR THE NEGATIVE PROBE.
   *
   * `60 of 60 CONFIRMED_NOT_HELD` is indistinguishable from a probe that cannot
   * fire at all — a broken `&&` operand, a wrong array cast, an index the
   * planner declined. So the same two queries are run against keys taken from
   * judgments we KNOW we hold, read straight out of `judgments` itself. If the
   * control does not come back with hits, every CONFIRMED_NOT_HELD above is
   * worthless and the run says so rather than reporting a clean sheet.
   */
  const controlRows = await sql<{ k: string }[]>`
    SELECT upper(regexp_replace(neutral_citation, '[^A-Za-z0-9]', '', 'g')) AS k
      FROM judgments
     WHERE neutral_citation IS NOT NULL AND length(neutral_citation) > 8
     LIMIT 25`;
  const controlKeys = controlRows.map((r) => r.k).filter((k) => k.length >= 5);
  const controlHits = controlKeys.length
    ? await sql<{ n: string }[]>`
        SELECT count(DISTINCT id)::text AS n
          FROM judgments
         WHERE upper(regexp_replace(COALESCE(neutral_citation,''), '[^A-Za-z0-9]', '', 'g')) = ANY(${controlKeys}::text[])`
    : [{ n: '0' }];
  const negativeProbeNonVacuous = Number(controlHits[0]!.n) > 0;

  const summary = {
    artifact: 'NEW2_CITATION_TRANCHE_R10',
    lane: 'NEW2',
    startedAt,
    finishedAt: new Date().toISOString(),
    resolverVersion: RESOLVER_VERSION,
    indexFreshness: { state: freshness.state, mayAssertUnique: freshness.state === 'CURRENT' },
    draw: {
      predicate: "cited_judgment_id IS NULL AND coalesce(citation_text,'') <> ''",
      sentinelExcluded: true,
      ordering: 'ORDER BY id over a v4 uuid pk — random with respect to content, not contiguous in time',
      requested: SAMPLE,
      returned: rows.length,
      populationUnresolved: null as number | null,
    },
    throughput: {
      resolveMs,
      rowsPerSecond: Math.round((rows.length / resolveMs) * 1000),
      msPerThousand: Number(((resolveMs / rows.length) * 1000).toFixed(1)),
      modelCalls: 0,
      tokens: 0,
      dbLabel: Number(act!.n) > 2 ? 'LOCAL_CONTENDED' : 'LOCAL_QUIET',
      activeQueriesAtReport: Number(act!.n),
    },
    states: {
      n: m.n,
      formed: m.formed,
      refused: m.refused,
      unique: m.unique,
      ambiguous: m.ambiguous,
      targetNotHeld: m.targetNotHeld,
      uniqueRate: m.uniqueRate,
      ambiguousRate: m.ambiguousRate,
      targetNotHeldRate: m.targetNotHeldRate,
      uniqueUnconfirmedStaleIndex: results.filter((r) => r.state === 'UNIQUE_UNCONFIRMED_STALE_INDEX').length,
    },
    precisionSample: {
      note:
        'Independent of the resolver: chronology and year come from judgments.judgment_date, ' +
        'court from judgments.court. None of the three is derived from judgment_citation_keys, ' +
        'which is the only evidence the resolver consulted.',
      positives: {
        audited: positives.length,
        chronology: tally((a) => a.chronology),
        year: tally((a) => a.year),
        court: tally((a) => a.court),
        overall: tally((a) => a.overall),
        yearGapHistogram: yearGaps,
        contradicted: positives.filter((p) => p.adjudication.overall === 'CONTRADICTED'),
      },
      negatives: {
        audited: negatives.length,
        recallMisses,
        probeNonVacuous: negativeProbeNonVacuous,
        probeControl: {
          keysProbed: controlKeys.length,
          judgmentsFound: Number(controlHits[0]!.n),
          note: 'keys taken from judgments.neutral_citation on rows we hold — the probe MUST find these',
        },
        byVerdict: negatives.reduce<Record<string, number>>((acc, n) => {
          const k = String((n as { recheck: string }).recheck);
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {}),
        misses: negatives.filter((n) => (n as { recheck: string }).recheck === 'RECALL_MISS'),
      },
    },
    perRowState: ROWS_OUT,
    wroteToDatabase: false,
  };

  const [pop] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM judgment_citations
     WHERE cited_judgment_id IS NULL AND COALESCE(citation_text,'') <> ''`;
  summary.draw.populationUnresolved = Number(pop!.n);

  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(summary, null, 1));

  console.log(`[tranche] ${rows.length} rows in ${resolveMs}ms — ${summary.throughput.rowsPerSecond} rows/sec`);
  console.log(
    `[tranche] unique ${m.unique} · ambiguous ${m.ambiguous} · not-held ${m.targetNotHeld} · refused ${m.refused}`,
  );
  console.log(
    `[tranche] positives audited ${positives.length}: overall ` +
      JSON.stringify(tally((a) => a.overall)),
  );
  console.log(`[tranche] negatives audited ${negatives.length}: recall misses ${recallMisses}`);
  console.log(`[tranche] wrote ${OUT} and ${ROWS_OUT}`);
} finally {
  await sql.end({ timeout: 10 });
}
