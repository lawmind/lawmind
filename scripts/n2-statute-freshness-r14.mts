/**
 * NEW2 R14 — STATUTE_FRESHNESS_V1.
 *
 * MEASURE, DO NOT REDESIGN. This builds no ingestion path, writes no statute
 * row and changes no text. It asks one question of a stratified sample of the
 * Acts we hold — *is what we store still what the official source says?* — and
 * reports the answer with its unknowns visible.
 *
 * ## The source
 *
 * India Code is the Government of India's own consolidated repository and is
 * the only source consulted. It MIGRATED HOSTS: `www.indiacode.nic.in/handle/…`
 * now 404s and `indiacode.gov.in` serves a DSpace 7 SPA whose REST API
 * (`/server/api/pid/find?id=hdl:…`) returns the item metadata directly. Every
 * `source_url` we stored against the old host is therefore dead, and an Act
 * reached only by search is recorded as reached by search — a weaker identity
 * than a handle, and never silently equated with one.
 *
 * ## What is measured, and what is deliberately not
 *
 *   act identity          act number and year, from the source's own fields
 *   current/repealed      the source's `dc.identifier.repealed` flag
 *   commencement          enactment and, where the source carries it, enforcement
 *   latest amendment      what our `statute_amendments` represents, against what
 *                         the source represents — UNKNOWN where it carries none
 *   section existence     our section count against the source's own count
 *   predecessor/successor `statute_mappings` coverage, reported as coverage
 *
 * **No legal applicability conclusion is drawn anywhere in this file.** That an
 * Act is flagged repealed upstream, or that a mapping row pairs an IPC section
 * with a BNS section, is recorded as what the source says. Whether a given
 * provision applies to a given offence on a given date is a question for an
 * advocate and this program does not answer it, does not imply it, and does not
 * let a caller infer it from a field name.
 *
 * Usage:
 *   tsx scripts/n2-statute-freshness-r14.mts
 *   tsx scripts/n2-statute-freshness-r14.mts --cap 12 --offline
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = join(ROOT, 'docs/ai/new2-r14');
mkdirSync(OUTDIR, { recursive: true });

const arg = (n: string, d: string) => {
  const at = process.argv.indexOf(`--${n}`);
  return at < 0 ? d : (process.argv[at + 1] ?? d);
};
const CAP = Number(arg('cap', '10'));
const OFFLINE = process.argv.includes('--offline');
/** The grant is politeness, not permission: one request a second, sequential. */
const DELAY_MS = Number(arg('delay', '1100'));
const API = 'https://indiacode.gov.in/server/api';

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
const TITLE_STOP = new Set(['THE', 'ACT', 'AND', 'OF', 'FOR']);
/** Distinctive words of an Act's short title, year and punctuation removed. */
const tokensOf = (t: string): Set<string> =>
  new Set(
    (t || '').toUpperCase().replace(/\b(19|20)\d{2}\b/g, ' ').split(/[^A-Z]+/).filter((x) => x.length >= 4 && !TITLE_STOP.has(x)),
  );

type Row = {
  id: string;
  act_id: string;
  short_title: string;
  act_number: string;
  act_year: number;
  enactment_date: Date | null;
  enforcement_date: Date | null;
  ministry: string | null;
  source_url: string;
  sections: number;
  amendments: number;
  latest_amendment_year: number | null;
  judgment_refs: number;
};

/**
 * The sample. Every stratum the instruction names is a stratum here, and the
 * six Acts it names by name are taken WHOLE rather than sampled — a freshness
 * measurement that might miss BNS by luck of the draw is not a measurement.
 */
const STRATA: Array<{ name: string; where: ReturnType<typeof sql>; whole?: boolean }> = [
  {
    name: 'NAMED_SIX',
    whole: true,
    where: sql`s.short_title ~* '(Bharatiya Nyaya Sanhita|Bharatiya Nagarik Suraksha|Bharatiya Sakshya|Indian Penal Code|Code of Criminal Procedure|Indian Evidence Act)'`,
  },
  { name: 'HEAVILY_JUDGMENT_REFERENCED', where: sql`r.judgment_refs > 0` },
  { name: 'WITH_KNOWN_AMENDMENTS', where: sql`a.amendments > 0` },
  { name: 'CURRENT_CENTRAL_RECENT', where: sql`s.act_year >= 2015` },
  { name: 'REPEAL_TITLED', where: sql`s.short_title ~* 'repeal'` },
  { name: 'PRE_INDEPENDENCE', where: sql`s.act_year < 1947` },
];

async function pick(): Promise<Array<Row & { strata: string[] }>> {
  const chosen = new Map<string, Row & { strata: string[] }>();
  for (const st of STRATA) {
    const rows = await sql<Row[]>`
      SELECT s.id, s.act_id, s.short_title, s.act_number, s.act_year,
             s.enactment_date, s.enforcement_date, s.ministry, s.source_url,
             coalesce(sec.n, 0)::int             AS sections,
             coalesce(a.amendments, 0)::int      AS amendments,
             a.latest_amendment_year::int        AS latest_amendment_year,
             coalesce(r.judgment_refs, 0)::int   AS judgment_refs
        FROM statutes s
        LEFT JOIN (SELECT statute_id, count(*) AS n FROM statute_sections GROUP BY 1) sec ON sec.statute_id = s.id
        LEFT JOIN (
          SELECT ss.statute_id, count(*) AS amendments, max(am.amending_act_year) AS latest_amendment_year
            FROM statute_amendments am JOIN statute_sections ss ON ss.id = am.statute_section_id
           GROUP BY 1) a ON a.statute_id = s.id
        LEFT JOIN (SELECT statute_id, count(*) AS judgment_refs FROM judgment_statute_refs
                    WHERE statute_id IS NOT NULL GROUP BY 1) r ON r.statute_id = s.id
       WHERE ${st.where}
       ORDER BY ${st.name === 'HEAVILY_JUDGMENT_REFERENCED' ? sql`coalesce(r.judgment_refs,0) DESC,` : sql``}
                ${st.name === 'WITH_KNOWN_AMENDMENTS' ? sql`coalesce(a.amendments,0) DESC,` : sql``}
                md5(s.act_id)
       LIMIT ${st.whole ? 40 : CAP}`;
    for (const r of rows) {
      const seen = chosen.get(r.id);
      if (seen) seen.strata.push(st.name);
      else chosen.set(r.id, { ...r, strata: [st.name] });
    }
  }
  return [...chosen.values()];
}

type Upstream =
  | { found: false; how: 'HANDLE_404_AND_NO_SEARCH_MATCH' | 'NO_HANDLE_IN_SOURCE_URL' | 'FETCH_FAILED'; detail: string }
  | {
      found: true;
      how: 'HANDLE' | 'SEARCH';
      uuid: string;
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
      keys: string[];
    };

const mv = (m: Record<string, Array<{ value: string }>>, k: string): string | null => m[k]?.[0]?.value ?? null;

function shape(j: any, how: 'HANDLE' | 'SEARCH'): Upstream {
  const m = j.metadata ?? {};
  return {
    found: true,
    how,
    uuid: j.uuid ?? j.id,
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
    keys: Object.keys(m),
  };
}

async function getJson(url: string): Promise<any | null> {
  await sleep(DELAY_MS);
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'LawMind statute-freshness measurement (contact: repo maintainer)' },
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) return null;
  return (await res.json()) as unknown;
}

/**
 * Resolve one held Act upstream. The handle is tried first because it is an
 * IDENTITY; search is a fallback and its match is only accepted when the
 * source's own act number AND act year agree with ours. A title that merely
 * looks right is not a match — that is the same rule the citation resolver
 * applies to a judgment, and for the same reason.
 */
async function resolve(row: Row): Promise<Upstream> {
  const handle = /handle\/(\d+\/\d+)/.exec(row.source_url)?.[1];
  if (handle) {
    try {
      const j = await getJson(`${API}/pid/find?id=hdl:${handle}`);
      if (j) return shape(j, 'HANDLE');
    } catch (e) {
      return { found: false, how: 'FETCH_FAILED', detail: String(e).slice(0, 160) };
    }
  }
  const q = encodeURIComponent(row.short_title.replace(/^The\s+/i, '').replace(/,\s*\d{4}$/, ''));
  try {
    const search = await getJson(`${API}/discover/search/objects?query=${q}&dsoType=item&size=10`);
    const objects: any[] = search?._embedded?.searchResult?._embedded?.objects ?? [];
    /**
     * A search match needs MORE than the act number and year agreeing. Both of
     * those are copied onto a State's subordinate rules and onto individual
     * section items, so on the first run this accepted
     * "…the State of Maharashtra eSakshya Management Rules, 2025" as BNSS and a
     * bare "Short title, application and commencement." as BSA. The collection
     * must say ACT and the title must actually carry the Act's distinctive
     * words; a Central item is preferred over a State reproduction of it.
     */
    const distinctive = tokensOf(row.short_title);
    const accepted: Extract<Upstream, { found: true }>[] = [];
    for (const o of objects) {
      const href = o?._links?.indexableObject?.href;
      if (!href) continue;
      const item = await getJson(href);
      if (!item) continue;
      const cand = shape(item, 'SEARCH');
      if (!cand.found) continue;
      if (cand.actNumber !== row.act_number || cand.actYear !== String(row.act_year)) continue;
      if (cand.collection !== null && cand.collection !== 'ACT') continue;
      const title = tokensOf(cand.title);
      const covered = [...distinctive].filter((t) => title.has(t)).length;
      if (distinctive.size > 0 && covered < distinctive.size) continue;
      accepted.push(cand);
    }
    const central = accepted.find((c) => (c.stateName ?? '').toUpperCase() === 'CENTRAL');
    if (central) return central;
    if (accepted.length > 0) return accepted[0]!;
  } catch (e) {
    return { found: false, how: 'FETCH_FAILED', detail: String(e).slice(0, 160) };
  }
  return {
    found: false,
    how: handle ? 'HANDLE_404_AND_NO_SEARCH_MATCH' : 'NO_HANDLE_IN_SOURCE_URL',
    detail: handle ? `hdl:${handle} 404 and no search candidate agreed on act number ${row.act_number} and year ${row.act_year}` : row.source_url,
  };
}

type Dim = 'EXACT_MATCH' | 'STALE' | 'UNKNOWN' | 'SOURCE_UNAVAILABLE';
const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);

function compare(row: Row & { strata: string[] }, up: Upstream) {
  const dims: Record<string, { verdict: Dim; ours: unknown; theirs: unknown; note?: string }> = {};
  const material: string[] = [];

  if (!up.found) {
    for (const d of ['actIdentity', 'currentRepealedState', 'commencement', 'latestRepresentedAmendment', 'sectionExistence']) {
      dims[d] = { verdict: 'SOURCE_UNAVAILABLE', ours: null, theirs: null, note: up.detail };
    }
    return { dims, material };
  }

  dims['actIdentity'] = {
    verdict:
      up.actNumber === null || up.actYear === null
        ? 'UNKNOWN'
        : up.actNumber === row.act_number && up.actYear === String(row.act_year)
          ? 'EXACT_MATCH'
          : 'STALE',
    ours: { actNumber: row.act_number, actYear: row.act_year },
    theirs: { actNumber: up.actNumber, actYear: up.actYear },
  };

  // WE DO NOT STORE A REPEAL STATE. `statutes` has no such column, so this is
  // UNKNOWN on our side for every Act in the corpus — not a per-Act gap but a
  // schema one, and it is recorded that way rather than defaulted to "current".
  dims['currentRepealedState'] = {
    verdict: 'UNKNOWN',
    ours: null,
    theirs: up.repealed,
    note: 'statutes carries no repeal column; the source flag is recorded, never interpreted',
  };

  const ourEnact = iso(row.enactment_date);
  dims['commencement'] = {
    verdict:
      up.enactDate === null
        ? 'UNKNOWN'
        : ourEnact === up.enactDate
          ? 'EXACT_MATCH'
          : 'STALE',
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

const sample = await pick();
process.stdout.write(`sample: ${sample.length} Acts\n`);

const mappings = await sql<{ old_act: string; new_act: string; n: string; unmapped_note: string }[]>`
  SELECT old_act, new_act, count(*)::text AS n, count(*) FILTER (WHERE note IS NULL)::text AS unmapped_note
    FROM statute_mappings GROUP BY 1, 2 ORDER BY 3 DESC`;

const results: unknown[] = [];
const tally: Record<Dim, number> = { EXACT_MATCH: 0, STALE: 0, UNKNOWN: 0, SOURCE_UNAVAILABLE: 0 };
const perAct: Record<string, number> = {};
const materialErrors: Array<{ act: string; problems: string[] }> = [];
const clusters: Record<string, number> = {};

for (const row of sample) {
  const up: Upstream = OFFLINE
    ? { found: false, how: 'FETCH_FAILED', detail: '--offline' }
    : await resolve(row);
  const { dims, material } = compare(row, up);
  for (const d of Object.values(dims)) tally[d.verdict] += 1;

  // A per-Act verdict is the WORST of its dimensions. Averaging them would let
  // three matching fields hide one wrong date, which is the only field that can
  // make an advocate miss a commencement.
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

  // Cluster key: WHY a thing failed, not which Act it was. A cluster is
  // escalated whole; nothing here mass-updates on the strength of a sample.
  if (!up.found) clusters[`${up.how}::${new URL(row.source_url).host}`] = (clusters[`${up.how}::${new URL(row.source_url).host}`] ?? 0) + 1;
  else if (up.stateName && up.stateName.toUpperCase() !== 'CENTRAL') clusters[`SOURCED_FROM_STATE_REPOSITORY::${up.stateName}`] = (clusters[`SOURCED_FROM_STATE_REPOSITORY::${up.stateName}`] ?? 0) + 1;

  results.push({
    act: row.short_title,
    actNumber: row.act_number,
    actYear: row.act_year,
    strata: row.strata,
    ourSections: row.sections,
    ourAmendmentEvents: row.amendments,
    judgmentReferences: row.judgment_refs,
    sourceUrl: row.source_url,
    upstream: up.found
      ? { how: up.how, handle: up.handle, title: up.title, stateName: up.stateName, ministryName: up.ministryName, repealed: up.repealed }
      : { how: up.how, detail: up.detail },
    dimensions: dims,
    actVerdict: worst,
  });
  process.stdout.write(`  ${worst.padEnd(19)} ${row.short_title.slice(0, 62)}\n`);
}

const report = {
  artifact: 'NEW2_R14_STATUTE_FRESHNESS_V1',
  lane: 'NEW2',
  generatedAt: new Date().toISOString(),
  source: {
    name: 'India Code (Government of India)',
    api: API,
    note: 'India Code migrated hosts: every www.indiacode.nic.in/handle/… URL we stored now 404s. Acts reached by search rather than by handle are marked how=SEARCH and carry a weaker identity.',
  },
  method:
    'Per-dimension comparison of held metadata against the source item\'s own fields. Dimensions are counted separately and the per-Act verdict is the worst of them; nothing is averaged and nothing untestable is folded into a match rate.',
  denominator: { acts: sample.length, dimensionsPerAct: 5, dimensionChecks: sample.length * 5 },
  dimensionTally: tally,
  actTally: perAct,
  materialTemporalErrors: { count: materialErrors.length, detail: materialErrors },
  clusters: {
    note: 'A cluster is escalated as a cluster. No statute row is updated on the strength of this sample, and none was touched by this run.',
    counts: clusters,
  },
  statuteMappings: {
    rows: mappings.reduce((a, b) => a + Number(b.n), 0),
    pairs: mappings.map((m) => ({ oldAct: m.old_act, newAct: m.new_act, rows: Number(m.n) })),
    note: 'Coverage only. A mapping row records that the source pairs two provisions; it states nothing about which applies to any offence on any date, and nothing here infers an IPC to BNS applicability.',
  },
  acts: results,
  caveats: [
    'The source publishes no commencement/enforcement field, so our enforcement_date — including the 2024-07-01 dates on BNS, BNSS and BSA — is unchecked by this measurement, not confirmed by it.',
    'The source publishes no amendment history on the item, so latestRepresentedAmendment is UNKNOWN for every Act rather than matched.',
    'statutes has no repeal column, so currentRepealedState is UNKNOWN on our side for the whole corpus. The source\'s own flag is recorded verbatim and is not treated as legally dispositive.',
    'Acts matched by search are matched on act number and act year agreeing; a title alone was never accepted.',
  ],
};
const path = join(OUTDIR, 'statute-freshness-v1.json');
writeFileSync(path, JSON.stringify(report, null, 1));
writeFileSync(join(OUTDIR, 'statute-freshness-v1.sha256'), `${createHash('sha256').update(readFileSync(path)).digest('hex')}  statute-freshness-v1.json\n`);
process.stdout.write(`\n${JSON.stringify({ denominator: report.denominator, dimensionTally: tally, actTally: perAct, clusters }, null, 1)}\n`);
await sql.end();
