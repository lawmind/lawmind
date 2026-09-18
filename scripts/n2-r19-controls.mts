/**
 * NEW2 — R19 §8. CONTROLS AGAINST THE DESTRUCTIVE RULES.
 *
 * Three attacks, none of which asks the extractor anything:
 *
 * 1. CONNECTED-MATTER CONTROL. `C2a` nulls a row because the CNR printed beside
 *    its citation belongs to a different judgment that stores the SAME citation.
 *    That is also exactly what a common order looks like — one order disposing of
 *    several connected matters, every one of which legitimately carries the
 *    order's citation. If the two rows are the same source document, the rule is
 *    reading a common order as a theft and every such null is FALSE. Decided on
 *    `content_hash` and the source object, never on a judgement call.
 *
 * 2. NEGATIVE CONTROL. A random sample of rows R18 classified
 *    `UNCHANGED_CONFIRMED` — where the rule that WROTE the value and the rule
 *    that replaced it agree — run through the identical destructive rules. Any
 *    firing is a false null on a row nothing disputes.
 *
 * 3. POSITIVE CONTROL. R17's 127 hand-adjudicated rows, which are ground truth
 *    arrived at by reading documents, not by running a parser.
 *
 * Read-only, batched, no lease, no row written.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-r19-controls.mts [--sample 3000]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const OUTDIR = join(ROOT, 'docs/ai/new2-r19');
const W = Number(arg('window', '60'));
const SAMPLE = Number(arg('sample', '3000'));
const SEED = arg('seed', 'r19-controls');
const NL = String.fromCharCode(10);

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

// ---- the same feature extraction as n2-r19-evidence.mts, same patterns ------
const CNR_G = /\b([A-Z]{4}[0-9]{12})\b/g;
const _CITE_G = /\b(\d{4}):([A-Z][A-Z-]{1,13}):(\d{1,6})\b(?:-(?:DB|FB))?/g;
const PAIR_G = /\b(\d{1,6})\s*(?:of|OF|of\.|\/|-)\s*((?:19|20)\d{2})\b/g;
const LEAD_G =
  /\b(?:reported in|reported as|reported at|cited as|relied upon|reliance (?:up)?on|referred to in|in the case of|judgment in|judgement in|decision in|order (?:passed )?in|following the decision|as held in|see also)\b/gi;

type Hit = { v: string; at: number; end: number };
function allMatches(t: string, re: RegExp, group = 0): Hit[] {
  const g = new RegExp(re.source, re.flags);
  const out: Hit[] = [];
  for (let m = g.exec(t); m; m = g.exec(t)) out.push({ v: m[group] ?? m[0], at: m.index, end: m.index + m[0].length });
  return out;
}
function nearestBefore(hits: Hit[], at: number, keep: (h: Hit) => boolean): { v: string; dist: number } | null {
  let best: Hit | null = null;
  for (const h of hits) {
    if (h.end > at) break;
    if (!keep(h)) continue;
    if (best === null || h.end > best.end) best = h;
  }
  return best === null ? null : { v: best.v, dist: at - best.end };
}
function nearestAfter(hits: Hit[], from: number, keep: (h: Hit) => boolean): { v: string; dist: number } | null {
  for (const h of hits) {
    if (h.at < from) continue;
    if (!keep(h)) continue;
    return { v: h.v, dist: h.at - from };
  }
  return null;
}
function ownPair(caseNumber: string | null): [string, string] | null {
  if (!caseNumber) return null;
  const nums = String(caseNumber).split('/').filter((p) => /^[0-9]+$/.test(p));
  if (nums.length < 2) return null;
  return [nums[nums.length - 2]!, nums[nums.length - 1]!];
}
const pairEq = (a: [string, string], b: [string, string]): boolean =>
  String(Number(a[0])) === String(Number(b[0])) && a[1] === b[1];
function ctrlDensity(t: string): number {
  if (t.length === 0) return 1;
  let c = 0;
  for (let k = 0; k < t.length; k++) {
    const cc = t.charCodeAt(k);
    if ((cc < 32 && cc !== 9 && cc !== 10 && cc !== 13) || (cc >= 0xe000 && cc <= 0xf8ff)) c++;
  }
  return c / t.length;
}
function engDensity(t: string): number {
  if (t.length === 0) return 0;
  return (t.match(/[A-Za-z]{3,}/g) ?? []).length / Math.max(1, t.length / 6);
}

type Fired = {
  rule: string | null;
  anyOwnCnrAdj: boolean;
  anyOwnPairAdj: boolean;
  everyOccForeignCnr: boolean;
  corroborated: boolean;
  everyOccLead: boolean;
  leadCnrs: string[];
  window: string | null;
};

/** The destructive NULL rules of n2-r19-adjudicate.mts, applied to any row. */
function nullRuleFires(
  text: string,
  stored: string,
  ownCnr: string | null,
  caseNumber: string | null,
  cnrCitation: (c: string) => { id: string; citation: string | null } | undefined,
  selfId: string,
): Fired {
  const own = ownPair(caseNumber);
  const cnrs = allMatches(text, CNR_G, 1);
  const rawPairs = allMatches(text, PAIR_G);
  const serials: [string, string][] = [];
  {
    const g = new RegExp(PAIR_G.source, PAIR_G.flags);
    for (let m = g.exec(text); m; m = g.exec(text)) serials.push([m[1]!, m[2]!]);
  }
  const ownPairHits = rawPairs.filter((_, i) => own !== null && serials[i] !== undefined && pairEq(serials[i]!, own));
  const leads = allMatches(text, LEAD_G);

  const occs: number[] = [];
  let i = text.indexOf(stored);
  while (i !== -1 && occs.length < 8) {
    occs.push(i);
    i = text.indexOf(stored, i + stored.length);
  }
  const damaged = ctrlDensity(text) > 0.005 || engDensity(text) < 0.5;

  let anyOwnCnrAdj = false;
  let anyOwnPairAdj = false;
  let everyOccForeignCnr = occs.length > 0;
  let everyOccLead = occs.length > 0;
  const leadCnrs: string[] = [];
  for (const at of occs) {
    const after = at + stored.length;
    const pOwnCnr = ownCnr === null ? null : nearestBefore(cnrs, at, (h) => h.v === ownCnr)?.dist ?? null;
    const nOwnCnr = ownCnr === null ? null : nearestAfter(cnrs, after, (h) => h.v === ownCnr)?.dist ?? null;
    const pOwnPair = nearestBefore(ownPairHits, at, () => true)?.dist ?? null;
    const nOwnPair = nearestAfter(ownPairHits, after, () => true)?.dist ?? null;
    if ((pOwnCnr !== null && pOwnCnr <= W) || (nOwnCnr !== null && nOwnCnr <= W)) anyOwnCnrAdj = true;
    if ((pOwnPair !== null && pOwnPair <= W) || (nOwnPair !== null && nOwnPair <= W)) anyOwnPairAdj = true;
    const cand = [nearestBefore(cnrs, at, (h) => h.v !== ownCnr), nearestAfter(cnrs, after, (h) => h.v !== ownCnr)]
      .filter((n): n is { v: string; dist: number } => n !== null && n.dist <= W)
      .sort((a, b) => a.dist - b.dist)[0];
    const res = cand ? cnrCitation(cand.v) : undefined;
    if (cand && res && res.id !== selfId) leadCnrs.push(cand.v);
    else everyOccForeignCnr = false;
    const l = nearestBefore(leads, at, () => true);
    if (!(l && l.dist <= W)) everyOccLead = false;
  }
  const corroborated = leadCnrs.length > 0 && leadCnrs.every((c) => cnrCitation(c)?.citation === stored);
  const at0 = occs[0];
  const window = at0 === undefined ? null : text.slice(Math.max(0, at0 - 150), at0 + stored.length + 150).replace(/\s+/g, ' ');

  let rule: string | null = null;
  if (damaged) rule = null;
  else if (anyOwnCnrAdj) rule = null;
  else if (everyOccForeignCnr && !anyOwnPairAdj) rule = corroborated ? 'C2a' : 'C2b';
  else if (everyOccLead && !anyOwnPairAdj) rule = 'C3';
  return { rule, anyOwnCnrAdj, anyOwnPairAdj, everyOccForeignCnr, corroborated, everyOccLead, leadCnrs, window };
}

/** Deterministic sampling: the hash of the id decides, so the sample is a
 *  property of the population and reproduces exactly on a re-run. */
const _pick = (id: string, n: number, of: number): boolean =>
  parseInt(createHash('sha256').update(SEED + id).digest('hex').slice(0, 8), 16) % of < n;

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  mkdirSync(OUTDIR, { recursive: true });
  const adj = readFileSync(join(OUTDIR, 'adjudication.jsonl'), 'utf8')
    .split(NL)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as {
      judgmentId: string;
      court: string;
      stored: string;
      proposed: string | null;
      verdict: string;
      rule: string;
      destructive: string;
      evidence: { foreignLeadCnrs: string[] };
    });

  // ---- 1. connected-matter control ----------------------------------------
  const c2 = adj.filter((a) => a.rule.startsWith('C2'));
  const leadPairs: { id: string; lead: string }[] = [];
  for (const a of c2) for (const c of a.evidence.foreignLeadCnrs) leadPairs.push({ id: a.judgmentId, lead: c });
  const leadCnrs = [...new Set(leadPairs.map((p) => p.lead))];
  const leadInfo = new Map<string, { id: string; hash: string | null; url: string | null; court: string; date: string | null; citation: string | null }>();
  for (let i = 0; i < leadCnrs.length; i += 2000) {
    const got = await sql<{ cnr: string; id: string; content_hash: string | null; source_url: string | null; court: string; judgment_date: string | null; neutral_citation: string | null }[]>`
      SELECT cnr, id::text AS id, content_hash, source_url, court, judgment_date::text AS judgment_date, neutral_citation
        FROM judgments WHERE cnr = ANY(${leadCnrs.slice(i, i + 2000)}::text[])`;
    for (const g of got)
      if (!leadInfo.has(g.cnr))
        leadInfo.set(g.cnr, { id: g.id, hash: g.content_hash, url: g.source_url, court: g.court, date: g.judgment_date, citation: g.neutral_citation });
  }
  const selfIds = [...new Set(c2.map((a) => a.judgmentId))];
  const selfInfo = new Map<string, { hash: string | null; url: string | null; date: string | null }>();
  for (let i = 0; i < selfIds.length; i += 1000) {
    const got = await sql<{ id: string; content_hash: string | null; source_url: string | null; judgment_date: string | null }[]>`
      SELECT id::text AS id, content_hash, source_url, judgment_date::text AS judgment_date
        FROM judgments WHERE id = ANY(${selfIds.slice(i, i + 1000)}::uuid[])`;
    for (const g of got) selfInfo.set(g.id, { hash: g.content_hash, url: g.source_url, date: g.judgment_date });
  }

  const connected: Record<string, number> = {};
  const connectedRows: unknown[] = [];
  for (const a of c2) {
    const me = selfInfo.get(a.judgmentId);
    const leads = a.evidence.foreignLeadCnrs.map((c) => leadInfo.get(c)).filter(Boolean);
    const sameDoc = leads.some((l) => l!.hash !== null && me?.hash !== null && l!.hash === me?.hash);
    const sameUrl = leads.some((l) => l!.url !== null && me?.url !== null && l!.url === me?.url);
    const sameDate = leads.some((l) => l!.date !== null && me?.date !== null && l!.date === me?.date);
    const k = sameDoc || sameUrl ? 'SAME_SOURCE_DOCUMENT' : sameDate ? 'SAME_DATE_DIFFERENT_DOCUMENT' : 'DIFFERENT_DOCUMENT';
    connected[`${a.rule}::${k}`] = (connected[`${a.rule}::${k}`] ?? 0) + 1;
    if (sameDoc || sameUrl)
      connectedRows.push({ judgmentId: a.judgmentId, rule: a.rule, stored: a.stored, leadCnrs: a.evidence.foreignLeadCnrs });
  }

  // ---- 2. negative control on UNCHANGED_CONFIRMED --------------------------
  const popIds = new Set(
    readFileSync(join(ROOT, 'docs/ai/new2-r18/existing-correction-population.jsonl'), 'utf8')
      .split(NL).filter((l) => l.trim()).map((l) => JSON.parse(l).judgmentId as string),
  );
  const untestableIds = new Set(
    readFileSync(join(ROOT, 'docs/ai/new2-r18/untestable-rows.jsonl'), 'utf8')
      .split(NL).filter((l) => l.trim()).map((l) => JSON.parse(l).judgmentId as string),
  );
  console.log(`[r19] excluding ${popIds.size} population + ${untestableIds.size} untestable ids from the negative control`);

  // Sampling is done on the PRIMARY KEY, from random start points. A `LIMIT`
  // after a court filter is not a sample — the heap is clustered by ingest order,
  // so the first N rows of a court are one slab of one week. Judgment ids are
  // random uuids, so `id > <random uuid> ORDER BY id LIMIT k` is a uniform draw
  // that the pkey index answers without sorting anything.
  const randomUuid = (n: number): string => {
    const h = createHash('sha256').update(`${SEED}:${n}`).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  };
  const SLAB = 25;
  const nullCourts = new Map<string, number>();
  for (const a of adj) if (a.destructive === 'NULL') nullCourts.set(a.court, (nullCourts.get(a.court) ?? 0) + 1);
  // Global probes give the unbiased control; the named courts are where the
  // destructive nulls concentrate and a global draw would barely reach them.
  const targeted = [...nullCourts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
  const probes: { court: string | null; n: number }[] = [];
  for (let i = 0; i < Math.ceil(SAMPLE / SLAB); i++) probes.push({ court: null, n: i });
  targeted.forEach((c, ci) => {
    for (let i = 0; i < 24; i++) probes.push({ court: c, n: 100000 + ci * 1000 + i });
  });

  const negRows: unknown[] = [];
  const negCounts: Record<string, number> = {};
  const negByCourt: Record<string, number> = {};
  let negScanned = 0;
  const seenIds = new Set<string>();
  for (const p of probes) {
    const startId = randomUuid(p.n);
    const got = p.court === null
      ? await sql<{ id: string; court: string; case_number: string | null; cnr: string | null; neutral_citation: string; full_text: string | null }[]>`
          SELECT id::text AS id, court, case_number, cnr, neutral_citation, full_text
            FROM judgments
           WHERE id > ${startId}::uuid
             AND neutral_citation IS NOT NULL AND neutral_citation <> ''
             AND source_url LIKE '%indian-high-court-judgments%'
           ORDER BY id LIMIT ${SLAB}`
      : await sql<{ id: string; court: string; case_number: string | null; cnr: string | null; neutral_citation: string; full_text: string | null }[]>`
          SELECT id::text AS id, court, case_number, cnr, neutral_citation, full_text
            FROM judgments
           WHERE id > ${startId}::uuid
             AND court = ${p.court}
             AND neutral_citation IS NOT NULL AND neutral_citation <> ''
             AND source_url LIKE '%indian-high-court-judgments%'
           ORDER BY id LIMIT ${SLAB}`;
    const chosen = got.filter((g) => !popIds.has(g.id) && !untestableIds.has(g.id) && !seenIds.has(g.id));
    for (const g of chosen) seenIds.add(g.id);
    if (chosen.length === 0) continue;

    const cnrsWanted = new Set<string>();
    for (const g of chosen) for (const h of allMatches(g.full_text ?? '', CNR_G, 1)) if (h.v !== g.cnr) cnrsWanted.add(h.v);
    const map = new Map<string, { id: string; citation: string | null }>();
    const cl = [...cnrsWanted];
    for (let i = 0; i < cl.length; i += 2000) {
      const r = await sql<{ cnr: string; id: string; neutral_citation: string | null }[]>`
        SELECT cnr, id::text AS id, neutral_citation FROM judgments WHERE cnr = ANY(${cl.slice(i, i + 2000)}::text[])`;
      for (const x of r) if (!map.has(x.cnr)) map.set(x.cnr, { id: x.id, citation: x.neutral_citation });
    }
    for (const g of chosen) {
      negScanned++;
      negByCourt[g.court] = (negByCourt[g.court] ?? 0) + 1;
      const f = nullRuleFires(g.full_text ?? '', g.neutral_citation, g.cnr, g.case_number, (c) => map.get(c), g.id);
      negCounts[f.rule ?? 'NO_RULE'] = (negCounts[f.rule ?? 'NO_RULE'] ?? 0) + 1;
      if (f.rule !== null) {
        negCounts[`${g.court}::${f.rule}`] = (negCounts[`${g.court}::${f.rule}`] ?? 0) + 1;
        negRows.push({ judgmentId: g.id, court: g.court, caseNumber: g.case_number, cnr: g.cnr, stored: g.neutral_citation, rule: f.rule, leadCnrs: f.leadCnrs, window: f.window });
      }
    }
    if (negScanned % 500 < SLAB) console.log(`[r19-ctl] negative control ${negScanned} rows, ${negRows.length} firings`);
  }

  const summary = {
    artifact: 'NEW2_R19_CONTROLS',
    lane: 'NEW2',
    takenAt: new Date().toISOString(),
    adjacencyWindow: W,
    connectedMatterControl: {
      question:
        'C2 nulls a row because the CNR beside its citation belongs to another judgment storing the same citation. A common order looks identical. Are the two rows the same source document?',
      rowsTested: c2.length,
      counts: connected,
      sameSourceDocumentRows: connectedRows.length,
      examples: connectedRows.slice(0, 20),
    },
    negativeControl: {
      question:
        'do the destructive NULL rules fire on rows R18 classified UNCHANGED_CONFIRMED — where the rule that wrote the value and the rule that replaced it agree?',
      populationSampled: negScanned,
      byCourt: negByCourt,
      sampling: 'random primary-key start points, slab 25, plus 24 targeted probes for each of the six courts carrying the most destructive nulls',
      counts: negCounts,
      firings: negRows.slice(0, 60),
      firingTotal: negRows.length,
    },
  };
  writeFileSync(join(OUTDIR, 'controls.json'), JSON.stringify(summary, null, 1) + NL);
  console.log('connected-matter:', JSON.stringify(connected));
  console.log('negative control scanned', negScanned, 'firings', negRows.length, JSON.stringify(negCounts).slice(0, 400));
} finally {
  await sql.end({ timeout: 5 });
}
