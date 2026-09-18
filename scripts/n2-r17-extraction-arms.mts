/**
 * NEW2 — R17 §3. GROUND TRUTH, AND FOUR NAMED EXTRACTION ARMS SCORED AGAINST IT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GROUND TRUTH IS ANCHORED ON IDENTITY, NOT ON POSITION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * If the adjudicator decided "own citation" by where the citation sits, and a
 * candidate rule also decided by where it sits, the measurement would only be
 * asking the same question twice. So the expected answer here is decided by the
 * ROW'S OWN IDENTITY — its CNR and its case number, both of which come from the
 * AWS metadata record and not from the document text — appearing beside the
 * citation, with no other matter's number intervening. Position is used for
 * nothing except reporting.
 *
 * A document whose text this instrument cannot read is UNTESTABLE and scores as
 * neither a hit nor a miss (`text-quality-certifies-garbage`: a CID glyph dump
 * passes `text_quality` at 0.85+ while carrying no readable identity at all).
 *
 * Every document where the adjudicator is UNDECIDED, and every document where an
 * arm disagrees with it, is written out for hand review — the scored numbers are
 * only as good as that review, and both are published.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ARMS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   OLD             what ships today: first match in 3,000 characters, accepted
 *                   on a year test alone.
 *   ARM_W250        the obvious fix — the same rule with the window cut to 250.
 *                   Named and measured precisely because it is the one that
 *                   looks free, and it is not.
 *   CANDIDATE       same 3,000-character exposure as OLD, but each match must
 *                   survive an identity gate: no other matter's case number or
 *                   CNR immediately before it, no citing lead unless the row's
 *                   own identity is beside it. Two surviving distinct citations
 *                   answer NULL, never a guess.
 *   ARM_CAND_FULL   the same gate over the whole document, to price the recall
 *                   the window is costing.
 *
 * Read-only. Database, no network. Mutates nothing.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-r17-extraction-arms.mts
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { neutralCitationFrom } from '../services/ingest/src/harvest/hc-load.ts';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const POP = join(ROOT, arg('population', 'docs/ai/new2-r17/eval-population.json'));
const REVIEW = join(ROOT, arg('review', 'docs/ai/new2-r17/hand-adjudication.json'));
const OUT = join(ROOT, arg('out', 'docs/ai/new2-r17/arms-scored.json'));

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

// ── the shared vocabulary ────────────────────────────────────────────────────

const NEUTRAL_G = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/g;
const CNR_G = /\b([A-Z]{2}HC[0-9]{12,14})\b/g;
/**
 * `No. - 859 of 2023`, `859 of 2023`, `18552/2025`, `CWP-15861-2015` — a matter,
 * printed.
 *
 * The two lookbehinds are a DATE guard and they are not cosmetic. Without them
 * `Judgment Reserved on : 09/12/2024` reads as matter 12 of 2024, and that one
 * false match made `FA/69/2022` (Chhattisgarh) disown its own masthead citation
 * — the date sits 69 characters after the citation and the row's real number 50
 * characters further on, so the date won on proximity. Dates are the commonest
 * `<digits><separator><year>` string in a judgment; a rule that cannot tell one
 * from a case number is measuring punctuation.
 */
const CASE_PAIR_G = /(?<!\d[/.-])(?<!\d)(\d{1,6})\s*(?:of|\/|-)\s*((?:19|20)\d{2})\b/g;
/** Language that introduces somebody else's judgment. */
const CITING_LEAD =
  /(in the case of|reported in|as held in|relied (?:up)?on|reliance (?:up)?on|covered (?:by|under)|passed by this Court|decided by this Court|Cases?\s+Referred|following [a-z ]{0,12}judge?ments?|judge?ments? of this Court|judge?ment dated|order dated|\bv\.\s|\bvs\.?\s|\bversus\b|\bSCC\b|\bSupreme Court\b)/i;

const MASTHEAD_MAX = 250;
const HEADER_WINDOW = 3000;

/** The row's own case number reduced to [serial, year]. `WRIT-A/7699/2023` -> ['7699','2023']. */
function ownPair(cn: string | null): [string, string] | null {
  if (!cn) return null;
  const nums = String(cn)
    .split('/')
    .filter((p) => /^[0-9]+$/.test(p));
  if (nums.length < 2) return null;
  return [nums[nums.length - 2]!, nums[nums.length - 1]!];
}
const samePair = (a: [string, string], b: [string, string]): boolean =>
  String(Number(a[0])) === String(Number(b[0])) && a[1] === b[1];

function _pairsIn(s: string): [string, string][] {
  CASE_PAIR_G.lastIndex = 0;
  const out: [string, string][] = [];
  for (let m = CASE_PAIR_G.exec(s); m; m = CASE_PAIR_G.exec(s)) out.push([m[1]!, m[2]!]);
  return out;
}
function _cnrsIn(s: string): string[] {
  CNR_G.lastIndex = 0;
  return [...new Set(s.match(CNR_G) ?? [])];
}
/** The document prints `<serial> … <year>` in one of the Indian cause-title forms. */
function _printsPair(s: string, p: [string, string] | null): boolean {
  if (!p) return false;
  return new RegExp('\\b' + p[0] + '\\b[^0-9]{0,40}\\b' + p[1] + '\\b').test(s);
}

function damage(t: string): { ctrl: number; english: number; damaged: boolean } {
  if (!t.length) return { ctrl: 1, english: 0, damaged: true };
  let ctrl = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || (c >= 0xe000 && c <= 0xf8ff)) ctrl++;
  }
  const words = t.match(/[A-Za-z]{3,}/g) ?? [];
  const english = words.length / Math.max(1, t.length / 6);
  return { ctrl: ctrl / t.length, english, damaged: ctrl / t.length > 0.02 || english < 0.35 };
}

type Occ = { citation: string; year: number; at: number };
function occurrences(t: string, limit: number): Occ[] {
  NEUTRAL_G.lastIndex = 0;
  const out: Occ[] = [];
  const scope = t.slice(0, limit);
  for (let m = NEUTRAL_G.exec(scope); m; m = NEUTRAL_G.exec(scope))
    out.push({ citation: m[0], year: Number(m[1]), at: m.index });
  return out;
}

// ── the one reading both sides share: the NEAREST structural signal wins ─────

/**
 * A citation is introduced by whatever stands closest to it, not by whatever
 * stands somewhere near it. Two documents forced this correction:
 *
 *   `RSA/1703/2023` (Karnataka) stamps `NC: 2026:KHC:19999 RSA No. 1703 of 2023`
 *   on all 28 pages, so the row's OWN case number sits within 350 characters of
 *   an authority quoted 13,728 characters in. Widest-context reading called that
 *   document AMBIGUOUS. Nearest-signal reading sees `v. Nagappa (Dead) by LRs and
 *   Ors. [` immediately before the authority and calls it what it is.
 *
 *   `CRM-M/18292/2024` (Punjab & Haryana) prints its own case number in the page
 *   footer and the next line quotes `[UOI v. Prateek Shukla, 2021:INSC:165`.
 *   Widest-context reading made a SUPREME COURT citation a High Court document's
 *   own.
 */
/**
 * FOREIGN is split by SIDE, and the split is load-bearing.
 *
 * A citation is disowned only by what INTRODUCES it. A different matter's cause
 * title standing AFTER it means something weaker: this document is a common
 * order and the masthead names the LEAD matter of a connected group, not this
 * row. Measured on 8 documents — `MCRC/1666/2025` under a masthead reading
 * `MCRC No. 1696 of 2025`, `CW/995/2021` under `D.B. Civil Writ Petition No.
 * 9599/2019`, `MFA/25707/2011` under `MFA No. 25207 of 2011` — all of which
 * print exactly one citation, which is theirs.
 *
 * Treating that as FOREIGN cost 8 of 198 true own citations and prevented none
 * of the 109 known defects: 106 of those carry a citing phrase BEFORE the
 * citation and the other three a foreign CNR or case number before it.
 */
type OccVerdict = 'OWN_ID' | 'OWN_POS' | 'FOREIGN_LEAD' | 'FOREIGN_PAIR' | 'FOREIGN_AFTER' | 'UNMARKED';

function lastIndexMatching(s: string, re: RegExp, keep: (m: RegExpExecArray) => boolean): number {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let last = -1;
  for (let m = g.exec(s); m; m = g.exec(s)) if (keep(m)) last = m.index;
  return last;
}
function firstIndexMatching(s: string, re: RegExp, keep: (m: RegExpExecArray) => boolean): number {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  for (let m = g.exec(s); m; m = g.exec(s)) if (keep(m)) return m.index;
  return -1;
}
const CITING_LEAD_G = new RegExp(CITING_LEAD.source, 'gi');

function classify(t: string, o: Occ, own: [string, string] | null, ownCnr: string | null): OccVerdict {
  const before = t.slice(Math.max(0, o.at - 200), o.at);
  const after = t.slice(o.at + o.citation.length, o.at + o.citation.length + 200);

  // BEFORE: the LAST signal to appear is the one that introduces the citation.
  const ownPairBefore = own === null ? -1 : lastIndexMatching(before, CASE_PAIR_G, (m) => samePair([m[1]!, m[2]!], own));
  const ownCnrBefore = ownCnr === null ? -1 : before.lastIndexOf(ownCnr);
  const foreignPairBefore = lastIndexMatching(before, CASE_PAIR_G, (m) => own === null || !samePair([m[1]!, m[2]!], own));
  const foreignCnrBefore = lastIndexMatching(before, CNR_G, (m) => m[1] !== ownCnr);
  const leadBefore = lastIndexMatching(before, CITING_LEAD_G, () => true);

  const ownBefore = Math.max(ownPairBefore, ownCnrBefore);
  const notOwnBefore = Math.max(foreignPairBefore, foreignCnrBefore, leadBefore);
  if (ownBefore >= 0 || notOwnBefore >= 0) {
    if (ownBefore > notOwnBefore) return 'OWN_ID';
    /**
     * A citing PHRASE or another matter's CNR is a claim about the citation. A
     * bare case number in the prose before it is often not — a page stamp lands
     * wherever the page broke, so `…MVC NO.3286/2005 … - 2 - NC: <citation>`
     * disowns nothing. Kept apart so the arms can price them separately.
     */
    return Math.max(leadBefore, foreignCnrBefore) > foreignPairBefore ? 'FOREIGN_LEAD' : 'FOREIGN_PAIR';
  }

  // AFTER: nothing introduced it, so the cause title it heads decides — and here
  // the FIRST signal is the nearest one.
  const ownPairAfter = own === null ? -1 : firstIndexMatching(after, CASE_PAIR_G, (m) => samePair([m[1]!, m[2]!], own));
  const ownCnrAfter = ownCnr === null ? -1 : after.indexOf(ownCnr);
  const foreignPairAfter = firstIndexMatching(after, CASE_PAIR_G, (m) => own === null || !samePair([m[1]!, m[2]!], own));
  const foreignCnrAfter = firstIndexMatching(after, CNR_G, (m) => m[1] !== ownCnr);
  const nearer = (a: number, b: number): number => (a < 0 ? b : b < 0 ? a : Math.min(a, b));
  const ownAfter = nearer(ownPairAfter, ownCnrAfter);
  const notOwnAfter = nearer(foreignPairAfter, foreignCnrAfter);
  if (ownAfter >= 0 || notOwnAfter >= 0)
    return ownAfter >= 0 && (notOwnAfter < 0 || ownAfter < notOwnAfter) ? 'OWN_ID' : 'FOREIGN_AFTER';

  return o.at <= MASTHEAD_MAX ? 'OWN_POS' : 'UNMARKED';
}

// ── the adjudicator: identity only, never position ───────────────────────────

type Expected =
  | { label: 'OWN'; citation: string; why: string }
  | { label: 'NONE'; why: string }
  | { label: 'AMBIGUOUS'; citations: string[]; why: string }
  | { label: 'UNTESTABLE'; why: string }
  | { label: 'UNDECIDED'; why: string };

/**
 * Ground truth says OWN only on IDENTITY. `OWN_POS` — a citation that opens the
 * document with nothing either side of it — is deliberately NOT enough here: it
 * is one of the things the arms are being judged on, and letting it decide the
 * answer would be marking an arm's homework with its own answer sheet. Those
 * documents come back UNDECIDED and are read by hand.
 */
function adjudicate(t: string, own: [string, string] | null, ownCnr: string | null): Expected {
  const dmg = damage(t);
  if (dmg.damaged)
    return { label: 'UNTESTABLE', why: `unreadable extraction (english ${dmg.english.toFixed(2)}, ctrl ${dmg.ctrl.toFixed(3)})` };
  const occ = occurrences(t, t.length);
  if (occ.length === 0) return { label: 'NONE', why: 'the document prints no neutral citation anywhere' };

  const ids = new Set<string>();
  let foreign = 0;
  let unanchored = 0;
  for (const o of occ) {
    const v = classify(t, o, own, ownCnr);
    if (v === 'OWN_ID') ids.add(o.citation);
    else if (v === 'FOREIGN_LEAD' || v === 'FOREIGN_PAIR' || v === 'FOREIGN_AFTER') foreign++;
    else unanchored++;
  }
  const owns = [...ids];
  if (owns.length === 1)
    return { label: 'OWN', citation: owns[0]!, why: 'the row own case number or CNR is the nearest identity to exactly one citation' };
  if (owns.length > 1)
    return { label: 'AMBIGUOUS', citations: owns, why: `${owns.length} distinct citations each carry the row own identity nearest them` };
  if (unanchored > 0) return { label: 'UNDECIDED', why: `${unanchored} occurrence(s) carry no identity either side` };
  return { label: 'NONE', why: `all ${foreign} occurrence(s) belong to another matter` };
}

// ── the arms ─────────────────────────────────────────────────────────────────

const yearOk = (c: number, y: number): boolean => c === y || c === y - 1;

/** Ships today. `services/ingest/src/harvest/hc-load.ts` at HEAD. */
function armOld(t: string, year: number): string | null {
  const m = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/.exec(t.slice(0, HEADER_WINDOW));
  if (!m) return null;
  return yearOk(Number(m[1]), year) ? m[0] : null;
}

/** The obvious fix, named so it can lose on the record. */
function armW250(t: string, year: number): string | null {
  const m = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/.exec(t.slice(0, MASTHEAD_MAX));
  if (!m) return null;
  return yearOk(Number(m[1]), year) ? m[0] : null;
}

type Buckets = Map<string, { id: number; pos: number; unmarked: number; lead: number; pair: number; foreignAfter: number; count: number }>;
function gateOccurrences(
  t: string,
  year: number,
  own: [string, string] | null,
  ownCnr: string | null,
  window: number,
): Buckets {
  const by: Buckets = new Map();
  for (const o of occurrences(t, window)) {
    if (!yearOk(o.year, year)) continue;
    const v = classify(t, o, own, ownCnr);
    const e = by.get(o.citation) ?? { id: 0, pos: 0, unmarked: 0, lead: 0, pair: 0, foreignAfter: 0, count: 0 };
    e.count++;
    if (v === 'OWN_ID') e.id++;
    else if (v === 'OWN_POS') e.pos++;
    else if (v === 'FOREIGN_LEAD') e.lead++;
    else if (v === 'FOREIGN_PAIR') e.pair++;
    else if (v === 'FOREIGN_AFTER') e.foreignAfter++;
    else e.unmarked++;
    by.set(o.citation, e);
  }
  return by;
}
const only = (cs: string[]): string | null => (cs.length === 1 ? cs[0]! : null);

/** CAND_A — identity only. Answers nothing a cause title does not anchor. */
function armIdentity(t: string, year: number, own: [string, string] | null, ownCnr: string | null, window: number): string | null {
  const by = gateOccurrences(t, year, own, ownCnr, window);
  return only([...by].filter(([, e]) => e.id > 0).map(([c]) => c));
}

/**
 * CAND_B — identity, then position, then the page stamp. Tiered, and the ORDER
 * is the whole rule:
 *
 *  1. a citation the row's own cause title anchors beats everything. This is the
 *     tier that gets `WPS/5687/2025` right — four connected Chhattisgarh writ
 *     petitions in one PDF, each with its own masthead and its own citation,
 *     where taking the first one files this row under WPS 5593's number;
 *  2. failing that, a citation that OPENS the document with nothing either side;
 *  3. failing that, the one citation in the document never introduced as somebody
 *     else's — **Bombay does not print its citation in the masthead.** It stamps
 *     it in the page furniture beside the judge's signature, so an identity-only
 *     rule answers NULL on every Bombay order there is. Measured, not assumed:
 *     45 of the 59 documents the identity adjudicator could not anchor.
 *
 * Two survivors at any tier answer NULL. A missing citation is a recoverable
 * gap; a wrong one files a document under another matter's number.
 */
function armTiered(t: string, year: number, own: [string, string] | null, ownCnr: string | null, window: number): string | null {
  const by = gateOccurrences(t, year, own, ownCnr, window);
  const ids = [...by].filter(([, e]) => e.id > 0).map(([c]) => c);
  if (ids.length > 0) return only(ids);
  const pos = [...by].filter(([, e]) => e.pos > 0).map(([c]) => c);
  if (pos.length > 0) return only(pos);

  /**
   * Tier 3, the page stamp. A citation is a candidate when no occurrence of it is
   * introduced as somebody else's — never by a citing phrase, never by another
   * matter's CNR. A bare foreign case number before it is forgiven ONLY when the
   * citation recurs: a page stamp is printed on every page, an order's footer
   * inherited from a different order is printed once. `CWP/1220/2024` (Punjab &
   * Haryana) carries exactly that inherited footer once, and stays refused.
   */
  const candidates = [...by].filter(([, e]) => e.lead === 0 && (e.pair === 0 || e.count >= 3));
  if (candidates.length === 1) return candidates[0]![0];
  /** More than one: only an unstamped rival loses to a stamped one, else NULL. */
  const clean = candidates.filter(([, e]) => e.foreignAfter === 0).map(([c]) => c);
  return only(clean);
}

/**
 * CAND_D — CAND_B, plus one measured fact: **a citation printed three or more
 * times in a document is page furniture, not an authority.**
 *
 * Measured on the 109 defect rows, not assumed: the wrongly-taken citation
 * appears exactly once in 103 of them and twice in 6. Never three times. So
 * repetition can override the citing-lead test, which matters because a page
 * stamp lands wherever the page broke — Rajasthan stamps
 * `[2025:RJ-JP:37433-DB] (2 of 24) [CCP-674/2018]` mid-cause-title, so the word
 * `Versus` from the party list falls immediately before it and disowns the
 * document's own citation.
 */
function armFurniture(t: string, year: number, own: [string, string] | null, ownCnr: string | null, window: number): string | null {
  if (damage(t).damaged) return null;
  const by = gateOccurrences(t, year, own, ownCnr, window);
  const ids = [...by].filter(([, e]) => e.id > 0).map(([c]) => c);
  if (ids.length > 0) return only(ids);
  const pos = [...by].filter(([, e]) => e.pos > 0).map(([c]) => c);
  if (pos.length > 0) return only(pos);
  const candidates = [...by].filter(([, e]) => e.count >= 3 || (e.lead === 0 && e.pair === 0));
  if (candidates.length === 1) return candidates[0]![0];
  return only(candidates.filter(([, e]) => e.foreignAfter === 0).map(([c]) => c));
}

/** CAND_C — CAND_B, and refuses outright on text the damage screen rejects. */
function armTieredScreened(t: string, year: number, own: [string, string] | null, ownCnr: string | null, window: number): string | null {
  return damage(t).damaged ? null : armTiered(t, year, own, ownCnr, window);
}

// ── run ──────────────────────────────────────────────────────────────────────

type Member = {
  judgmentId: string;
  stratum: string;
  court: string;
  date: string;
  caseNumber: string | null;
  cnr: string | null;
  contentHash: string | null;
};
type Row = {
  id: string;
  case_number: string | null;
  cnr: string | null;
  neutral_citation: string | null;
  content_hash: string | null;
  jyear: number;
  full_text: string | null;
  case_title: string | null;
  source_url: string | null;
};

const ARMS = ['OLD', 'ARM_W250', 'CAND_A_IDENTITY', 'CAND_B_TIERED', 'CAND_C_SCREENED', 'CAND_D_FURNITURE', 'CAND_B_W3000', 'SHIPPED'] as const;
type ArmName = (typeof ARMS)[number];

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  const takenAt = new Date().toISOString();
  const pop = JSON.parse(readFileSync(POP, 'utf8')) as {
    populationId: string;
    populationHash: string;
    size: number;
    members: Member[];
  };
  /** Hand adjudication overrides, keyed by judgmentId. Written by a human, read here. */
  const hand = existsSync(REVIEW)
    ? (JSON.parse(readFileSync(REVIEW, 'utf8')) as { decisions: Record<string, { label: string; citation?: string; note: string }> })
    : { decisions: {} as Record<string, { label: string; citation?: string; note: string }> };

  const ids = pop.members.map((m) => m.judgmentId);
  const rows = new Map<string, Row>();
  for (let i = 0; i < ids.length; i += 100) {
    const got = await sql<Row[]>`
      SELECT j.id, j.case_number, j.cnr, j.neutral_citation, j.content_hash, j.case_title, j.source_url,
             extract(year FROM j.judgment_date)::int AS jyear, j.full_text
        FROM judgments j WHERE j.id = ANY(${ids.slice(i, i + 100)})`;
    for (const r of got) rows.set(r.id, r);
  }
  if (rows.size !== pop.size) throw new Error(`population is ${pop.size} but ${rows.size} rows came back`);

  /** the frozen identity must still hold, or the measurement is of a different corpus */
  const identity = pop.members.map((m) => `${m.judgmentId}:${m.contentHash ?? ''}`).join('\n');
  const nowHash = createHash('sha256').update(identity).digest('hex');
  const drift = pop.members.filter((m) => (rows.get(m.judgmentId)!.content_hash ?? '') !== (m.contentHash ?? ''));

  const judged = pop.members.map((m) => {
    const r = rows.get(m.judgmentId)!;
    const t = r.full_text ?? '';
    /**
     * The ingest year is the PARTITION year. It is recovered from the source URL
     * so the arms see what `neutralCitationFrom` actually sees, not the row date.
     */
    const py = /year=(\d{4})/.exec(r.source_url ?? '');
    const year = py ? Number(py[1]) : r.jyear;
    const own = ownPair(r.case_number);

    const auto = adjudicate(t, own, r.cnr);
    const override = hand.decisions[m.judgmentId];
    const expected: Expected = override
      ? override.label === 'OWN'
        ? { label: 'OWN', citation: override.citation!, why: `hand: ${override.note}` }
        : override.label === 'AMBIGUOUS'
          ? { label: 'AMBIGUOUS', citations: [], why: `hand: ${override.note}` }
          : override.label === 'UNTESTABLE'
            ? { label: 'UNTESTABLE', why: `hand: ${override.note}` }
            : { label: 'NONE', why: `hand: ${override.note}` }
      : auto;

    const predictions: Record<ArmName, string | null> = {
      OLD: armOld(t, year),
      ARM_W250: armW250(t, year),
      CAND_A_IDENTITY: armIdentity(t, year, own, r.cnr, t.length),
      CAND_B_TIERED: armTiered(t, year, own, r.cnr, t.length),
      CAND_C_SCREENED: armTieredScreened(t, year, own, r.cnr, t.length),
      CAND_D_FURNITURE: armFurniture(t, year, own, r.cnr, t.length),
      CAND_B_W3000: armTiered(t, year, own, r.cnr, HEADER_WINDOW),
      SHIPPED: neutralCitationFrom(t, year, { caseNumber: r.case_number, cnr: r.cnr }),
    };

    const firstOcc = occurrences(t, t.length)[0];
    return {
      judgmentId: m.judgmentId,
      stratum: m.stratum,
      court: m.court,
      date: m.date,
      caseNumber: r.case_number,
      cnr: r.cnr,
      partitionYear: year,
      textLength: t.length,
      storedNeutralCitation: r.neutral_citation,
      firstOccurrenceOffset: firstOcc ? firstOcc.at : -1,
      distinctCitations: new Set(occurrences(t, t.length).map((o) => o.citation)).size,
      expected: expected.label,
      expectedCitation: expected.label === 'OWN' ? expected.citation : null,
      expectedWhy: expected.why,
      handAdjudicated: Boolean(override),
      predictions,
      evidence: firstOcc
        ? t
            .slice(Math.max(0, firstOcc.at - 200), firstOcc.at + 120)
            .replace(/\s+/g, ' ')
            .trim()
        : '',
    };
  });

  type Score = {
    trueOwn: number;
    falseOwn: number;
    missedOwn: number;
    correctNull: number;
    untestableAnswered: number;
    suffixTruncated: number;
  };
  /**
   * `2025:DHC:8491-DBThis is a digitally signed order` — the page prints the
   * `-DB`, the extraction glues the next word to it, and the shared regex cannot
   * take a suffix with no boundary after it. Every arm loses it identically, so
   * it is counted on its own rather than blamed on the choice rule; precision is
   * reported both ways.
   */
  const suffixOnly = (pred: string | null, exp: string | null): boolean =>
    pred !== null && exp !== null && exp !== pred && exp.replace(/-(?:DB|FB)$/, '') === pred;

  const score = (arm: ArmName): Score => {
    const s: Score = { trueOwn: 0, falseOwn: 0, missedOwn: 0, correctNull: 0, untestableAnswered: 0, suffixTruncated: 0 };
    for (const j of judged) {
      if (j.expected === 'UNDECIDED') continue; // not scored until a human decides
      const p = j.predictions[arm];
      if (j.expected === 'OWN') {
        if (p === null) s.missedOwn++;
        else if (p === j.expectedCitation) s.trueOwn++;
        else if (suffixOnly(p, j.expectedCitation)) s.suffixTruncated++;
        else s.falseOwn++;
      } else if (j.expected === 'UNTESTABLE') {
        if (p === null) s.correctNull++;
        else {
          s.falseOwn++;
          s.untestableAnswered++;
        }
      } else {
        // NONE or AMBIGUOUS: any answer at all is an unsupported own-citation claim
        if (p === null) s.correctNull++;
        else s.falseOwn++;
      }
    }
    return s;
  };

  const scores = Object.fromEntries(
    ARMS.map((a) => {
      const s = score(a);
      /** strict: a truncated suffix is a wrong citation string. lenient: it is the right judgment. */
      const answered = s.trueOwn + s.falseOwn + s.suffixTruncated;
      const wanted = s.trueOwn + s.missedOwn + s.suffixTruncated;
      const p3 = (x: number | null): number | null => (x === null ? null : Number(x.toFixed(4)));
      return [
        a,
        {
          ...s,
          precisionStrict: answered === 0 ? null : p3(s.trueOwn / answered),
          precisionSuffixLenient: answered === 0 ? null : p3((s.trueOwn + s.suffixTruncated) / answered),
          recallStrict: wanted === 0 ? null : p3(s.trueOwn / wanted),
          recallSuffixLenient: wanted === 0 ? null : p3((s.trueOwn + s.suffixTruncated) / wanted),
        },
      ];
    }),
  );

  const byStratum: Record<string, Record<string, Score>> = {};
  for (const st of [...new Set(judged.map((j) => j.stratum))].sort()) {
    byStratum[st] = {};
    for (const a of ARMS) {
      const s: Score = { trueOwn: 0, falseOwn: 0, missedOwn: 0, correctNull: 0, untestableAnswered: 0, suffixTruncated: 0 };
      for (const j of judged.filter((x) => x.stratum === st && x.expected !== 'UNDECIDED')) {
        const p = j.predictions[a];
        if (j.expected === 'OWN') {
          if (p === null) s.missedOwn++;
          else if (p === j.expectedCitation) s.trueOwn++;
          else if (suffixOnly(p, j.expectedCitation)) s.suffixTruncated++;
          else s.falseOwn++;
        } else if (p === null) s.correctNull++;
        else s.falseOwn++;
      }
      byStratum[st]![a] = s;
    }
  }

  /** everything a human still has to look at */
  const needsReview = judged.filter(
    (j) =>
      !j.handAdjudicated &&
      (j.expected === 'UNDECIDED' ||
        j.expected === 'AMBIGUOUS' ||
        ARMS.some((a) => {
          const p = j.predictions[a];
          return j.expected === 'OWN'
            ? p !== null && p !== j.expectedCitation && !suffixOnly(p, j.expectedCitation)
            : p !== null;
        })),
  );

  const artifact = {
    artifact: 'NEW2_R17_ARMS_SCORED',
    lane: 'NEW2',
    takenAt,
    population: {
      populationId: pop.populationId,
      populationHash: pop.populationHash,
      recomputedHash: nowHash,
      hashMatches: nowHash === pop.populationHash,
      contentDrift: drift.length,
      size: pop.size,
    },
    method: {
      groundTruth:
        'identity anchoring: the row own CNR or own case number (both from the AWS metadata record, not the text) beside a citation, with no other matter number between; position is reported, never decisive',
      undecidedAreNotScored: true,
      handAdjudicationFile: 'docs/ai/new2-r17/hand-adjudication.json',
      handAdjudicated: judged.filter((j) => j.handAdjudicated).length,
      armDefinitions: {
        OLD: 'first match in 3,000 chars, year test only — services/ingest/src/harvest/hc-load.ts at HEAD',
        ARM_W250: 'identical, window 250',
        CAND_A_IDENTITY: 'identity only, whole document, two survivors answer NULL',
        CAND_B_TIERED: 'identity, then position, then the one never-foreign citation; whole document',
        CAND_C_SCREENED: 'CAND_B, refusing outright on text the damage screen rejects',
        CAND_D_FURNITURE: 'CAND_C, plus repetition (3 or more occurrences) overriding the citing-lead test',
        CAND_B_W3000: 'CAND_B confined to the current 3,000-character window, to price the window apart from the rule',
        SHIPPED: 'the real services/ingest/src/harvest/hc-load.ts neutralCitationFrom, imported — so the published numbers belong to the committed code and not to a copy of it living in this script',
      },
    },
    expectedDistribution: judged.reduce<Record<string, number>>((a, j) => ((a[j.expected] = (a[j.expected] ?? 0) + 1), a), {}),
    scores,
    byStratum,
    needsReviewCount: needsReview.length,
    needsReview: needsReview.map((j) => ({
      judgmentId: j.judgmentId,
      stratum: j.stratum,
      court: j.court,
      caseNumber: j.caseNumber,
      cnr: j.cnr,
      textLength: j.textLength,
      expected: j.expected,
      expectedCitation: j.expectedCitation,
      expectedWhy: j.expectedWhy,
      predictions: j.predictions,
      firstOccurrenceOffset: j.firstOccurrenceOffset,
      distinctCitations: j.distinctCitations,
      evidence: j.evidence,
    })),
    judged,
  };
  const body = JSON.stringify(artifact, null, 2);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, body + '\n');
  console.log('[arms] population', pop.populationId, 'hashMatches', nowHash === pop.populationHash, 'drift', drift.length);
  console.log('[arms] expected', JSON.stringify(artifact.expectedDistribution));
  console.log('[arms] scores', JSON.stringify(scores, null, 1));
  console.log('[arms] needsReview', needsReview.length);
  console.log('[arms] wrote', OUT);
} finally {
  await sql.end();
}
