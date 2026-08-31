/**
 * NEW2 R14 FOLLOW-UP — re-resolve the India Code handles that
 * STATUTE_FRESHNESS_V1 recorded as SOURCE_UNAVAILABLE.
 *
 * ## What the frozen measurement actually proved
 *
 * `docs/ai/new2-r14/statute-freshness-v1.json` marked 25 of 49 sampled Acts
 * `SOURCE_UNAVAILABLE` — 125 of its 245 dimension checks. Every one of those 25
 * failed the same way: `HANDLE_404_AND_NO_SEARCH_MATCH`. The stored handle 404s
 * at the migrated host, and the title-search fallback found nothing that agreed.
 *
 * That verdict is about OUR REACH, not about the source. India Code's DSpace
 * `/discover` ranking returns SECTION items ahead of the ACT item — a search for
 * "Bharatiya Sakshya Adhiniyam" returns ten sections of the Act and never the
 * Act — so a top-10 title search structurally cannot find a principal Act that
 * has more than ten sections indexed. The Act was there the whole time.
 *
 * ## The identity this uses, and why it is not a title guess
 *
 * `statutes.act_id` holds India Code's own `dc.identifier.act_id` verbatim FOR
 * THE ROWS INGESTED FROM INDIA CODE (BSA 2023 is
 * `AC_CEN_5_23_00049_2023-47_1719292804654` in our row and in theirs, byte for
 * byte). It is the platform's internal Act key, so a query for it plus
 * `dc.identifier.collection:"ACT"` returns the one principal-Act item — one
 * request, one hit, no ranking involved.
 *
 * The column is NOT uniformly upstream's key. Rows acquired by our own scripts
 * carry a LawMind-minted id — `MHA_JUD_2022-09_ccp1973`,
 * `INDIACODE_547533_iea_1872`, `INDIACODE_547812_ipc_act`. Those can never
 * match upstream and are not sent as one; the `AC_` prefix is the test, and a
 * minted id is recorded as an absent identity rather than a failed lookup.
 *
 * The stored handle is tried FIRST and its response body is read, not just its
 * status. A handle that still resolves to an item agreeing on act number and
 * year has not moved, whatever a search would have ranked.
 *
 * A resolution is accepted ONLY when the source's own act number and act year
 * agree with ours on top of that key. Title similarity is never sufficient and
 * is never used alone: the fallback path (for rows with no act_id) still
 * requires number and year to agree and the item to be in the ACT collection.
 *
 * Act numbers are compared with leading zeros stripped on BOTH sides. Our rows
 * carry `"04"` where the source carries `"4"`; that is a formatting difference
 * in one field, not a different Act, and treating it as one is what made the
 * original fallback reject Acts it had correctly found.
 *
 * ## What this writes
 *
 * With `--apply`, and only for `MOVED_OFFICIAL_HANDLE`, it rewrites
 * `statutes.source_url` to the live official handle URL. Nothing else is
 * touched: no text, no section, no repeal state, no schema. Without `--apply`
 * it writes the evidence artifact and changes nothing.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-indiacode-handle-reresolve.mts
 *   services/ingest/node_modules/.bin/tsx scripts/n2-indiacode-handle-reresolve.mts --apply
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = join(ROOT, 'docs/ai/new2-r14-followup');
mkdirSync(OUTDIR, { recursive: true });

const APPLY = process.argv.includes('--apply');
const arg = (n: string, d: string) => {
  const at = process.argv.indexOf(`--${n}`);
  return at < 0 ? d : (process.argv[at + 1] ?? d);
};
const DELAY_MS = Number(arg('delay', '1100'));
const API = 'https://indiacode.gov.in/server/api';
const HANDLE_BASE = 'https://indiacode.gov.in/handle';

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

/** Leading zeros are a formatting difference in one field, not a different Act. */
const normNum = (n: string | null): string | null =>
  n === null
    ? null
    : n
        .trim()
        .replace(/^0+(?=\d)/, '')
        .toUpperCase();

const TITLE_STOP = new Set(['THE', 'ACT', 'AND', 'OF', 'FOR']);
const tokensOf = (t: string): Set<string> =>
  new Set(
    (t || '')
      .toUpperCase()
      .replace(/\b(19|20)\d{2}\b/g, ' ')
      .split(/[^A-Z]+/)
      .filter((x) => x.length >= 4 && !TITLE_STOP.has(x)),
  );

type Item = {
  handle: string;
  uuid: string;
  name: string;
  actId: string | null;
  actNumber: string | null;
  actYear: string | null;
  collection: string | null;
  stateName: string | null;
  ministryName: string | null;
  repealed: string | null;
  enactDate: string | null;
  issued: string | null;
  sectionCount: string | null;
};

const mv = (m: any, k: string): string | null => m?.[k]?.[0]?.value ?? null;
const shape = (io: any): Item => ({
  handle: io.handle,
  uuid: io.uuid ?? io.id,
  name: io.name ?? mv(io.metadata, 'dc.title') ?? '',
  actId: mv(io.metadata, 'dc.identifier.act_id'),
  actNumber: mv(io.metadata, 'dc.identifier.act_number'),
  actYear: mv(io.metadata, 'dc.date.act_year'),
  collection: mv(io.metadata, 'dc.identifier.collection'),
  stateName: mv(io.metadata, 'dc.identifier.state_name'),
  ministryName: mv(io.metadata, 'dc.identifier.ministry_name'),
  repealed: mv(io.metadata, 'dc.identifier.repealed'),
  enactDate: mv(io.metadata, 'dc.date.enact_date'),
  issued: mv(io.metadata, 'dc.date.issued'),
  sectionCount: mv(io.metadata, 'dc.identifier.no_of_section'),
});

const UA = {
  accept: 'application/json',
  'user-agent': 'LawMind statute-freshness measurement (contact: repo maintainer)',
};
let REQUESTS = 0;

async function getJson(url: string): Promise<{ status: number; json: any | null }> {
  await sleep(DELAY_MS);
  REQUESTS += 1;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45_000) });
  if (!res.ok) return { status: res.status, json: null };
  return { status: res.status, json: (await res.json()) as unknown };
}

/** One `/discover` query, ACT collection only, returning every hit it has. */
async function searchActs(query: string): Promise<Item[]> {
  const url = `${API}/discover/search/objects?query=${encodeURIComponent(query)}&dsoType=item&size=25`;
  const { json } = await getJson(url);
  const objs: any[] = json?._embedded?.searchResult?._embedded?.objects ?? [];
  const out: Item[] = [];
  for (const o of objs) {
    const io = o?._embedded?.indexableObject;
    if (!io) continue;
    const it = shape(io);
    if (it.collection !== 'ACT') continue;
    out.push(it);
  }
  return out;
}

type Row = {
  id: string;
  act_id: string | null;
  short_title: string;
  act_number: string;
  act_year: number;
  source_url: string;
};

type Klass =
  | 'MOVED_OFFICIAL_HANDLE'
  | 'HANDLE_STILL_CURRENT'
  | 'SOURCE_CURRENTLY_UNAVAILABLE'
  | 'WRONG_IDENTITY'
  | 'DUPLICATE_SOURCE_ENTRY'
  | 'UNKNOWN';

type Verdict = {
  act: string;
  actNumber: string;
  actYear: number;
  ourActId: string | null;
  storedUrl: string;
  storedHandle: string | null;
  storedHandleStatus: number | null;
  classification: Klass;
  evidence: string;
  resolvedHandle: string | null;
  resolvedUrl: string | null;
  upstream: Item | null;
  candidates: Array<
    Pick<Item, 'handle' | 'name' | 'actNumber' | 'actYear' | 'stateName' | 'actId'>
  >;
  sourceItemState: string | null;
  actIdIsUpstreamKey: boolean;
  note: string;
};

/** Only an `AC_`-prefixed id is India Code's own; the rest we minted ourselves. */
const isUpstreamKey = (id: string | null): id is string => /^AC_/.test(id ?? '');

const brief = (i: Item) => ({
  handle: i.handle,
  name: i.name,
  actNumber: i.actNumber,
  actYear: i.actYear,
  stateName: i.stateName,
  actId: i.actId,
});

/** Number and year must agree on top of whatever path found the item. */
const agrees = (row: Row, i: Item) =>
  normNum(i.actNumber) === normNum(row.act_number) && i.actYear === String(row.act_year);

async function reresolve(row: Row): Promise<Verdict> {
  const storedHandle = /handle\/(\d+\/\d+)/.exec(row.source_url)?.[1] ?? null;
  let storedHandleStatus: number | null = null;
  let storedItem: Item | null = null;
  if (storedHandle) {
    const got = await getJson(`${API}/pid/find?id=hdl:${storedHandle}`);
    storedHandleStatus = got.status;
    if (got.json) storedItem = shape(got.json);
  }

  const base = {
    act: row.short_title,
    actNumber: row.act_number,
    actYear: row.act_year,
    ourActId: row.act_id,
    storedUrl: row.source_url,
    storedHandle,
    storedHandleStatus,
    actIdIsUpstreamKey: isUpstreamKey(row.act_id),
  };

  // Path 0 — the stored handle, read rather than merely pinged. A handle that
  // still resolves to an agreeing ACT item has not moved and needs no
  // replacement. A 200 is NOT enough on its own: `123456789/1565` survived the
  // migration attached to a DSpace object named "Rule" carrying no act number,
  // no act year and no collection, and the frozen measurement took that as the
  // Limitation Act's upstream item. An object that is not an Act cannot settle
  // an Act's identity either way, so it falls through to the act_id path.
  const storedIsAct =
    storedItem !== null &&
    storedItem.collection === 'ACT' &&
    storedItem.actNumber !== null &&
    storedItem.actYear !== null;
  if (storedItem && storedIsAct) {
    if (!agrees(row, storedItem)) {
      return {
        ...base,
        classification: 'WRONG_IDENTITY',
        evidence: 'STORED_HANDLE_LIVE',
        resolvedHandle: null,
        resolvedUrl: null,
        upstream: storedItem,
        candidates: [brief(storedItem)],
        sourceItemState: storedItem.stateName,
        note: `the stored handle resolves to act number ${storedItem.actNumber} of ${storedItem.actYear}; we hold ${row.act_number} of ${row.act_year}`,
      };
    }
    const central = (storedItem.stateName ?? '').toUpperCase() === 'CENTRAL';
    return {
      ...base,
      classification: 'HANDLE_STILL_CURRENT',
      evidence: 'STORED_HANDLE_LIVE',
      resolvedHandle: storedItem.handle,
      resolvedUrl: `${HANDLE_BASE}/${storedItem.handle}`,
      upstream: storedItem,
      candidates: [brief(storedItem)],
      sourceItemState: storedItem.stateName,
      note: central
        ? 'the stored handle resolves and the source item is the CENTRAL one'
        : `the stored handle resolves and act number and year agree, but the item is the ${storedItem.stateName} reproduction rather than the CENTRAL one`,
    };
  }

  const storedNote =
    storedItem && !storedIsAct
      ? ` (the stored handle ${storedHandle} still resolves, but to "${storedItem.name}" — collection ${storedItem.collection ?? 'null'}, no act number — which is not an Act item)`
      : '';

  // Path 1 — the platform's own Act key. An identity, not a resemblance.
  if (isUpstreamKey(row.act_id)) {
    const hits = await searchActs(
      `dc.identifier.act_id:"${row.act_id}" AND dc.identifier.collection:"ACT"`,
    );
    const exact = hits.filter((h) => h.actId === row.act_id);
    if (exact.length > 1) {
      return {
        ...base,
        classification: 'DUPLICATE_SOURCE_ENTRY',
        evidence: 'ACT_ID',
        resolvedHandle: null,
        resolvedUrl: null,
        upstream: null,
        candidates: exact.map(brief),
        sourceItemState: null,
        note: `${exact.length} ACT items carry our act_id; a single official handle is not established`,
      };
    }
    if (exact.length === 1) {
      const it = exact[0]!;
      if (!agrees(row, it)) {
        return {
          ...base,
          classification: 'WRONG_IDENTITY',
          evidence: 'ACT_ID',
          resolvedHandle: null,
          resolvedUrl: null,
          upstream: it,
          candidates: [brief(it)],
          sourceItemState: it.stateName,
          note: `our act_id resolves to act number ${it.actNumber} of ${it.actYear}; we hold ${row.act_number} of ${row.act_year}`,
        };
      }
      const moved = it.handle !== storedHandle;
      return {
        ...base,
        classification: moved ? 'MOVED_OFFICIAL_HANDLE' : 'HANDLE_STILL_CURRENT',
        evidence: 'ACT_ID',
        resolvedHandle: it.handle,
        resolvedUrl: `${HANDLE_BASE}/${it.handle}`,
        upstream: it,
        candidates: [brief(it)],
        sourceItemState: it.stateName,
        note:
          (moved
            ? `act_id matched byte-for-byte; act number and year agree; handle ${storedHandle ?? 'none'} -> ${it.handle}`
            : 'act_id matched and the stored handle is the live one') + storedNote,
      };
    }
  }

  // Path 2 — title tokens, still gated on number, year and the ACT collection.
  const q = row.short_title.replace(/^The\s+/i, '').replace(/,?\s*\d{4}\.?$/, '');
  const hits = await searchActs(`${q} AND dc.identifier.collection:"ACT"`);
  const distinctive = tokensOf(row.short_title);
  const accepted = hits.filter((h) => {
    if (!agrees(row, h)) return false;
    const t = tokensOf(h.name);
    return distinctive.size > 0 && [...distinctive].every((x) => t.has(x));
  });
  const central = accepted.filter((c) => (c.stateName ?? '').toUpperCase() === 'CENTRAL');
  const pool = central.length > 0 ? central : accepted;
  if (pool.length > 1) {
    return {
      ...base,
      classification: 'DUPLICATE_SOURCE_ENTRY',
      evidence: 'TITLE_NUMBER_YEAR_ACT',
      resolvedHandle: null,
      resolvedUrl: null,
      upstream: null,
      candidates: pool.map(brief),
      sourceItemState: null,
      note: `${pool.length} ACT items agree on number ${row.act_number} and year ${row.act_year}; no single official handle`,
    };
  }
  if (pool.length === 1) {
    const it = pool[0]!;
    const moved = it.handle !== storedHandle;
    return {
      ...base,
      classification: moved ? 'MOVED_OFFICIAL_HANDLE' : 'HANDLE_STILL_CURRENT',
      evidence: 'TITLE_NUMBER_YEAR_ACT',
      resolvedHandle: it.handle,
      resolvedUrl: `${HANDLE_BASE}/${it.handle}`,
      upstream: it,
      candidates: [brief(it)],
      sourceItemState: it.stateName,
      note: `no act_id path; matched on full distinctive title tokens with act number and year agreeing`,
    };
  }
  if (!isUpstreamKey(row.act_id)) {
    return {
      ...base,
      classification: 'UNKNOWN',
      evidence: 'NONE',
      resolvedHandle: null,
      resolvedUrl: null,
      upstream: null,
      candidates: hits.slice(0, 5).map(brief),
      sourceItemState: null,
      note:
        row.act_id === null
          ? 'our row carries no act_id, and no ACT item agreed on number and year'
          : `our act_id ${row.act_id} is LawMind-minted rather than India Code's own key, and no ACT item agreed on number and year`,
    };
  }
  return {
    ...base,
    classification: 'SOURCE_CURRENTLY_UNAVAILABLE',
    evidence: 'ACT_ID_AND_TITLE',
    resolvedHandle: null,
    resolvedUrl: null,
    upstream: null,
    candidates: hits.slice(0, 5).map(brief),
    sourceItemState: null,
    note: 'our act_id returns no ACT item and no title candidate agreed on number and year',
  };
}

async function main() {
  const frozen = JSON.parse(
    readFileSync(join(ROOT, 'docs/ai/new2-r14/statute-freshness-v1.json'), 'utf8'),
  ) as { generatedAt: string; acts: Array<{ act: string; actVerdict: string; sourceUrl: string }> };

  const dead = new Set(
    frozen.acts.filter((a) => a.actVerdict === 'SOURCE_UNAVAILABLE').map((a) => a.act),
  );
  const titles = frozen.acts.map((a) => a.act);
  const rows = await sql<Row[]>`
    SELECT id, act_id, short_title, act_number, act_year, source_url
      FROM statutes WHERE short_title = ANY(${titles}) ORDER BY short_title`;

  const verdicts: Array<Verdict & { population: 'DEAD_HANDLE' | 'CONTROL' }> = [];
  for (const row of rows) {
    const population = dead.has(row.short_title) ? 'DEAD_HANDLE' : 'CONTROL';
    const v = await reresolve(row);
    verdicts.push({ ...v, population });
    process.stdout.write(
      `${population === 'DEAD_HANDLE' ? 'DEAD ' : 'CTRL '}${v.classification.padEnd(28)} ${v.evidence.padEnd(22)} ${row.short_title}\n`,
    );
  }

  const tally = (pop: string) => {
    const t: Record<string, number> = {};
    for (const v of verdicts)
      if (pop === 'ALL' || v.population === pop)
        t[v.classification] = (t[v.classification] ?? 0) + 1;
    return t;
  };

  const applied: Array<{ act: string; from: string; to: string }> = [];
  if (APPLY) {
    for (const v of verdicts) {
      if (v.classification !== 'MOVED_OFFICIAL_HANDLE' || !v.resolvedUrl) continue;
      const r = rows.find((x) => x.short_title === v.act)!;
      await sql`UPDATE statutes SET source_url = ${v.resolvedUrl} WHERE id = ${r.id}`;
      applied.push({ act: v.act, from: v.storedUrl, to: v.resolvedUrl });
    }
  }

  const artifact = {
    artifact: 'NEW2_R14_FOLLOWUP_INDIACODE_HANDLE_RERESOLUTION',
    lane: 'NEW2',
    measuredAt: new Date().toISOString(),
    scope: {
      population:
        'the 49 Acts of STATUTE_FRESHNESS_V1, split into the 25 it recorded SOURCE_UNAVAILABLE and the 24 it resolved',
      deadHandles: [...dead].length,
      controls: rows.length - [...dead].length,
      rowsFound: rows.length,
      frozenMeasurementGeneratedAt: frozen.generatedAt,
      note: 'this artifact does not modify docs/ai/new2-r14/statute-freshness-v1.json, which stays frozen as measured',
    },
    source: {
      name: 'India Code (Government of India)',
      api: API,
      requestsIssued: REQUESTS,
      delayMs: DELAY_MS,
    },
    method: {
      storedHandleFirst:
        'the stored handle is fetched and its BODY read; an item that resolves and agrees on act number and year has not moved',
      identity:
        'statutes.act_id is India Code dc.identifier.act_id verbatim for India-Code-ingested rows (AC_ prefix); the query is that key AND dc.identifier.collection:"ACT". A LawMind-minted act_id is never sent upstream',
      acceptance:
        'act number (leading zeros stripped on both sides) and act year must agree with the source on every path; title similarity alone is never accepted',
      whyTheOriginalFailed:
        'India Code /discover ranks SECTION items above the ACT item, so a top-10 title search cannot reach a principal Act that has more than ten indexed sections',
    },
    tally: { all: tally('ALL'), deadHandles: tally('DEAD_HANDLE'), controls: tally('CONTROL') },
    applied: APPLY ? applied : null,
    appliedCount: APPLY ? applied.length : 0,
    verdicts,
  };

  const out = join(OUTDIR, 'indiacode-handle-reresolution.json');
  const body = JSON.stringify(artifact, null, 2);
  writeFileSync(out, body);
  writeFileSync(
    join(OUTDIR, 'indiacode-handle-reresolution.sha256'),
    `${createHash('sha256').update(body).digest('hex')}  indiacode-handle-reresolution.json\n`,
  );
  console.log('\nDEAD_HANDLE  ', JSON.stringify(tally('DEAD_HANDLE')));
  console.log('CONTROL      ', JSON.stringify(tally('CONTROL')));
  console.log('requests     ', REQUESTS);
  console.log('applied      ', APPLY ? applied.length : '(dry run — pass --apply to write)');
  console.log('artifact     ', out);
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
