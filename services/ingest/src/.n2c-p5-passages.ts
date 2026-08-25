/**
 * NEW2 §8/NEW2-5 — PASSAGE ROLE / SAFETY SAMPLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS CAN RUN BEFORE NEW1'S TRANCHE IS BUILT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Passage ROLE (is this the court's reasoning, or counsel's submission, or a
 * reporter's headnote?) and passage DAMAGE are properties of the TEXT. Neither
 * depends on a single vector existing. So this study is a PRECONDITION to the
 * build rather than a post-mortem of it, which is what §8 asks for — and it
 * costs no GPU, so it does not compete with NEW1's decision-critical experiment.
 *
 * The segmentation is `chunkJudgment` from `services/embed` — the SHIPPED
 * chunker, not a restatement of it. Measuring a different segmentation than the
 * one that would be built is measuring nothing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FRAME
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW1's TRANCHE_100K_DESIGN frame, deliberately: sampled from `judgments`,
 * never from `new1_doc_vector_stage`. Sampling from the stage would guarantee
 * every document is already reachable and delete the stratum that matters.
 * `in_production_stage` is recorded per document as a reported output.
 *
 * Ordered by `md5(id)` so the draw is reproducible and a later session can
 * EXTEND it by taking more of the same prefix rather than drawing afresh.
 *
 * READ ONLY. Writes only artefacts under docs/ai/new2/.
 */
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import postgres from 'postgres';

import { chunkJudgment, defaultChunkOptions } from '../../embed/src/chunk.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', {
  max: 1,
  prepare: false,
  statement_timeout: 1_800_000,
  idle_timeout: 0,
  onnotice: () => {},
});

/** Newline, named so an inserted literal one cannot break the source. */
const NL = String.fromCharCode(10);

/** Documents per stratum. Small on purpose: every passage here is meant to be READ. */
const PER_STRATUM = Number(process.env['N2_PER_STRATUM'] ?? 12);

type Row = {
  id: string;
  court: string;
  judgment_date: string | null;
  case_number: string | null;
  full_text: string;
  body_text_evidence: string;
  in_production_stage: boolean;
};

/**
 * DAMAGE SIGNALS, computed per PASSAGE rather than per document.
 *
 * `control_char_density` is the proof-grade one: on this corpus it separates
 * glyph-code dumps from readable text at 0.6263 against 0.0000, and it is the
 * signal the English-density screen misses — a signature footer lifts the
 * English rate of a document that is otherwise unreadable.
 *
 * `english_density` is kept beside it precisely BECAUSE the two disagree. Where
 * they disagree is the finding, not a nuisance.
 */
function damageSignals(text: string) {
  const n = text.length || 1;
  let control = 0;
  let ascii = 0;
  let deva = 0;
  let digit = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || (c >= 0xe000 && c <= 0xf8ff)) control++;
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) ascii++;
    if (c >= 0x0900 && c <= 0x097f) deva++;
    if (c >= 48 && c <= 57) digit++;
  }
  return {
    control_char_density: +(control / n).toFixed(6),
    english_density: +(ascii / n).toFixed(4),
    devanagari_density: +(deva / n).toFixed(4),
    digit_density: +(digit / n).toFixed(4),
  };
}

function passageRow(
  d: Row,
  stratum: string,
  c: { index: number; text: string; offset: number },
  chunkCount: number,
) {
  return {
    passage_id: `${d.id}#${c.index}`,
    judgment_id: d.id,
    chunk_index: c.index,
    chunk_count: chunkCount,
    court: d.court,
    judgment_date: d.judgment_date,
    case_number: d.case_number,
    stratum,
    doc_body_text_evidence: d.body_text_evidence,
    in_production_stage: d.in_production_stage,
    /* Position as a FRACTION — role correlates with where you are in a judgment,
     * and an absolute index cannot be compared across documents of very
     * different lengths. */
    position: chunkCount > 1 ? +(c.index / (chunkCount - 1)).toFixed(3) : 0,
    /* HEAD:4800 is today's production recipe. A passage beyond it is text the
     * current embedder has NEVER READ — precisely the new surface a passage
     * build creates, and the reason NEW1's bus 1090 says the quality gates
     * become load-bearing on a bigger surface. */
    beyond_head_4800: c.offset >= 0 && c.offset >= 4800,
    chars: c.text.length,
    offset: c.offset,
    ...damageSignals(c.text),
    text: c.text,
  };
}

async function main() {
  /* The strata. Court and era are the two the corpus actually holds as
   * first-class facts — NEW1 measured `case_type` NULL at 75.6%, so it cannot
   * carry a stratum. Era bands are deliberately NOT proportional: the corpus is
   * 96.5% post-2010 and a proportional draw would contain almost no older
   * authority, which is exactly the material an advocate cites for a settled
   * proposition. No corpus-wide rate is quoted from an oversampled draw. */
  const eras: [string, string, string][] = [
    ['PRE_2000', '1900-01-01', '2000-01-01'],
    ['2000_2009', '2000-01-01', '2010-01-01'],
    ['2010_2019', '2010-01-01', '2020-01-01'],
    ['2020_PLUS', '2020-01-01', '2100-01-01'],
  ];
  const courtRows = await sql<{ court: string; n: number }[]>`
    SELECT court, count(*)::int AS n FROM judgments TABLESAMPLE SYSTEM (0.05) REPEATABLE (17)
     WHERE court IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8`;
  const courts = courtRows.map((c) => c.court);
  console.log('courts in frame:', courts.join(' | '));

  /* CHECKPOINT PER STRATUM, not at the end.
   *
   * The first run of this script was killed at 26 of 32 strata and wrote
   * NOTHING, because the only write was after the loop -- the same failure this
   * repo already recorded once (160 of 283 queries lost to a teardown). A long
   * job whose artefact appears only on success has no partial result, and its
   * progress is invisible while it runs, which is also why it looked dead. */
  const JSONL = 'docs/ai/new2/passage-sample.jsonl';
  const DONE = 'docs/ai/new2/.passage-strata-done.json';
  const done: Record<string, true> = existsSync(DONE)
    ? (JSON.parse(readFileSync(DONE, 'utf8')) as Record<string, true>)
    : {};
  if (Object.keys(done).length === 0 && existsSync(JSONL)) rmSync(JSONL);

  const docs: (Row & { stratum: string })[] = [];
  for (const court of courts) {
    for (const [era, from, to] of eras) {
      const stratum = `${court} | ${era}`;
      /* Checked BEFORE the query, so a resume costs nothing rather than
       * re-running the expensive sort it already paid for. */
      if (done[stratum] === true) {
        console.log(`  ${stratum}: already checkpointed, skipping`);
        continue;
      }
      const rows = await sql<Row[]>`
        SELECT j.id::text, j.court, j.judgment_date::text, j.case_number, j.full_text,
               e.body_text_evidence,
               EXISTS (SELECT 1 FROM new1_doc_vector_stage s WHERE s.judgment_id = j.id) AS in_production_stage
          FROM judgments j
          JOIN judgment_body_text_evidence e ON e.id = j.id
         WHERE j.court = ${court}
           AND j.judgment_date >= ${from}::date AND j.judgment_date < ${to}::date
           AND j.full_text IS NOT NULL AND length(j.full_text) >= 2000
         ORDER BY md5(j.id::text)
         LIMIT ${PER_STRATUM}`;
      for (const r of rows) docs.push({ ...r, stratum });
      /* Chunk and flush THIS stratum before moving on. */
      let wrote = 0;
      for (const d of rows) {
        const chunks = chunkJudgment(d.full_text, defaultChunkOptions);
        for (const c of chunks) {
          appendFileSync(JSONL, JSON.stringify(passageRow(d, stratum, c, chunks.length)) + NL);
          wrote++;
        }
      }
      done[stratum] = true;
      writeFileSync(DONE, JSON.stringify(done, null, 1));
      console.log(`  ${stratum}: ${rows.length} docs -> ${wrote} passages (flushed)`);
    }
  }
  console.log(`\ndocuments drawn: ${docs.length}`);

  /* Read back what was flushed, so the summary describes the ARTEFACT rather
   * than an in-memory copy that might disagree with it. */
  const passages = readFileSync(JSONL, 'utf8').trim().split(NL).filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  const perDoc = [...new Set(passages.map((p) => p['judgment_id'] as string))]
    .map((id) => passages.filter((p) => p['judgment_id'] === id).length);

  const summary = {
    generated_at: new Date().toISOString(),
    frame: 'judgments (NOT new1_doc_vector_stage), md5(id)-ordered, full_text >= 2000',
    chunker: 'services/embed/src/chunk.ts chunkJudgment @ defaultChunkOptions',
    chunk_options: defaultChunkOptions,
    courts,
    eras: eras.map((e) => e[0]),
    per_stratum: PER_STRATUM,
    documents: docs.length,
    passages: passages.length,
    chunks_per_document_mean: +(passages.length / (docs.length || 1)).toFixed(3),
    chunks_per_document_max: perDoc.length > 0 ? Math.max(...perDoc) : 0,
    passages_beyond_head_4800: passages.filter((p) => p['beyond_head_4800'] === true).length,
    documents_in_production_stage: docs.filter((d) => d.in_production_stage).length,
    doc_evidence_mix: docs.reduce<Record<string, number>>((a, d) => {
      a[d.body_text_evidence] = (a[d.body_text_evidence] ?? 0) + 1;
      return a;
    }, {}),
  };

  writeFileSync('docs/ai/new2/passage-sample.json', JSON.stringify({ summary, passages }, null, 1));
  writeFileSync('docs/ai/new2/passage-sample-summary.json', JSON.stringify(summary, null, 2));
  console.log('\n' + JSON.stringify(summary, null, 2));
  console.log('\nwrote docs/ai/new2/passage-sample.json');
}

try {
  await main();
} finally {
  await sql.end({ timeout: 10 });
}
