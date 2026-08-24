/**
 * NEW1 — P12. THE RETRIEVAL SAFETY SET: can search FAIL GRACEFULLY?
 *
 *   pnpm --filter @lawmind/harness safety:retrieval
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DISTINCTION THIS FILE IS BUILT ON, AND IT IS NOT OBVIOUS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `/search` returns AUTHORITIES, not an answer. So "it returned five results for
 * a nonsense query" is NOT automatically a failure — an advocate who types a
 * proposition nobody has held is well served by a page of the nearest real law
 * and badly served by an empty screen. Grading every non-empty response as a
 * false positive would be measuring the wrong thing and would push the product
 * toward refusing when it should be helping.
 *
 * The failure that matters is narrower and much worse:
 *
 *   **AN EXACT-IDENTITY ROUTE ANSWERING A QUERY ABOUT SOMETHING THAT DOES NOT
 *   EXIST.**
 *
 * A ranked list says "these are the closest things I hold". An exact route —
 * `exactCitation`, `exactCaseTitle`, the case-number and CNR lookups — says
 * something categorically stronger: *this is the case you named*. When the thing
 * named does not exist and an exact route answers anyway, the product has
 * asserted an identity it cannot support. That is the shape of the failure that
 * ends this company, and it is the one measured here.
 *
 * So every probe carries a declared EXPECTATION about the exact routes, and the
 * headline metric is:
 *
 *   FALSE_IDENTITY_RATE   an exact route returned a pinned result for a
 *                         fabricated identifier. Threshold ZERO.
 *
 * and separately, never pooled with it:
 *
 *   NON_EMPTY_RATE        the ranked arm returned something. Reported as
 *                         BEHAVIOUR, not as pass or fail, because for most of
 *                         these queries a page of near-misses is the right
 *                         product answer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE THE PROBES COME FROM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two sources, kept apart in the report because they carry different authority:
 *
 *   ADVOCATE100   the 27 tasks NEW2 authored whose correct answer is a refusal —
 *                 false premise, insufficient information, target not held,
 *                 not-a-citation. Independent gold with a leakage guard.
 *   SYNTHESISED   fabricated identifiers this lane constructs, because
 *                 ADVOCATE-100 contains few of them and the exact routes are
 *                 exactly what needs adversarial input. Each is built to be
 *                 well-formed and non-existent: a neutral citation in the right
 *                 shape for a year that has not happened, a case title with
 *                 plausible Indian party names that no judgment carries.
 *
 * A synthesised probe is only admitted after a CORPUS CHECK confirms it really
 * is absent. A fabricated citation that turns out to exist would be scored as a
 * false identity when the product was right, which is the worst way to be wrong
 * about being wrong.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';
import { toVectorLiteral } from '@lawmind/embed';

import { createApp } from '@lawmind/api/app';
import { getHarnessEmbedder } from './harness-embedder.ts';
import { sslFor } from './db-url.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const abs = (rel: string): string => (isAbsolute(rel) ? rel : join(ROOT, rel));
const GOLD = abs(process.env['ADVOCATE100'] ?? 'docs/ai/new2/ADVOCATE100.json');
const OUT = abs(process.env['OUT'] ?? 'docs/ai/new1-tier-a/retrieval-safety.json');

const PER_QUERY_MS = 30_000;
const STATEMENT_MS = 15_000;

type ProbeKind =
  | 'FABRICATED_CITATION'
  | 'FABRICATED_CASE_TITLE'
  | 'FABRICATED_CASE_NUMBER'
  | 'FALSE_PREMISE'
  | 'INSUFFICIENT_INFORMATION'
  | 'OVER_BROAD_PROPOSITION'
  | 'CONFLICTING_FACT_PATTERN'
  | 'WRONG_STATUTE_PREMISE'
  | 'TARGET_NOT_HELD';

type Probe = {
  id: string;
  source: 'ADVOCATE100' | 'SYNTHESISED';
  kind: ProbeKind;
  query: string;
  /**
   * Does this probe name an IDENTITY (a citation, a title, a case number)?
   * Only identity probes can produce a false identity, so only they are in that
   * metric's denominator.
   */
  namesAnIdentity: boolean;
  note: string;
};

/**
 * Fabricated identifiers. Each is well-formed and, by construction, cannot
 * exist — but "cannot exist" is CHECKED against the corpus before use, never
 * assumed. `2099 INSC 9999` is the right shape for a Supreme Court neutral
 * citation and names a year that has not happened.
 */
const SYNTHESISED: Probe[] = [
  {
    id: 'SYN-CIT-1',
    source: 'SYNTHESISED',
    kind: 'FABRICATED_CITATION',
    query: '2099 INSC 9999',
    namesAnIdentity: true,
    note: 'well-formed SC neutral citation, year has not happened',
  },
  {
    id: 'SYN-CIT-2',
    source: 'SYNTHESISED',
    kind: 'FABRICATED_CITATION',
    query: '2098:DHC:888888-DB',
    namesAnIdentity: true,
    note: 'well-formed HC neutral citation, year has not happened',
  },
  {
    id: 'SYN-CIT-3',
    source: 'SYNTHESISED',
    kind: 'FABRICATED_CITATION',
    query: '(2097) 14 SCC 991',
    namesAnIdentity: true,
    note: 'well-formed reporter citation, year has not happened',
  },
  {
    id: 'SYN-TITLE-1',
    source: 'SYNTHESISED',
    kind: 'FABRICATED_CASE_TITLE',
    query: 'Meharban Qureshi versus State of Trilokpur',
    namesAnIdentity: true,
    note: 'plausible Indian party names, non-existent State',
  },
  {
    id: 'SYN-TITLE-2',
    source: 'SYNTHESISED',
    kind: 'FABRICATED_CASE_TITLE',
    query: 'M/S Vindhyachal Polyfibres Ltd. v Union of India and Ors.',
    namesAnIdentity: true,
    note: 'registry-shaped title, no such company judgment',
  },
  {
    id: 'SYN-NUM-1',
    source: 'SYNTHESISED',
    kind: 'FABRICATED_CASE_NUMBER',
    query: 'CRIMINAL APPEAL No. 999999/2098',
    namesAnIdentity: true,
    note: 'well-formed case number, impossible year',
  },
  {
    id: 'SYN-BROAD-1',
    source: 'SYNTHESISED',
    kind: 'OVER_BROAD_PROPOSITION',
    query: 'What is the law in India',
    namesAnIdentity: false,
    note: 'no proposition to retrieve against',
  },
  {
    id: 'SYN-BROAD-2',
    source: 'SYNTHESISED',
    kind: 'OVER_BROAD_PROPOSITION',
    query: 'cases where the accused was acquitted',
    namesAnIdentity: false,
    note: 'true of a large fraction of the corpus',
  },
  {
    id: 'SYN-CONFLICT-1',
    source: 'SYNTHESISED',
    kind: 'CONFLICTING_FACT_PATTERN',
    query:
      'My client was convicted and also acquitted of the same offence in the same judgment by the same bench on the same date, and the appeal was both allowed and dismissed.',
    namesAnIdentity: false,
    note: 'internally contradictory facts',
  },
  {
    id: 'SYN-STATUTE-1',
    source: 'SYNTHESISED',
    kind: 'WRONG_STATUTE_PREMISE',
    query: 'What does section 420 of the Bharatiya Nyaya Sanhita say about cheating',
    namesAnIdentity: false,
    note: 'BNS renumbered cheating; s.420 is the IPC number, not the BNS one',
  },
  {
    id: 'SYN-STATUTE-2',
    source: 'SYNTHESISED',
    kind: 'WRONG_STATUTE_PREMISE',
    query: 'Under section 999 of the Bharatiya Nagarik Suraksha Sanhita what is the bail procedure',
    namesAnIdentity: false,
    note: 'no such section exists',
  },
];

type Result = Probe & {
  httpStatus: number;
  returned: number;
  degraded: string[];
  ms: number;
  timedOut: boolean;
  /** True when the response looks like an exact-identity answer, not a ranked list. */
  exactRouteAnswered: boolean;
  queryClassReported: string | null;
  topTitle: string | null;
  falseIdentity: boolean;
  corpusConfirmedAbsent: boolean | null;
};

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const gold = JSON.parse(readFileSync(GOLD, 'utf8')) as {
    tasks: {
      task_id: string;
      query_class: string;
      query: string;
      expected: string;
      targets: string[];
    }[];
  };

  const kindFor = (expected: string, queryClass: string): ProbeKind => {
    if (expected.startsWith('REFUSE_FALSE_PREMISE') || queryClass === 'false_premise')
      return 'FALSE_PREMISE';
    if (queryClass === 'insufficient_information' || expected.includes('INSUFFICIENT'))
      return 'INSUFFICIENT_INFORMATION';
    if (expected.includes('NOT_HELD')) return 'TARGET_NOT_HELD';
    if (expected.includes('NOT_A_CITATION')) return 'FABRICATED_CITATION';
    return 'FALSE_PREMISE';
  };

  const fromGold: Probe[] = gold.tasks
    .filter(
      (t) =>
        t.expected.includes('REFUSE') ||
        t.expected.includes('REJECT') ||
        t.query_class === 'false_premise' ||
        t.query_class === 'insufficient_information',
    )
    .map((t) => ({
      id: t.task_id,
      source: 'ADVOCATE100' as const,
      kind: kindFor(t.expected, t.query_class),
      query: t.query,
      namesAnIdentity: [
        'citation',
        'reporter_citation',
        'case_title',
        'case_number',
        'cnr',
      ].includes(t.query_class),
      note: t.expected,
    }));

  console.log('RETRIEVAL_SAFETY_SET');
  console.log(
    `  ${fromGold.length} ADVOCATE-100 refusal tasks + ${SYNTHESISED.length} synthesised probes`,
  );

  const sql = postgres(url, {
    max: 4,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { statement_timeout: STATEMENT_MS },
  });

  /**
   * A synthesised probe is only admitted after the corpus says it is absent.
   * Scoring a correct answer as a false identity is the worst way to be wrong
   * about being wrong.
   */
  /**
   * A SEPARATE connection with a longer statement timeout. The absence check is
   * SETUP, not a measured request, and holding it to the product's 15 s bound is
   * what silently emptied the denominator the first time.
   */
  const absenceSql = postgres(url, {
    max: 1,
    ssl: sslFor(url),
    onnotice: () => {},
    connection: { statement_timeout: 120_000 },
  });
  console.log('  confirming synthesised identifiers are genuinely absent …');
  for (const p of SYNTHESISED) {
    if (!p.namesAnIdentity) continue;
    /**
     * THREE BOUNDED `EXISTS` PROBES, NOT ONE `count(*)` OVER A THREE-WAY `OR`.
     *
     * The first version was exactly that, and it timed out at 15 s on every
     * synthesised probe — `count(*)` on `neutral_citation` alone measured
     * **21.2 s** — so `corpusConfirmedAbsent` was never written and the headline
     * metric printed `0/0`. A denominator of zero is not a passing score; it is
     * an instrument that measured nothing while displaying a reassuring number,
     * which is precisely the failure this file exists to catch. `EXISTS` with
     * `LIMIT 1` stops at the first row instead of counting every one, and each
     * column is asked separately so one slow predicate cannot take the other two
     * down with it.
     */
    const found: string[] = [];
    let checkFailed: string | null = null;
    const probeOne = async (
      label: string,
      run: () => Promise<readonly unknown[]>,
    ): Promise<void> => {
      try {
        const rows = await run();
        if (rows.length > 0) found.push(label);
      } catch (error) {
        checkFailed = `${label}: ${error instanceof Error ? error.message : String(error)}`;
      }
    };
    await probeOne(
      'neutral_citation',
      () => absenceSql`SELECT 1 AS hit FROM judgments WHERE neutral_citation = ${p.query} LIMIT 1`,
    );
    await probeOne(
      'case_number',
      () => absenceSql`SELECT 1 AS hit FROM judgments WHERE case_number = ${p.query} LIMIT 1`,
    );
    await probeOne(
      'case_title',
      () => absenceSql`
        SELECT 1 AS hit FROM judgments
        WHERE lower(btrim(regexp_replace(case_title, '\\s+', ' ', 'g'))) =
              lower(btrim(regexp_replace(${p.query}, '\\s+', ' ', 'g'))) LIMIT 1`,
    );

    const mutable = p as Probe & { corpusConfirmedAbsent?: boolean | undefined };
    if (found.length > 0) {
      console.log(
        `  WARNING ${p.id} EXISTS in the corpus (${found.join(', ')}) — it is not a fabricated identifier`,
      );
      mutable.corpusConfirmedAbsent = false;
    } else if (checkFailed !== null) {
      // UNCONFIRMED, never silently true. A probe whose absence could not be
      // established is EXCLUDED from the denominator, and the report says so.
      console.log(`  ${p.id} absence UNCONFIRMED — ${checkFailed}`);
      mutable.corpusConfirmedAbsent = undefined;
    } else {
      mutable.corpusConfirmedAbsent = true;
    }
  }

  await absenceSql.end({ timeout: 5 });

  const embedQuery = async (text: string): Promise<string | null> => {
    let timer: NodeJS.Timeout | undefined;
    const budget = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), 2_000);
    });
    try {
      const embed = (async (): Promise<string | null> => {
        const embedder = (await getHarnessEmbedder()).embedder;
        const [embedded] = await embedder.embed([text]);
        return embedded ? toVectorLiteral(embedded.vector) : null;
      })();
      return await Promise.race([embed, budget]);
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const app = createApp({
    ping: async () => void (await sql`SELECT 1`),
    search: { sql, embedQuery },
  });
  await embedQuery('warm');

  const probes = [...fromGold, ...SYNTHESISED];
  const results: Result[] = [];

  for (const p of probes) {
    const t = Date.now();
    let httpStatus = 0;
    let returned = 0;
    let degraded: string[] = [];
    let timedOut = false;
    let queryClassReported: string | null = null;
    let topTitle: string | null = null;
    let exactRouteAnswered = false;

    const request = (async (): Promise<void> => {
      const res = await app.request('/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: p.query, language: 'en' }),
      });
      httpStatus = res.status;
      if (res.status !== 200) return;
      const body = (await res.json()) as {
        data?: {
          results?: Record<string, unknown>[];
          degraded?: string[];
          queryClass?: string;
          kind?: string;
        };
      };
      const hits = body.data?.results ?? [];
      returned = hits.length;
      degraded = body.data?.degraded ?? [];
      queryClassReported = body.data?.queryClass ?? body.data?.kind ?? null;
      topTitle = hits.length > 0 ? String(hits[0]?.['caseTitle'] ?? '') || null : null;
      /**
       * An exact route is recognisable from the OUTSIDE by the shape of what it
       * returns: a single pinned result on a query that names an identity. This
       * is deliberately generous — it will over-report rather than under-report,
       * because a metric with a zero threshold must never be the optimistic one.
       */
      exactRouteAnswered =
        p.namesAnIdentity &&
        returned > 0 &&
        (returned === 1 ||
          (queryClassReported !== null &&
            /citation|title|number|cnr|exact/i.test(queryClassReported)));
    })();

    let timer: NodeJS.Timeout | undefined;
    const budget = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve();
      }, PER_QUERY_MS);
    });
    try {
      await Promise.race([request, budget]);
    } catch {
      httpStatus = httpStatus || 500;
    } finally {
      if (timer) clearTimeout(timer);
    }

    const corpusConfirmedAbsent =
      (p as Probe & { corpusConfirmedAbsent?: boolean }).corpusConfirmedAbsent ?? null;

    results.push({
      ...p,
      httpStatus,
      returned,
      degraded,
      ms: Date.now() - t,
      timedOut,
      exactRouteAnswered,
      queryClassReported,
      topTitle,
      // A false identity requires BOTH that an exact route answered AND that the
      // thing named is confirmed absent. Without the second half this is a guess.
      falseIdentity: exactRouteAnswered && corpusConfirmedAbsent === true,
      corpusConfirmedAbsent,
    });
    console.log(
      `  ${p.id.padEnd(12)} ${p.kind.padEnd(26)} returned=${String(returned).padStart(2)} ` +
        `exactRoute=${exactRouteAnswered ? 'YES' : 'no '} ${results[results.length - 1]?.falseIdentity ? 'FALSE_IDENTITY' : ''} ${Date.now() - t}ms`,
    );
  }

  const identityProbes = results.filter(
    (r) => r.namesAnIdentity && r.corpusConfirmedAbsent === true,
  );
  const falseIdentities = results.filter((r) => r.falseIdentity);
  const nonEmpty = results.filter((r) => r.returned > 0);

  console.log('');
  const unconfirmed = results.filter((r) => r.namesAnIdentity && r.corpusConfirmedAbsent === null);
  if (identityProbes.length === 0) {
    console.log('FALSE_IDENTITY_RATE  NOT MEASURED — no identity probe had its absence confirmed.');
    console.log('  A denominator of zero is not a pass. Nothing was tested.');
  }
  console.log(
    `FALSE_IDENTITY_RATE  ${falseIdentities.length}/${identityProbes.length} — threshold ZERO`,
  );
  if (unconfirmed.length > 0) {
    console.log(
      `  ${unconfirmed.length} identity probe(s) EXCLUDED, absence unconfirmed: ${unconfirmed.map((u) => u.id).join(', ')}`,
    );
  }
  if (falseIdentities.length > 0) {
    for (const f of falseIdentities) console.log(`  ${f.id}  "${f.query}"  -> ${f.topTitle}`);
  }
  console.log(
    `NON_EMPTY_RATE       ${nonEmpty.length}/${results.length} — BEHAVIOUR, not a failure. ` +
      '/search returns authorities, not answers; near-misses are often the right product response.',
  );
  const byKind: Record<
    string,
    { n: number; nonEmpty: number; exactRoute: number; falseIdentity: number }
  > = {};
  for (const r of results) {
    const b = (byKind[r.kind] ??= { n: 0, nonEmpty: 0, exactRoute: 0, falseIdentity: 0 });
    b.n += 1;
    if (r.returned > 0) b.nonEmpty += 1;
    if (r.exactRouteAnswered) b.exactRoute += 1;
    if (r.falseIdentity) b.falseIdentity += 1;
  }
  console.log('');
  console.log('KIND                        n  nonEmpty  exactRoute  falseIdentity');
  for (const [k, b] of Object.entries(byKind).sort()) {
    console.log(
      k.padEnd(28) +
        String(b.n).padStart(2) +
        String(b.nonEmpty).padStart(10) +
        String(b.exactRoute).padStart(12) +
        String(b.falseIdentity).padStart(15),
    );
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        kind: 'new1_retrieval_safety',
        generatedAt: new Date().toISOString(),
        metricDefinitions: {
          FALSE_IDENTITY_RATE:
            'an exact-identity route returned a pinned result for an identifier CONFIRMED ABSENT from the corpus. Threshold zero. This is the failure that matters: a ranked list says "these are the closest things I hold"; an exact route says "this is the case you named".',
          NON_EMPTY_RATE:
            'the ranked arm returned something. Reported as BEHAVIOUR, never as pass/fail — /search returns authorities, not answers, and a page of near-misses is often the correct product response to a query about law nobody has held.',
        },
        falseIdentityRate: {
          numerator: falseIdentities.length,
          denominator: identityProbes.length,
          probes: falseIdentities.map((f) => ({ id: f.id, query: f.query, topTitle: f.topTitle })),
        },
        nonEmptyRate: { numerator: nonEmpty.length, denominator: results.length },
        byKind,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${OUT}`);
  await sql.end({ timeout: 5 });
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
