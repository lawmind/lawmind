/**
 * NEW2 — P5. THE STRATIFIED FRAME FOR THE EXPANDED DOCUMENT-ROLE GOLD.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG WITH THE 87-ROW KEY, WHICH WAS MINE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `new2-heldout-key.json` drew UNIFORMLY from the documents the eligibility view
 * admits. That is the right design for estimating a rate and the wrong one for
 * evaluating a classifier, and the evidence is in the file itself:
 *
 *   stored class at key time:   null 80 · decided 4 · bail_order 3
 *
 * **80 of 87 rows carried no class at all**, because the classifier had walked
 * 1-2% of the id space when the key was cut. So the key measures the model on a
 * population where the deterministic rules are silent, and says almost nothing
 * about the classes LCC actually has to get right. `procedural_disposal` and
 * `reference_stub` appear zero times.
 *
 * LCC's pooled result came out at 90.6% on 64 scorable rows with a ±7.3
 * interval, and the number that mattered — 12.5% false-substantive — rested on
 * 40 procedural rows. Neither can be tightened by drawing more of the same.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STRATIFIED ON WHAT THE ANSWER DEPENDS ON, AND NOTHING ELSE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Twelve cells: six document classes crossed with two length bands.
 *
 *   decided · decided_brief · procedural_disposal · bail_order · reference_stub
 *   · unclassified            ×            short (< 1,500 chars) · long
 *
 * Court, year and text-damage state are RECORDED but not stratified on. Crossing
 * them in would give hundreds of cells holding one row each, which is a table
 * rather than a sample; and the draws are over `judgments.id`, which is uuid v4
 * and therefore blind to court and year, so diversity on those arrives free and
 * is reported rather than engineered.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY ROW CARRIES ITS INCLUSION PROBABILITY. THIS IS THE LOAD-BEARING PART.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A stratified sample quoted as a corpus rate is wrong by the ratio of the
 * strata, and `reference_stub` is over-drawn here by a factor of about 55. So
 * each row carries `stratumPopulationEstimated` and `inclusionProbability`, and
 * the frame carries the same for every cell. An accuracy computed on this file
 * is an accuracy PER CLASS; a corpus figure requires re-weighting by those
 * numbers, and with them it is arithmetic rather than a judgement call.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT WRITES QUESTIONS, NOT ANSWERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two files, deliberately: a QUESTIONS file with no verdict field at all, and a
 * frame file with the strata arithmetic. The key is written separately, by a
 * labeller reading the primary document, and the directive on it is explicit —
 * the model under evaluation must not also grade. Keeping the verdict out of the
 * generated artefact is what makes that checkable rather than promised.
 *
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/heldout-frame-cli.ts --per-cell 30 \
 *       --out ../../docs/ops/migration/new2-heldout-frame-v2
 */

import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { BRIEF_MAX_CHARS } from './hc-classify.ts';
import { DAMAGE_SPAN, TEXT_DAMAGE_VERSION, damageVerdict } from './text-damage.ts';
import { DATE_QUALITY_VERSION, dateQuality } from './date-quality.ts';
import { ENGLISH_RATE_FLOOR, englishRate } from './quality-state.ts';
import { MINED_MARKERS, SUSPECT_MARKER_RATE, textSignature } from './legacy-font.ts';
import {
  MAX_SINGLE_CHAR_RATIO,
  MIN_TOKENS_TO_JUDGE,
  MIN_WORD_LIKE_RATIO,
  corruptionSignals,
} from './text-corruption.ts';

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL is not set');
const argOf = (n: string, d: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1]! : d;
};

const PER_CELL = Number(argOf('--per-cell', '30'));
const OUT = argOf('--out', '../../docs/ops/migration/new2-heldout-frame-v2');
/** How much of the document the labeller is given. Long enough to reach the
 * operative direction, which in an Indian order is at the end of the head or in
 * the final paragraph; the labeller is also given the tail for that reason. */
const HEAD = 4000;
const TAIL = 1500;

const CLASSES = [
  'decided',
  'decided_brief',
  'procedural_disposal',
  'bail_order',
  'reference_stub',
  null,
] as const;
const BANDS = ['short', 'long'] as const;

const sql = postgres(url, { max: 4, idle_timeout: 30, connect_timeout: 30 });

type Row = {
  id: string;
  court: string | null;
  judgment_date: string | null;
  case_number: string | null;
  disposal_nature: string | null;
  hc_document_class: string | null;
  hc_class_method: string | null;
  source_url: string | null;
  script_quality: string | null;
  text_quality: number | null;
  text_len: number | null;
  head: string | null;
  tail: string | null;
};

const clsPredicate = (cls: string | null) =>
  cls === null ? sql`j.hc_document_class IS NULL` : sql`j.hc_document_class = ${cls}`;
const bandPredicate = (band: string) =>
  band === 'short'
    ? sql`length(j.full_text) < ${BRIEF_MAX_CHARS}`
    : sql`length(j.full_text) >= ${BRIEF_MAX_CHARS}`;

/**
 * Cell population = EXACT class count x ESTIMATED band fraction, and the
 * estimate is labelled as one.
 *
 * The exact count is available cheaply: `GROUP BY hc_document_class` runs off
 * the column in seconds. Adding `length(full_text) < 1500` to it does not —
 * there is no index on the length of the text, so the count has to read every
 * document in the class, and twelve of those on an 18.6M-row table did not
 * finish in ten minutes on a box already running three jobs.
 *
 * So the band split is estimated from `BAND_PROBE` uniform draws inside the
 * class. Each draw is one index lookup, six probes cost seconds, and the
 * estimate carries a binomial interval of about +/-2 points at 1,500 draws —
 * far inside the precision an inclusion probability needs to stop a stratified
 * sample being misread as a corpus rate.
 *
 * Reported as `populationRowsEstimated` with `bandFractionDraws` beside it, so
 * nobody later mistakes it for the exact number the class count is.
 */
const BAND_PROBE = 1500;
const classCounts = new Map<string, number>();
async function loadClassCounts(): Promise<void> {
  const rows = await sql<{ cls: string; n: string }[]>`
    SELECT coalesce(hc_document_class, '(null)') AS cls, count(*)::bigint AS n
    FROM judgments WHERE court <> 'Supreme Court of India' GROUP BY 1`;
  for (const r of rows) classCounts.set(r.cls, Number(r.n));
}

const bandFractions = new Map<string, { short: number; draws: number }>();
async function loadBandFraction(cls: string | null): Promise<void> {
  const key = cls ?? '(null)';
  const points = Array.from({ length: BAND_PROBE }, () => randomUUID());
  const rows = await sql<{ len: number | null }[]>`
    SELECT d.len FROM unnest(${points}::uuid[]) AS p(point)
    CROSS JOIN LATERAL (
      SELECT length(j.full_text) AS len FROM judgments j
      WHERE j.id > p.point AND j.court <> 'Supreme Court of India' AND ${clsPredicate(cls)}
      ORDER BY j.id LIMIT 1
    ) d`;
  const short = rows.filter((r) => (r.len ?? 0) < BRIEF_MAX_CHARS).length;
  bandFractions.set(key, { short: rows.length ? short / rows.length : 0, draws: rows.length });
}

function cellSize(cls: string | null, band: string): { rows: number; draws: number } {
  const key = cls ?? '(null)';
  const total = classCounts.get(key) ?? 0;
  const f = bandFractions.get(key) ?? { short: 0, draws: 0 };
  return { rows: Math.round(total * (band === 'short' ? f.short : 1 - f.short)), draws: f.draws };
}

async function drawCell(cls: string | null, band: string, n: number): Promise<Row[]> {
  const points = Array.from({ length: n }, () => randomUUID());
  return sql<Row[]>`
    SELECT DISTINCT ON (d.id) d.* FROM unnest(${points}::uuid[]) AS p(point)
    CROSS JOIN LATERAL (
      SELECT j.id, j.court, to_char(j.judgment_date,'YYYY-MM-DD') AS judgment_date,
             j.case_number, j.disposal_nature, j.hc_document_class, j.hc_class_method,
             j.source_url, j.script_quality, j.text_quality,
             length(j.full_text) AS text_len,
             left(j.full_text, ${HEAD}) AS head,
             right(j.full_text, ${TAIL}) AS tail
      FROM judgments j
      WHERE j.id > p.point AND j.court <> 'Supreme Court of India'
        AND ${clsPredicate(cls)} AND ${bandPredicate(band)}
      ORDER BY j.id LIMIT 1
    ) d`;
}

/** Same screens, same modules, as everything else this lane publishes. */
function quality(r: Row) {
  const head = r.head ?? '';
  const sig = corruptionSignals(head);
  const judgeable = sig !== null && sig.tokens >= MIN_TOKENS_TO_JUDGE;
  const marker = textSignature(head, MINED_MARKERS);
  const damage = damageVerdict({
    text: head,
    textLength: r.text_len,
    storedScriptQuality: r.script_quality,
    englishDensityLow:
      marker.zeroDevanagari && head.length >= 1000 && englishRate(head) < ENGLISH_RATE_FLOOR,
    tokenShapeAnomaly:
      judgeable &&
      (sig!.singleCharRatio > MAX_SINGLE_CHAR_RATIO || sig!.wordLikeRatio < MIN_WORD_LIKE_RATIO),
    legacyFontMarkers: marker.zeroDevanagari && marker.markerRate >= SUSPECT_MARKER_RATE,
  });
  const date = dateQuality({ judgmentDate: r.judgment_date, sourceUrl: r.source_url, text: head });
  return { damage, date };
}

const frameCells: Record<string, unknown>[] = [];
const questions: Record<string, unknown>[] = [];
const seen = new Set<string>();

await loadClassCounts();
for (const cls of CLASSES) await loadBandFraction(cls);

for (const cls of CLASSES) {
  for (const band of BANDS) {
    const label = `${cls ?? 'unclassified'}:${band}`;
    const { rows: size, draws: bandDraws } = cellSize(cls, band);
    if (size === 0) {
      frameCells.push({
        cell: label,
        populationRowsEstimated: 0,
        drawn: 0,
        note: 'estimated empty; no rows drawn',
      });
      continue;
    }
    /* Over-draw, because DISTINCT ON collapses two random points that landed on
     * the same row. Reported as `drawn` so the inclusion probability is the
     * realised one, not the requested one. */
    const rows = await drawCell(cls, band, Math.ceil(PER_CELL * 1.25));
    const kept = rows.filter((r) => !seen.has(r.id)).slice(0, PER_CELL);
    for (const r of kept) seen.add(r.id);

    for (const r of kept) {
      const q = quality(r);
      questions.push({
        documentId: r.id,
        stratum: label,
        stratumPopulationEstimated: size,
        bandFractionDraws: bandDraws,
        inclusionProbability: kept.length / size,
        court: r.court,
        judgmentDate: r.judgment_date,
        caseNumber: r.case_number,
        textLength: r.text_len,
        /* Recorded as EVIDENCE, never as truth — the classifier is running as
         * this frame is cut, so the same row may carry a different label an
         * hour later. The 87-row key made the same note and it proved right. */
        storedClassAtFrameTime: r.hc_document_class,
        storedMethodAtFrameTime: r.hc_class_method,
        disposalNature: r.disposal_nature,
        textDamage: {
          verdict: q.damage.verdict,
          reasons: q.damage.reasons,
          detector: TEXT_DAMAGE_VERSION,
          span: DAMAGE_SPAN,
        },
        dateQuality: {
          state: q.date.state,
          detector: DATE_QUALITY_VERSION,
          filenameDeltaDays: q.date.filenameDeltaDays,
        },
        sourceUrl: r.source_url,
        /* The labeller reads THIS, not the database. */
        head: r.head,
        tail: r.tail,
      });
    }
    const damaged = kept.filter((r) => quality(r).damage.verdict === 'TEXT_UNSAFE_VERIFIED').length;
    frameCells.push({
      cell: label,
      populationRowsEstimated: size,
      bandFractionDraws: bandDraws,
      drawn: kept.length,
      inclusionProbability: kept.length / size,
      textUnsafeVerifiedInCell: damaged,
    });
    process.stdout.write(
      `\r  ${label} — population ${size.toLocaleString()}, drew ${kept.length}          `,
    );
  }
}

const byCourt = new Map<string, number>();
const byYear = new Map<string, number>();
for (const q of questions) {
  const c = (q['court'] as string) ?? '(null)';
  byCourt.set(c, (byCourt.get(c) ?? 0) + 1);
  const y = String(q['judgmentDate'] ?? '').slice(0, 4) || '(null)';
  byYear.set(y, (byYear.get(y) ?? 0) + 1);
}

const frame = {
  generatedAt: new Date().toISOString(),
  lane: 'NEW2',
  purpose:
    'stratified frame for the expanded document-role gold; supersedes the uniform 87-row draw as an EVALUATION set, and does not supersede it as a rate estimate',
  strategy: 'six document classes x two length bands, uniform within cell over judgments.id',
  lengthBandBoundaryChars: BRIEF_MAX_CHARS,
  headChars: HEAD,
  tailChars: TAIL,
  perCellTarget: PER_CELL,
  totalRows: questions.length,
  cells: frameCells,
  realisedByCourt: Object.fromEntries([...byCourt.entries()].sort((a, b) => b[1] - a[1])),
  realisedByYear: Object.fromEntries([...byYear.entries()].sort()),
  caveats: [
    'STRATIFIED, NOT UNIFORM. An accuracy computed here is per class. A corpus figure requires re-weighting by stratumPopulationEstimated, and quoting a raw pooled number off this file overstates the rare classes by up to ~55x.',
    'stratumPopulationEstimated is the EXACT class count times an ESTIMATED band fraction from 1,500 uniform draws inside the class (about +/-2 points). The class counts are exact; the band split is not, because there is no index on the length of the text and twelve exact counts did not finish in ten minutes on a loaded box.',
    'storedClassAtFrameTime is evidence, not truth. The classifier is walking as this is cut.',
    'Court and year are recorded, not stratified. Draws are over judgments.id (uuid v4), which is blind to both.',
    'Text damage is recorded, not stratified. A TEXT_UNSAFE_VERIFIED row cannot be labelled for role from its text and should be given the TEXT_UNSAFE verdict rather than a guess.',
    'No verdict field exists in this file by construction. The key is written separately by a labeller reading the primary document.',
  ],
};

writeFileSync(`${OUT}-frame.json`, JSON.stringify(frame, null, 2));
writeFileSync(`${OUT}-questions.jsonl`, questions.map((q) => JSON.stringify(q)).join('\n') + '\n');
console.log(`\n\n${questions.length} rows across ${frameCells.length} cells`);
console.log(`  ${OUT}-frame.json`);
console.log(`  ${OUT}-questions.jsonl`);
for (const c of frameCells)
  console.log(
    `  ${String(c['cell']).padEnd(30)} pop~${String(c['populationRowsEstimated']).padStart(10)}  drew ${c['drawn']}  damaged ${c['textUnsafeVerifiedInCell'] ?? 0}`,
  );
await sql.end();
