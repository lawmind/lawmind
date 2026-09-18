/**
 * NEW2 — R9. THE CHRONOLOGY TEST PACKAGE, on FIFTH's bus 1357.
 *
 * FIFTH's ask was precise: *"add a chronology refusal/control and predecessor
 * identity handling, then reapply and republish the F-4 package."* This is the
 * republication. It is built the way the R8.3 package was — to make the NEXT
 * defect findable, not to demonstrate that the last one is fixed.
 *
 * ## The thing this package must not let me get away with
 *
 * `verification-catches-false-positives-only`: a claim never made leaves no
 * trace, so an adjudicator sampling only what I DID can never see what I wrongly
 * declined. The chronology rule is a REFUSAL rule, so its dangerous error is
 * over-refusal — clearing a link that was correct — and that error is invisible
 * in the population of remaining links.
 *
 * So the package carries three things and not one:
 *
 *   1. **the cleared population**, stratified by Act x forum x decade, each with
 *      the court's own words around the reference, so the predecessor claim can
 *      be read rather than trusted;
 *   2. **negative controls on the BOUNDARY** — links the rule left alone that sit
 *      one year either side of it. If the rule is off by one, that is where it
 *      shows, and nowhere else;
 *   3. **the non-vacuity proof**, re-run live: the guard must block exactly the
 *      1,723 and let the boundary through.
 *
 * ## What was NOT done, stated first because FIFTH asked for it
 *
 * **Predecessor identity handling was NOT built.** FIFTH asked for it; I refused
 * instead. The corpus does not hold the Indian Ports Act 1908, the Cantonments
 * Act 1924, the Companies Act 1956, the Arbitration Act 1940 or the Trade Marks
 * Act 1940, so "handling" would mean linking to an Act we have never ingested or
 * inventing a row for it. The founder's instruction is to prefer
 * `UNRESOLVED_PREDECESSOR` over a wrong link, and that is what the refusal is.
 * The predecessor's IDENTITY is recorded in the sample where the court names it,
 * so the acquisition target is nameable — but nothing is linked to it.
 *
 * Read-only. Writes one artifact.
 *
 * Usage: services/ingest/node_modules/.bin/tsx scripts/n2-chronology-test-package.mts
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/ai/new2-r9/chronology-test-package.json';
const ROLLBACK = 'docs/ai/new2-r9/statute-chronology-rollback.json';
const RULE_SRC = 'scripts/n2-statute-chronology.mts';
const GUARD_SRC = 'scripts/n2-statute-link-apply.mts';

/** Cleared refs sampled per (Act x forum x decade) stratum. Small enough to read by hand. */
const PER_STRATUM = 2;
/** Boundary controls per class. */
const CONTROLS = 25;

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

const sha = (p: string): string =>
  existsSync(join(ROOT, p)) ? createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex') : 'MISSING';

const sql = postgres(databaseUrl(), { max: 1, prepare: false, idle_timeout: 60 });

/**
 * The predecessor the COURT names, taken from its own text near the reference.
 *
 * A regex over the context, not a lookup table: the point of the sample is that
 * FIFTH reads the court's words, and a table would be this lane asserting the
 * predecessor rather than exhibiting it. Nulls are common and correct — many
 * judgments name no year at all, which is exactly why the link went wrong.
 */
function predecessorNamedInContext(context: string | null, actWord: string): string[] {
  if (!context) return [];
  const flat = context.replace(/\s+/g, ' ');
  const head = actWord.split(/\s+/)[0] ?? actWord;
  const out = new Set<string>();
  const re = new RegExp(`([A-Z][A-Za-z' .()-]{0,60}\\b${head}[A-Za-z' .()-]{0,30},?\\s*(?:Act\\s+)?(?:No\\.\\s*)?(?:[IVXLC]+\\s+of\\s+)?(1[6-9]\\d{2}|20\\d{2}))`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat))) out.add(m[1]!.trim());
  // Also catch the bare "Act No. 11 of 1924" / "III of 1906" forms.
  for (const b of flat.matchAll(/\b(?:Act\s+)?No\.?\s*([IVXLC]+|\d{1,3})\s+of\s+(1[6-9]\d{2}|20\d{2})\b/g)) {
    out.add(`Act ${b[1]} of ${b[2]}`);
  }
  return [...out].slice(0, 4);
}

async function main(): Promise<void> {
  const generatedAt = new Date().toISOString();

  const rollback = JSON.parse(readFileSync(join(ROOT, ROLLBACK), 'utf8')) as {
    entries: { refId: string; statuteId: string }[];
  };
  const clearedIds = rollback.entries.map((e) => e.refId);
  const _clearedStatute = new Map(rollback.entries.map((e) => [e.refId, e.statuteId]));
  const rollbackSha = createHash('sha256').update(readFileSync(join(ROOT, ROLLBACK))).digest('hex');

  // ---- live state: the rule's own claim, re-measured now -------------------
  const [live] = await sql<{ refs: string; linked: string; impossible: string }[]>`
    SELECT (SELECT count(*)::text FROM judgment_statute_refs) AS refs,
           (SELECT count(statute_id)::text FROM judgment_statute_refs) AS linked,
           (SELECT count(*)::text
              FROM judgment_statute_refs r
              JOIN judgments j ON j.id = r.judgment_id
              JOIN statutes  s ON s.id = r.statute_id
             WHERE r.statute_id IS NOT NULL
               AND j.judgment_date IS NOT NULL
               AND s.act_year > EXTRACT(YEAR FROM j.judgment_date)) AS impossible
  `;
  console.log(`live: refs ${live!.refs} · linked ${live!.linked} · impossible ${live!.impossible}`);

  // ---- the cleared population, stratified, with the court's own words -------
  //
  // The stratum is (Act x forum x decade) because a link that is right for a
  // 2024 judgment can be wrong for a 1959 one citing the predecessor, and
  // sampling by Act alone draws every row from the Acts already most looked at.

  /**
   * The cleared rows no longer carry `statute_id`, so the Act they POINTED AT
   * can only come from the rollback manifest. That is the whole reason the
   * manifest is written before the transaction, and it is why this join is
   * against a VALUES list rather than against the live column.
   */
  const clearedRows = await sql<{
    ref_id: string; judgment_id: string; court: string | null; judgment_date: string | null;
    act_named: string; section_number: string; act_key: string; statute_id: string;
    linked_short_title: string; linked_act_year: number; judgment_year: number;
    section_exists_in_linked_act: boolean; raw_context: string | null; still_linked: boolean;
  }[]>`
    SELECT r.id::text                      AS ref_id,
           r.judgment_id::text             AS judgment_id,
           j.court,
           j.judgment_date::text           AS judgment_date,
           r.act_named,
           r.section_number,
           r.act_key,
           m.statute_id::text              AS statute_id,
           s.short_title                   AS linked_short_title,
           s.act_year                      AS linked_act_year,
           EXTRACT(YEAR FROM j.judgment_date)::int AS judgment_year,
           EXISTS (
             SELECT 1 FROM statute_sections ss
              WHERE ss.statute_id = m.statute_id
                AND upper(regexp_replace(ss.section_number, '[^A-Za-z0-9]', '', 'g'))
                  = upper(regexp_replace(r.section_number, '[^A-Za-z0-9]', '', 'g'))
           )                               AS section_exists_in_linked_act,
           substr(j.full_text, greatest(r.first_offset - 200, 1), 460) AS raw_context,
           (r.statute_id IS NOT NULL)      AS still_linked
      FROM unnest(${clearedIds}::uuid[], ${rollback.entries.map((e) => e.statuteId)}::uuid[]) AS m(ref_id, statute_id)
      JOIN judgment_statute_refs r ON r.id = m.ref_id
      JOIN judgments j ON j.id = r.judgment_id
      JOIN statutes  s ON s.id = m.statute_id
  `;
  console.log(`cleared rows re-read: ${clearedRows.length} of ${clearedIds.length}`);

  const stillLinked = clearedRows.filter((r) => r.still_linked);
  if (stillLinked.length > 0) {
    console.log(`!! ${stillLinked.length} cleared refs are linked again — the repair did not hold`);
  }

  // Stratify in JS: the population is 1,723 rows, and a window function over a
  // VALUES join costs more to read than it saves.
  const strata = new Map<string, typeof clearedRows>();
  for (const r of clearedRows) {
    const forum = /supreme/i.test(r.court ?? '') ? 'SC' : 'HC';
    const decade = Math.floor(r.judgment_year / 10) * 10;
    const k = `${r.statute_id}|${forum}|${decade}`;
    const list = strata.get(k) ?? [];
    if (list.length < PER_STRATUM) list.push(r);
    strata.set(k, list);
  }
  const sample = [...strata.values()].flat().map((r) => ({
    ref_id: r.ref_id,
    judgment_id: r.judgment_id,
    court: r.court,
    judgment_date: r.judgment_date,
    judgment_year: r.judgment_year,
    act_named_by_extractor: r.act_named,
    act_key: r.act_key,
    section_number: r.section_number,
    was_linked_to: `${r.linked_short_title} (${r.linked_act_year})`,
    gap_years: r.linked_act_year - r.judgment_year,
    section_exists_in_the_act_it_was_linked_to: r.section_exists_in_linked_act,
    predecessor_named_by_the_court: predecessorNamedInContext(r.raw_context, r.act_named),
    verdict: 'UNRESOLVED_PREDECESSOR',
    still_linked_now: r.still_linked,
    raw_context: r.raw_context?.replace(/\s+/g, ' ').trim() ?? null,
  }));
  console.log(`sample: ${sample.length} across ${strata.size} (Act x forum x decade) strata`);

  // ---- boundary controls: what the rule must NOT have touched ---------------
  //
  // Over-refusal is invisible in the remaining population, so the controls are
  // drawn from the two years either side of the rule's threshold. A rule that is
  // off by one shows here and nowhere else.
  const boundary = await sql<{
    class: string; ref_id: string; court: string | null; judgment_year: number;
    act_named: string; section_number: string; short_title: string; act_year: number; raw_context: string | null;
  }[]>`
    (SELECT 'SAME_YEAR — act enacted in the judgment''s own year; chronology permits it and MUST NOT refuse it' AS class,
            r.id::text AS ref_id, j.court, EXTRACT(YEAR FROM j.judgment_date)::int AS judgment_year,
            r.act_named, r.section_number, s.short_title, s.act_year,
            substr(j.full_text, greatest(r.first_offset - 160, 1), 320) AS raw_context
       FROM judgment_statute_refs r
       JOIN judgments j ON j.id = r.judgment_id
       JOIN statutes  s ON s.id = r.statute_id
      WHERE r.statute_id IS NOT NULL AND j.judgment_date IS NOT NULL
        AND s.act_year = EXTRACT(YEAR FROM j.judgment_date)
      ORDER BY md5(r.id::text) LIMIT ${CONTROLS})
    UNION ALL
    (SELECT 'ONE_YEAR_INSIDE — act one year older than the judgment; the nearest legitimate link' AS class,
            r.id::text, j.court, EXTRACT(YEAR FROM j.judgment_date)::int,
            r.act_named, r.section_number, s.short_title, s.act_year,
            substr(j.full_text, greatest(r.first_offset - 160, 1), 320)
       FROM judgment_statute_refs r
       JOIN judgments j ON j.id = r.judgment_id
       JOIN statutes  s ON s.id = r.statute_id
      WHERE r.statute_id IS NOT NULL AND j.judgment_date IS NOT NULL
        AND s.act_year = EXTRACT(YEAR FROM j.judgment_date) - 1
      ORDER BY md5(r.id::text) LIMIT ${CONTROLS})
    UNION ALL
    (SELECT 'NULL_JUDGMENT_DATE — chronology is silent, and the rule deliberately lets these through' AS class,
            r.id::text, j.court, NULL::int,
            r.act_named, r.section_number, s.short_title, s.act_year,
            substr(j.full_text, greatest(r.first_offset - 160, 1), 320)
       FROM judgment_statute_refs r
       JOIN judgments j ON j.id = r.judgment_id
       JOIN statutes  s ON s.id = r.statute_id
      WHERE r.statute_id IS NOT NULL AND j.judgment_date IS NULL
      ORDER BY md5(r.id::text) LIMIT ${CONTROLS})
  `;
  const controlCounts: Record<string, number> = {};
  for (const c of boundary) controlCounts[c.class] = (controlCounts[c.class] ?? 0) + 1;
  console.log(`boundary controls: ${JSON.stringify(controlCounts)}`);

  // ---- the population sizes those controls are drawn from -------------------
  const [pop] = await sql<{ same_year: string; one_inside: string; null_date: string }[]>`
    SELECT
      count(*) FILTER (WHERE s.act_year = EXTRACT(YEAR FROM j.judgment_date))::text     AS same_year,
      count(*) FILTER (WHERE s.act_year = EXTRACT(YEAR FROM j.judgment_date) - 1)::text AS one_inside,
      count(*) FILTER (WHERE j.judgment_date IS NULL)::text                              AS null_date
    FROM judgment_statute_refs r
    JOIN judgments j ON j.id = r.judgment_id
    JOIN statutes  s ON s.id = r.statute_id
    WHERE r.statute_id IS NOT NULL
  `;

  // ---- non-vacuity, re-run live against the apply's actual WHERE clause -----
  const rawSet = JSON.parse(readFileSync(join(ROOT, 'docs/ai/new2-r8/statute-link-set.json'), 'utf8'));
  const linkSet = (Array.isArray(rawSet) ? rawSet : rawSet.links) as {
    act_key: string; act_named: string; statute_id: string;
  }[];
  let withoutGuard = 0;
  let withGuard = 0;
  for (const l of linkSet) {
    const [a] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM judgment_statute_refs r
       WHERE r.act_key = ${l.act_key} AND r.act_named = ${l.act_named}
         AND r.id = ANY(${clearedIds}::uuid[])
         AND r.statute_id IS DISTINCT FROM ${l.statute_id}::uuid
    `;
    withoutGuard += a!.n;
    const [b] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM judgment_statute_refs r
       WHERE r.act_key = ${l.act_key} AND r.act_named = ${l.act_named}
         AND r.id = ANY(${clearedIds}::uuid[])
         AND r.statute_id IS DISTINCT FROM ${l.statute_id}::uuid
         AND NOT EXISTS (
           SELECT 1 FROM judgments j, statutes s
            WHERE j.id = r.judgment_id AND s.id = ${l.statute_id}::uuid
              AND j.judgment_date IS NOT NULL
              AND s.act_year > EXTRACT(YEAR FROM j.judgment_date)
         )
    `;
    withGuard += b!.n;
  }
  console.log(`non-vacuity: re-apply would restore ${withoutGuard} WITHOUT the guard, ${withGuard} WITH it`);

  const byAct: Record<string, { act_year: number; cleared: number }> = {};
  for (const r of clearedRows) {
    const k = `${r.linked_short_title} (${r.linked_act_year})`;
    byAct[k] ??= { act_year: r.linked_act_year, cleared: 0 };
    byAct[k]!.cleared++;
  }

  const pkg = {
    artifact: 'NEW2_CHRONOLOGY_TEST_PACKAGE',
    lane: 'NEW2',
    for: 'FIFTH — republication of the F-4 package on bus 1357',
    generated_at: generatedAt,

    rule: {
      name: 'CHRONOLOGY_REFUSAL_V1',
      statement:
        'A link whose target Act has act_year LATER than the year of the judgment is refused: statute_id is set NULL, the reference row, its act_named and its section survive, and it renders as an unresolved reference.',
      unit: 'the individual reference, not the (act_key, act_named) pair',
      comparison: 'YEARS, not full dates — enactment_date is null on most statute rows, so a date-level test would refuse on data we do not have',
      null_judgment_date: 'ALLOWED THROUGH. Chronology has nothing to say about an undated judgment, and refusing on absent evidence is the same over-refusal in the other direction.',
      no_model: 'nothing in this rule calls one; every decision is an integer comparison',
      detector_source: RULE_SRC,
      detector_sha256: sha(RULE_SRC),
      prevention_source: GUARD_SRC,
      prevention_sha256: sha(GUARD_SRC),
      rollback_manifest: ROLLBACK,
      rollback_sha256: rollbackSha,
    },

    what_was_deliberately_not_done: {
      predecessor_identity_handling: 'NOT BUILT',
      why:
        'FIFTH asked for it. The corpus holds none of the predecessors involved — not the Indian Ports Act 1908, the Cantonments Act 1924, the Companies Act 1956, the Arbitration Act 1940 or the Trade Marks Act 1940 — so "handling" would mean linking to an Act we have never ingested. The founder\'s instruction is to prefer UNRESOLVED_PREDECESSOR over a wrong link. The predecessor the COURT names is exhibited in each sample row so the acquisition target is nameable, but nothing is linked to it.',
      consequence: 'These references are now unresolved. That is a visible gap, not a silent wrong answer, and it is the trade this rule makes on purpose.',
    },

    live_state: {
      measured_at: generatedAt,
      refs_total: Number(live!.refs),
      refs_linked: Number(live!.linked),
      temporally_impossible_links: Number(live!.impossible),
      cleared_by_this_rule: clearedIds.length,
      cleared_refs_re_read: clearedRows.length,
      cleared_refs_linked_again: stillLinked.length,
      note: 'temporally_impossible_links is the rule\'s own claim, re-measured against the live database at the moment this package was written. It is NOT read from an artifact.',
    },

    cleared_by_act: Object.fromEntries(Object.entries(byAct).sort((a, b) => b[1].cleared - a[1].cleared)),

    non_vacuity: {
      question: 'Does the prevention guard actually block anything, or does it pass because nothing reaches it?',
      method: `the apply's exact WHERE clause, run over the ${clearedIds.length} cleared ref ids, with and without the guard`,
      would_restore_without_guard: withoutGuard,
      would_restore_with_guard: withGuard,
      verdict: withGuard === 0 && withoutGuard === clearedIds.length ? 'NON_VACUOUS' : 'INCONCLUSIVE — read the two numbers',
    },

    boundary_controls: {
      why:
        'Over-refusal is invisible in the remaining population — a claim never made leaves no trace. These are links the rule must NOT have touched, drawn from the two years either side of its threshold and from the null-date class it deliberately passes. A rule that is off by one shows here and nowhere else.',
      population_sizes: {
        same_year: Number(pop!.same_year),
        one_year_inside: Number(pop!.one_inside),
        null_judgment_date: Number(pop!.null_date),
      },
      empty_classes: Object.entries({
        same_year: Number(pop!.same_year),
        one_year_inside: Number(pop!.one_inside),
        null_judgment_date: Number(pop!.null_date),
      })
        .filter(([, n]) => n === 0)
        .map(([k]) => k),
      empty_class_caveat:
        'A control class with a population of ZERO tests nothing. The tolerance for that class is asserted by the code and has no live evidence behind it, and this field exists so it reads as UNTESTED rather than as PASSED.',
      sampled: controlCounts,
      rows: boundary.map((c) => ({
        class: c.class,
        ref_id: c.ref_id,
        court: c.court,
        judgment_year: c.judgment_year,
        act_named: c.act_named,
        section_number: c.section_number,
        linked_to: `${c.short_title} (${c.act_year})`,
        raw_context: c.raw_context?.replace(/\s+/g, ' ').trim() ?? null,
      })),
    },

    predecessor_extraction: {
      positives_with_a_predecessor_named: sample.filter((r) => r.predecessor_named_by_the_court.length > 0).length,
      positives_total: sample.length,
      caveat:
        'This is a limit of MY regex, not evidence that the courts rarely name the predecessor. Judgments write "Cr. P. C." and "s. 251A(2)" rather than "Code of Criminal Procedure, 1898", and a form-based extractor cannot see that. THE RAW CONTEXT IS THE EVIDENCE; predecessor_named_by_the_court is a convenience that fires when the court happens to spell the year out. Tuning it until the number looked better would be scoring a phrase list on the documents it was written from.',
    },

    positives_stratified: sample,

    known_residual_not_addressed_by_this_rule: {
      statute_link_apply_would_still_change: 1179,
      what_they_are:
        'references the R8.3 name-only precision repair deliberately unlinked, which the R8.1-era link set would restore. NOT the chronology population — the guard blocks all of those. n2-statute-link-apply.mts was NOT run this round.',
      measured_by: 'a full dry run of n2-statute-link-apply.mts after the chronology apply',
    },

    how_to_attack: [
      'Read raw_context on each positive. Does the court name a PREDECESSOR? If it names the Act we cleared it from, the clearance was wrong and the rule over-refused.',
      'section_exists_in_the_act_it_was_linked_to is a hint, not the test. s.13 exists in both the 1906 and the 2011 Coinage Act — the silent failures pass a section check, which is why chronology is a separate control.',
      'The boundary controls are the real target. Sample SAME_YEAR: an Act enacted in December cited by a December judgment is legitimate and the rule must not touch it. If any SAME_YEAR row is unlinked, the comparison is wrong.',
      'NULL_JUDGMENT_DATE rows are passed on purpose. Argue if you think absent evidence should refuse; the rule says it should not, and that is a judgement call, not a measurement.',
      'Check cleared_refs_linked_again. It must be 0. Anything above 0 means something re-linked them after the repair, and the repair does not hold.',
      'The 8 DATE_UNSAFE rows (judgment on a placeholder date) were cleared like the rest. Argue that a placeholder date should not condemn a link; I refused them because if chronology is impossible, deterministic link confirmation cannot stand — your own words on 1357.',
    ],
  };

  mkdirSync(join(ROOT, dirname(OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(pkg, null, 1) + '\n');
  console.log(`wrote ${OUT}`);
  await sql.end();
}

await main();
