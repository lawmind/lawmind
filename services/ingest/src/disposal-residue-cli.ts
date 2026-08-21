/**
 * NEW2 — WHAT THE 755k `DISPOSED` RESIDUE ACTUALLY IS.
 *
 * THE PROBLEM, STATED PRECISELY
 *
 * `hc-classify.ts` refuses the `DISPOSED OFF` / `DISPOSED OF` / `DISPOSED` /
 * `CLOSED` family on purpose, and the refusal is correct. Those strings are
 * registry bookkeeping: the same four words cover a Constitution Bench deciding
 * a question of law and a writ petition closed because the petitioner did not
 * appear. Guessing them into `decided` would move a measured 32.5% of a sample
 * into the authority class wrongly, and precedent eligibility is exactly the
 * thing that must not be contaminated.
 *
 * 760,305 rows carry a disposal string the rules refuse. The standing direction
 * is: do NOT put all of them through a model, use deterministic features first,
 * and hand LCC a manifest only of the genuinely uncertain.
 *
 * THE METHOD: TRAIN ON AN INDEPENDENT LABEL, APPLY WHERE IT IS MISSING
 *
 * The corpus already contains its own labelled training set, and nothing had
 * used it. 1.13M rows carry an `hc_document_class` assigned from the DISPOSAL
 * STRING — a signal completely independent of the judgment text. So:
 *
 *   1. Draw labelled documents whose class came from the disposal string:
 *      `decided` (merits) as one class, `procedural_disposal` as the other.
 *   2. Split them into train and test halves.
 *   3. Mine the words that separate them, on the TRAIN half only
 *      (`mineMarkers`, document frequency, never raw count — one judgment
 *      repeating a word 900 times must not be able to nominate a marker).
 *   4. Score the held-out TEST half. That measurement is the entire licence for
 *      step 5, and if it is poor the honest output is "text does not separate
 *      these", not a manifest.
 *   5. Score a stratified sample of the residue and report the mix.
 *   6. Emit as a manifest ONLY the rows the text screen cannot call either way.
 *
 * This writes NOTHING to `judgments`. `hc_document_class` stays NULL for every
 * row it touches. The output is a measurement and a manifest; LCC owns any model
 * classification, and the objective is high-precision semantic eligibility, not
 * a fully populated column.
 *
 * WHY THE TEST HALF IS NOT OPTIONAL
 *
 * A marker list mined and then scored on the documents it was mined from
 * reports its own training accuracy, which for a document-frequency screen is
 * close to 100% and means nothing. The pilot for `legacy-font.ts` made the same
 * mistake avoidable by labelling from PDF fonts; here the independent label is
 * the disposal string, and the split is what keeps it independent.
 *
 * Usage:
 *   pnpm --filter @lawmind/ingest exec tsx --env-file=../../.env \
 *     src/disposal-residue-cli.ts [--labelled 3000] [--residue 6000]
 *     [--json ../../docs/ops/migration/new2-disposal-residue.json]
 *     [--manifest ../../docs/ops/migration/new2-residue-uncertain-manifest.json]
 */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from './db-host.ts';
import { mineMarkers } from './legacy-font.ts';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('DATABASE_URL is not set — run with --env-file=../../.env');
  process.exit(2);
}

const argOf = (name: string, dflt: string | null = null): string | null => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
};
const LABELLED = Number(argOf('labelled', '3000'));
const RESIDUE = Number(argOf('residue', '6000'));
const JSON_OUT = argOf('json');
const MANIFEST_OUT = argOf('manifest');

/**
 * Long enough to contain reasoning. A 400-character order says nothing about
 * whether the court decided anything, and including such rows would let
 * document LENGTH masquerade as a text signal in both directions.
 */
const MIN_CHARS = 1200;
/**
 * Only the operative tail is scored. A judgment's opening recites the parties
 * and the procedural history of a case that may have been withdrawn, allowed and
 * remanded at various points; what the court DID is in the last part. Scoring the
 * whole text mixes the history of the litigation with its outcome.
 */
const TAIL_CHARS = 4000;
const tail = (t: string): string => (t.length <= TAIL_CHARS ? t : t.slice(-TAIL_CHARS));

type Row = {
  id: string;
  disposal_nature: string | null;
  full_text: string | null;
  court: string | null;
};

const sql = await openDb(url, 2, 10 * 60_000);

/**
 * A random-uuid start, not `ORDER BY random()`. Ordering by random must produce
 * every matching row before it can sort them, which on this table means
 * detoasting `full_text` corpus-wide to return three thousand rows — the exact
 * mistake the legacy-font pilot documented after a ten-minute timeout.
 */
async function draw(where: string, limit: number): Promise<Row[]> {
  const out: Row[] = [];
  const seen = new Set<string>();
  /* Several short scans from independent random starts rather than one long
   * one: a single keyset run is a contiguous block of the primary key, and rows
   * adjacent in key order were inserted together, so one run is one corner of
   * the corpus. Eight starts is still bounded and is materially less clustered. */
  for (let attempt = 0; attempt < 8 && out.length < limit; attempt++) {
    const want = Math.ceil((limit - out.length) * 1.6);
    const rows = (await sql.unsafe(
      `SELECT id, disposal_nature, court, full_text
         FROM judgments
        WHERE id > $1::uuid AND ${where}
        ORDER BY id
        LIMIT $2`,
      [randomUUID(), want],
    )) as unknown as Row[];
    if (rows.length === 0) continue;
    for (const r of rows) {
      if (out.length >= limit) break;
      if (seen.has(r.id)) continue;
      if ((r.full_text?.length ?? 0) < MIN_CHARS) continue;
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

try {
  console.log(
    `drawing labelled documents (target ${LABELLED} per class, min ${MIN_CHARS} chars)...`,
  );
  const decided = await draw(
    `hc_document_class = 'decided' AND hc_class_method = 'disposal_nature_merits' AND full_text IS NOT NULL`,
    LABELLED,
  );
  const procedural = await draw(
    `hc_document_class = 'procedural_disposal' AND hc_class_method = 'disposal_nature_procedural' AND full_text IS NOT NULL`,
    LABELLED,
  );
  console.log(`  decided ${decided.length} · procedural ${procedural.length}`);
  if (decided.length < 200 || procedural.length < 200) {
    console.log(
      '\nnot enough labelled documents in either class to measure a screen. No manifest written.',
    );
    process.exit(0);
  }

  /* Deterministic split by position in the draw, which is primary-key order
   * within each of eight random runs — not by a coin flip, so the same command
   * re-run against the same corpus splits the same way and a change in the
   * measurement is a change in the corpus rather than in the dice. */
  const half = (xs: Row[]): [Row[], Row[]] => [
    xs.filter((_, i) => i % 2 === 0),
    xs.filter((_, i) => i % 2 === 1),
  ];
  const [decTrain, decTest] = half(decided);
  const [proTrain, proTest] = half(procedural);

  /**
   * Both directions are mined. A screen that only knows what "procedural" looks
   * like calls everything else decided by default, and "everything we could not
   * recognise is precedent" is precisely the contamination this exercise exists
   * to prevent.
   */
  const opts = {
    minLength: 4,
    maxLength: 20,
    minPositiveShare: 0.12,
    maxNegativeShare: 0.04,
    top: 60,
  };
  const proMarkers = mineMarkers(
    proTrain.map((r) => tail(r.full_text ?? '')),
    decTrain.map((r) => tail(r.full_text ?? '')),
    opts,
  );
  const decMarkers = mineMarkers(
    decTrain.map((r) => tail(r.full_text ?? '')),
    proTrain.map((r) => tail(r.full_text ?? '')),
    opts,
  );
  console.log(
    `  mined ${proMarkers.length} procedural marker(s), ${decMarkers.length} decided marker(s)`,
  );

  const hits = (text: string, markers: { marker: string }[]): string[] => {
    const t = text.toLowerCase();
    const found: string[] = [];
    for (const m of markers) {
      if (new RegExp(`(^|[^a-z])${m.marker}([^a-z]|$)`).test(t)) found.push(m.marker);
    }
    return found;
  };

  /**
   * A MARGIN, not a majority. Calling a document by whichever side has one more
   * marker turns a coin flip into a verdict; requiring a lead of two before
   * saying anything sends the near-ties to the `uncertain` bucket, which is the
   * bucket LCC's model is for. The threshold is reported with the measurement it
   * produces, so a reader can see what widening it would cost.
   */
  const MARGIN = 2;
  const score = (text: string) => {
    const p = hits(text, proMarkers).length;
    const d = hits(text, decMarkers).length;
    if (p - d >= MARGIN) return { call: 'procedural' as const, p, d };
    if (d - p >= MARGIN) return { call: 'decided' as const, p, d };
    return { call: 'uncertain' as const, p, d };
  };

  /**
   * A CONFUSION MATRIX, because the per-class version of this was wrong and read
   * as reassuring.
   *
   * The first version computed, within the truly-decided test set alone,
   * `decided calls / all calls` and named it `precisionWhenCalled`. It reported
   * 98.5%. That number is not precision - it is a recall-flavoured statistic
   * about ONE class, and it cannot be precision, because precision is
   * P(truly X | called X) and that quantity is undefined without the other class
   * contributing its false positives. Measured on both halves pooled, the screen
   * calls `decided` on a measured share of truly PROCEDURAL documents, so a
   * `decided` call is right about 86% of the time on a balanced set, not 98.5%.
   *
   * The distinction is the whole safety argument here: 98.5% would have licensed
   * writing `decided` onto ~616,000 residue rows, and roughly one in seven of
   * them would have been court admin entering the authority class. Precision is
   * reported below under an EXPLICIT prior, and the residue prior is unknown,
   * which is itself the reason nothing is written.
   */
  const callsOf = (xs: Row[]) => xs.map((r) => score(tail(r.full_text ?? '')).call);
  const decCalls = callsOf(decTest);
  const proCalls = callsOf(proTest);
  const countOf = (calls: string[], c: string) => calls.filter((x) => x === c).length;
  const matrix = {
    trulyDecided: {
      n: decTest.length,
      calledDecided: countOf(decCalls, 'decided'),
      calledProcedural: countOf(decCalls, 'procedural'),
      uncertain: countOf(decCalls, 'uncertain'),
    },
    trulyProcedural: {
      n: proTest.length,
      calledDecided: countOf(proCalls, 'decided'),
      calledProcedural: countOf(proCalls, 'procedural'),
      uncertain: countOf(proCalls, 'uncertain'),
    },
  };
  const rate = (a: number, b: number) => (b === 0 ? 0 : a / b);
  const perClass = {
    decided: {
      recall: rate(matrix.trulyDecided.calledDecided, matrix.trulyDecided.n),
      falseCallRateOnOtherClass: rate(
        matrix.trulyProcedural.calledDecided,
        matrix.trulyProcedural.n,
      ),
    },
    procedural: {
      recall: rate(matrix.trulyProcedural.calledProcedural, matrix.trulyProcedural.n),
      falseCallRateOnOtherClass: rate(matrix.trulyDecided.calledProcedural, matrix.trulyDecided.n),
    },
  };
  /* Precision AT THE TEST SET OWN PRIOR, which is 50/50 by construction. The
   * residue prior is the thing being measured, so this is stated as an
   * assumption and never as a property of the screen. */
  const precisionAtBalancedPrior = {
    decided: rate(
      matrix.trulyDecided.calledDecided,
      matrix.trulyDecided.calledDecided + matrix.trulyProcedural.calledDecided,
    ),
    procedural: rate(
      matrix.trulyProcedural.calledProcedural,
      matrix.trulyProcedural.calledProcedural + matrix.trulyDecided.calledProcedural,
    ),
  };

  console.log('\nHELD-OUT CONFUSION MATRIX (documents the markers were NOT mined from):');
  console.log(
    `  truly decided     n=${String(matrix.trulyDecided.n).padStart(5)} -> decided ${String(matrix.trulyDecided.calledDecided).padStart(4)} · procedural ${String(matrix.trulyDecided.calledProcedural).padStart(4)} · uncertain ${String(matrix.trulyDecided.uncertain).padStart(4)}`,
  );
  console.log(
    `  truly procedural  n=${String(matrix.trulyProcedural.n).padStart(5)} -> decided ${String(matrix.trulyProcedural.calledDecided).padStart(4)} · procedural ${String(matrix.trulyProcedural.calledProcedural).padStart(4)} · uncertain ${String(matrix.trulyProcedural.uncertain).padStart(4)}`,
  );
  console.log(
    `  a 'decided' call is ${(100 * precisionAtBalancedPrior.decided).toFixed(1)}% correct AT A 50/50 PRIOR; ` +
      `the screen calls decided on ${(100 * perClass.decided.falseCallRateOnOtherClass).toFixed(1)}% of truly procedural documents`,
  );
  console.log(
    `  a 'procedural' call is ${(100 * precisionAtBalancedPrior.procedural).toFixed(1)}% correct AT A 50/50 PRIOR; ` +
      `the screen calls procedural on ${(100 * perClass.procedural.falseCallRateOnOtherClass).toFixed(1)}% of truly decided documents`,
  );

  const worstPrecision = Math.min(
    precisionAtBalancedPrior.decided,
    precisionAtBalancedPrior.procedural,
  );

  console.log(`\ndrawing residue sample (target ${RESIDUE})...`);
  const residue = await draw(
    `hc_class_method IS NOT NULL AND hc_document_class IS NULL AND disposal_nature IS NOT NULL AND full_text IS NOT NULL`,
    RESIDUE,
  );
  console.log(`  residue drawn ${residue.length}`);

  const mix = { decided: 0, procedural: 0, uncertain: 0 };
  const byDisposal = new Map<
    string,
    { n: number; decided: number; procedural: number; uncertain: number }
  >();
  const uncertainIds: {
    id: string;
    disposal: string;
    court: string | null;
    proceduralHits: number;
    decidedHits: number;
  }[] = [];
  for (const r of residue) {
    const s = score(tail(r.full_text ?? ''));
    mix[s.call]++;
    const key = r.disposal_nature ?? '(null)';
    const b = byDisposal.get(key) ?? { n: 0, decided: 0, procedural: 0, uncertain: 0 };
    b.n++;
    b[s.call]++;
    byDisposal.set(key, b);
    if (s.call === 'uncertain') {
      uncertainIds.push({
        id: r.id,
        disposal: key,
        court: r.court,
        proceduralHits: s.p,
        decidedHits: s.d,
      });
    }
  }

  console.log('\nRESIDUE MIX (sample, deterministic text screen only):');
  const pct = (x: number) => `${((100 * x) / Math.max(1, residue.length)).toFixed(1)}%`;
  console.log(
    `  substantive-looking (decided)   ${String(mix.decided).padStart(5)}  ${pct(mix.decided)}`,
  );
  console.log(
    `  procedural-looking              ${String(mix.procedural).padStart(5)}  ${pct(mix.procedural)}`,
  );
  console.log(
    `  UNCERTAIN — the manifest        ${String(mix.uncertain).padStart(5)}  ${pct(mix.uncertain)}`,
  );

  console.log('\nby disposal string (top 15 by sample size):');
  for (const [k, v] of [...byDisposal.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 15)) {
    console.log(
      `  ${k.slice(0, 34).padEnd(35)} n=${String(v.n).padStart(5)} · decided ${String(v.decided).padStart(4)} · procedural ${String(v.procedural).padStart(4)} · uncertain ${String(v.uncertain).padStart(4)}`,
    );
  }

  /**
   * The population estimate is deliberately a RANGE anchored on the sample
   * share, and it is labelled as an estimate everywhere it appears. The residue
   * total is a count; the mix is from a few thousand documents drawn from eight
   * key-order runs, which is bounded and unclustered but is not a uniform random
   * draw, and quoting a single derived number would launder that.
   */
  const RESIDUE_TOTAL = 760305;
  const projected = {
    residueTotal: RESIDUE_TOTAL,
    note: 'projections are sampleShare x residueTotal. The sample is bounded and drawn from eight independent key-order runs; it is not a uniform random draw, so these are estimates and the third digit is not meaningful.',
    substantiveLooking: Math.round((mix.decided / Math.max(1, residue.length)) * RESIDUE_TOTAL),
    proceduralLooking: Math.round((mix.procedural / Math.max(1, residue.length)) * RESIDUE_TOTAL),
    uncertain: Math.round((mix.uncertain / Math.max(1, residue.length)) * RESIDUE_TOTAL),
  };
  console.log('\nPROJECTED OVER THE 760,305-ROW RESIDUE (estimates, not counts):');
  console.log(`  substantive-looking  ~${projected.substantiveLooking.toLocaleString()}`);
  console.log(`  procedural-looking   ~${projected.proceduralLooking.toLocaleString()}`);
  console.log(
    `  genuinely uncertain  ~${projected.uncertain.toLocaleString()}  <- the population a model is for`,
  );

  const report = {
    tool: 'disposal-residue-cli',
    takenAt: new Date().toISOString(),
    wroteToJudgments: false,
    minChars: MIN_CHARS,
    tailChars: TAIL_CHARS,
    margin: MARGIN,
    labelled: {
      decided: decided.length,
      procedural: procedural.length,
      trainTestSplit: 'alternating index, deterministic',
    },
    heldOut: {
      confusionMatrix: matrix,
      perClass,
      precisionAtBalancedPrior,
      worstPrecisionAtBalancedPrior: worstPrecision,
      priorWarning:
        'Precision is quoted at the TEST SET prior, which is 50/50 by construction. The residue prior is unknown and is the thing being measured, so these precisions do not transfer to the residue without it.',
    },
    markers: { procedural: proMarkers, decided: decMarkers, mineOptions: opts },
    residueSample: { n: residue.length, mix },
    byDisposal: [...byDisposal.entries()]
      .map(([disposal, v]) => ({ disposal, ...v }))
      .sort((a, b) => b.n - a.n),
    projected,
    caveats: [
      'NOTHING is written to judgments. hc_document_class stays NULL for every row here. This is a measurement and a manifest; LCC owns any model classification.',
      'The labels are the DISPOSAL STRING, not a human reading. A document the registry recorded as a merits disposal is treated as decided even if the text disagrees, so the held-out precision is precision against the registry, not against ground truth.',
      'The text screen is a word-presence margin over the last 4,000 characters. It is a triage device for choosing what to send a model, and it is not a document classifier. A `decided`-looking residue row is a CANDIDATE, never an authority.',
      'Sampling is eight independent random-uuid key-order runs, bounded. Not a uniform random draw: rows adjacent in key order were inserted together. Projections inherit that exactly.',
      'The screen is ASYMMETRIC and leans decided: it calls decided on a measured share of truly procedural documents (see perClass.decided.falseCallRateOnOtherClass). The substantive-looking projection is therefore an UPPER bound on substantive content in the residue, and the procedural projection is a lower bound.',
      'Precision figures are at the test set 50/50 prior. The residue prior is unknown; if the residue is mostly procedural the decided-call precision is far worse than quoted, and that possibility is exactly why nothing is written.',
      'DISPOSED OFF is still not decided. The whole point of the residue is that its disposal string cannot answer the question, and a text screen that leans one way does not convert a bookkeeping string into a holding.',
    ],
  };

  if (JSON_OUT) {
    writeFileSync(join(process.cwd(), JSON_OUT), JSON.stringify(report, null, 1));
    console.log(`\nwrote ${JSON_OUT}`);
  }
  if (MANIFEST_OUT) {
    writeFileSync(
      join(process.cwd(), MANIFEST_OUT),
      JSON.stringify(
        {
          tool: 'disposal-residue-cli',
          takenAt: new Date().toISOString(),
          forLane: 'LCC',
          purpose:
            'Rows in the DISPOSED/CLOSED residue that a deterministic text screen cannot call either way. These are the rows where model classification is genuinely useful; the rows the screen CAN call are not in here and should not be paid for.',
          selector:
            'hc_class_method IS NOT NULL AND hc_document_class IS NULL AND disposal_nature IS NOT NULL AND length(full_text) >= 1200',
          screen: {
            margin: MARGIN,
            tailChars: TAIL_CHARS,
            heldOutWorstPrecisionAtBalancedPrior: worstPrecision,
            confusionMatrix: matrix,
          },
          sampleUncertainCount: uncertainIds.length,
          projectedPopulation: projected.uncertain,
          rows: uncertainIds,
          caveats: [
            'These ids are a SAMPLE of the uncertain population, not the whole of it. Re-run the screen over the full residue to enumerate it; this file exists to size and characterise the job before anyone pays for it.',
            'A model verdict on these must not be written as `decided` without the same precision gate the deterministic rules are held to. Contaminating precedent eligibility is the failure this whole exercise is avoiding.',
          ],
        },
        null,
        1,
      ),
    );
    console.log(`wrote ${MANIFEST_OUT} (${uncertainIds.length} uncertain rows)`);
  }
} finally {
  await sql.end({ timeout: 10 });
}
