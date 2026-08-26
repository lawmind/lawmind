/**
 * NEW2 — R8.1 §7.2 deterministic statute-reference -> held-Act linking.
 *
 * DRY RUN. Computes the link set and its classification; writes nothing to the
 * database. There is deliberately no `--apply` in this file — the write lives
 * in its own script so a plan cannot become a backfill by a flag typo.
 *
 * One canonical Act-key implementation, and it already exists: `canonicalAct`
 * from `@lawmind/ingest/sections`, the same function the ingest used to WRITE
 * `judgment_statute_refs.act_key` and the same one `/search` uses to read it.
 * A second normaliser here would be a second truth.
 *
 * No model anywhere. Every decision is a set-size or a string-equality question.
 *
 * ## Why the year matters more than the name
 *
 * `canonicalAct` strips the trailing year — by design, so that "Police Act" and
 * "Police Act, 1861" share a key. But `act_named` keeps the printed text
 * verbatim, so the year the COURT printed is still recoverable, and it is the
 * discriminating fact:
 *
 *   - a key matching exactly one held Act is NOT automatically linkable. If the
 *     judgment printed "Land Acquisition Act, 2013" and the Act we hold is the
 *     1894 one, they are different statutes and linking them is a false link —
 *     invisible to the advocate, because a statute link carries no badge.
 *   - a key matching two held Acts is NOT automatically ambiguous. "Police Act,
 *     1861" names one of them exactly.
 *   - a key matching two held Acts and printing "Police Act, 1983" is not
 *     ambiguous either — it names a State Act we do not hold at all.
 *
 * So the unit of classification is the (act_key, act_named) PAIR, not the key.
 *
 * Usage: services/ingest/node_modules/.bin/tsx scripts/n2-statute-link-plan.mts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';
import { canonicalAct } from '../services/ingest/src/sections.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found in environment or .env');
}

const OUT = 'docs/ai/new2-r8/statute-link-plan.json';
const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 10, connect_timeout: 20 });

type Held = { id: string; act_id: string; short_title: string; act_year: number };
type Pair = { act_key: string | null; act_named: string; refs: number; judgments: number };

/** The year the COURT printed, if it printed one. Trailing position only. */
function printedYear(actNamed: string): number | null {
  const m = /(?:^|[\s,])(\d{4})\s*$/.exec(actNamed.trim());
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1800 && y <= 2100 ? y : null;
}

/**
 * A held Act has TWO legitimate years and they routinely disagree.
 *
 * `act_year` is the year of the enactment NUMBERING — "Act No. 4 of 2016".
 * `short_title` carries the year the statute is CITED by, which is the one a
 * judgment prints. The Commercial Courts Act is No. 4 of 2016 and is cited as
 * "Commercial Courts Act, 2015"; the Competition Act is No. 12 of 2003 and is
 * cited as "Competition Act, 2002"; the LLP Act is No. 6 of 2009 and is cited
 * as "LLP Act, 2008".
 *
 * Comparing only `act_year` refused 669 references across those three Acts
 * alone — a false refusal, and one this lane made before catching it. Both
 * years are the Act's own, taken from the Act's own record; neither is
 * inferred, and no alias table is invented here.
 */
function heldYears(a: Held): Set<number> {
  const years = new Set<number>([a.act_year]);
  const m = /(?:^|[\s,])(\d{4})\s*$/.exec(a.short_title.trim());
  if (m) {
    const y = Number(m[1]);
    if (y >= 1800 && y <= 2100) years.add(y);
  }
  return years;
}

/**
 * A year-conflict refusal is not one population, and saying so matters because
 * the two halves want opposite work.
 *
 * `DIGIT_EDIT_1` means the printed year differs from a held year by ONE
 * character — 1987/1897, 1881/1981, 1988/1998, 1955/1956. That is a mechanical
 * string property, claimed as nothing more. It is a CANDIDATE for adjudication,
 * never a link: this lane does not decide that a court's printed year was a
 * typo.
 *
 * `PREDECESSOR_CANDIDATE` is everything else — Consumer Protection 1986 against
 * a held 2019, Motor Vehicles 1939 against a held 1988. Refusing these is
 * correct and it is also a COVERAGE finding: the corpus cites statutes we do
 * not hold, and holding the successor is not holding them.
 */
function yearShape(printed: number, heldSet: number[]): 'DIGIT_EDIT_1' | 'PREDECESSOR_CANDIDATE' {
  const p = String(printed);
  for (const h of heldSet) {
    const s = String(h);
    let diff = 0;
    for (let i = 0; i < 4; i += 1) if (p[i] !== s[i]) diff += 1;
    if (diff === 1) return 'DIGIT_EDIT_1';
    // transposition of adjacent digits, e.g. 1988 -> 1998 is diff 1 already,
    // but 1897 -> 1987 is two positions and still one swap.
    for (let i = 0; i < 3; i += 1) {
      const swapped = s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2);
      if (swapped === p) return 'DIGIT_EDIT_1';
    }
  }
  return 'PREDECESSOR_CANDIDATE';
}

/**
 * Outcomes. Only LINK_* may ever be written; every other value is a refusal
 * that carries its own reason, per §7.2's "explicit ambiguous/unmatched reason".
 */
type Outcome =
  | 'LINK_YEAR_CONFIRMED'    // one held Act, and the printed year matches it
  | 'LINK_NAME_ONLY'         // one held Act, no year printed — name is the only evidence
  | 'LINK_YEAR_RESOLVED'     // several held Acts, printed year names exactly one
  | 'REFUSE_YEAR_CONFLICT'   // held Act(s) exist, printed year matches NONE of them
  | 'REFUSE_AMBIGUOUS'       // several held Acts, no year printed
  | 'REFUSE_UNHELD'          // no held Act carries this key at all
  | 'REFUSE_PAIR_UNIDENTIFIED' // name-only, and the held Act cannot supply the sections cited under that name
  | 'REFUSE_NULL_KEY';       // extractor produced no key

/**
 * A name-only pair whose held Act cannot supply this share of its cited
 * sections is treated as unidentified. See §3b.
 *
 * 0.20 is this lane's choice, recorded as such. The distribution makes it a gap
 * rather than a knife-edge: 257 of 340 name-only pairs missed NOTHING, 51 more
 * missed under 5%, and then empty space until Companies Act at 22%, Societies
 * Registration at 36%, Revenue Recovery at 84%, Co-operative Societies at 88%.
 */
const NAME_ONLY_MISS_FLOOR = 0.2;

/**
 * A pair-level verdict needs enough refs to be a rate rather than an anecdote.
 * At 3 or 4 refs a single absent section reads as 25–33% and would condemn a
 * correct pair — the same over-refusal in the other direction.
 */
const NAME_ONLY_MIN_REFS = 20;

async function main() {
  // ---- 1. Held Acts, keyed by the SAME function the extractor used --------
  const held = await sql<Held[]>`select id, act_id, short_title, act_year from statutes`;

  const byKey = new Map<string, Held[]>();
  for (const a of held) {
    const key = canonicalAct(a.short_title);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(a);
  }
  const collidingKeys = [...byKey.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([k, v]) => ({ act_key: k, targets: v.map((a) => `${a.short_title} (${a.act_year})`) }));

  // ---- 2. Every distinct (act_key, act_named) pair, with its weight -------
  const pairs = await sql<Pair[]>`
    select act_key, act_named, count(*)::int as refs, count(distinct judgment_id)::int as judgments
    from judgment_statute_refs
    group by act_key, act_named
  `;

  // ---- 3. Classify each pair --------------------------------------------
  const tally: Record<Outcome, { pairs: number; refs: number }> = {
    LINK_YEAR_CONFIRMED: { pairs: 0, refs: 0 },
    LINK_NAME_ONLY: { pairs: 0, refs: 0 },
    LINK_YEAR_RESOLVED: { pairs: 0, refs: 0 },
    REFUSE_YEAR_CONFLICT: { pairs: 0, refs: 0 },
    REFUSE_AMBIGUOUS: { pairs: 0, refs: 0 },
    REFUSE_UNHELD: { pairs: 0, refs: 0 },
    REFUSE_PAIR_UNIDENTIFIED: { pairs: 0, refs: 0 },
    REFUSE_NULL_KEY: { pairs: 0, refs: 0 },
  };

  const linkPlan: { act_key: string; act_named: string; refs: number; statute_id: string; outcome: Outcome }[] = [];
  const yearConflicts: { act_key: string; act_named: string; refs: number; printed: number; held: string[]; shape: 'DIGIT_EDIT_1' | 'PREDECESSOR_CANDIDATE' }[] = [];
  const trulyAmbiguous: { act_key: string; act_named: string; refs: number; targets: string[] }[] = [];
  const unheld = new Map<string, number>();

  for (const p of pairs) {
    if (p.act_key === null) {
      tally.REFUSE_NULL_KEY.pairs += 1;
      tally.REFUSE_NULL_KEY.refs += p.refs;
      continue;
    }
    const targets = byKey.get(p.act_key) ?? [];
    const year = printedYear(p.act_named);

    if (targets.length === 0) {
      tally.REFUSE_UNHELD.pairs += 1;
      tally.REFUSE_UNHELD.refs += p.refs;
      unheld.set(p.act_key, (unheld.get(p.act_key) ?? 0) + p.refs);
      continue;
    }

    if (year !== null) {
      const exact = targets.filter((t) => heldYears(t).has(year));
      if (exact.length === 1) {
        const outcome: Outcome = targets.length === 1 ? 'LINK_YEAR_CONFIRMED' : 'LINK_YEAR_RESOLVED';
        tally[outcome].pairs += 1;
        tally[outcome].refs += p.refs;
        linkPlan.push({ act_key: p.act_key, act_named: p.act_named, refs: p.refs, statute_id: exact[0].id, outcome });
        continue;
      }
      // The court printed a year, and no held Act carries it. This is a
      // DIFFERENT statute, not a near miss. Refusing is the whole point.
      tally.REFUSE_YEAR_CONFLICT.pairs += 1;
      tally.REFUSE_YEAR_CONFLICT.refs += p.refs;
      yearConflicts.push({
        act_key: p.act_key,
        act_named: p.act_named,
        refs: p.refs,
        printed: year,
        held: targets.map((t) => [...heldYears(t)].sort().join('/')),
        shape: yearShape(year, targets.flatMap((t) => [...heldYears(t)])),
      });
      continue;
    }

    // No year printed.
    if (targets.length === 1) {
      tally.LINK_NAME_ONLY.pairs += 1;
      tally.LINK_NAME_ONLY.refs += p.refs;
      linkPlan.push({ act_key: p.act_key, act_named: p.act_named, refs: p.refs, statute_id: targets[0].id, outcome: 'LINK_NAME_ONLY' });
    } else {
      tally.REFUSE_AMBIGUOUS.pairs += 1;
      tally.REFUSE_AMBIGUOUS.refs += p.refs;
      trulyAmbiguous.push({
        act_key: p.act_key,
        act_named: p.act_named,
        refs: p.refs,
        targets: targets.map((t) => `${t.short_title} (${t.act_year})`),
      });
    }
  }

  // ---- 3b. THE NAME-ONLY PREDECESSOR PREMISE — added R8.3 on FIFTH 1319 ---
  //
  // A name-only match identifies the Act only if the corpus holds the Act the
  // court meant. It is silently wrong when the court meant the REPEALED
  // PREDECESSOR: "Companies Act" with no year keys to the held 2013 Act, and
  // FIFTH found a judgment discussing s.542 — fraudulent conduct of business, a
  // 1956 section — pinned to an Act that ends at s.470.
  //
  // The mechanical proof available without deciding which Act the court meant:
  // if the held Act cannot supply {@link NAME_ONLY_MISS_FLOOR} of the sections
  // courts cite under that name, the name has not identified it.
  //
  // This must live HERE and not in a post-hoc cleanup, because the plan file is
  // what `n2-statute-link-apply.mts` reads. A repair applied afterwards is undone
  // by the next apply, silently, and nothing would report it.
  const nameOnly = linkPlan.filter((l) => l.outcome === 'LINK_NAME_ONLY');
  const unidentified: { act_key: string; act_named: string; refs: number; statute_id: string; missing: number; miss_rate: number; short_title: string }[] = [];
  if (nameOnly.length > 0) {
    // The test is against the PLANNED target and never against `r.statute_id`.
    //
    // A first version joined on the current link, and reported zero — because
    // the R8.3 precision pass had already unlinked exactly the rows it needed
    // to see. A rule that reads the state its own repair just changed measures
    // the repair, not the corpus.
    const keys = [...new Set(nameOnly.map((l) => l.act_key))];
    const cited = await sql<{ act_key: string; act_named: string; sec: string; n: number }[]>`
      select act_key, act_named,
             upper(regexp_replace(section_number, '[^A-Za-z0-9]', '', 'g')) as sec,
             count(*)::int as n
        from judgment_statute_refs
       where act_key = any(${keys})
       group by 1, 2, 3`;
    const targets = [...new Set(nameOnly.map((l) => l.statute_id))];
    const heldSecs = await sql<{ statute_id: string; sec: string }[]>`
      select statute_id::text as statute_id,
             upper(regexp_replace(section_number, '[^A-Za-z0-9]', '', 'g')) as sec
        from statute_sections
       where statute_id = any(${targets}::uuid[])`;
    const heldBy = new Map<string, Set<string>>();
    for (const h of heldSecs) {
      if (!heldBy.has(h.statute_id)) heldBy.set(h.statute_id, new Set());
      heldBy.get(h.statute_id)!.add(h.sec);
    }
    const citedBy = new Map<string, { sec: string; n: number }[]>();
    for (const c of cited) {
      const k = `${c.act_key}|${c.act_named}`;
      if (!citedBy.has(k)) citedBy.set(k, []);
      citedBy.get(k)!.push({ sec: c.sec, n: c.n });
    }
    const titleOf = new Map(held.map((h) => [h.id, h.short_title]));

    for (const l of nameOnly) {
      const heldSet = heldBy.get(l.statute_id);
      if (!heldSet || heldSet.size === 0) continue; // absent says nothing about an Act with no sections held
      const rows = citedBy.get(`${l.act_key}|${l.act_named}`) ?? [];
      const n = rows.reduce((a, r) => a + r.n, 0);
      if (n < NAME_ONLY_MIN_REFS) continue;
      const missing = rows.filter((r) => !heldSet.has(r.sec)).reduce((a, r) => a + r.n, 0);
      const rate = missing / n;
      if (rate < NAME_ONLY_MISS_FLOOR) continue;
      l.outcome = 'REFUSE_PAIR_UNIDENTIFIED';
      tally.LINK_NAME_ONLY.pairs -= 1;
      tally.LINK_NAME_ONLY.refs -= l.refs;
      tally.REFUSE_PAIR_UNIDENTIFIED.pairs += 1;
      tally.REFUSE_PAIR_UNIDENTIFIED.refs += l.refs;
      unidentified.push({ ...l, missing, miss_rate: Number(rate.toFixed(4)), short_title: titleOf.get(l.statute_id) ?? '?' });
    }
    // Removed from the writable set, not merely relabelled: the apply script
    // trusts every row in this file to be linkable.
    for (let i = linkPlan.length - 1; i >= 0; i--) {
      if (linkPlan[i]!.outcome === 'REFUSE_PAIR_UNIDENTIFIED') linkPlan.splice(i, 1);
    }
  }

  // ---- 4. Section-text coverage for what we would link -------------------
  // Linking the Act is what §7.2 asks. Whether the advocate can then READ the
  // section is a different fact and is reported separately — a link to an Act
  // whose sections we do not hold is not a lie, but calling it "the advocate
  // can now read s. 138" would be.
  const linkStatuteIds = [...new Set(linkPlan.map((l) => l.statute_id))];
  const heldSections = await sql<{ statute_id: string; n: number }[]>`
    select statute_id, count(*)::int as n from statute_sections
    where statute_id = any(${linkStatuteIds}::uuid[])
    group by statute_id
  `;
  const secByStatute = new Map(heldSections.map((r) => [r.statute_id, r.n]));
  const refsWithSectionedAct = linkPlan
    .filter((l) => (secByStatute.get(l.statute_id) ?? 0) > 0)
    .reduce((a, l) => a + l.refs, 0);

  // ---- 5. Report ---------------------------------------------------------
  const totalRefs = pairs.reduce((a, p) => a + p.refs, 0);
  const linkableRefs = tally.LINK_YEAR_CONFIRMED.refs + tally.LINK_NAME_ONLY.refs + tally.LINK_YEAR_RESOLVED.refs;

  const topUnheld = [...unheld.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([act_key, refs]) => ({ act_key, refs }));

  const report = {
    artifact: 'NEW2_STATUTE_LINK_PLAN_V1',
    lane: 'NEW2',
    protocol: 'LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md §7.2',
    generated_at: new Date().toISOString(),
    mode: 'DRY_RUN — writes nothing',
    canonical_act_key_implementation: '@lawmind/ingest/sections :: canonicalAct',
    unit_of_classification: '(act_key, act_named) pair — the key alone cannot see the year the court printed',
    held_acts: held.length,
    held_act_keys_after_normalisation: byKey.size,
    held_acts_colliding_under_normalisation: collidingKeys,
    reference_rows_total: totalRefs,
    distinct_pairs: pairs.length,
    tally,
    linkable_refs: linkableRefs,
    linkable_pct: +((linkableRefs / totalRefs) * 100).toFixed(2),
    section_text_coverage: {
      distinct_acts_linked: linkStatuteIds.length,
      acts_with_no_held_section: linkStatuteIds.length - heldSections.length,
      refs_whose_act_has_held_sections: refsWithSectionedAct,
    },
    year_conflict_shape: {
      DIGIT_EDIT_1: {
        pairs: yearConflicts.filter((c) => c.shape === 'DIGIT_EDIT_1').length,
        refs: yearConflicts.filter((c) => c.shape === 'DIGIT_EDIT_1').reduce((a, c) => a + c.refs, 0),
        note: 'candidate for adjudication, NEVER linked by this plan',
      },
      PREDECESSOR_CANDIDATE: {
        pairs: yearConflicts.filter((c) => c.shape === 'PREDECESSOR_CANDIDATE').length,
        refs: yearConflicts.filter((c) => c.shape === 'PREDECESSOR_CANDIDATE').reduce((a, c) => a + c.refs, 0),
        note: 'the corpus cites a statute we do not hold; holding its successor is not holding it',
      },
    },
    year_conflicts: yearConflicts.sort((a, b) => b.refs - a.refs),
    truly_ambiguous: trulyAmbiguous.sort((a, b) => b.refs - a.refs),
    name_only_miss_floor: NAME_ONLY_MISS_FLOOR,
    name_only_min_refs: NAME_ONLY_MIN_REFS,
    pair_unidentified: unidentified.sort((a, b) => b.refs - a.refs),
    unheld_keys_top: topUnheld,
    link_plan_size: linkPlan.length,
  };

  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(join(ROOT, 'docs/ai/new2-r8/statute-link-set.json'), JSON.stringify(linkPlan, null, 0), 'utf8');

  const pct = (n: number) => `${((n / totalRefs) * 100).toFixed(2)}%`;
  console.log(`held Acts ${held.length} -> ${byKey.size} keys (${collidingKeys.length} keys hold >1 Act)`);
  console.log(`reference rows ${totalRefs.toLocaleString()} over ${pairs.length.toLocaleString()} distinct (act_key, act_named) pairs`);
  console.log('');
  for (const [k, v] of Object.entries(tally)) {
    console.log(`  ${k.padEnd(22)} pairs ${String(v.pairs).padStart(6)}   refs ${String(v.refs).padStart(8)} ${pct(v.refs).padStart(8)}`);
  }
  console.log('');
  console.log(`LINKABLE                 ${linkableRefs.toLocaleString()} refs  ${pct(linkableRefs)}`);
  console.log(`  acts linked            ${linkStatuteIds.length}`);
  console.log(`  acts with no section   ${linkStatuteIds.length - heldSections.length}`);
  console.log(`  refs w/ sectioned act  ${refsWithSectionedAct.toLocaleString()}`);
  console.log('');
  const de1 = yearConflicts.filter((c) => c.shape === 'DIGIT_EDIT_1');
  const pre = yearConflicts.filter((c) => c.shape === 'PREDECESSOR_CANDIDATE');
  console.log(`year conflicts refused   ${tally.REFUSE_YEAR_CONFLICT.refs.toLocaleString()} refs over ${yearConflicts.length} pairs`);
  console.log(`  DIGIT_EDIT_1           ${de1.reduce((a, c) => a + c.refs, 0).toLocaleString()} refs / ${de1.length} pairs  (adjudicate, never link)`);
  console.log(`  PREDECESSOR_CANDIDATE  ${pre.reduce((a, c) => a + c.refs, 0).toLocaleString()} refs / ${pre.length} pairs  (coverage gap)`);
  console.log(`truly ambiguous refused  ${tally.REFUSE_AMBIGUOUS.refs.toLocaleString()} refs over ${trulyAmbiguous.length} pairs`);
  console.log('');
  console.log(`written ${OUT} and statute-link-set.json (${linkPlan.length} pairs)`);
}

try {
  await main();
} finally {
  await sql.end({ timeout: 10 });
}
