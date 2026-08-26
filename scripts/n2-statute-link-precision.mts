/**
 * NEW2 — R8.3 §11 N2-4. Statute-link precision repair, on FIFTH's bus 1319.
 *
 * ## The defect FIFTH found, and why the pair rule could not see it
 *
 * `LINK_NAME_ONLY` links a printed Act name to the one held Act sharing its
 * normalised key. That is sound when the corpus holds the Act the court meant.
 * It is silently wrong when the court meant that Act's REPEALED PREDECESSOR,
 * which we do not hold: "Companies Act" with no year keys to the held 2013 Act,
 * and a judgment discussing s.542 (fraudulent conduct of business, a 1956
 * section) is pinned to an Act that ends at s.470.
 *
 * The R8.1 replay confirms the implemented rule matches its specification
 * exactly — FIFTH found 0 departures over all 16,582 pairs. The rule is
 * faithfully implemented AND insufficient, which is a distinction worth keeping:
 * this is not a bug in the code, it is a missing premise in the rule.
 *
 * ## The two repairs, and why they are different rules
 *
 * **1. `REFUSE_PAIR_UNIDENTIFIED` — the whole pair.** If the held Act cannot
 * supply {@link PAIR_MISS_FLOOR} of the sections courts cite under that name,
 * the name has not identified it. This is the repair that matters, because the
 * refs it removes are mostly ones that PASS a per-section test: s.10 exists in
 * both the 1956 and the 2013 Companies Act and means different things, so a
 * per-ref check would keep 3,267 of the Companies Act's 4,213 links and leave
 * the silent half in place.
 *
 * **2. `REFUSE_SECTION_ABSENT` — the individual ref.** Inside a pair that IS
 * identified, a ref whose section the held Act does not contain is refused on
 * its own.
 *
 * ## What is deliberately NOT repaired
 *
 * `LINK_YEAR_CONFIRMED` links are preserved, including their 2,380
 * section-absent refs, and FIFTH asked for exactly this. The court printed the
 * year and it matches the held Act, so Act identity is established by evidence
 * stronger than a section inventory. A missing section there is one of: our
 * inventory being incomplete, a State amendment, an OCR error, or the court's
 * own typo. **This lane does not decide that a court's printed section was
 * wrong**, so those are reported as a coverage queue and left linked.
 *
 * Rollback manifest is written BEFORE the transaction commits.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-statute-link-precision.mts
 *   services/ingest/node_modules/.bin/tsx scripts/n2-statute-link-precision.mts --apply
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LINK_SET = 'docs/ai/new2-r8/statute-link-set.json';
const OUT = 'docs/ai/new2-r83/statute-link-precision.json';
const ROLLBACK = 'docs/ai/new2-r83/statute-link-precision-rollback.json';

/**
 * A name-only pair whose held Act cannot supply this share of its cited
 * sections is treated as unidentified.
 *
 * 0.20 is this lane's choice and is recorded as such. The distribution makes it
 * a gap rather than a knife-edge: 257 of 340 name-only pairs miss NOTHING, 51
 * more miss under 5%, and then there is empty space until the tail — Companies
 * Act at 22%, Co-operative Societies at 88%, Revenue Recovery at 84%. No pair
 * sits between 5% and 20% carrying real volume, so the threshold is not
 * separating similar things.
 */
const PAIR_MISS_FLOOR = 0.2;

/**
 * A pair-level verdict needs enough refs to be a rate rather than an anecdote.
 *
 * Without this the first run condemned "The Specific Relief Act" (4 refs) and
 * "The General Clauses Act" (3 refs) at 25% and 33% — each of which is ONE
 * absent section. Unlinking three correct links because one row missed is the
 * same over-refusal in the opposite direction from the defect being fixed.
 * Below this count the per-ref rule applies instead, which removes exactly the
 * offending row.
 */
const PAIR_MIN_REFS = 20;

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type LinkSetRow = { act_key: string; act_named: string; refs: number; statute_id: string; outcome: string };
type AuditRow = {
  act_key: string;
  act_named: string;
  statute_id: string;
  short_title: string;
  held_sections: number;
  n: number;
  missing: number;
};

const apply = process.argv.includes('--apply');
const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 60, connect_timeout: 20 });

async function main(): Promise<void> {
  console.log(`R8.3 §11 N2-4 — statute-link precision${apply ? ' (APPLY)' : ' (dry run)'}\n`);

  const linkSet: LinkSetRow[] = JSON.parse(readFileSync(join(ROOT, LINK_SET), 'utf8'));
  const outcomeOf = new Map(linkSet.map((r) => [`${r.act_key}|${r.act_named}`, r.outcome]));
  const ruleHash = createHash('sha256').update(readFileSync(join(ROOT, LINK_SET))).digest('hex');
  console.log(`link set          ${linkSet.length} pairs   sha256 ${ruleHash.slice(0, 16)}…`);

  // The section-existence test, normalised the same way on both sides. A join
  // that normalises only one side is a comparison between two different things,
  // which is how a `citation_key` mismatch produced a confident wrong number
  // earlier in this programme.
  const audit = await sql<AuditRow[]>`
    with held as (select statute_id, count(*)::int c from statute_sections group by 1)
    select r.act_key, r.act_named, r.statute_id::text as statute_id, st.short_title,
           coalesce(h.c, 0) as held_sections,
           count(*)::int as n,
           count(*) filter (where s.id is null)::int as missing
      from judgment_statute_refs r
      join statutes st on st.id = r.statute_id
      left join held h on h.statute_id = r.statute_id
      left join statute_sections s
        on s.statute_id = r.statute_id
       and upper(regexp_replace(s.section_number, '[^A-Za-z0-9]', '', 'g'))
         = upper(regexp_replace(r.section_number, '[^A-Za-z0-9]', '', 'g'))
     where r.statute_id is not null
     group by 1, 2, 3, 4, 5`;

  const totalRefs = audit.reduce((a, r) => a + r.n, 0);
  const totalMissing = audit.reduce((a, r) => a + r.missing, 0);
  console.log(`linked refs       ${totalRefs.toLocaleString()}   section-absent ${totalMissing.toLocaleString()} (${((totalMissing / totalRefs) * 100).toFixed(2)}%)`);

  const unidentified: AuditRow[] = [];
  const sectionAbsentPairs: AuditRow[] = [];
  const yearConfirmedMisses: AuditRow[] = [];

  for (const r of audit) {
    const outcome = outcomeOf.get(`${r.act_key}|${r.act_named}`) ?? 'UNKNOWN';
    if (r.missing === 0) continue;
    if (r.held_sections === 0) continue; // absent tells us nothing about an Act with no sections held
    if (outcome === 'LINK_NAME_ONLY' && r.n >= PAIR_MIN_REFS && r.missing / r.n >= PAIR_MISS_FLOOR) unidentified.push(r);
    else if (outcome === 'LINK_NAME_ONLY') sectionAbsentPairs.push(r);
    else yearConfirmedMisses.push(r);
  }

  const unidentifiedRefs = unidentified.reduce((a, r) => a + r.n, 0);
  const absentRefs = sectionAbsentPairs.reduce((a, r) => a + r.missing, 0);
  const preservedMisses = yearConfirmedMisses.reduce((a, r) => a + r.missing, 0);

  console.log(`\nREFUSE_PAIR_UNIDENTIFIED   ${unidentified.length} pairs, ${unidentifiedRefs.toLocaleString()} refs unlinked ENTIRELY`);
  for (const r of [...unidentified].sort((a, b) => b.n - a.n)) {
    console.log(`  ${String(r.n).padStart(6)} refs  ${String(Math.round((r.missing / r.n) * 100)).padStart(3)}% absent  "${r.act_named}" -> ${r.short_title}`);
  }
  console.log(`\nREFUSE_SECTION_ABSENT      ${sectionAbsentPairs.length} pairs, ${absentRefs.toLocaleString()} individual refs unlinked`);
  console.log(`PRESERVED (year-confirmed) ${yearConfirmedMisses.length} pairs, ${preservedMisses.toLocaleString()} section-absent refs LEFT LINKED — coverage queue, not an Act-identity error`);

  const totalUnlink = unidentifiedRefs + absentRefs;
  console.log(`\ntotal to unlink   ${totalUnlink.toLocaleString()} of ${totalRefs.toLocaleString()} (${((totalUnlink / totalRefs) * 100).toFixed(2)}%)`);
  console.log(`links remaining   ${(totalRefs - totalUnlink).toLocaleString()}`);

  mkdirSync(join(ROOT, dirname(OUT)), { recursive: true });
  writeFileSync(
    join(ROOT, OUT),
    JSON.stringify(
      {
        artifact: 'NEW2_STATUTE_LINK_PRECISION',
        lane: 'NEW2',
        protocol: 'LAWMIND_FINAL_R8_3_LIMITED_FREEZE_ORCHESTRATION_2026-08-26.md §11 N2-4',
        raised_by: 'FIFTH bus 1319 — NAME_ONLY links unheld Companies Act 1956 refs to the held 2013 Act',
        generated_at: new Date().toISOString(),
        link_set_sha256: ruleHash,
        pair_miss_floor: PAIR_MISS_FLOOR,
        pair_min_refs: PAIR_MIN_REFS,
        totals: {
          linked_refs: totalRefs,
          section_absent_refs: totalMissing,
          unlinked_pair_unidentified: unidentifiedRefs,
          unlinked_section_absent: absentRefs,
          preserved_year_confirmed_absent: preservedMisses,
          links_remaining: totalRefs - totalUnlink,
        },
        refuse_pair_unidentified: unidentified.map((r) => ({ ...r, miss_rate: Number((r.missing / r.n).toFixed(4)) })),
        refuse_section_absent_pairs: sectionAbsentPairs.map((r) => ({ ...r, miss_rate: Number((r.missing / r.n).toFixed(4)) })),
        preserved_year_confirmed: yearConfirmedMisses
          .sort((a, b) => b.missing - a.missing)
          .map((r) => ({ ...r, miss_rate: Number((r.missing / r.n).toFixed(4)) })),
        applied: false,
      },
      null,
      1,
    ) + '\n',
  );
  console.log(`\nwrote ${OUT}`);

  if (!apply) {
    console.log('\ndry run — nothing unlinked. Re-run with --apply.');
    return;
  }

  // Rollback manifest BEFORE the write: every row that is about to lose its
  // statute_id, by id, with the value it held.
  //
  // One query per pair, not one tuple-IN over all of them. postgres.js does not
  // build row-constructor IN lists, and 77 small indexed queries are cheaper to
  // read and to verify than a generated predicate nobody can check by eye.
  type Doomed = {
    id: string;
    statute_id: string;
    act_key: string;
    act_named: string;
    section_number: string;
    judgment_id: string;
    reason: string;
  };
  const doomed: Doomed[] = [];

  for (const p of unidentified) {
    const rows = await sql<Doomed[]>`
      select r.id::text, r.statute_id::text, r.act_key, r.act_named, r.section_number, r.judgment_id::text,
             'REFUSE_PAIR_UNIDENTIFIED' as reason
        from judgment_statute_refs r
       where r.statute_id = ${p.statute_id}::uuid
         and r.act_key = ${p.act_key}
         and r.act_named = ${p.act_named}`;
    doomed.push(...rows);
  }
  for (const p of sectionAbsentPairs) {
    const rows = await sql<Doomed[]>`
      select r.id::text, r.statute_id::text, r.act_key, r.act_named, r.section_number, r.judgment_id::text,
             'REFUSE_SECTION_ABSENT' as reason
        from judgment_statute_refs r
       where r.statute_id = ${p.statute_id}::uuid
         and r.act_key = ${p.act_key}
         and r.act_named = ${p.act_named}
         and not exists (
           select 1 from statute_sections s
            where s.statute_id = r.statute_id
              and upper(regexp_replace(s.section_number, '[^A-Za-z0-9]', '', 'g'))
                = upper(regexp_replace(r.section_number, '[^A-Za-z0-9]', '', 'g')))`;
    doomed.push(...rows);
  }

  console.log(`\nrollback manifest ${doomed.length.toLocaleString()} rows`);
  writeFileSync(
    join(ROOT, ROLLBACK),
    JSON.stringify(
      {
        artifact: 'NEW2_STATUTE_LINK_PRECISION_ROLLBACK',
        generated_at: new Date().toISOString(),
        restore: 'UPDATE judgment_statute_refs SET statute_id = <statute_id> WHERE id = <id>',
        count: doomed.length,
        rows: doomed,
      },
      null,
      1,
    ) + '\n',
  );
  console.log(`wrote ${ROLLBACK}`);

  if (doomed.length !== totalUnlink) {
    console.error(`REFUSING: manifest ${doomed.length} != planned ${totalUnlink}. The plan and the write disagree.`);
    process.exitCode = 1;
    return;
  }

  const ids = doomed.map((d) => d.id);
  const updated = await sql.begin(async (tx) => {
    let n = 0;
    for (let i = 0; i < ids.length; i += 5000) {
      const chunk = ids.slice(i, i + 5000);
      const res = await tx`update judgment_statute_refs set statute_id = null where id::text in ${tx(chunk)}`;
      n += res.count;
    }
    return n;
  });
  console.log(`unlinked ${updated.toLocaleString()} rows`);

  const [after] = await sql<{ linked: string }[]>`
    select count(*)::text as linked from judgment_statute_refs where statute_id is not null`;
  console.log(`verified by re-read: ${Number(after!.linked).toLocaleString()} refs still linked`);

  const json = JSON.parse(readFileSync(join(ROOT, OUT), 'utf8'));
  json.applied = true;
  json.rows_unlinked = updated;
  json.linked_after = Number(after!.linked);
  writeFileSync(join(ROOT, OUT), JSON.stringify(json, null, 1) + '\n');
}

try {
  await main();
} finally {
  await sql.end();
}
