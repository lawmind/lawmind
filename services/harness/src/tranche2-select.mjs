#!/usr/bin/env node
/**
 * NEW1 R9 — passage tranche 2: a PRIORITY-ORDERED, BUDGET-CAPPED selector.
 *
 *   node services/harness/src/tranche2-select.mjs --plan            # counts only, no file
 *   node services/harness/src/tranche2-select.mjs --cap 568000      # freeze the list
 *
 * Design and the arithmetic behind the cap: `docs/ai/new1-r9/PASSAGE_TRANCHE_2_DESIGN.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT `tranche-select-cli.mjs`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Tranche 1 was a stratified RANDOM sample, drawn gold-blind, because its job was
 * to support an unbiased benchmark. Tranche 2's job is the opposite: spend a
 * fixed storage budget on the documents an advocate is most likely to need a
 * PARAGRAPH from. A random sample would be the wrong instrument, and reusing the
 * old selector with different weights would quietly turn a benchmark frame into a
 * product decision.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ORDERING IS THE DESIGN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Populations 1–4 are small and irreplaceable. Population 5 is large and
 * substitutable. Filling in this order means a budget cut removes High Court
 * volume and never removes the Supreme Court — the property that matters when
 * someone halves the number six months from now.
 *
 *   1  Supreme Court, every eligible judgment      binding on every court in India
 *   2  cited authorities                            other judgments actually cite them
 *   3  BNS / BNSS / BSA citing judgments            no frontier model knows these codes
 *   4  treatment and currentness                    where showing the wrong para is worst
 *   5  saved to matters                             a QUEUE, not a tranche member — see below
 *   6  recent High Court, newest first              spends the remainder on current law
 *
 * `matter_authorities` holds 0 rows because there are no users yet. It is listed
 * so the omission is deliberate rather than forgotten: the day an advocate saves
 * an authority its passages should exist, which is a continuous trickle and not
 * something a tranche cut today can contain.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUERY SHAPE — LEARNED FROM ATTEMPTS #1..#3 OF THE TRANCHE-1 SELECTOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Three earlier selectors died asking the database to rank the corpus: a
 * `row_number() OVER (PARTITION BY …)` cannot stream, so forty minutes produced
 * no partial output at all. Nothing here sorts the world.
 *
 * Every population below is either an index scan over a selective predicate or a
 * direct read of a small materialised view. Eligibility is then revalidated in
 * bounded PK batches against the LIVE view — measured at 0.203 ms/id — because
 * membership computed from a frozen frame is membership that can go stale, and a
 * copy of a predicate is a copy that drifts.
 *
 * Population 6 is the only unbounded one, and it is walked NEWEST FIRST with a
 * hard remaining-slots cap, so it stops rather than scanning.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = new URL('../../../', import.meta.url);
const url = readFileSync(new URL('.env', ROOT), 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();

function argOf(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
const CAP = Number(argOf('--cap') ?? 568000);
const PLAN = process.argv.includes('--plan');
const OUT_DIR = argOf('--out') ?? 'docs/ai/new1-r9/tranche2';
/** Passage-worthy bands only. A `brief` or `stub` document has no paragraphs worth splitting. */
const BANDS = ['standard', 'full', 'substantial'];
const REVALIDATE_BATCH = 2000;

const sql = postgres(url, { ssl: false, max: 2, onnotice: () => {}, connection: { statement_timeout: 0 } });

/** Candidate id lists, cheapest and most selective first. Each returns ids only. */
const POPULATIONS = [
  {
    name: 'supreme_court',
    why: 'binding on every court in India; the paragraph is what gets pleaded',
    ids: (s) => s`SELECT id FROM judgments WHERE court = 'Supreme Court of India'`,
  },
  {
    name: 'cited_authority',
    why: 'a judgment other judgments actually cite is the definition of one worth quoting',
    ids: (s) => s`SELECT judgment_id AS id FROM cited_authority`,
  },
  {
    name: 'bns_bnss_bsa',
    why: 'no frontier model knows the 2023 codes; retrieval is the only path to them',
    ids: (s) => s`
      SELECT DISTINCT r.judgment_id AS id
        FROM judgment_statute_refs r
        JOIN statutes st ON st.id = r.statute_id
       WHERE st.short_title ~* 'Nyaya Sanhita|Nagarik Suraksha|Sakshya'`,
  },
  {
    name: 'treatment_currentness',
    why: 'the population where showing the wrong paragraph is worst',
    ids: (s) => s`
      SELECT id FROM judgments WHERE overruled_status <> 'none'
      UNION
      SELECT overruled_by_judgment_id AS id FROM judgments WHERE overruled_by_judgment_id IS NOT NULL`,
  },
  {
    name: 'saved_to_matters',
    why: 'must be a continuous queue, not a tranche member; 0 rows today because there are no users',
    ids: (s) => s`SELECT DISTINCT judgment_id AS id FROM matter_authorities`,
  },
];

/**
 * Population 6, walked newest-first in bounded date pages so it STOPS at the cap
 * instead of scanning the corpus. `judgments_judgment_date_idx` drives it.
 */
async function recentHighCourt(s, slots, exclude) {
  const picked = [];
  let cursorDate = null;
  let cursorId = null;
  while (picked.length < slots) {
    const page = await s`
      SELECT j.id, j.judgment_date
        FROM judgments j
       WHERE j.court <> 'Supreme Court of India'
         AND j.judgment_date IS NOT NULL
         ${
           cursorDate
             ? s`AND (j.judgment_date, j.id) < (${cursorDate}::date, ${cursorId}::uuid)`
             : s``
         }
       ORDER BY j.judgment_date DESC, j.id DESC
       LIMIT 20000`;
    if (page.length === 0) break;
    cursorDate = page[page.length - 1].judgment_date;
    cursorId = page[page.length - 1].id;
    const fresh = page.map((r) => r.id).filter((id) => !exclude.has(id));
    const ok = await revalidate(s, fresh);
    for (const id of ok) {
      if (picked.length >= slots) break;
      if (exclude.has(id)) continue;
      exclude.add(id);
      picked.push(id);
    }
    process.stdout.write(`  recent_high_court ${picked.length}/${slots} (through ${String(cursorDate).slice(0, 10)})\r`);
  }
  process.stdout.write('\n');
  return picked;
}

/** Bounded PK revalidation against the DEPLOYED view. Never a re-derived predicate. */
async function revalidate(s, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += REVALIDATE_BATCH) {
    const slice = ids.slice(i, i + REVALIDATE_BATCH);
    const rows = await s`
      SELECT e.id FROM judgment_embedding_eligibility e
       WHERE e.id = ANY(${slice}::uuid[])
         AND e.semantic_tier <> 'NOT_ELIGIBLE'
         AND e.text_safety <> 'UNSAFE_VERIFIED'
         AND e.value_band = ANY(${BANDS})`;
    for (const r of rows) out.push(r.id);
  }
  return out;
}

try {
  const [viewRow] = await sql`SELECT pg_get_viewdef('judgment_embedding_eligibility'::regclass, true) AS def`;
  const definitionHash = createHash('sha256').update(viewRow.def).digest('hex').slice(0, 16);

  // Documents that already HAVE passages are kept and count against the budget,
  // so they are excluded from selection rather than re-selected.
  const already = new Set(
    (await sql`SELECT DISTINCT judgment_id FROM new1_tranche_passages`).map((r) => r.judgment_id),
  );
  console.log(`already in tranche 1: ${already.size} documents (kept, counted against the cap)`);

  const chosen = new Set(already);
  const report = [];
  let slots = CAP - already.size;

  for (const pop of POPULATIONS) {
    const t0 = Date.now();
    const raw = (await pop.ids(sql)).map((r) => r.id);
    const novel = raw.filter((id) => !chosen.has(id));
    const eligible = await revalidate(sql, novel);
    const taken = eligible.slice(0, Math.max(slots, 0));
    for (const id of taken) chosen.add(id);
    slots -= taken.length;
    report.push({
      population: pop.name,
      why: pop.why,
      candidates: raw.length,
      novel: novel.length,
      eligible: eligible.length,
      taken: taken.length,
      slotsLeft: Math.max(slots, 0),
      seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
    });
    console.log(
      `${pop.name.padEnd(22)} candidates ${String(raw.length).padStart(8)}  novel ${String(novel.length).padStart(8)}  eligible ${String(eligible.length).padStart(8)}  taken ${String(taken.length).padStart(8)}  left ${Math.max(slots, 0)}`,
    );
  }

  let recent = [];
  if (slots > 0) {
    const t0 = Date.now();
    recent = await recentHighCourt(sql, slots, chosen);
    slots -= recent.length;
    report.push({
      population: 'recent_high_court',
      why: 'newest first; spends the remainder on law that is still current',
      candidates: null,
      novel: null,
      eligible: recent.length,
      taken: recent.length,
      slotsLeft: Math.max(slots, 0),
      seconds: Number(((Date.now() - t0) / 1000).toFixed(1)),
    });
  }

  const selected = [...chosen].filter((id) => !already.has(id)).concat(recent.filter((id) => !chosen.has(id)));
  const uniqueSelected = [...new Set(selected)];
  const totalDocs = already.size + uniqueSelected.length;

  // Storage, from the MEASURED per-document cost of tranche 1 — never a
  // projection from a vendor table.
  const BYTES_PER_DOC = 110_520;
  const manifest = {
    kind: 'new1_passage_tranche2_plan',
    cap: CAP,
    definitionHash,
    bands: BANDS,
    keptFromTranche1: already.size,
    newlySelected: uniqueSelected.length,
    totalDocuments: totalDocs,
    estimatedPassages: Math.round(totalDocs * 5.115),
    estimatedBytes: totalDocs * BYTES_PER_DOC,
    estimatedGiB: Number(((totalDocs * BYTES_PER_DOC) / 1024 ** 3).toFixed(1)),
    estimatedGpuHours: Number(((totalDocs * 5.115) / 38000).toFixed(1)),
    populations: report,
    idsHash: createHash('sha256').update(uniqueSelected.slice().sort().join(',')).digest('hex').slice(0, 16),
    generatedAt: new Date().toISOString(),
    plan: PLAN,
  };

  if (!PLAN) {
    mkdirSync(new URL(OUT_DIR + '/', ROOT), { recursive: true });
    writeFileSync(new URL(OUT_DIR + '/tranche2-ids.txt', ROOT), uniqueSelected.join('\n') + '\n');
    writeFileSync(new URL(OUT_DIR + '/tranche2-manifest.json', ROOT), JSON.stringify(manifest, null, 2) + '\n');
  }
  console.log('\n' + JSON.stringify(manifest, null, 2));
} finally {
  await sql.end({ timeout: 10 });
}
