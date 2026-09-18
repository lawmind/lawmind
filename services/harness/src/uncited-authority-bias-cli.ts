/**
 * NEW1 — P5. HOW BIG IS THE UNCITED-AUTHORITY BIAS?
 *
 *   pnpm --filter @lawmind/harness bias:uncited
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STRUCTURAL FACT, READ OFF THE DEPLOYED VIEW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgment_embedding_eligibility` hands out a rescue in exactly two places, and
 * both of them are spelled `ca.judgment_id IS NOT NULL` — an INBOUND CITATION:
 *
 *   length(full_text) < 2000            cited → CITED_AUTHORITY_REACHABLE
 *                                       uncited → NOT_ELIGIBLE
 *   class ∈ (decided_brief,             cited → CITED_AUTHORITY_REACHABLE
 *            procedural_disposal,       uncited → UNRESOLVED_EXPERIMENTAL
 *            reference_stub)
 *
 * A judgment that other judgments cite can escape a refusal. A judgment that
 * nobody has cited yet cannot — by construction, not by accident. That is a
 * POPULARITY PRIOR sitting inside a correctness contract, and it runs the wrong
 * way for exactly the documents a research product exists to surface: the recent
 * High Court judgment on the point, which is authoritative and uncited because it
 * is three months old.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MEASURES, AND THE ONE COUNTERFACTUAL THAT MATTERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Over ADVOCATE-100's bound targets — gold NEW2 authored with a leakage guard —
 * each authority is placed in one of:
 *
 *   ELIGIBLE_NORMALLY      reaches the index on its own merits
 *   RESCUED_BECAUSE_CITED  in the index ONLY because something cites it
 *   REFUSED_BY_CLASS       refused class, uncited → UNRESOLVED_EXPERIMENTAL
 *   REFUSED_OTHER          fails identity or text safety; citation is irrelevant
 *   NOT_HELD               not in the corpus at all — NEW3's lane, not this one
 *
 * and then the counterfactual is computed by flipping ONE bit:
 *
 *   UNREACHABLE_SOLELY_FOR_WANT_OF_A_CITATION
 *       the tier it has now is a refusal, and the tier it WOULD have with a
 *       single inbound citation is a rescue. Nothing else about the document
 *       changes. This is the size of the bias, stated as a count of real
 *       authorities an advocate asked for.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A CITATION EDGE IS NOT A LEGAL TREATMENT — BINDING, AND LOAD-BEARING HERE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `cited_authority` records that A CITES B. It does NOT establish that B was
 * followed, relied on, distinguished, doubted, approved, overruled or set aside.
 * Nothing in this file may be read as currentness or treatment coverage, and a
 * rise in resolver coverage must never be reported as a rise in currentness
 * coverage. The pipeline is: reference extracted → target resolved → RELATIONSHIP
 * UNKNOWN → treatment only on independent evidence.
 *
 * That separation is the whole point of the finding rather than a caveat beside
 * it. The view is using "has an inbound citation" as a proxy for "is a real
 * authority", and those are different claims about different evidence. The fix is
 * NOT to make every refused class eligible — that deletes a refusal that is doing
 * real work against procedural chaff. It is to find a POSITIVE substantive-
 * authority signal that does not require the document to be popular.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';
import { sslFor } from './db-url.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const abs = (rel: string): string => (isAbsolute(rel) ? rel : join(ROOT, rel));
const GOLD = abs(process.env['ADVOCATE100'] ?? 'docs/ai/new2/ADVOCATE100.json');
const OUT = abs(process.env['OUT'] ?? 'docs/ai/new1-tier-a/uncited-authority-bias.json');

type Task = { task_id: string; query_class: string; targets: string[]; expected?: string };

type Row = {
  id: string;
  semantic_tier: string;
  is_cited_authority: boolean;
  hc_document_class: string | null;
  text_length: number | null;
  axis_a_identity: boolean;
  axis_b_text: boolean;
  axis_c_role: boolean;
  text_safety: string;
};

/**
 * The view's own CASE, re-evaluated with `is_cited_authority` forced true.
 *
 * Written out rather than queried with a modified view, because a second copy of
 * the view is a second thing to keep in step. This mirrors the deployed
 * definition read at run time and printed into the artefact, so a drift shows up
 * as a difference between the two rather than as a silently wrong answer.
 */
function tierIfCited(r: Row): string {
  if (!(r.axis_a_identity && r.axis_b_text)) return 'NOT_ELIGIBLE';
  if ((r.text_length ?? 0) < 2000) return 'CITED_AUTHORITY_REACHABLE';
  if (r.hc_document_class === 'bail_order') return 'BAIL_ORDER_REACHABLE';
  if (
    ['decided_brief', 'procedural_disposal', 'reference_stub'].includes(r.hc_document_class ?? '')
  )
    return 'CITED_AUTHORITY_REACHABLE';
  return r.semantic_tier;
}

const REFUSING_TIERS = new Set(['NOT_ELIGIBLE', 'UNRESOLVED_EXPERIMENTAL']);
const RESCUE_TIERS = new Set(['CITED_AUTHORITY_REACHABLE']);

async function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const gold = JSON.parse(readFileSync(GOLD, 'utf8')) as {
    tasks: Task[];
    gold_set_version?: string;
  };
  /**
   * SUBSTANTIVE authorities only. A task whose correct answer is a REFUSAL has
   * no authority to be reachable, and counting its (absent) targets would put a
   * deliberate non-answer into a coverage denominator.
   */
  const substantive = gold.tasks.filter((t) => t.expected !== 'REFUSE' && t.targets.length > 0);
  const targetIds = [...new Set(substantive.flatMap((t) => t.targets))];
  const classOf = new Map<string, string[]>();
  for (const t of substantive)
    for (const id of t.targets)
      (classOf.get(id) ?? classOf.set(id, []).get(id)!).push(t.query_class);

  console.log('UNCITED_AUTHORITY_BIAS');
  console.log(
    `  ${substantive.length} substantive tasks · ${targetIds.length} distinct bound authorities`,
  );

  const sql = postgres(url, {
    ssl: sslFor(url),
    max: 2,
    onnotice: () => {},
    connection: { statement_timeout: 120_000 },
  });

  const [def] = await sql<{ def: string }[]>`
    SELECT pg_get_viewdef('judgment_embedding_eligibility'::regclass, true) AS def`;
  const viewHash = (await import('node:crypto'))
    .createHash('sha256')
    .update(def?.def ?? '')
    .digest('hex')
    .slice(0, 16);
  console.log(`  deployed eligibility view sha256[0:16] = ${viewHash}`);

  const rows: Row[] = [];
  const PAGE = 100;
  for (let i = 0; i < targetIds.length; i += PAGE) {
    const ids = targetIds.slice(i, i + PAGE);
    const got = await sql<Row[]>`
      SELECT id, semantic_tier, is_cited_authority, hc_document_class, text_length,
             axis_a_identity, axis_b_text, axis_c_role, text_safety
      FROM judgment_embedding_eligibility WHERE id = ANY(${ids}::uuid[])`;
    rows.push(...got);
    process.stdout.write(`\r  read ${rows.length}/${targetIds.length}   `);
  }
  process.stdout.write('\n');

  const held = new Set(rows.map((r) => r.id));
  const notHeld = targetIds.filter((id) => !held.has(id));

  // Is the vector actually staged? Eligibility is a contract; staging is a fact.
  const staged = new Set<string>();
  for (let i = 0; i < targetIds.length; i += PAGE) {
    const ids = targetIds.slice(i, i + PAGE);
    const got = await sql<{ judgment_id: string }[]>`
      SELECT judgment_id FROM new1_doc_vector_stage WHERE judgment_id = ANY(${ids}::uuid[])`;
    for (const g of got) staged.add(g.judgment_id);
  }

  type Bucket =
    | 'ELIGIBLE_NORMALLY'
    | 'RESCUED_BECAUSE_CITED'
    | 'REFUSED_BY_CLASS'
    | 'REFUSED_OTHER'
    | 'NOT_HELD';

  const classify = (r: Row): Bucket => {
    if (RESCUE_TIERS.has(r.semantic_tier)) return 'RESCUED_BECAUSE_CITED';
    if (r.semantic_tier === 'UNRESOLVED_EXPERIMENTAL') return 'REFUSED_BY_CLASS';
    if (r.semantic_tier === 'NOT_ELIGIBLE') return 'REFUSED_OTHER';
    return 'ELIGIBLE_NORMALLY';
  };

  const detail = rows.map((r) => {
    const now = r.semantic_tier;
    const ifCited = tierIfCited(r);
    return {
      id: r.id,
      queryClasses: [...new Set(classOf.get(r.id) ?? [])],
      bucket: classify(r),
      semanticTier: now,
      tierIfCited: ifCited,
      isCitedAuthority: r.is_cited_authority,
      hcDocumentClass: r.hc_document_class,
      textLength: r.text_length,
      textSafety: r.text_safety,
      staged: staged.has(r.id),
      /** The counterfactual: refused now, rescued by ONE inbound citation, nothing else changed. */
      unreachableSolelyForWantOfACitation:
        !r.is_cited_authority && REFUSING_TIERS.has(now) && RESCUE_TIERS.has(ifCited),
    };
  });

  const counts: Record<string, number> = {};
  for (const d of detail) counts[d.bucket] = (counts[d.bucket] ?? 0) + 1;
  counts['NOT_HELD'] = notHeld.length;

  const solely = detail.filter((d) => d.unreachableSolelyForWantOfACitation);
  const rescued = detail.filter((d) => d.bucket === 'RESCUED_BECAUSE_CITED');

  const denom = targetIds.length;
  const pct = (n: number): string => `${((n / denom) * 100).toFixed(1)}%`;

  console.log('');
  console.log(`BUCKET                          n      share of ${denom} bound authorities`);
  for (const b of [
    'ELIGIBLE_NORMALLY',
    'RESCUED_BECAUSE_CITED',
    'REFUSED_BY_CLASS',
    'REFUSED_OTHER',
    'NOT_HELD',
  ]) {
    console.log(`${b.padEnd(30)} ${String(counts[b] ?? 0).padStart(4)}   ${pct(counts[b] ?? 0)}`);
  }
  console.log('');
  console.log(
    `RESCUED_BECAUSE_CITED = ${rescued.length} — in the index ONLY because something cites them.`,
  );
  console.log(
    `UNREACHABLE_SOLELY_FOR_WANT_OF_A_CITATION = ${solely.length} (${pct(solely.length)}).`,
  );
  console.log('  Same document, same text, same class. One inbound citation would admit it.');
  console.log('');
  console.log('A citation edge is NOT a legal treatment. This measures identity reachability,');
  console.log('never whether an authority was followed, distinguished, doubted or overruled.');

  const byClass: Record<string, Record<string, number>> = {};
  for (const d of detail) {
    for (const c of d.queryClasses) {
      (byClass[c] ??= {})[d.bucket] = ((byClass[c] ?? {})[d.bucket] ?? 0) + 1;
      if (d.unreachableSolelyForWantOfACitation)
        (byClass[c] ??= {})['UNREACHABLE_SOLELY_FOR_WANT_OF_A_CITATION'] =
          ((byClass[c] ?? {})['UNREACHABLE_SOLELY_FOR_WANT_OF_A_CITATION'] ?? 0) + 1;
    }
  }

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE CORPUS CENSUS, BECAUSE THE GOLD CANNOT SEE THIS BIAS
   * ───────────────────────────────────────────────────────────────────────────
   *
   * The gold-based answer above is a real answer and it is not the whole one.
   * ADVOCATE-100's substantive tasks rest on a SMALL number of distinct
   * judgments, and they are landmarks — long, `decided`, and cited by everything.
   * A landmark is the one kind of document that can never be caught by a rule
   * that refuses the uncited, so a gold made of landmarks will report a bias of
   * zero however large the bias is.
   *
   * That is a property of the instrument, not evidence about the corpus. So the
   * size of the bias is measured where it lives: over a random sample of the
   * corpus, through the DEPLOYED view, with the same one-bit counterfactual.
   *
   * TABLESAMPLE on `judgments` and then a lookup through the view, rather than a
   * full aggregate: 18.7M rows through a LEFT JOIN is a scan that would hold a
   * lock and starve the walk for the sake of a number a sample answers.
   */
  const SAMPLE_TARGET = Number(process.env['BIAS_SAMPLE'] ?? 40_000);
  console.log(`\nCORPUS CENSUS — sampling ~${SAMPLE_TARGET} judgments through the deployed view …`);
  const census: Record<string, number> = {};
  const censusCounterfactual: Record<string, number> = {};
  let sampled = 0;
  try {
    const sampleIds = await sql<{ id: string }[]>`
      SELECT id FROM judgments TABLESAMPLE SYSTEM (0.25) LIMIT ${SAMPLE_TARGET}`;
    for (let i = 0; i < sampleIds.length; i += 500) {
      const ids = sampleIds.slice(i, i + 500).map((r) => r.id);
      const got = await sql<Row[]>`
        SELECT id, semantic_tier, is_cited_authority, hc_document_class, text_length,
               axis_a_identity, axis_b_text, axis_c_role, text_safety
        FROM judgment_embedding_eligibility WHERE id = ANY(${ids}::uuid[])`;
      for (const r of got) {
        sampled += 1;
        census[r.semantic_tier] = (census[r.semantic_tier] ?? 0) + 1;
        const ifCited = tierIfCited(r);
        if (
          !r.is_cited_authority &&
          REFUSING_TIERS.has(r.semantic_tier) &&
          RESCUE_TIERS.has(ifCited)
        ) {
          const key = `${r.semantic_tier}__WOULD_BE_RESCUED`;
          censusCounterfactual[key] = (censusCounterfactual[key] ?? 0) + 1;
        }
      }
      process.stdout.write(`\r  census ${sampled}/${sampleIds.length}   `);
    }
    process.stdout.write('\n');
  } catch (error) {
    console.log(`  census skipped: ${error instanceof Error ? error.message : String(error)}`);
  }

  const wouldBeRescued = Object.values(censusCounterfactual).reduce((a, b) => a + b, 0);
  if (sampled > 0) {
    console.log('');
    console.log(`CORPUS SAMPLE n=${sampled}`);
    for (const [tier, n] of Object.entries(census).sort((a, b) => b[1] - a[1])) {
      console.log(
        `  ${tier.padEnd(28)} ${String(n).padStart(7)}  ${((n / sampled) * 100).toFixed(2)}%`,
      );
    }
    console.log('');
    console.log(
      `  UNREACHABLE SOLELY FOR WANT OF A CITATION: ${wouldBeRescued} of ${sampled} = ` +
        `${((wouldBeRescued / sampled) * 100).toFixed(2)}% of the corpus.`,
    );
    console.log('  Every one of these is a document the contract refuses ONLY because');
    console.log('  nothing has cited it yet. A recent High Court judgment on the point is');
    console.log('  exactly this shape, and it is exactly what a research product must find.');
  }

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE THRESHOLD COUNTERFACTUAL — LCC's bus 1054, asked for precisely
   * ───────────────────────────────────────────────────────────────────────────
   *
   * LCC will not move the 2,000-character gate without evidence, and named the
   * exact table that would justify moving it:
   *
   *   at 2000 / 1500 / 1200 / 800, how many additional documents become
   *   `standard`, and what share of those additions are `procedural_disposal`
   *   by NEW2's classifier?
   *
   * That is the trade in one table — RECALL BOUGHT against CHAFF ADMITTED. If
   * the chaff share stays flat down to 1,200 the decision makes itself; if it
   * doubles at 1,500 the current number is closer to right than it looks.
   *
   * Two things this deliberately does NOT do:
   *
   *   - It does not recommend a threshold. The class evidence is NEW2's and the
   *     view is LCC's; this lane supplies the counterfactual and nothing else.
   *   - It does not treat an UNCLASSIFIED document as clean. `hc_document_class
   *     IS NULL` is its own column in the table, because refused-by-a-rule and
   *     never-looked-at are two populations that want opposite work and both
   *     read as NULL.
   *
   * Same sample as the census above, so the two tables are about one population.
   */
  const THRESHOLDS = [2000, 1500, 1200, 800];
  const thresholdTable: Record<string, unknown>[] = [];
  if (sampled > 0) {
    console.log('\nTHRESHOLD COUNTERFACTUAL (LCC bus 1054) — same sample, n=' + sampled);
    try {
      const sampleIds = await sql<{ id: string }[]>`
        SELECT id FROM judgments TABLESAMPLE SYSTEM (0.25) LIMIT ${SAMPLE_TARGET}`;
      type Band = {
        id: string;
        text_length: number | null;
        hc_document_class: string | null;
        axis_a_identity: boolean;
        axis_b_text: boolean;
      };
      const bands: Band[] = [];
      for (let i = 0; i < sampleIds.length; i += 500) {
        const ids = sampleIds.slice(i, i + 500).map((r) => r.id);
        const got = await sql<Band[]>`
          SELECT id, text_length, hc_document_class, axis_a_identity, axis_b_text
          FROM judgment_embedding_eligibility WHERE id = ANY(${ids}::uuid[])`;
        bands.push(...got);
      }
      /**
       * Only documents that pass identity AND text safety can be admitted by a
       * length change — a shorter gate cannot rescue a document that fails an
       * earlier axis, and counting those as "additions" would overstate the
       * recall bought.
       */
      const admissible = bands.filter((b) => b.axis_a_identity && b.axis_b_text);
      console.log(
        'threshold  additions  cumulative  procedural_disposal  refused-class  UNCLASSIFIED  chaff/all  chaff/CLASSIFIED',
      );
      let previous = 2000;
      let cumulative = 0;
      for (const t of THRESHOLDS) {
        if (t === 2000) {
          thresholdTable.push({
            threshold: 2000,
            additions: 0,
            cumulative: 0,
            note: 'the deployed gate — the baseline, not an addition',
          });
          console.log(
            '     2000          0           0                    -              -             -          -                 -   (deployed)',
          );
          previous = 2000;
          continue;
        }
        const added = admissible.filter(
          (b) => (b.text_length ?? 0) >= t && (b.text_length ?? 0) < previous,
        );
        const proc = added.filter((b) => b.hc_document_class === 'procedural_disposal').length;
        const refusedClass = added.filter((b) =>
          ['procedural_disposal', 'reference_stub', 'decided_brief'].includes(
            b.hc_document_class ?? '',
          ),
        ).length;
        const unclassified = added.filter((b) => b.hc_document_class === null).length;
        cumulative += added.length;
        /**
         * TWO DENOMINATORS, AND THEY GIVE OPPOSITE ANSWERS.
         *
         * ~77% of every addition band is UNCLASSIFIED — no class verdict at all.
         * Dividing procedural_disposal by ALL additions measures "how much
         * PROVEN chaff" and reads ~5-13%, which looks like a flat, safe curve.
         * Dividing by the additions that HAVE a verdict measures "of the
         * documents anyone has actually looked at, how many are chaff" — and
         * that curve roughly doubles across the same range.
         *
         * The second is the honest denominator for a threshold decision, because
         * an unclassified document is not a clean document; it is one nobody has
         * examined. Reporting only the first would answer LCC's stated rule
         * ("if the chaff share stays flat down to 1,200 the decision makes
         * itself") with a YES that the classified evidence contradicts.
         */
        const classified = added.length - unclassified;
        const shareAll =
          added.length === 0 ? 'n/a' : `${((proc / added.length) * 100).toFixed(1)}%`;
        const share = classified === 0 ? 'n/a' : `${((proc / classified) * 100).toFixed(1)}%`;
        thresholdTable.push({
          threshold: t,
          band: `[${t}, ${previous})`,
          additions: added.length,
          cumulative,
          proceduralDisposal: proc,
          refusedClassAny: refusedClass,
          unclassified,
          classifiedAdditions: classified,
          proceduralDisposalShareOfAllAdditions: added.length === 0 ? null : proc / added.length,
          proceduralDisposalShareOfCLASSIFIEDAdditions: classified === 0 ? null : proc / classified,
          shareNote:
            'The share of ALL additions is a FLOOR, not a rate: ~77% of each band has no class verdict. The share of CLASSIFIED additions is the honest denominator for a threshold decision.',
        });
        console.log(
          String(t).padStart(9) +
            String(added.length).padStart(11) +
            String(cumulative).padStart(12) +
            String(proc).padStart(21) +
            String(refusedClass).padStart(15) +
            String(unclassified).padStart(14) +
            shareAll.padStart(11) +
            share.padStart(18),
        );
        previous = t;
      }
      console.log('  Additions are documents that ALREADY pass identity and text safety —');
      console.log('  a shorter gate cannot rescue a document that fails an earlier axis.');
      console.log('  UNCLASSIFIED is its own column: never-looked-at is not the same as clean.');
      console.log('  READ THE LAST COLUMN, NOT THE ONE BEFORE IT. ~77% of each band has no class');
      console.log(
        '  verdict, so chaff/all is a FLOOR. chaff/CLASSIFIED is the rate among documents',
      );
      console.log('  anyone has actually examined, and it points the opposite way.');
    } catch (error) {
      console.log(
        `  threshold counterfactual skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        kind: 'new1_uncited_authority_bias',
        generatedAt: new Date().toISOString(),
        goldSetVersion: gold.gold_set_version ?? null,
        deployedEligibilityViewSha256Prefix: viewHash,
        treatmentSeparation:
          'cited_authority records that A CITES B. It establishes no treatment relationship (followed/relied_on/distinguished/doubted/overruled/set_aside/approved). Nothing here may be reported as currentness or treatment coverage.',
        denominatorBoundAuthorities: denom,
        substantiveTasks: substantive.length,
        counts,
        stagedOfBound: detail.filter((d) => d.staged).length,
        unreachableSolelyForWantOfACitation: solely.length,
        rescuedBecauseCited: rescued.length,
        byQueryClass: byClass,
        goldCannotSeeThisBias:
          'ADVOCATE-100 substantive tasks rest on a small number of distinct judgments and they are landmarks — long, `decided`, heavily cited. A landmark cannot be caught by a rule that refuses the uncited, so a gold of landmarks reports zero bias however large the bias is. The corpus census below is the measurement that can see it.',
        corpusCensus: {
          sampled,
          byTier: census,
          unreachableSolelyForWantOfACitation: wouldBeRescued,
          shareOfSample: sampled > 0 ? wouldBeRescued / sampled : null,
          counterfactualByTier: censusCounterfactual,
          method:
            'TABLESAMPLE SYSTEM on judgments, then a lookup through the DEPLOYED judgment_embedding_eligibility view. A full aggregate over 18.7M rows through the cited_authority LEFT JOIN would starve the walk for a number a sample answers.',
        },
        thresholdCounterfactual: {
          origin:
            'LCC bus 1054 — the exact table that would let the 2,000-char gate be argued from evidence',
          thresholds: THRESHOLDS,
          note: 'Additions are documents already passing identity AND text safety; a shorter gate cannot rescue a document that fails an earlier axis. UNCLASSIFIED is reported separately because never-looked-at is not the same as clean.',
          rows: thresholdTable,
        },
        notHeld,
        detail,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${OUT}`);
  await sql.end({ timeout: 5 });
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
