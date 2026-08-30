/**
 * NEW2 R14 — the independent citation falsifier, and a NEW immutable apply
 * candidate.
 *
 * ## Why this exists
 *
 * FIFTH held `--apply` (bus 1583/1584) on two grounds the earlier evidence
 * could not answer: the alias path was never adjudicated as a PATH, and
 * cross-court collisions were explicitly outside the in-sample replay. The
 * founder's instruction adds a third: an apply decision must bind to ONE
 * immutable population and ONE known frontier, because a corpus that advances
 * under the evidence invalidates the evidence.
 *
 * ## The root cause this measures
 *
 * A neutral citation is NOT a unique key in this corpus. Indian registries
 * stamp one neutral citation on every connected matter disposed of by a common
 * order, and our own ingest additionally lands the same judgment twice from two
 * sources. So the resolver's `UNIQUE` is a statement about HOW MUCH OF THE
 * CORPUS HAS LANDED, not about how many judgments bear the citation. A pin made
 * while the second bearer is unlanded is a false unique that no freshness gate
 * can see: all three gates in `resolver.ts` reason about rows that EXIST, and
 * the second bearer does not exist yet.
 *
 * ## Four independent instruments, none of which reads a resolver prediction
 *
 *   1. TEMPORAL HOLDOUT   keys single-claim at T0, multi-claim now. Out of
 *                         sample by construction, and the only instrument that
 *                         can see the failure above. Population-level.
 *   2. STRUCTURAL CENSUS  how many keys demonstrably name more than one
 *                         distinct case, split by same-case duplicate vs
 *                         genuinely different authority.
 *   3. BLIND STRATA       edges selected by DB structure and the PURE
 *                         normalisation function only. The resolver is run
 *                         AFTER selection is written and hashed.
 *   4. ALIAS ENUMERATION  every alias row, not a sample. 4,394 is small enough
 *                         that sampling would be a choice to know less.
 *
 * Deterministic legal identity is primary throughout: the court token and the
 * year token carried BY THE CITATION FORM ITSELF, checked against attributes
 * the target judgment records independently. Party/title overlap is recorded
 * and reported, and is allowed to corroborate or contradict an identity that
 * already exists. It never creates one.
 *
 * Usage:
 *   tsx scripts/n2-citation-falsifier-r14.mts --stage package
 *   tsx scripts/n2-citation-falsifier-r14.mts --stage freeze
 *   tsx scripts/n2-citation-falsifier-r14.mts --stage adjudicate
 *   tsx scripts/n2-citation-falsifier-r14.mts --stage report
 */
import { createHash } from 'node:crypto';
import { appendFileSync, createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';
import { canonicalKeyFor, resolveBatch, RESOLVER_VERSION } from '../services/api/src/citations/resolver.ts';
import { readKeyFreshness } from '../services/api/src/citations/key-freshness.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORK = join(ROOT, '.tmp-new2/r14');
const OUTDIR = join(ROOT, 'docs/ai/new2-r14');
mkdirSync(WORK, { recursive: true });
mkdirSync(OUTDIR, { recursive: true });

const arg = (name: string, fallback: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : (process.argv[at + 1] ?? fallback);
};
const STAGE = arg('stage', 'package');
/** Per-stratum cap. Every stratum smaller than this is taken WHOLE. */
const CAP = Number(arg('cap', '400'));
/** The holdout boundary. Keys the index learned before this are "early". */
const HOLDOUT_T0 = arg('t0', '2026-08-18');
/**
 * Exclude a pin whose target IS the citing judgment.
 *
 * INTENT: the extractor already refuses to self-pin -- citations-cli.ts writes
 * `cited_judgment_id = target && target !== judgment.id ? target : null` -- and
 * schema.ts says unresolved rows are KEPT because they measure coverage. Those
 * two agree. What disagrees with both is the later resolver sweep, which sees
 * only a string and pins the header reference the extractor deliberately left
 * alone. So the fix belongs on the APPLY side and the stored row stays: the
 * coverage measurement is unharmed and the fabricated edge is never written.
 */
const EXCLUDE_SELF_EDGES = process.argv.includes("--exclude-self-edges");

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}
const sql = postgres(databaseUrl(), { max: 3, idle_timeout: 120, connect_timeout: 30 });

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
async function fileSha256(path: string): Promise<string> {
  const h = createHash('sha256');
  for await (const c of createReadStream(path)) h.update(c);
  return h.digest('hex');
}
/** Deterministic, uniform, and independent of row order. */
const rank = (id: string) => createHash('md5').update(id).digest('hex');

/* ─────────────────────────────────────────────────────────────────────────────
 * KEY CLASS — the structural facts about every key in the index.
 * Derived from `judgment_citation_keys` joined to `judgments`, and from nothing
 * the resolver produced. 1.43M rows, so it is held in memory as packed flags.
 * ───────────────────────────────────────────────────────────────────────────*/
const F_ALIAS = 1, F_REPORTER = 2, F_NEUTRAL = 4, F_MULTI = 8;
const F_MULTI_TITLE = 16, F_CROSS_COURT = 32, F_LATE = 64;

type KeyClass = Map<string, number>;

async function loadKeyClass(): Promise<KeyClass> {
  const map: KeyClass = new Map();
  const cursor = sql<
    {
      citation_key: string;
      n_j: string;
      has_alias: boolean;
      has_reporter: boolean;
      has_neutral: boolean;
      n_court: string;
      n_title: string;
      late: boolean;
    }[]
  >`
    SELECT k.citation_key,
           count(DISTINCT k.judgment_id)::text AS n_j,
           bool_or(k.source = 'alias')          AS has_alias,
           bool_or(k.source = 'reporter')       AS has_reporter,
           bool_or(k.source = 'neutral')        AS has_neutral,
           count(DISTINCT j.court)::text        AS n_court,
           count(DISTINCT upper(regexp_replace(coalesce(j.case_title, ''), '[^A-Za-z0-9]', '', 'g')))::text AS n_title,
           (min(k.created_at) >= ${HOLDOUT_T0}::timestamptz) AS late
      FROM judgment_citation_keys k
      JOIN judgments j ON j.id = k.judgment_id
     GROUP BY k.citation_key`.cursor(20_000);

  for await (const rows of cursor) {
    for (const r of rows) {
      let f = 0;
      if (r.has_alias) f |= F_ALIAS;
      if (r.has_reporter) f |= F_REPORTER;
      if (r.has_neutral) f |= F_NEUTRAL;
      if (Number(r.n_j) >= 2) f |= F_MULTI;
      if (Number(r.n_title) > 1) f |= F_MULTI_TITLE;
      if (Number(r.n_court) > 1) f |= F_CROSS_COURT;
      if (r.late) f |= F_LATE;
      map.set(r.citation_key, f);
    }
  }
  return map;
}

/**
 * The strata. Every predicate reads ONLY the packed structural flags and the
 * pure `canonicalKeyFor` gate — never a resolution.
 *
 * The order matters: the first matching stratum wins, so the dangerous classes
 * are named before the broad ones and a cross-court key is never quietly
 * counted as an ordinary multi-claim key.
 */
const STRATA: Array<{ name: string; why: string; test: (flags: number | undefined, refused: boolean) => boolean }> = [
  { name: 'I_REFUSED_FORM', why: 'difficult negative: the pure gate refuses the string before any lookup', test: (_f, refused) => refused },
  { name: 'H_TARGET_NOT_HELD', why: 'difficult negative: a well-formed citation the corpus does not hold at all', test: (f) => f === undefined },
  { name: 'F_CROSS_COURT_COLLISION', why: 'the class FIFTH named as outside the earlier replay', test: (f) => !!f && (f & F_CROSS_COURT) !== 0 },
  { name: 'E_MULTI_DISTINCT_CASE', why: 'one citation string naming two DIFFERENT cases — the false-unique generator', test: (f) => !!f && (f & F_MULTI) !== 0 && (f & F_MULTI_TITLE) !== 0 },
  { name: 'D_MULTI_SAME_CASE', why: 'the same judgment ingested twice — a recall loss, not a false pin', test: (f) => !!f && (f & F_MULTI) !== 0 },
  { name: 'A_ALIAS_PATH', why: 'the dominant pin path, and the one the DB unique index makes incapable of AMBIGUOUS', test: (f) => !!f && (f & F_ALIAS) !== 0 },
  { name: 'G_LATE_LEARNED_KEY', why: 'the index learned this key only after T0 — a proxy for the target that had not landed', test: (f) => !!f && (f & F_LATE) !== 0 },
  { name: 'B_REPORTER_PATH', why: 'a reporter series names a publisher, not a court — the untestable-court class', test: (f) => !!f && (f & F_REPORTER) !== 0 },
  { name: 'C_NEUTRAL_SINGLE_CLAIM', why: 'the ordinary case, and the bulk of any apply', test: (f) => !!f && (f & F_NEUTRAL) !== 0 },
];

const PACKAGE_PATH = join(WORK, 'blind-package.jsonl');
const PACKAGE_META = join(WORK, 'blind-package.meta.json');

type Sampled = { edgeId: string; raw: string; key: string | null; stratum: string; r: string };

/* ─────────────────────────────────────────────────────────────────────────────
 * STAGE 1 — PACKAGE. Prediction-blind by construction: the resolver is not
 * imported into this pass's decisions, the file is written and hashed, and only
 * then is anything resolved. A package built after seeing predictions can
 * always be accused of having been shaped by them; this one cannot.
 * ───────────────────────────────────────────────────────────────────────────*/
async function stagePackage(): Promise<void> {
  const keyClass = await loadKeyClass();
  process.stdout.write(`keyclass loaded: ${keyClass.size} keys\n`);

  const [{ snapshot_at }] = await sql<{ snapshot_at: string }[]>`SELECT now()::text AS snapshot_at`;
  const reservoirs = new Map<string, Sampled[]>();
  const seen = new Map<string, number>();
  for (const s of STRATA) {
    reservoirs.set(s.name, []);
    seen.set(s.name, 0);
  }

  /** Keep the CAP smallest ranks. A heap would be faster; at CAP=400 it is not the cost. */
  const offer = (bucket: string, row: Sampled) => {
    seen.set(bucket, (seen.get(bucket) ?? 0) + 1);
    const list = reservoirs.get(bucket)!;
    if (list.length < CAP) {
      list.push(row);
      if (list.length === CAP) list.sort((a, b) => (a.r < b.r ? -1 : a.r > b.r ? 1 : 0));
      return;
    }
    if (row.r >= list[list.length - 1]!.r) return;
    let lo = 0;
    let hi = list.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid]!.r < row.r) lo = mid + 1;
      else hi = mid;
    }
    list.splice(lo, 0, row);
    list.pop();
  };

  let scanned = 0;
  const cursor = sql<{ id: string; raw: string; citing: string }[]>`
    SELECT id,
           COALESCE(NULLIF(btrim(normalised_citation), ''), citation_text) AS raw,
           citing_judgment_id AS citing
      FROM judgment_citations
     WHERE cited_judgment_id IS NULL
       AND COALESCE(citation_text, '') <> ''
       AND created_at <= ${snapshot_at}::timestamptz
     ORDER BY id`.cursor(20_000);

  for await (const rows of cursor) {
    for (const row of rows) {
      scanned += 1;
      const gate = canonicalKeyFor(row.raw);
      const key = gate.refused ? null : gate.key;
      const flags = key === null ? undefined : keyClass.get(key);
      const stratum = STRATA.find((s) => s.test(flags, gate.refused))?.name;
      if (!stratum) continue;
      offer(stratum, { edgeId: row.id, raw: row.raw, key, stratum, r: rank(row.id) });
    }
    if (scanned % 500_000 < 20_000) process.stdout.write(`  scanned ${scanned}\n`);
  }

  const all: Sampled[] = [];
  for (const s of STRATA) all.push(...reservoirs.get(s.name)!.sort((a, b) => (a.r < b.r ? -1 : 1)));
  writeFileSync(PACKAGE_PATH, all.map((s) => JSON.stringify(s)).join('\n') + '\n');
  const hash = await fileSha256(PACKAGE_PATH);

  const meta = {
    artifact: 'NEW2_R14_BLIND_PACKAGE',
    builtAt: new Date().toISOString(),
    snapshotAt: snapshot_at,
    selectionInputs: ['judgment_citation_keys', 'judgments.court', 'judgments.case_title', 'canonicalKeyFor (pure)'],
    resolverConsulted: false,
    cap: CAP,
    holdoutT0: HOLDOUT_T0,
    edgesScanned: scanned,
    keysInIndex: keyClass.size,
    strata: STRATA.map((s) => ({
      name: s.name,
      why: s.why,
      populationEdges: seen.get(s.name) ?? 0,
      sampled: reservoirs.get(s.name)!.length,
    })),
    packagePath: 'docs/ai/new2-r14/blind-package.jsonl',
    packageSha256: hash,
    sampledTotal: all.length,
  };
  writeFileSync(PACKAGE_META, JSON.stringify(meta, null, 1));
  writeFileSync(join(OUTDIR, 'blind-package.jsonl'), readFileSync(PACKAGE_PATH));
  writeFileSync(join(OUTDIR, 'blind-package.json'), JSON.stringify(meta, null, 1));
  process.stdout.write(`package: ${all.length} rows, sha256=${hash}\n`);
}

// v1 is the candidate AS THE RESOLVER PRODUCES IT; v2 is the same sweep with
// the self-edge exclusion applied. Two files, because a candidate that quietly
// replaced the one the evidence was written against would be the exact failure
// this whole round exists to prevent.
const SUFFIX = EXCLUDE_SELF_EDGES ? '-v2-no-self' : '';
const CANDIDATE_JOURNAL = join(WORK, `apply-candidate${SUFFIX}.jsonl`);
const CANDIDATE_META = join(OUTDIR, `citation-apply-candidate${SUFFIX}.json`);

/* ─────────────────────────────────────────────────────────────────────────────
 * STAGE 2 — FREEZE. The apply candidate is the set of edges the resolver calls
 * UNIQUE over ONE snapshot at ONE frontier. It is written to a journal, counted
 * and hashed, so that any later write can be bound to these exact rows and
 * refuses a corpus that has moved. Nothing is applied here; `--apply` does not
 * exist in this file on purpose.
 * ───────────────────────────────────────────────────────────────────────────*/
async function stageFreeze(): Promise<void> {
  const [{ snapshot_at }] = await sql<{ snapshot_at: string }[]>`SELECT now()::text AS snapshot_at`;
  const freshness = await readKeyFreshness(sql);
  const [frontier] = await sql<{ max_j: string; max_k: string; n_j: string; n_k: string }[]>`
    SELECT (SELECT max(created_at)::text FROM judgments)               AS max_j,
           (SELECT max(created_at)::text FROM judgment_citation_keys)  AS max_k,
           (SELECT count(*)::text        FROM judgments)               AS n_j,
           (SELECT count(*)::text        FROM judgment_citation_keys)  AS n_k`;

  writeFileSync(CANDIDATE_JOURNAL, '');
  const tally: Record<string, number> = {};
  let scanned = 0;
  let buffer = '';
  const started = Date.now();

  let selfExcluded = 0;
  const cursor = sql<Array<{ id: string; raw: string; citing: string }>>`
    SELECT id, COALESCE(NULLIF(btrim(normalised_citation), ''), citation_text) AS raw,
           citing_judgment_id AS citing
      FROM judgment_citations
     WHERE cited_judgment_id IS NULL
       AND COALESCE(citation_text, '') <> ''
       AND created_at <= ${snapshot_at}::timestamptz
     ORDER BY id`.cursor(5_000);

  for await (const rows of cursor) {
    const results = await resolveBatch(sql, rows.map((r) => r.raw), freshness);
    results.forEach((r, i) => {
      scanned += 1;
      tally[r.state] = (tally[r.state] ?? 0) + 1;
      // ONLY the population being proposed for application is journalled. The
      // other states are counted, not listed: a 6M-line file nobody reads is
      // not evidence, and the states that are not applied bind nothing.
      if (r.state === 'UNIQUE' && r.candidates.length === 1) {
        if (EXCLUDE_SELF_EDGES && r.candidates[0]!.judgmentId === rows[i]!.citing) {
          selfExcluded += 1;
          return;
        }
        buffer += `${JSON.stringify({ edgeId: rows[i]!.id, key: r.key, cited: r.candidates[0]!.judgmentId, via: r.candidates[0]!.source })}\n`;
      }
    });
    if (buffer.length > 1_000_000) {
      appendFileSync(CANDIDATE_JOURNAL, buffer);
      buffer = '';
    }
    if (scanned % 500_000 < 5_000) {
      process.stdout.write(`  resolved ${scanned} (${Math.round(scanned / ((Date.now() - started) / 1000))}/s)\n`);
    }
  }
  if (buffer.length > 0) appendFileSync(CANDIDATE_JOURNAL, buffer);

  const hash = await fileSha256(CANDIDATE_JOURNAL);
  const count = (tally['UNIQUE'] ?? 0) - selfExcluded;
  const meta = {
    artifact: 'NEW2_R14_CITATION_APPLY_CANDIDATE',
    lane: 'NEW2',
    state: 'FROZEN_UNAPPLIED',
    createdAt: new Date().toISOString(),
    definition:
      (EXCLUDE_SELF_EDGES ? 'Excludes any pin whose target is the citing judgment itself. ' : '') +
      'judgment_citations rows with cited_judgment_id IS NULL and non-empty citation_text, created at or before snapshotAt, whose COALESCE(NULLIF(btrim(normalised_citation),\'\'), citation_text) resolves to state UNIQUE with exactly one candidate under the named resolver at the named frontier.',
    applyPopulationId: `NEW2-R14-APPLY-${hash.slice(0, 16)}`,
    applyPopulationCount: count,
    applyPopulationSha256: hash,
    journalPath: `docs/ai/new2-r14/apply-candidate${SUFFIX}.sha256`,
    journalLocalPath: `.tmp-new2/r14/apply-candidate${SUFFIX}.jsonl`,
    resolverVersion: RESOLVER_VERSION,
    snapshotAt: snapshot_at,
    frontier: {
      keyFreshnessState: freshness.state,
      mayAssertUnique: freshness.state !== 'STALE',
      maxJudgmentCreatedAt: frontier!.max_j,
      maxKeyCreatedAt: frontier!.max_k,
      judgmentRows: Number(frontier!.n_j),
      keyIndexRows: Number(frontier!.n_k),
    },
    decidedTotal: scanned,
    states: tally,
    excludesSelfEdges: EXCLUDE_SELF_EDGES,
    selfEdgesExcluded: EXCLUDE_SELF_EDGES ? selfExcluded : null,
    binding:
      'Any write authorised by this candidate must re-read the journal, verify applyPopulationSha256, and refuse if the frontier has moved past snapshotAt. A newer population is a different population and needs its own evidence.',
  };
  writeFileSync(CANDIDATE_META, JSON.stringify(meta, null, 1));
  writeFileSync(join(OUTDIR, 'apply-candidate.sha256'), `${hash}  apply-candidate.jsonl\n${count} lines\n`);
  process.stdout.write(`freeze: UNIQUE=${count} sha256=${hash}\n`);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISTIC LEGAL IDENTITY
 *
 * Two discriminators are carried BY THE CITATION FORM ITSELF and can be checked
 * against attributes the target judgment records independently of any citation:
 * the COURT it names and the YEAR it names. Neither is similarity. A form that
 * says `2026:JHHC:24297` says Jharkhand High Court and says 2026, and a target
 * that is neither is not that authority.
 *
 * The court-code map is DERIVED FROM THE CORPUS, never typed from memory: for
 * every code appearing in a stored `neutral_citation`, the courts that actually
 * carry it. A code that maps to more than one court in our own data is recorded
 * as ambiguous and yields UNTESTABLE rather than a guess.
 * ───────────────────────────────────────────────────────────────────────────*/
const NEUTRAL_FORM = /^\s*(\d{4})\s*:\s*([A-Z][A-Z0-9-]*)\s*:\s*(\d+)/i;
/** `2024 INSC 835` and `(2024) INSC 835` — the Supreme Court's own form. */
const INSC_FORM = /^\s*\(?(\d{4})\)?\s*INSC\s*(\d+)/i;
/** AIR / SCC / SCR / SCALE with an explicit court token. */
const REPORTER_SC = /\b(AIR|SCC|SCR|SCALE|JT)\b/i;
const REPORTER_SC_TOKEN = /\bAIR\s+\d{4}\s+SC\b|\bSCC\b|\bSCR\b|\bSCALE\b/i;
const AIR_HC_TOKEN = /\bAIR\s+\d{4}\s+(ALL|AP|BOM|CAL|DEL|GAU|GUJ|HP|J&K|JHAR|KANT|KAR|KER|MAD|MP|ORI|PAT|PUNJ|P&H|RAJ|SIKK|TRIP)\b/i;

type CourtMap = Map<string, { court: string | null; ambiguous: boolean }>;

async function loadCourtCodeMap(): Promise<CourtMap> {
  const rows = await sql<Array<{ code: string; court: string; display: string; n: string }>>`
    SELECT upper(split_part(neutral_citation, ':', 2)) AS code,
           -- The SAME court is stored under several spellings that differ only
           -- in whitespace and case. Counting them as different courts made
           -- Rajasthan look 69% unanimous and cost the court check on 198,406
           -- judgments; the check then read UNTESTABLE and proved nothing.
           upper(regexp_replace(court, '[^A-Za-z]', '', 'g')) AS court,
           min(court) AS display,
           count(*)::text AS n
      FROM judgments
     WHERE neutral_citation IS NOT NULL
       AND neutral_citation ~ '^[0-9]{4}:[A-Za-z][A-Za-z0-9-]*:[0-9]+'
     GROUP BY 1, 2`;
  const byCode = new Map<string, Array<{ court: string; n: number }>>();
  for (const r of rows) {
    // `KHC-D` and `KHC` are the same court sitting at a different seat; the
    // seat suffix is not a different court and collapsing it is not a guess.
    const code = r.code.split('-')[0]!;
    const list = byCode.get(code) ?? [];
    list.push({ court: r.court, n: Number(r.n) });
    byCode.set(code, list);
  }
  const map: CourtMap = new Map();
  for (const [code, list] of byCode) {
    const total = list.reduce((a, b) => a + b.n, 0);
    const top = list.sort((a, b) => b.n - a.n)[0]!;
    // A code is treated as naming a court only where our own corpus is
    // effectively unanimous. Below that it names nothing we can check.
    map.set(code, top.n / total >= 0.98 ? { court: top.court, ambiguous: false } : { court: null, ambiguous: true });
  }
  return map;
}

const normCourt = (c: string) => (c || '').toUpperCase().replace(/[^A-Z]/g, '');
const SUPREME = normCourt('Supreme Court of India');

/** Distinctive party tokens. Corroboration only — never an identity on its own. */
const STOP = new Set([
  'STATE', 'UNION', 'INDIA', 'OF', 'THE', 'AND', 'ORS', 'ANR', 'OTHERS', 'ANOTHER', 'VS', 'VERSUS', 'V',
  'SHRI', 'SMT', 'MR', 'MRS', 'M/S', 'LTD', 'LIMITED', 'PVT', 'PRIVATE', 'COMPANY', 'CO', 'CORPORATION',
  'GOVERNMENT', 'COMMISSIONER', 'DIRECTOR', 'MANAGER', 'OFFICER', 'DEPARTMENT', 'THROUGH', 'ETC', 'NOW',
]);
const tokens = (s: string): Set<string> =>
  new Set(
    (s || '')
      .toUpperCase()
      .split(/[^A-Z]+/)
      .filter((t) => t.length >= 4 && !STOP.has(t)),
  );

/**
 * SELF_EDGE is separate from FALSE_PIN on purpose. A judgment prints its own
 * neutral citation in its own header, the extractor makes an edge of it, and
 * the resolver pins it — CORRECTLY — back to the judgment it came from. The
 * identity is right; the EDGE should never have existed. Scoring it as a false
 * pin would send the next fix into the resolver, which is the one component
 * that behaved.
 */
type Verdict = 'FALSE_PIN' | 'FALSE_UNIQUE' | 'SELF_EDGE' | 'CONSISTENT' | 'UNTESTABLE' | 'CORRECT_REFUSAL';

type Adjudicated = {
  edgeId: string;
  stratum: string;
  raw: string;
  key: string | null;
  resolverState: string;
  heldCandidates: number;
  pinned: string | null;
  verdict: Verdict;
  reasons: string[];
  courtCheck: 'AGREE' | 'DISAGREE' | 'UNTESTABLE';
  yearCheck: 'AGREE' | 'DISAGREE' | 'IMPLAUSIBLE_LAG' | 'UNTESTABLE';
  titleCorroboration: 'CORROBORATED' | 'CONTRADICTED' | 'NO_PARTY_CONTEXT' | 'UNTESTABLE';
  identityBasis: 'PUBLISHED_FORM' | 'DERIVED_ALIAS' | 'NONE';
  selfPin: boolean;
};

/**
 * The court and year a CITATION FORM names, if it names them unambiguously.
 * Returns nulls rather than guesses; `untestable` is a real answer here and is
 * reported as its own number instead of being folded into a success rate.
 */
function formIdentity(raw: string, courts: CourtMap): { court: string | null; year: number | null; kind: string } {
  const neutral = NEUTRAL_FORM.exec(raw);
  if (neutral) {
    const entry = courts.get(neutral[2]!.toUpperCase().split('-')[0]!);
    return { court: entry?.ambiguous ? null : (entry?.court ?? null), year: Number(neutral[1]), kind: 'neutral' };
  }
  const insc = INSC_FORM.exec(raw);
  if (insc) return { court: SUPREME, year: Number(insc[1]), kind: 'insc' };
  const year = /\b(1[89]\d{2}|20\d{2})\b/.exec(raw);
  if (REPORTER_SC.test(raw)) {
    const hc = AIR_HC_TOKEN.test(raw);
    return {
      court: hc ? null : REPORTER_SC_TOKEN.test(raw) ? SUPREME : null,
      year: year ? Number(year[1]) : null,
      kind: hc ? 'reporter_hc' : 'reporter',
    };
  }
  return { court: null, year: year ? Number(year[1]) : null, kind: 'other' };
}

type Target = {
  id: string;
  court: string;
  case_title: string | null;
  judgment_date: Date | null;
  neutral_citation: string | null;
  reporter_citations: string[] | null;
};

function adjudicate(
  s: Sampled,
  res: { state: string; heldCandidates: number; candidates: readonly { readonly judgmentId: string }[] },
  target: Target | null,
  citingId: string,
  window: string | null,
  courts: CourtMap,
): Adjudicated {
  const reasons: string[] = [];
  const base = {
    edgeId: s.edgeId,
    stratum: s.stratum,
    raw: s.raw,
    key: s.key,
    resolverState: res.state,
    heldCandidates: res.heldCandidates,
  };
  const claimsUnique = res.state === 'UNIQUE' || res.state === 'UNIQUE_UNCONFIRMED_STALE_INDEX';

  if (!claimsUnique || !target) {
    // A refusal is the resolver doing its job. It is reported, never scored as
    // a success and never scored as a failure — AMBIGUOUS on a key that names
    // two cases is the CORRECT answer, and calling it an error would push the
    // next change in exactly the wrong direction.
    return {
      ...base,
      pinned: null,
      verdict: res.state === 'AMBIGUOUS' || res.state === 'TARGET_NOT_HELD' || res.state === 'REFUSED'
        ? 'CORRECT_REFUSAL'
        : 'UNTESTABLE',
      reasons: [`resolver returned ${res.state}`],
      courtCheck: 'UNTESTABLE',
      yearCheck: 'UNTESTABLE',
      titleCorroboration: 'UNTESTABLE',
      identityBasis: 'NONE',
      selfPin: false,
    };
  }

  const id = formIdentity(s.raw, courts);
  let courtCheck: Adjudicated['courtCheck'] = 'UNTESTABLE';
  if (id.court) {
    courtCheck = id.court === normCourt(target.court) ? 'AGREE' : 'DISAGREE';
    if (courtCheck === 'DISAGREE') reasons.push(`form names ${id.court}; target sits in ${target.court}`);
  } else {
    reasons.push(`citation form (${id.kind}) names no court our own corpus agrees on`);
  }

  /**
   * WHERE THE PIN'S IDENTITY COMES FROM, and it changes what the year check can
   * prove. If the target PUBLISHES this exact form — its own neutral citation
   * or one of its own reporter citations — then the form and the target are the
   * same object and the year is a fact about the registry's stamp, not a
   * discriminator. `2023:PHHC:023835` really does sit on a judgment delivered in
   * 2024; treating that as a false pin blamed the resolver for a registry's
   * numbering. Only a DERIVED alias puts an independent year on the line.
   */
  const normForm = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const published = new Set(
    [target.neutral_citation ?? '', ...(target.reporter_citations ?? [])].filter(Boolean).map(normForm),
  );
  const identityBasis: Adjudicated['identityBasis'] = s.key === null ? 'NONE' : published.has(s.key) ? 'PUBLISHED_FORM' : 'DERIVED_ALIAS';

  let yearCheck: Adjudicated['yearCheck'] = 'UNTESTABLE';
  const decided = target.judgment_date ? new Date(target.judgment_date).getUTCFullYear() : null;
  if (id.year && decided) {
    if (id.kind === 'neutral' || id.kind === 'insc') {
      // A neutral citation is normally stamped in the year of the order, but a
      // form the target itself publishes cannot be evidence against the target.
      yearCheck =
        id.year === decided ? 'AGREE' : identityBasis === 'PUBLISHED_FORM' ? 'IMPLAUSIBLE_LAG' : 'DISAGREE';
      if (yearCheck === 'DISAGREE') reasons.push(`neutral form says ${id.year}; target decided ${decided}`);
      if (yearCheck === 'IMPLAUSIBLE_LAG') {
        reasons.push(`registry stamp year ${id.year} on a judgment delivered ${decided} — the target publishes this exact form`);
      }
    } else {
      const lag = id.year - decided;
      // A reporter cannot print a judgment before it exists. It can print it
      // years later, and does; three years is where our own alias evidence
      // stops supporting the pairing, so beyond it is flagged, not condemned.
      yearCheck = lag < 0 ? 'DISAGREE' : lag <= 3 ? 'AGREE' : 'IMPLAUSIBLE_LAG';
      if (lag < 0) reasons.push(`reporter year ${id.year} precedes decision year ${decided}`);
      if (lag > 3) reasons.push(`reporter lag ${lag}y beyond the corroborated range`);
    }
  }

  let titleCorroboration: Adjudicated['titleCorroboration'] = 'UNTESTABLE';
  if (window && target.case_title) {
    const w = tokens(window);
    const t = tokens(target.case_title);
    const overlap = [...t].filter((x) => w.has(x));
    // A citation printed in a "Cases referred" list or a footnote carries NO
    // party names at all, and Indian judgments do that constantly. Reading that
    // absence as a contradiction produced 174 "contradicted" pins on the first
    // run, every sampled one of which was a footnote. A contradiction needs a
    // party pattern to actually be present and to name someone else.
    const namesSomeone = /\b(?:v\.?|vs\.?|versus)\b/i.test(window);
    titleCorroboration =
      overlap.length > 0 ? 'CORROBORATED' : namesSomeone && t.size >= 2 && w.size >= 6 ? 'CONTRADICTED' : 'NO_PARTY_CONTEXT';
    if (titleCorroboration === 'CONTRADICTED') {
      reasons.push('the citing text names parties beside this citation and none of them is the target');
    }
  }

  const selfPin = target.id === citingId;
  if (selfPin) reasons.push('pin targets the citing judgment itself');

  // FALSE_UNIQUE and FALSE_PIN are DIFFERENT failures and are never merged.
  // The first says "you claimed only one and there are two"; the second says
  // "the one you claimed is not this authority". A report that adds them tells
  // nobody which lever to pull.
  const verdict: Verdict =
    res.heldCandidates > 1
      ? 'FALSE_UNIQUE'
      : courtCheck === 'DISAGREE' || yearCheck === 'DISAGREE'
        ? 'FALSE_PIN'
        : selfPin
          ? 'SELF_EDGE'
          : courtCheck === 'UNTESTABLE' && yearCheck === 'UNTESTABLE'
            ? 'UNTESTABLE'
            : 'CONSISTENT';

  return { ...base, pinned: target.id, verdict, reasons, courtCheck, yearCheck, titleCorroboration, identityBasis, selfPin };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * STAGE 3 — ADJUDICATE. The package is read back from its hashed file, so the
 * rows scored are provably the rows selected before any prediction existed.
 * ───────────────────────────────────────────────────────────────────────────*/
async function stageAdjudicate(): Promise<void> {
  const meta = JSON.parse(readFileSync(PACKAGE_META, 'utf8')) as { packageSha256: string; snapshotAt: string };
  const observed = await fileSha256(PACKAGE_PATH);
  if (observed !== meta.packageSha256) throw new Error(`package hash moved: ${observed}`);

  const rows = readFileSync(PACKAGE_PATH, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Sampled);
  const courts = await loadCourtCodeMap();
  const freshness = await readKeyFreshness(sql);
  process.stdout.write(`adjudicating ${rows.length} rows against ${courts.size} court codes\n`);

  const out: Adjudicated[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const results = await resolveBatch(sql, batch.map((b) => b.raw), freshness);

    const pins = results.map((r) => (r.candidates[0]?.judgmentId ?? null));
    const wanted = [...new Set(pins.filter((p): p is string => p !== null))];
    const targets = wanted.length
      ? await sql<Target[]>`
          SELECT id, court, case_title, judgment_date, neutral_citation, reporter_citations
            FROM judgments WHERE id = ANY(${wanted}::uuid[])`
      : [];
    const byId = new Map(targets.map((t) => [t.id, t]));

    // The citing side, and a bounded window of its own text around the
    // citation. The window is EVIDENCE, never stored, and is thrown away with
    // the batch — `docs/CITATION_STRATEGY.md`'s read-as-evidence rule.
    const edgeIds = batch.map((b) => b.edgeId);
    const cited = await sql<Array<{ id: string; citing: string; window: string | null }>>`
      SELECT c.id,
             c.citing_judgment_id AS citing,
             substr(j.full_text, greatest(1, c.char_offset - 320), 640) AS window
        FROM judgment_citations c
        JOIN judgments j ON j.id = c.citing_judgment_id
       WHERE c.id = ANY(${edgeIds}::uuid[])`;
    const byEdge = new Map(cited.map((c) => [c.id, c]));

    batch.forEach((s, k) => {
      const ctx = byEdge.get(s.edgeId);
      const pin = pins[k];
      out.push(
        adjudicate(
          s,
          results[k]!,
          pin ? (byId.get(pin) ?? null) : null,
          ctx?.citing ?? '',
          ctx?.window ?? null,
          courts,
        ),
      );
    });
    if (i % 2000 === 0) process.stdout.write(`  ${i}/${rows.length}\n`);
  }

  writeFileSync(join(WORK, 'adjudicated.jsonl'), out.map((o) => JSON.stringify(o)).join('\n') + '\n');
  writeFileSync(join(OUTDIR, 'falsifier-adjudicated.jsonl'), out.map((o) => JSON.stringify(o)).join('\n') + '\n');
  const byStratum: Record<string, Record<string, number>> = {};
  for (const o of out) {
    (byStratum[o.stratum] ??= {})[o.verdict] = ((byStratum[o.stratum] ??= {})[o.verdict] ?? 0) + 1;
  }
  process.stdout.write(`${JSON.stringify(byStratum, null, 1)}\n`);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ALIAS ENUMERATION — every row, because 4,394 is small enough that sampling
 * would be a choice to know less. This is the path FIFTH named: the DB's unique
 * index on `alias_key` means an alias can never resolve AMBIGUOUS, so a wrong
 * alias is a CONFIDENT wrong pin that no gate in the resolver can fire on.
 * ───────────────────────────────────────────────────────────────────────────*/
async function auditAliases() {
  const rows = await sql<
    {
      alias: string;
      alias_key: string;
      alias_reporter: string;
      corroborations: number;
      evidence: string;
      court: string;
      judgment_date: Date | null;
      case_title: string | null;
      collides: string;
    }[]
  >`
    SELECT a.alias, a.alias_key, a.alias_reporter, a.corroborations, a.evidence,
           j.court, j.judgment_date, j.case_title,
           (SELECT count(*)::text FROM judgment_citation_keys k
             WHERE k.citation_key = a.alias_key AND k.judgment_id <> a.judgment_id) AS collides
      FROM judgment_citation_aliases a
      JOIN judgments j ON j.id = a.judgment_id`;

  const tally = {
    total: rows.length,
    courtDisagrees: 0,
    yearPrecedesDecision: 0,
    implausibleLag: 0,
    belowCorroborationFloor: 0,
    evidenceDoesNotContainAlias: 0,
    keyCollidesWithOtherJudgment: 0,
    consistent: 0,
    untestable: 0,
  };
  const failures: unknown[] = [];
  const norm = (s: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  for (const r of rows) {
    const why: string[] = [];
    const isSC = /\bSC\b|\bSCC\b|\bSCR\b|\bSCALE\b/i.test(r.alias);
    if (isSC && normCourt(r.court) !== SUPREME) {
      tally.courtDisagrees += 1;
      why.push(`alias names the Supreme Court; target sits in ${r.court}`);
    }
    const y = /\b(1[89]\d{2}|20\d{2})\b/.exec(r.alias);
    const decided = r.judgment_date ? new Date(r.judgment_date).getUTCFullYear() : null;
    if (y && decided) {
      const lag = Number(y[1]) - decided;
      if (lag < 0) {
        tally.yearPrecedesDecision += 1;
        why.push(`reporter year ${y[1]} precedes decision year ${decided}`);
      } else if (lag > 3) {
        tally.implausibleLag += 1;
        why.push(`reporter lag ${lag}y`);
      }
    } else {
      tally.untestable += 1;
    }
    if (r.corroborations < 2) {
      tally.belowCorroborationFloor += 1;
      why.push(`corroborations ${r.corroborations} below the schema's floor of 2`);
    }
    // THE PROVENANCE CHECK FIFTH ASKED FOR. `evidence` is the span that
    // justified the alias; an alias whose own evidence does not contain it is
    // an assertion with a citation attached, which is the thing we forbid.
    if (!norm(r.evidence).includes(norm(r.alias))) {
      tally.evidenceDoesNotContainAlias += 1;
      why.push('the stored evidence span does not contain the alias it justifies');
    }
    if (Number(r.collides) > 0) {
      tally.keyCollidesWithOtherJudgment += 1;
      why.push(`alias key also claimed by ${r.collides} other judgment(s)`);
    }
    if (why.length === 0) tally.consistent += 1;
    else failures.push({ alias: r.alias, court: r.court, decided, corroborations: r.corroborations, why });
  }
  return { tally, failures: failures.slice(0, 60), failureCount: failures.length };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * THE TEMPORAL HOLDOUT — the only instrument here that can see a false unique
 * caused by an authority that had not landed yet, because it lets the corpus
 * itself provide the answer 12 days later. It reads no resolver output at all.
 * ───────────────────────────────────────────────────────────────────────────*/
async function holdout(t0: string) {
  const [totals] = await sql<{ single_at_t0: string; now_multi: string }[]>`
    WITH t0 AS (
      SELECT citation_key FROM judgment_citation_keys WHERE created_at < ${t0}::timestamptz
       GROUP BY citation_key HAVING count(DISTINCT judgment_id) = 1
    ), gone AS (
      SELECT k.citation_key FROM judgment_citation_keys k JOIN t0 ON t0.citation_key = k.citation_key
       GROUP BY k.citation_key HAVING count(DISTINCT k.judgment_id) >= 2
    )
    SELECT (SELECT count(*)::text FROM t0) AS single_at_t0, (SELECT count(*)::text FROM gone) AS now_multi`;

  const severity = await sql<{ distinct_cases: boolean; distinct_text: boolean; cross_court: boolean; keys: string }[]>`
    WITH t0 AS (
      SELECT citation_key FROM judgment_citation_keys WHERE created_at < ${t0}::timestamptz
       GROUP BY citation_key HAVING count(DISTINCT judgment_id) = 1
    ), gone AS (
      SELECT k.citation_key FROM judgment_citation_keys k JOIN t0 ON t0.citation_key = k.citation_key
       GROUP BY k.citation_key HAVING count(DISTINCT k.judgment_id) >= 2
    ), cls AS (
      SELECT g.citation_key,
             count(DISTINCT jj.court) AS n_court,
             count(DISTINCT upper(regexp_replace(coalesce(jj.case_title, ''), '[^A-Za-z0-9]', '', 'g'))) AS n_title,
             count(DISTINCT md5(coalesce(jj.full_text, ''))) AS n_text
        FROM gone g
        JOIN judgment_citation_keys kk ON kk.citation_key = g.citation_key
        JOIN judgments jj ON jj.id = kk.judgment_id
       GROUP BY g.citation_key
    )
    SELECT (n_title > 1) AS distinct_cases, (n_text > 1) AS distinct_text, (n_court > 1) AS cross_court,
           count(*)::text AS keys
      FROM cls GROUP BY 1, 2, 3`;

  const singleAtT0 = Number(totals!.single_at_t0);
  const nowMulti = Number(totals!.now_multi);
  const material = severity.filter((s) => s.distinct_cases).reduce((a, b) => a + Number(b.keys), 0);
  const duplicate = nowMulti - material;
  return {
    t0,
    keysSingleClaimAtT0: singleAtT0,
    keysMultiClaimNow: nowMulti,
    /** Same case, ingested twice. Costs recall, never points at another authority. */
    duplicateIdentity: duplicate,
    /** DIFFERENT cases sharing one citation string. This is a false pin. */
    materialFalseUnique: material,
    materialFalseUniqueRate: singleAtT0 ? material / singleAtT0 : null,
    crossCourt: severity.filter((s) => s.cross_court).reduce((a, b) => a + Number(b.keys), 0),
    breakdown: severity.map((s) => ({ ...s, keys: Number(s.keys) })),
  };
}

async function structuralCensus() {
  const rows = await sql<{ all_neutral: boolean; cross_court: boolean; distinct_cases: boolean; keys: string }[]>`
    WITH k AS (
      SELECT citation_key FROM judgment_citation_keys
       GROUP BY citation_key HAVING count(DISTINCT judgment_id) >= 2
    ), j AS (
      SELECT k.citation_key,
             count(DISTINCT jj.court) AS n_court,
             count(DISTINCT upper(regexp_replace(coalesce(jj.case_title, ''), '[^A-Za-z0-9]', '', 'g'))) AS n_title,
             bool_and(kk.source = 'neutral') AS all_neutral
        FROM k
        JOIN judgment_citation_keys kk ON kk.citation_key = k.citation_key
        JOIN judgments jj ON jj.id = kk.judgment_id
       GROUP BY k.citation_key
    )
    SELECT all_neutral, (n_court > 1) AS cross_court, (n_title > 1) AS distinct_cases, count(*)::text AS keys
      FROM j GROUP BY 1, 2, 3`;
  const [{ distinct_keys, single }] = await sql<{ distinct_keys: string; single: string }[]>`
    SELECT count(*)::text AS distinct_keys,
           count(*) FILTER (WHERE n = 1)::text AS single
      FROM (SELECT count(DISTINCT judgment_id) AS n FROM judgment_citation_keys GROUP BY citation_key) t`;
  return {
    distinctKeys: Number(distinct_keys),
    singleClaimKeys: Number(single),
    multiClaimKeys: Number(distinct_keys) - Number(single),
    rows: rows.map((r) => ({ ...r, keys: Number(r.keys) })),
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * STAGE 4 — REPORT. Four counts, reported separately and never pooled. The
 * untestable rows in particular are NOT hidden inside a success percentage:
 * a denominator that quietly excludes what could not be checked is the exact
 * way a 100% arrives without meaning anything.
 * ───────────────────────────────────────────────────────────────────────────*/
/**
 * How much of the frozen candidate is a judgment pointing at itself. Counted
 * over the WHOLE population from the journal, not estimated from the sample:
 * the sample says the class exists, and only this says how much of a 2.5M-row
 * write it would be.
 */
async function selfEdgeShare(): Promise<{ population: number; selfEdges: number; share: number }> {
  const lines = readFileSync(CANDIDATE_JOURNAL, 'utf8').trim().split('\n');
  let selfEdges = 0;
  for (let i = 0; i < lines.length; i += 10_000) {
    const chunk = lines.slice(i, i + 10_000).map((l) => JSON.parse(l) as { edgeId: string; cited: string });
    const byEdge = new Map(chunk.map((c) => [c.edgeId, c.cited]));
    const rows = await sql<Array<{ id: string; citing: string }>>`
      SELECT id, citing_judgment_id AS citing
        FROM judgment_citations WHERE id = ANY(${chunk.map((c) => c.edgeId)}::uuid[])`;
    for (const r of rows) if (byEdge.get(r.id) === r.citing) selfEdges += 1;
  }
  return { population: lines.length, selfEdges, share: selfEdges / lines.length };
}

async function stageReport(): Promise<void> {
  const pkg = JSON.parse(readFileSync(PACKAGE_META, 'utf8'));
  const candidate = JSON.parse(readFileSync(CANDIDATE_META, 'utf8'));
  const adjudicated = readFileSync(join(WORK, 'adjudicated.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Adjudicated);

  const count = (p: (a: Adjudicated) => boolean) => adjudicated.filter(p).length;
  const positives = adjudicated.filter((a) => a.resolverState === 'UNIQUE' || a.resolverState === 'UNIQUE_UNCONFIRMED_STALE_INDEX');
  const negatives = adjudicated.filter((a) => !positives.includes(a));

  const byStratum: Record<string, Record<string, number>> = {};
  for (const a of adjudicated) {
    byStratum[a.stratum] ??= {};
    byStratum[a.stratum]![a.verdict] = (byStratum[a.stratum]![a.verdict] ?? 0) + 1;
  }

  const falsePin = count((a) => a.verdict === 'FALSE_PIN');
  const falseUnique = count((a) => a.verdict === 'FALSE_UNIQUE');
  const ambiguous = count((a) => a.resolverState === 'AMBIGUOUS');
  const untestable = count((a) => a.verdict === 'UNTESTABLE');

  const selfEdges = await selfEdgeShare();
  const [aliases, hold18, hold25, hold28, census] = await Promise.all([
    auditAliases(),
    holdout('2026-08-18'),
    holdout('2026-08-25'),
    holdout('2026-08-28'),
    structuralCensus(),
  ]);

  /**
   * THE GATE. `CITATION_HARNESS.md` sets the threshold at zero, and zero is not
   * a rounding target. It is evaluated against the POPULATION instruments as
   * well as the sample, because a sample of 3,000 cannot clear a 2.5M-row write
   * on its own: an in-sample zero is consistent with thousands of false pins.
   */
  const populationMaterialFalseUnique = hold18.materialFalseUnique;
  const gatePass = falsePin === 0 && falseUnique === 0 && populationMaterialFalseUnique === 0 && selfEdges.selfEdges === 0;

  const report = {
    artifact: 'NEW2_R14_CITATION_FALSIFIER',
    lane: 'NEW2',
    generatedAt: new Date().toISOString(),
    resolverVersion: RESOLVER_VERSION,
    rootCause:
      'A neutral citation is not a unique key in this corpus — the registry stamps one on every connected matter disposed of by a common order, and our ingest additionally lands the same judgment twice — so the resolver\'s UNIQUE reports how much of the corpus has landed, not how many judgments bear the citation, and a pin made before the second bearer lands is a false unique all three freshness gates are structurally unable to see.',
    applyCandidate: {
      applyPopulationId: candidate.applyPopulationId,
      applyPopulationHash: candidate.applyPopulationSha256,
      applyPopulationCount: candidate.applyPopulationCount,
      snapshotAt: candidate.snapshotAt,
      frontier: candidate.frontier,
      createdAt: candidate.createdAt,
    },
    blindPackage: {
      packageSha256: pkg.packageSha256,
      builtAt: pkg.builtAt,
      resolverConsulted: pkg.resolverConsulted,
      sampled: adjudicated.length,
      strata: pkg.strata,
    },
    results: {
      adversarialPositives: positives.length,
      adversarialNegatives: negatives.length,
      falsePin,
      falseUnique,
      ambiguous,
      untestable,
      correctRefusal: count((a) => a.verdict === 'CORRECT_REFUSAL'),
      consistent: count((a) => a.verdict === 'CONSISTENT'),
      selfEdge: count((a) => a.verdict === 'SELF_EDGE'),
      selfPin: count((a) => a.selfPin),
      titleContradicted: count((a) => a.titleCorroboration === 'CONTRADICTED'),
      titleCorroborated: count((a) => a.titleCorroboration === 'CORROBORATED'),
      implausibleLag: count((a) => a.yearCheck === 'IMPLAUSIBLE_LAG'),
      courtUntestable: count((a) => a.courtCheck === 'UNTESTABLE'),
      byStratum,
    },
    selfEdgesInCandidate: {
      ...selfEdges,
      note: 'A judgment prints its own neutral citation in its own header and the extractor makes an edge of it. The resolver pins it correctly; the edge should not exist. This is an EXTRACTOR defect and applying the candidate would write every one of these as a self-loop in the citation graph.',
    },
    aliasEnumeration: aliases,
    temporalHoldout: { primary: hold18, secondary: [hold25, hold28] },
    structuralCensus: census,
    gate: {
      threshold: 'zero false pins — docs/CITATION_HARNESS.md',
      sampleFalsePin: falsePin,
      sampleFalseUnique: falseUnique,
      populationMaterialFalseUnique,
      populationSelfEdges: selfEdges.selfEdges,
      falsePinGate: gatePass ? 'PASS' : 'FAIL',
      citationBulkApply: gatePass ? 'AUTHORIZED' : 'HOLD',
      boundTo: gatePass ? candidate.applyPopulationId : null,
    },
    caveats: [
      'The sample is a sample. An in-sample zero on 3,000 rows bounds the false-pin rate at roughly 1e-3, not at zero, and the population instruments are what decide the gate.',
      'The two secondary holdouts (25 and 28 August) span a period in which almost no corpus landed, so their near-zero rates measure a quiet fleet, not resolver precision, and must not be quoted as safety.',
      'Title corroboration reads the citing judgment\'s own text and is reported separately. It never creates or confirms an edge on its own.',
      'The court-code map is derived from our own corpus, so a code we hold only from one court reads unanimous whether or not it is.',
    ],
  };
  writeFileSync(join(OUTDIR, 'citation-falsifier-r14.json'), JSON.stringify(report, null, 1));
  process.stdout.write(`${JSON.stringify(report.results, null, 1)}\n`);
  process.stdout.write(`GATE ${report.gate.falsePinGate} · CITATION_BULK_APPLY=${report.gate.citationBulkApply}\n`);
}

const stages: Record<string, () => Promise<void>> = {
  package: stagePackage,
  freeze: stageFreeze,
  adjudicate: stageAdjudicate,
  report: stageReport,
};
const run = stages[STAGE];
if (!run) throw new Error(`unknown --stage ${STAGE}; expected ${Object.keys(stages).join(' | ')}`);
await run();
await sql.end();
