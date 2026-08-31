/**
 * NEW2 — R17 §2. THE FROZEN, PREDICTION-BLIND EVALUATION POPULATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE DRAW IS NOT `WHERE neutral_citation IS NOT NULL`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * That column IS the extractor's prediction. Drawing positives from it makes an
 * evaluation set that can only ever confirm the extractor, because every
 * document it silently refused is invisible to the draw. The random strata here
 * are drawn from 2023+ High Court rows WITHOUT consulting that column at all,
 * so a document the extractor wrongly left NULL is exactly as likely to appear
 * as one it answered.
 *
 * The random draw is by RANDOM UUID ANCHOR, not `ORDER BY random()` and not
 * `TABLESAMPLE SYSTEM`. `judgments.id` is a v4 uuid, so the primary-key order is
 * uncorrelated with court, date, length or partition; a page-based sample is
 * court-clustered (`limit-after-filter-is-not-a-sample` — a clustered slab
 * understated reporter text 2.8x) and a full-table `random()` sort is a seq scan
 * over 18.7M detoasted documents.
 *
 * Strata, and what each one is a control FOR:
 *
 *   A known_wrong              the 109 measured defective rows          (R17 §1)
 *   B owner_of_a_defect_key    the documents those 109 stole from       positives
 *   C source_genuine_foreign   the 13 keys a court really did print twice — these
 *                              MUST stay OWN; relabelling one is a regression
 *   D multi_citation           two or more distinct citations in one document
 *   E no_citation_in_text      no candidate at all — both rules must answer NULL
 *   F short_order              < 2,500 characters
 *   G long_judgment            >= 20,000 characters
 *   H header_boundary          first occurrence at 150-800 — the boundary a
 *                              window rule lives or dies on
 *   I degraded                 unreadable extraction; the only honest answer is
 *                              UNKNOWN, never a citation
 *   R random_2023plus          the base rate, drawn blind
 *
 * The population is frozen by `(judgmentId, contentHash)` and hashed. The
 * expected answers are NOT computed here — this file only decides WHICH
 * documents are judged, so the draw cannot be steered by what either rule says.
 *
 * Read-only. Database, no network.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-r17-eval-population.mts
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
const CLASSIFICATION = join(ROOT, arg('classification', 'docs/ai/new2-r17/reproduce-noncohort-46.json'));
const DEFECTS = join(ROOT, arg('defects', 'docs/ai/new2-r17/defect-table-30.json'));
const OUT = join(ROOT, arg('out', 'docs/ai/new2-r17/eval-population.json'));
const ANCHORS = Number(arg('anchors', '14000'));

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

/** Deterministic PRNG, so the same seed redraws the same population. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const SEED = 'NEW2-R17-EVAL';
const rnd = mulberry32(
  Number.parseInt(createHash('sha256').update(SEED).digest('hex').slice(0, 8), 16),
);
const HEX = '0123456789abcdef';
function randomUuid(): string {
  let s = '';
  for (let i = 0; i < 32; i++) s += HEX[Math.floor(rnd() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

const NEUTRAL_G = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/g;

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

type PoolRow = {
  id: string;
  jdate: string;
  court: string;
  case_number: string | null;
  cnr: string | null;
  content_hash: string | null;
  source_url: string | null;
  full_text: string | null;
};

type Member = {
  judgmentId: string;
  stratum: string;
  court: string;
  date: string;
  caseNumber: string | null;
  cnr: string | null;
  contentHash: string | null;
  sourceUrl: string | null;
  textLength: number;
  distinctNeutralCitations: number;
  firstOccurrenceOffset: number;
  englishTokenDensity: number;
  controlCharDensity: number;
};

const sql = postgres(databaseUrl(), { max: 3, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  const takenAt = new Date().toISOString();

  // ── the random pool ────────────────────────────────────────────────────────
  const anchors: string[] = [];
  for (let i = 0; i < ANCHORS; i++) anchors.push(randomUuid());
  /**
   * The pool keeps only DERIVED values. Holding 30,000 full documents in memory
   * is how a sampler dies at 90% with no artifact written.
   */
  const seen = new Set<string>();
  const measured: {
    row: Omit<PoolRow, 'full_text'>;
    textLength: number;
    distinct: number;
    firstAt: number;
    dmg: { ctrl: number; english: number; damaged: boolean };
  }[] = [];
  const BATCH = 250;
  for (let i = 0; i < anchors.length; i += BATCH) {
    const slice = anchors.slice(i, i + BATCH);
    const got = await sql<PoolRow[]>`
      SELECT DISTINCT ON (j.id) j.id, to_char(j.judgment_date,'YYYY-MM-DD') AS jdate, j.court,
             j.case_number, j.cnr, j.content_hash, j.source_url, j.full_text
        FROM unnest(${slice}::uuid[]) AS a(anchor)
        CROSS JOIN LATERAL (
          SELECT * FROM judgments x
           WHERE x.id >= a.anchor
             AND x.judgment_date >= DATE '2023-01-01'
             AND x.full_text IS NOT NULL
             AND x.source_url LIKE '%indian-high-court-judgments%'
             AND x.source_url NOT LIKE '%bench=testcase%'
           ORDER BY x.id
           LIMIT 1) j`;
    for (const r of got) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const t = r.full_text ?? '';
      NEUTRAL_G.lastIndex = 0;
      const occ: { c: string; at: number }[] = [];
      for (let m = NEUTRAL_G.exec(t); m; m = NEUTRAL_G.exec(t)) occ.push({ c: m[0], at: m.index });
      const { full_text: _drop, ...rest } = r;
      measured.push({
        row: rest,
        textLength: t.length,
        distinct: new Set(occ.map((o) => o.c)).size,
        firstAt: occ.length ? occ[0]!.at : -1,
        dmg: damage(t),
      });
    }
    if ((i / BATCH) % 8 === 0) console.log(`[eval-pop] anchors ${i + slice.length}/${anchors.length} pool ${measured.length}`);
  }
  const poolSize = measured.length;
  console.log(`[eval-pop] pool ${poolSize} distinct documents`);

  const taken = new Set<string>();
  const members: Member[] = [];
  const add = (m: (typeof measured)[number], stratum: string): void => {
    if (taken.has(m.row.id)) return;
    taken.add(m.row.id);
    members.push({
      judgmentId: m.row.id,
      stratum,
      court: m.row.court,
      date: m.row.jdate,
      caseNumber: m.row.case_number,
      cnr: m.row.cnr,
      contentHash: m.row.content_hash,
      sourceUrl: m.row.source_url,
      textLength: m.textLength,
      distinctNeutralCitations: m.distinct,
      firstOccurrenceOffset: m.firstAt,
      englishTokenDensity: Number(m.dmg.english.toFixed(3)),
      controlCharDensity: Number(m.dmg.ctrl.toFixed(4)),
    });
  };
  /** deterministic order within a stratum: by judgment id */
  const draw = (pred: (m: (typeof measured)[number]) => boolean, n: number, stratum: string): number => {
    const eligible = measured.filter((m) => !taken.has(m.row.id) && pred(m)).sort((a, b) => (a.row.id < b.row.id ? -1 : 1));
    for (const m of eligible.slice(0, n)) add(m, stratum);
    return Math.min(n, eligible.length);
  };

  // ── the adjudicated strata: the 46 keys ────────────────────────────────────
  // Taken FIRST. A defective row that also turns up in the random pool must land
  // in A_known_wrong, not be counted as a blind draw — the first version of this
  // put the random strata first and stratum A came back 108 of 109.
  const cls = JSON.parse(readFileSync(CLASSIFICATION, 'utf8')) as {
    cases: {
      citationKey: string;
      verdict: string;
      members: {
        judgmentId: string;
        role: string;
        court: string;
        date: string;
        caseNumber: string | null;
        cnr: string | null;
        contentHash: string | null;
        sourceUrl: string | null;
        textLength: number;
        englishTokenDensity: number;
        controlCharDensity: number;
      }[];
    }[];
  };
  const defectTable = JSON.parse(readFileSync(DEFECTS, 'utf8')) as { defects: { judgmentId: string }[] };
  const defectIds = new Set(defectTable.defects.map((d) => d.judgmentId));

  const fromCase = (
    m: (typeof cls.cases)[number]['members'][number],
    stratum: string,
  ): void => {
    if (taken.has(m.judgmentId)) return;
    taken.add(m.judgmentId);
    members.push({
      judgmentId: m.judgmentId,
      stratum,
      court: m.court,
      date: m.date,
      caseNumber: m.caseNumber,
      cnr: m.cnr,
      contentHash: m.contentHash,
      sourceUrl: m.sourceUrl,
      textLength: m.textLength,
      distinctNeutralCitations: -1, // recomputed at scoring time from the text
      firstOccurrenceOffset: -1,
      englishTokenDensity: m.englishTokenDensity,
      controlCharDensity: m.controlCharDensity,
    });
  };

  for (const c of cls.cases) {
    for (const m of c.members) {
      if (c.verdict === 'INGEST_WRONG_NEUTRAL_CITATION_EXTRACTION')
        fromCase(m, defectIds.has(m.judgmentId) ? 'A_known_wrong' : 'B_owner_of_a_defect_key');
      else if (c.verdict === 'SOURCE_DOCUMENT_GENUINELY_PRINTS_FOREIGN_NEUTRAL_CITATION')
        fromCase(m, 'C_source_genuine_foreign');
      else if (c.verdict === 'UNTESTABLE') fromCase(m, 'I_degraded_known');
      else if (c.verdict === 'INGEST_WRONG_DOCUMENT_IDENTITY') fromCase(m, 'J_wrong_document_identity');
    }
  }

  // ── the blind strata, rarest first so a common one does not eat their draw ──
  draw((m) => m.dmg.damaged, 20, 'I_degraded');
  draw((m) => m.distinct >= 2, 60, 'D_multi_citation');
  draw((m) => m.textLength >= 20000, 40, 'G_long_judgment');
  draw((m) => m.firstAt >= 150 && m.firstAt <= 800, 60, 'H_header_boundary');
  draw((m) => m.textLength < 2500, 60, 'F_short_order');
  draw((m) => m.firstAt === -1, 30, 'E_no_citation_in_text');
  draw(() => true, 120, 'R_random_2023plus');

  members.sort((a, b) => (a.judgmentId < b.judgmentId ? -1 : 1));
  const byStratum = members.reduce<Record<string, number>>((a, m) => ((a[m.stratum] = (a[m.stratum] ?? 0) + 1), a), {});
  const identity = members.map((m) => `${m.judgmentId}:${m.contentHash ?? ''}`).join('\n');
  const populationHash = createHash('sha256').update(identity).digest('hex');
  const populationId = `NEW2-R17-EVAL-${populationHash.slice(0, 16)}`;

  const artifact = {
    artifact: 'NEW2_R17_EVAL_POPULATION',
    lane: 'NEW2',
    takenAt,
    populationId,
    populationHash,
    immutable: true,
    seed: SEED,
    draw: {
      method: 'random uuid anchor, forward index scan, rejection to 2023+ AWS High Court rows, bench=testcase excluded',
      anchors: ANCHORS,
      poolSize,
      predictionBlind:
        'the random strata never consult judgments.neutral_citation, so a document the extractor wrongly left NULL is as likely to be drawn as one it answered',
    },
    sources: {
      classification: 'docs/ai/new2-r17/reproduce-noncohort-46.json',
      defectTable: 'docs/ai/new2-r17/defect-table-30.json',
    },
    size: members.length,
    byStratum,
    members,
  };
  const body = JSON.stringify(artifact, null, 2);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, body + '\n');
  console.log('[eval-pop]', populationId, 'size', members.length);
  console.log('[eval-pop]', JSON.stringify(byStratum, null, 1));
  console.log('[eval-pop] artifact sha256', createHash('sha256').update(body).digest('hex'));
  console.log('[eval-pop] wrote', OUT);
} finally {
  await sql.end();
}
