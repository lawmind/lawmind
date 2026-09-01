/**
 * NEW2 — R19 §1. EVIDENCE FOR THE R18 POPULATION, DERIVED WITHOUT THE EXTRACTOR.
 *
 * R18 froze 20,556 proposals produced by `neutralCitationFrom`. The extractor is
 * the thing under test, so nothing it says may be used as ground truth here.
 * This walk re-reads the retained text of every population row and records only
 * facts that exist independently of it:
 *
 *   - where the STORED citation actually occurs in the document, byte offset by
 *     byte offset, and what court-issued identity stands nearest to it;
 *   - the CNR, which is a court-issued 16-character key for ONE case and is the
 *     strongest identity signal a High Court document prints;
 *   - whether the document mentions THIS row's identity at all;
 *   - the damage measurements (control-char density, English-word density) that
 *     decide whether the text can carry evidence in the first place.
 *
 * It deliberately imports NOTHING from `services/ingest/src/harvest/hc-load.ts`.
 * The regexes here are written for this file. Where they resemble the
 * extractor's it is because both are reading the same page furniture, and the
 * rules built on top of these features (n2-r19-adjudicate.mts) never accept the
 * extractor's answer as evidence for a destructive change.
 *
 * Read-only. Database, no network. Batched by id, checkpointed after every
 * batch, two connections, no lease, no transaction held across a batch.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-r19-evidence.mts [--batch 400] [--resume]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const has = (n: string) => process.argv.includes(`--${n}`);

const POP = join(ROOT, 'docs/ai/new2-r18/existing-correction-population.jsonl');
const OUTDIR = join(ROOT, arg('outdir', 'docs/ai/new2-r19'));
const OUT = join(OUTDIR, 'evidence.jsonl');
const CKPT = join(OUTDIR, 'evidence-checkpoint.json');
const BATCH = Number(arg('batch', '400'));
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

// ---------------------------------------------------------------------------
// Patterns. Written here, on purpose, rather than shared with the extractor.
// ---------------------------------------------------------------------------

/** A CNR: four court letters and twelve digits. One case, issued by the court. */
const CNR_G = /\b([A-Z]{4}[0-9]{12})\b/g;
/** A neutral citation, with the suffix taken when it is printed. */
const CITE_G = /\b(\d{4}):([A-Z][A-Z-]{1,13}):(\d{1,6})\b(?:-(?:DB|FB))?/g;
/** `605 of 2019`, `605/2019`, `605-2019` — a printed case serial and its year. */
const PAIR_G = /\b(\d{1,6})\s*(?:of|OF|of\.|\/|-)\s*((?:19|20)\d{2})\b/g;
/**
 * Phrases that introduce SOMEBODY ELSE'S judgment. Deliberately narrow: each one
 * has to be a phrase a court uses to point away from the document in hand, never
 * one it uses to name itself. `Neutral Citation No.` is excluded precisely
 * because it introduces the document's OWN number.
 */
const LEAD_G =
  /\b(?:reported in|reported as|reported at|cited as|relied upon|reliance (?:up)?on|referred to in|in the case of|judgment in|judgement in|decision in|order (?:passed )?in|following the decision|as held in|see also)\b/gi;

const clamp = (s: string, a: number, b: number): string => s.slice(Math.max(0, a), Math.min(s.length, b));

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
  const words = t.match(/[A-Za-z]{3,}/g) ?? [];
  return words.length / Math.max(1, t.length / 6);
}

type Hit = { v: string; at: number; end: number };
function allMatches(t: string, re: RegExp, group = 0): Hit[] {
  const g = new RegExp(re.source, re.flags);
  const out: Hit[] = [];
  for (let m = g.exec(t); m; m = g.exec(t)) out.push({ v: m[group] ?? m[0], at: m.index, end: m.index + m[0].length });
  return out;
}

/** Nearest hit that ENDS before `at`, and how many characters short of it it stops. */
function nearestBefore(hits: Hit[], at: number, keep: (h: Hit) => boolean): { v: string; dist: number } | null {
  let best: Hit | null = null;
  for (const h of hits) {
    if (h.end > at) break;
    if (!keep(h)) continue;
    if (best === null || h.end > best.end) best = h;
  }
  return best === null ? null : { v: best.v, dist: at - best.end };
}
/** Nearest hit that STARTS after `at + len`. */
function nearestAfter(hits: Hit[], from: number, keep: (h: Hit) => boolean): { v: string; dist: number } | null {
  for (const h of hits) {
    if (h.at < from) continue;
    if (!keep(h)) continue;
    return { v: h.v, dist: h.at - from };
  }
  return null;
}

/** The row's own case number reduced to serial and year, from the METADATA record. */
function ownPair(caseNumber: string | null): [string, string] | null {
  if (!caseNumber) return null;
  const nums = String(caseNumber)
    .split('/')
    .filter((p) => /^[0-9]+$/.test(p));
  if (nums.length < 2) return null;
  return [nums[nums.length - 2]!, nums[nums.length - 1]!];
}
const pairEq = (a: [string, string], b: [string, string]): boolean =>
  String(Number(a[0])) === String(Number(b[0])) && a[1] === b[1];

type Occ = {
  at: number;
  prevCnr: { v: string; dist: number } | null;
  nextCnr: { v: string; dist: number } | null;
  prevOwnCnr: number | null;
  nextOwnCnr: number | null;
  prevOwnPair: number | null;
  nextOwnPair: number | null;
  prevForeignPair: { v: string; dist: number } | null;
  nextForeignPair: { v: string; dist: number } | null;
  prevLead: { v: string; dist: number } | null;
  window: string;
};

/** Everything worth knowing about ONE printed occurrence of ONE citation. */
function occurrenceEvidence(
  text: string,
  at: number,
  len: number,
  cnrs: Hit[],
  ownPairHits: Hit[],
  foreignPairHits: Hit[],
  leads: Hit[],
  ownCnr: string | null,
): Occ {
  const after = at + len;
  return {
    at,
    prevCnr: nearestBefore(cnrs, at, (h) => h.v !== ownCnr),
    nextCnr: nearestAfter(cnrs, after, (h) => h.v !== ownCnr),
    prevOwnCnr: ownCnr === null ? null : (nearestBefore(cnrs, at, (h) => h.v === ownCnr)?.dist ?? null),
    nextOwnCnr: ownCnr === null ? null : (nearestAfter(cnrs, after, (h) => h.v === ownCnr)?.dist ?? null),
    prevOwnPair: nearestBefore(ownPairHits, at, () => true)?.dist ?? null,
    nextOwnPair: nearestAfter(ownPairHits, after, () => true)?.dist ?? null,
    prevForeignPair: nearestBefore(foreignPairHits, at, () => true),
    nextForeignPair: nearestAfter(foreignPairHits, after, () => true),
    prevLead: nearestBefore(leads, at, () => true),
    window: clamp(text, at - 150, at + len + 150).replace(/\s+/g, ' '),
  };
}

type PopRow = {
  judgmentId: string;
  court: string;
  caseNumber: string | null;
  cnr: string | null;
  currentStoredNeutralCitation: string;
  proposedValue: string | null;
  reasonClass: string;
  distinctEligibleCitationsInText: number;
  sourceObjectKey: string | null;
  seriesToken: string | null;
  seriesHomeCourt: string | null;
  seriesIsAnotherCourts: boolean;
};

type DbRow = {
  id: string;
  court: string;
  case_number: string | null;
  cnr: string | null;
  neutral_citation: string | null;
  source_url: string | null;
  judgment_date: string | null;
  full_text: string | null;
};

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  mkdirSync(OUTDIR, { recursive: true });
  const pop: PopRow[] = readFileSync(POP, 'utf8')
    .split(NL)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as PopRow);
  console.log(`[r19] population ${pop.length} rows`);

  let from = 0;
  const counts: Record<string, number> = {};
  const bump = (k: string, by = 1): void => {
    counts[k] = (counts[k] ?? 0) + by;
  };
  if (has('resume') && existsSync(CKPT)) {
    const c = JSON.parse(readFileSync(CKPT, 'utf8'));
    from = c.from ?? 0;
    Object.assign(counts, c.counts ?? {});
    console.log(`[r19] resumed at ${from}`);
  } else {
    writeFileSync(OUT, '');
  }

  const t0 = Date.now();
  for (; from < pop.length; from += BATCH) {
    const slice = pop.slice(from, from + BATCH);
    const ids = slice.map((r) => r.judgmentId);
    const rows = await sql<DbRow[]>`
      SELECT id, court, case_number, cnr, neutral_citation, source_url,
             judgment_date::text AS judgment_date, full_text
        FROM judgments
       WHERE id = ANY(${ids}::uuid[])`;
    const byId = new Map(rows.map((r) => [r.id, r]));
    const emit: string[] = [];

    for (const p of slice) {
      const r = byId.get(p.judgmentId);
      if (!r) {
        bump('ROW_GONE');
        emit.push(JSON.stringify({ judgmentId: p.judgmentId, evidenceState: 'ROW_GONE' }));
        continue;
      }
      // The population is a snapshot. If the stored value moved since R18 froze
      // it, every proposal about this row is stale and must be said so, not
      // silently re-based on today's value.
      const stored = r.neutral_citation ?? '';
      const drift = stored !== p.currentStoredNeutralCitation;
      if (drift) bump('STORED_VALUE_MOVED_SINCE_R18');

      const text = r.full_text ?? '';
      const ownCnr = r.cnr?.trim() || null;
      const own = ownPair(r.case_number);
      const py = /year=(\d{4})/.exec(r.source_url ?? '');
      const partitionYear = py ? Number(py[1]) : null;

      const cd = ctrlDensity(text);
      const ed = engDensity(text);
      const readable = text.length > 0 && cd <= 0.02 && ed >= 0.35;

      const cnrs = allMatches(text, CNR_G, 1);
      const rawPairs = allMatches(text, PAIR_G);
      const pairSerials = (() => {
        const g = new RegExp(PAIR_G.source, PAIR_G.flags);
        const out: [string, string][] = [];
        for (let m = g.exec(text); m; m = g.exec(text)) out.push([m[1]!, m[2]!]);
        return out;
      })();
      const leads = allMatches(text, LEAD_G);
      const cites = allMatches(text, CITE_G);

      const distinct = new Map<string, { count: number; firstAt: number }>();
      for (const c of cites) {
        const e = distinct.get(c.v) ?? { count: 0, firstAt: c.at };
        e.count++;
        distinct.set(c.v, e);
      }

      // The own/foreign split of printed case numbers is a property of the
      // DOCUMENT, not of an occurrence, so it is computed once per row.
      const ownPairHits = rawPairs.filter((_, i) => own !== null && pairSerials[i] !== undefined && pairEq(pairSerials[i]!, own));
      const foreignPairHits = rawPairs.filter((_, i) => own !== null && pairSerials[i] !== undefined && !pairEq(pairSerials[i]!, own));
      const occOf = (value: string): Occ[] => {
        const out: Occ[] = [];
        if (value.length === 0) return out;
        let i = text.indexOf(value);
        while (i !== -1 && out.length < 8) {
          out.push(occurrenceEvidence(text, i, value.length, cnrs, ownPairHits, foreignPairHits, leads, ownCnr));
          i = text.indexOf(value, i + value.length);
        }
        return out;
      };

      const storedOcc = readable ? occOf(stored) : [];
      const proposedOcc = readable && p.proposedValue ? occOf(p.proposedValue) : [];

      const ownCnrInText = ownCnr !== null && cnrs.some((h) => h.v === ownCnr);
      const ownPairInText = own !== null && pairSerials.some((s) => pairEq(s, own));
      const foreignCnrsInText = [...new Set(cnrs.map((h) => h.v).filter((v) => v !== ownCnr))];

      // What identity, if any, stands adjacent to citations OTHER than the
      // stored one — the evidence a replacement would need on its own side.
      const ownAnchoredOthers: string[] = [];
      for (const [v] of distinct) {
        if (v === stored) continue;
        const occ = occOf(v);
        const anchored = occ.some(
          (o) =>
            (o.prevOwnCnr !== null && o.prevOwnCnr <= 60) ||
            (o.nextOwnCnr !== null && o.nextOwnCnr <= 60) ||
            (o.prevOwnPair !== null && o.prevOwnPair <= 60) ||
            (o.nextOwnPair !== null && o.nextOwnPair <= 60),
        );
        if (anchored) ownAnchoredOthers.push(v);
      }

      bump(readable ? 'READABLE' : 'TEXT_UNREADABLE');
      bump(storedOcc.length > 0 ? 'STORED_PRINTED' : 'STORED_NOT_PRINTED');

      emit.push(
        JSON.stringify({
          judgmentId: p.judgmentId,
          court: r.court,
          caseNumber: r.case_number,
          cnr: ownCnr,
          judgmentDate: r.judgment_date,
          partitionYear,
          reasonClass: p.reasonClass,
          storedAtR18: p.currentStoredNeutralCitation,
          storedNow: stored,
          storedValueMovedSinceR18: drift,
          proposedValue: p.proposedValue,
          seriesToken: p.seriesToken,
          seriesHomeCourt: p.seriesHomeCourt,
          seriesIsAnotherCourts: p.seriesIsAnotherCourts,
          evidenceState: readable ? 'READABLE' : 'TEXT_UNREADABLE',
          textLen: text.length,
          ctrlDensity: Number(cd.toFixed(5)),
          engDensity: Number(ed.toFixed(4)),
          ownCnrInText,
          ownPairInText,
          ownIdentityInText: ownCnrInText || ownPairInText,
          cnrCountInText: cnrs.length,
          foreignCnrsInText: foreignCnrsInText.slice(0, 12),
          distinctCitationsInText: [...distinct].map(([v, e]) => ({ v, count: e.count, firstAt: e.firstAt })).slice(0, 24),
          distinctCitationCount: distinct.size,
          storedOccurrences: storedOcc,
          proposedOccurrences: proposedOcc,
          ownAnchoredOtherCitations: ownAnchoredOthers.slice(0, 8),
          r18DistinctEligible: p.distinctEligibleCitationsInText,
        }),
      );
    }

    appendFileSync(OUT, emit.join(NL) + NL);
    writeFileSync(CKPT, JSON.stringify({ from: from + BATCH, counts, at: new Date().toISOString() }, null, 1) + NL);
    const done = Math.min(from + BATCH, pop.length);
    if (done % 2000 === 0 || done === pop.length)
      console.log(`[r19] ${done}/${pop.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s  ${JSON.stringify(counts)}`);
  }
  console.log(`[r19] evidence written to ${OUT}`);
} finally {
  await sql.end({ timeout: 5 });
}
