/**
 * NEW2 — R8.3 §11 N2-4. The independent-test package FIFTH attacks.
 *
 * Correction 7: "a large deterministic write is not self-proving merely because
 * the arithmetic closes." FIFTH has already proved that on this very join — the
 * pair rule replays exactly and was still linking an unheld 1956 Companies Act
 * to the held 2013 one. So this package is built to make the NEXT such defect
 * findable, not to demonstrate that the last one is fixed.
 *
 * What it emits, per §11 N2-4:
 *   - the join rule, its version and the sha256 of the file that encodes it;
 *   - positive samples STRATIFIED by Act, court and year;
 *   - alias and collision cases — keys where normalisation merges distinct Acts;
 *   - negative controls — refusals of every reason, which must stay refused;
 *   - the raw reference text beside the linked Act and section.
 *
 * Read-only.
 *
 * Usage: services/ingest/node_modules/.bin/tsx scripts/n2-statute-link-test-package.mts
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/ai/new2-r83/statute-link-test-package.json';
const PLAN = 'docs/ai/new2-r8/statute-link-plan.json';
const SET = 'docs/ai/new2-r8/statute-link-set.json';
const RULE_SRC = 'scripts/n2-statute-link-plan.mts';

/** Positives per stratum. Small enough to read by hand, which is the point. */
const PER_ACT = 3;

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

const sha = (p: string): string => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 60, connect_timeout: 20 });

async function main(): Promise<void> {
  const plan = JSON.parse(readFileSync(join(ROOT, PLAN), 'utf8'));
  const linkSet: { act_key: string; act_named: string; refs: number; statute_id: string; outcome: string }[] =
    JSON.parse(readFileSync(join(ROOT, SET), 'utf8'));

  console.log(`rule source   ${RULE_SRC}  sha256 ${sha(RULE_SRC).slice(0, 16)}…`);
  console.log(`link set      ${linkSet.length} pairs`);

  // ---- positives, stratified by Act x court x year ------------------------
  //
  // Stratifying by Act alone would draw every sample from the Acts with the most
  // references, and those are the ones already most looked at. Court and year
  // are in the stratum because a link that is right for a 2024 Supreme Court
  // judgment can be wrong for a 1975 High Court one citing the predecessor.
  const positives = await sql<{
    ref_id: string; judgment_id: string; court: string | null; year: number | null;
    act_named: string; section_number: string; act_key: string;
    statute_id: string; short_title: string; act_year: number | null;
    section_held: boolean; section_heading: string | null; raw_context: string | null;
  }[]>`
    with linked as (
      select r.id, r.judgment_id, r.act_key, r.act_named, r.section_number, r.statute_id,
             r.first_offset,
             j.court, extract(year from j.judgment_date)::int as year,
             row_number() over (
               partition by r.statute_id,
                            case when j.court ilike '%supreme%' then 'SC' else 'HC' end,
                            (extract(year from j.judgment_date)::int / 10)
               order by md5(r.id::text)
             ) as rn
        from judgment_statute_refs r
        join judgments j on j.id = r.judgment_id
       where r.statute_id is not null
    )
    select l.id::text as ref_id, l.judgment_id::text, l.court, l.year,
           l.act_named, l.section_number, l.act_key,
           l.statute_id::text, st.short_title, st.act_year,
           (s.id is not null) as section_held,
           s.heading as section_heading,
           substr(j.full_text, greatest(l.first_offset - 160, 0), 380) as raw_context
      from linked l
      join statutes st on st.id = l.statute_id
      join judgments j on j.id = l.judgment_id
      left join statute_sections s
        on s.statute_id = l.statute_id
       and upper(regexp_replace(s.section_number, '[^A-Za-z0-9]', '', 'g'))
         = upper(regexp_replace(l.section_number, '[^A-Za-z0-9]', '', 'g'))
     where l.rn <= ${PER_ACT}`;
  console.log(`positives     ${positives.length} across Act x forum x decade strata`);

  // ---- alias / collision cases -------------------------------------------
  const collisions = plan.held_acts_colliding_under_normalisation ?? [];
  const collisionRefs = await sql<{ act_key: string; act_named: string; refs: number; outcome_hint: string }[]>`
    select r.act_key, r.act_named, count(*)::int as refs,
           case when bool_or(r.statute_id is not null) then 'SOME_LINKED' else 'NONE_LINKED' end as outcome_hint
      from judgment_statute_refs r
     where r.act_key = any(${collisions.map((c: { act_key: string }) => c.act_key)})
     group by 1, 2
     order by refs desc`;
  console.log(`collisions    ${collisions.length} keys, ${collisionRefs.length} pairs under them`);

  // ---- negative controls: every refusal reason ---------------------------
  //
  // A refusal that quietly becomes a link is the failure this half exists to
  // catch. Each control names the reason it must KEEP being refused.
  const controls: { reason: string; sample: unknown[] }[] = [
    {
      reason: 'REFUSE_PAIR_UNIDENTIFIED — name-only, held Act cannot supply the cited sections',
      sample: (plan.pair_unidentified ?? []).slice(0, 10),
    },
    {
      reason: 'REFUSE_YEAR_CONFLICT / PREDECESSOR_CANDIDATE — printed year names an Act we do not hold',
      sample: (plan.year_conflicts ?? []).filter((c: { shape: string }) => c.shape === 'PREDECESSOR_CANDIDATE').slice(0, 10),
    },
    {
      reason: 'REFUSE_YEAR_CONFLICT / DIGIT_EDIT_1 — one digit from a held year; this lane does not rule a court typed it wrong',
      sample: (plan.year_conflicts ?? []).filter((c: { shape: string }) => c.shape === 'DIGIT_EDIT_1').slice(0, 10),
    },
    {
      reason: 'REFUSE_AMBIGUOUS — several held Acts share the key and no year was printed',
      sample: plan.truly_ambiguous ?? [],
    },
    {
      reason: 'REFUSE_UNHELD — no held Act carries the key at all',
      sample: (plan.unheld_keys_top ?? []).slice(0, 15),
    },
  ];

  const [live] = await sql<{ linked: string; total: string }[]>`
    select count(*) filter (where statute_id is not null)::text as linked,
           count(*)::text as total
      from judgment_statute_refs`;

  mkdirSync(join(ROOT, dirname(OUT)), { recursive: true });
  writeFileSync(
    join(ROOT, OUT),
    JSON.stringify(
      {
        artifact: 'NEW2_STATUTE_LINK_TEST_PACKAGE',
        lane: 'NEW2',
        for: 'FIFTH — F-4',
        protocol: 'LAWMIND_FINAL_R8_3_LIMITED_FREEZE_ORCHESTRATION_2026-08-26.md §11 N2-4',
        generated_at: new Date().toISOString(),
        join_rule: {
          version: 'R8.3',
          unit: '(act_key, act_named) pair — the key alone cannot see the year the court printed',
          normaliser: '@lawmind/ingest/sections :: canonicalAct — the SAME function the extractor wrote act_key with',
          year_rule: 'a printed year may match EITHER statutes.act_year OR the year in short_title; they legitimately differ',
          added_in_r8_3:
            'REFUSE_PAIR_UNIDENTIFIED — a name-only pair whose held Act cannot supply >=20% of the sections cited under that name, at >=20 refs',
          source_file: RULE_SRC,
          source_sha256: sha(RULE_SRC),
          plan_sha256: sha(PLAN),
          set_sha256: sha(SET),
        },
        live_state: {
          measured_at: new Date().toISOString(),
          refs_total: Number(live!.total),
          refs_linked: Number(live!.linked),
          note: 'the plan is larger than the live linked count: the CrPC acquisition made ~280k refs newly linkable and that apply is HEAVY_BOX-gated',
        },
        plan_tally: plan.tally,
        positives_stratified: positives,
        alias_and_collision: { colliding_keys: collisions, pairs_under_them: collisionRefs },
        negative_controls: controls,
        how_to_attack: [
          'For each positive: does the raw_context support the Act the link names, or its predecessor? section_held=false is a hint, not the test — the silent failures pass it.',
          'For each collision key: is the pair linked to the right one of the colliding Acts, or refused?',
          'For each negative control: confirm it is still refused in the live DB. A control that has become a link is the finding.',
          'The positives are 3 per (Act x forum x decade), so a defect confined to one decade of one court is discoverable; a proportional draw would not be.',
        ],
      },
      null,
      1,
    ) + '\n',
  );
  console.log(`\nwrote ${OUT}`);
  console.log(`live: ${Number(live!.linked).toLocaleString()} of ${Number(live!.total).toLocaleString()} refs linked`);
}

try {
  await main();
} finally {
  await sql.end();
}
