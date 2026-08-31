/**
 * NEW2 R14 FOLLOW-UP — re-measure ONLY the statute-freshness rows the handle
 * re-resolution affected, plus their controls.
 *
 * `docs/ai/new2-r14/statute-freshness-v1.json` STAYS FROZEN. Nothing here
 * rewrites it, and it is read only to fix the population: the 49 Acts it
 * sampled, split into the 25 it could not reach and the 24 it could. This
 * artifact carries its own `measuredAt` and its own scope, and its numbers are
 * NOT a correction posted over the originals — they are a second measurement of
 * the same Acts after `scripts/n2-indiacode-handle-reresolve.mts` replaced 46
 * dead handles with the official ones the source itself names.
 *
 * The five dimensions, their verdict vocabulary and the worst-of-dimensions
 * per-Act rule are the frozen run's, unchanged, so the two are comparable. What
 * changed is only which upstream item each Act is compared AGAINST.
 *
 * No applicability conclusion is drawn. That the source flags an Act repealed
 * is recorded as what the source says; whether a provision governs a given
 * matter on a given date is not a question this file answers or implies.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-statute-freshness-r14-followup.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = join(ROOT, 'docs/ai/new2-r14-followup');
mkdirSync(OUTDIR, { recursive: true });
const API = 'https://indiacode.gov.in/server/api';
const DELAY_MS = 1100;

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}
const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 60, connect_timeout: 30 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const normNum = (n: string | null): string | null =>
  n === null
    ? null
    : n
        .trim()
        .replace(/^0+(?=\d)/, '')
        .toUpperCase();

type Row = {
  id: string;
  act_id: string | null;
  short_title: string;
  act_number: string;
  act_year: number;
  enactment_date: Date | null;
  enforcement_date: Date | null;
  source_url: string;
  sections: number;
  amendments: number;
  latest_amendment_year: number | null;
  judgment_refs: number;
};
type Dim = 'EXACT_MATCH' | 'STALE' | 'UNKNOWN' | 'SOURCE_UNAVAILABLE';
type Up =
  | { found: false; how: 'HANDLE_404'; detail: string }
  | {
      found: true;
      how: 'HANDLE';
      handle: string;
      title: string;
      actNumber: string | null;
      actYear: string | null;
      enactDate: string | null;
      issued: string | null;
      repealed: string | null;
      stateName: string | null;
      ministryName: string | null;
      sectionCount: string | null;
      collection: string | null;
    };

const mv = (m: any, k: string): string | null => m?.[k]?.[0]?.value ?? null;
let REQUESTS = 0;

async function resolveByHandle(url: string): Promise<Up> {
  const handle = /handle\/(\d+\/\d+)/.exec(url)?.[1];
  if (!handle) return { found: false, how: 'HANDLE_404', detail: `no handle in ${url}` };
  await sleep(DELAY_MS);
  REQUESTS += 1;
  const res = await fetch(`${API}/pid/find?id=hdl:${handle}`, {
    headers: {
      accept: 'application/json',
      'user-agent': 'LawMind statute-freshness measurement (contact: repo maintainer)',
    },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok)
    return { found: false, how: 'HANDLE_404', detail: `hdl:${handle} returned ${res.status}` };
  const j: any = await res.json();
  const m = j.metadata ?? {};
  return {
    found: true,
    how: 'HANDLE',
    handle: j.handle,
    title: j.name ?? mv(m, 'dc.title') ?? '',
    actNumber: mv(m, 'dc.identifier.act_number'),
    actYear: mv(m, 'dc.date.act_year'),
    enactDate: mv(m, 'dc.date.enact_date'),
    issued: mv(m, 'dc.date.issued'),
    repealed: mv(m, 'dc.identifier.repealed'),
    stateName: mv(m, 'dc.identifier.state_name'),
    ministryName: mv(m, 'dc.identifier.ministry_name'),
    sectionCount: mv(m, 'dc.identifier.no_of_section'),
    collection: mv(m, 'dc.identifier.collection'),
  };
}

/** The frozen run's dimension logic, unchanged, so the two runs compare. */
function compare(row: Row, up: Up) {
  const dims: Record<string, { verdict: Dim; ours: unknown; theirs: unknown; note?: string }> = {};
  const material: string[] = [];

  if (!up.found) {
    for (const d of [
      'actIdentity',
      'currentRepealedState',
      'commencement',
      'latestRepresentedAmendment',
      'sectionExistence',
    ]) {
      dims[d] = { verdict: 'SOURCE_UNAVAILABLE', ours: null, theirs: null, note: up.detail };
    }
    return { dims, material };
  }

  // Leading zeros are compared away on BOTH sides. `04` and `4` are one field
  // formatted two ways, and the frozen run's byte comparison of them is the
  // single reason several Acts it HAD found were rejected as not agreeing.
  dims['actIdentity'] = {
    verdict:
      up.actNumber === null || up.actYear === null
        ? 'UNKNOWN'
        : normNum(up.actNumber) === normNum(row.act_number) && up.actYear === String(row.act_year)
          ? 'EXACT_MATCH'
          : 'STALE',
    ours: { actNumber: row.act_number, actYear: row.act_year },
    theirs: { actNumber: up.actNumber, actYear: up.actYear },
    note:
      normNum(row.act_number) !== row.act_number
        ? 'our act_number is zero-padded; compared with leading zeros stripped on both sides'
        : undefined,
  };

  dims['currentRepealedState'] = {
    verdict: 'UNKNOWN',
    ours: null,
    theirs: up.repealed,
    note: 'statutes carries no repeal column; the source flag is recorded, never interpreted',
  };

  const ourEnact = iso(row.enactment_date);
  dims['commencement'] = {
    verdict:
      up.enactDate === null ? 'UNKNOWN' : ourEnact === up.enactDate ? 'EXACT_MATCH' : 'STALE',
    ours: { enactmentDate: ourEnact, enforcementDate: iso(row.enforcement_date) },
    theirs: { enactDate: up.enactDate, issued: up.issued },
    note: 'the source carries no enforcement/commencement field, so our enforcement_date has nothing to be checked against',
  };
  if (dims['commencement'].verdict === 'STALE') {
    material.push(`enactment date: we hold ${ourEnact}, the source says ${up.enactDate}`);
  }

  dims['latestRepresentedAmendment'] = {
    verdict: 'UNKNOWN',
    ours: { latestAmendingActYear: row.latest_amendment_year, amendmentEvents: row.amendments },
    theirs: null,
    note: 'the source item metadata carries no amendment history; ours is parsed from footnotes and has nothing upstream to be compared against',
  };

  const theirSections = up.sectionCount === null ? null : Number(up.sectionCount);
  dims['sectionExistence'] = {
    verdict:
      theirSections === null || theirSections === 0
        ? 'UNKNOWN'
        : theirSections === row.sections
          ? 'EXACT_MATCH'
          : 'STALE',
    ours: row.sections,
    theirs: theirSections,
    note: theirSections === 0 ? 'the source publishes no_of_section = 0 for this item' : undefined,
  };

  return { dims, material };
}

async function main() {
  const frozen = JSON.parse(
    readFileSync(join(ROOT, 'docs/ai/new2-r14/statute-freshness-v1.json'), 'utf8'),
  ) as {
    generatedAt: string;
    dimensionTally: Record<Dim, number>;
    actTally: Record<string, number>;
    acts: Array<{ act: string; actVerdict: string; strata: string[] }>;
  };
  const reres = JSON.parse(
    readFileSync(join(OUTDIR, 'indiacode-handle-reresolution.json'), 'utf8'),
  ) as {
    measuredAt: string;
    verdicts: Array<{ act: string; classification: string; resolvedHandle: string | null }>;
  };
  const klass = new Map(reres.verdicts.map((v) => [v.act, v.classification]));
  const affected = new Set(
    reres.verdicts.filter((v) => v.classification === 'MOVED_OFFICIAL_HANDLE').map((v) => v.act),
  );
  const wasDead = new Set(
    frozen.acts.filter((a) => a.actVerdict === 'SOURCE_UNAVAILABLE').map((a) => a.act),
  );
  const strata = new Map(frozen.acts.map((a) => [a.act, a.strata]));
  const titles = frozen.acts.map((a) => a.act);

  const rows = await sql<Row[]>`
    SELECT s.id, s.act_id, s.short_title, s.act_number, s.act_year, s.enactment_date,
           s.enforcement_date, s.source_url,
           coalesce(sec.n, 0)::int AS sections,
           coalesce(a.amendments, 0)::int AS amendments,
           a.latest_amendment_year::int AS latest_amendment_year,
           coalesce(r.judgment_refs, 0)::int AS judgment_refs
      FROM statutes s
      LEFT JOIN (SELECT statute_id, count(*) AS n FROM statute_sections GROUP BY 1) sec ON sec.statute_id = s.id
      LEFT JOIN (
        SELECT ss.statute_id, count(*) AS amendments, max(am.amending_act_year) AS latest_amendment_year
          FROM statute_amendments am JOIN statute_sections ss ON ss.id = am.statute_section_id
         GROUP BY 1) a ON a.statute_id = s.id
      LEFT JOIN (SELECT statute_id, count(*) AS judgment_refs FROM judgment_statute_refs
                  WHERE statute_id IS NOT NULL GROUP BY 1) r ON r.statute_id = s.id
     WHERE s.short_title = ANY(${titles}) ORDER BY s.short_title`;

  const tally: Record<Dim, number> = {
    EXACT_MATCH: 0,
    STALE: 0,
    UNKNOWN: 0,
    SOURCE_UNAVAILABLE: 0,
  };
  const perAct: Record<string, number> = {};
  const byPopulation: Record<string, Record<Dim, number>> = {};
  const materialErrors: Array<{ act: string; problems: string[] }> = [];
  const clusters: Record<string, number> = {};
  const results: unknown[] = [];

  for (const row of rows) {
    const population = affected.has(row.short_title)
      ? wasDead.has(row.short_title)
        ? 'AFFECTED_WAS_SOURCE_UNAVAILABLE'
        : 'AFFECTED_WAS_SEARCH_RESOLVED'
      : 'CONTROL_HANDLE_UNCHANGED';
    const up = await resolveByHandle(row.source_url);
    const { dims, material } = compare(row, up);
    byPopulation[population] ??= { EXACT_MATCH: 0, STALE: 0, UNKNOWN: 0, SOURCE_UNAVAILABLE: 0 };
    for (const d of Object.values(dims)) {
      tally[d.verdict] += 1;
      byPopulation[population]![d.verdict] += 1;
    }

    const verdicts = Object.values(dims).map((d) => d.verdict);
    const worst: Dim = verdicts.includes('STALE')
      ? 'STALE'
      : verdicts.includes('SOURCE_UNAVAILABLE')
        ? 'SOURCE_UNAVAILABLE'
        : verdicts.includes('UNKNOWN')
          ? 'UNKNOWN'
          : 'EXACT_MATCH';
    perAct[worst] = (perAct[worst] ?? 0) + 1;
    if (material.length) materialErrors.push({ act: row.short_title, problems: material });
    if (!up.found)
      clusters[`${up.how}::${new URL(row.source_url).host}`] =
        (clusters[`${up.how}::${new URL(row.source_url).host}`] ?? 0) + 1;
    else if (up.stateName && up.stateName.toUpperCase() !== 'CENTRAL')
      clusters[`SOURCED_FROM_STATE_REPOSITORY::${up.stateName}`] =
        (clusters[`SOURCED_FROM_STATE_REPOSITORY::${up.stateName}`] ?? 0) + 1;

    results.push({
      act: row.short_title,
      actNumber: row.act_number,
      actYear: row.act_year,
      strata: strata.get(row.short_title) ?? [],
      population,
      handleReresolution: klass.get(row.short_title) ?? 'NOT_RERESOLVED',
      ourSections: row.sections,
      ourAmendmentEvents: row.amendments,
      judgmentReferences: row.judgment_refs,
      sourceUrl: row.source_url,
      upstream: up.found
        ? {
            how: up.how,
            handle: up.handle,
            title: up.title,
            collection: up.collection,
            stateName: up.stateName,
            ministryName: up.ministryName,
            repealed: up.repealed,
          }
        : { how: up.how, detail: up.detail },
      dimensions: dims,
      actVerdict: worst,
      frozenActVerdict: frozen.acts.find((a) => a.act === row.short_title)?.actVerdict ?? null,
    });
    process.stdout.write(
      `  ${worst.padEnd(19)} ${population.padEnd(33)} ${row.short_title.slice(0, 55)}\n`,
    );
  }
  return {
    frozen,
    reres,
    rows,
    tally,
    perAct,
    byPopulation,
    materialErrors,
    clusters,
    results,
    affected,
    wasDead,
  };
}

const r = await main();
const report = {
  artifact: 'NEW2_R14_FOLLOWUP_STATUTE_FRESHNESS',
  lane: 'NEW2',
  measuredAt: new Date().toISOString(),
  scope: {
    population:
      'the 49 Acts of STATUTE_FRESHNESS_V1 — the 25 it recorded SOURCE_UNAVAILABLE, plus the 24 it resolved, carried as controls',
    affectedByHandleReresolution: r.affected.size,
    controlsWithUnchangedHandle: r.rows.length - r.affected.size,
    actsMeasured: r.rows.length,
    frozenMeasurementGeneratedAt: r.frozen.generatedAt,
    handleReresolutionMeasuredAt: r.reres.measuredAt,
    doesNotSupersede:
      'docs/ai/new2-r14/statute-freshness-v1.json is unchanged and remains the R14 measurement of record for the state of the corpus on the date it was taken',
  },
  source: {
    name: 'India Code (Government of India)',
    api: API,
    requestsIssued: REQUESTS,
    delayMs: DELAY_MS,
  },
  method:
    'Identical to the frozen run: the same five dimensions, the same verdict vocabulary, the same worst-of-dimensions per-Act rule. Two things differ — each Act is fetched by the handle the source itself names for it, and act numbers are compared with leading zeros stripped on both sides.',
  denominator: { acts: r.rows.length, dimensionsPerAct: 5, dimensionChecks: r.rows.length * 5 },
  dimensionTally: r.tally,
  dimensionTallyByPopulation: r.byPopulation,
  actTally: r.perAct,
  materialTemporalErrors: { count: r.materialErrors.length, detail: r.materialErrors },
  comparisonWithFrozenRun: {
    note: 'Side by side, not overwritten. The frozen run measured what we could reach on 30 Aug 2026; this one measures the same Acts after the handles were re-resolved.',
    frozen: { dimensionTally: r.frozen.dimensionTally, actTally: r.frozen.actTally },
    followUp: { dimensionTally: r.tally, actTally: r.perAct },
  },
  clusters: { note: 'A cluster is escalated as a cluster.', counts: r.clusters },
  caveats: [
    'This is a second measurement of the same 49 Acts, not a correction of the first. Both stand, each with its own measuredAt.',
    'The source publishes no commencement/enforcement field, so our enforcement_date — including the 2024-07-01 dates on BNS, BNSS and BSA — is unchecked here too, not confirmed.',
    'The source publishes no amendment history on the item, so latestRepresentedAmendment stays UNKNOWN for every Act.',
    'statutes still has no repeal column, so currentRepealedState stays UNKNOWN on our side for the whole corpus. The source flag is recorded verbatim and is not treated as legally dispositive.',
    'Acts whose upstream item is a State reproduction rather than the CENTRAL one are recorded in clusters; the reproduction agrees on act number and year but is a weaker provenance and is not silently equated with the Central item.',
    'No applicability conclusion is drawn anywhere in this artifact.',
  ],
  acts: r.results,
};
const out = join(OUTDIR, 'statute-freshness-followup.json');
const body = JSON.stringify(report, null, 1);
writeFileSync(out, body);
writeFileSync(
  join(OUTDIR, 'statute-freshness-followup.sha256'),
  `${createHash('sha256').update(body).digest('hex')}  statute-freshness-followup.json\n`,
);
process.stdout.write(
  `\n${JSON.stringify({ denominator: report.denominator, dimensionTally: r.tally, byPopulation: r.byPopulation, actTally: r.perAct, materialTemporalErrors: r.materialErrors.length, clusters: r.clusters }, null, 1)}\n`,
);
await sql.end();
