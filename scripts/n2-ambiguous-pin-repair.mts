/**
 * NEW2 — R8.1 §7.3 ambiguous materialized citation-pin repair.
 *
 * A materialized `judgment_citations.cited_judgment_id` whose canonical key maps
 * to more than one judgment is a pin the resolver would REFUSE to make today.
 * `AMBIGUOUS` is the correct answer for those, and `/search` already returns it.
 * The stored pointer is a fossil from before the key index knew about the peers.
 *
 * ## Why clearing is not dropping
 *
 * `CITATION_HARNESS.md` forbids silently dropping a citation. Nothing here drops
 * one. `citation_text`, `normalised_citation`, `char_offset`, `relationship` and
 * `evidence` are all untouched; only the POINTER goes. The citation still
 * renders — as ambiguous, which is what it is. A wrong pin is invisible to an
 * advocate because verified is silent; an ambiguous one is visible and
 * actionable. Clearing moves a citation from a false confident state into a true
 * uncertain one.
 *
 * ## Not every ambiguous key is an unsafe pin
 *
 * If every peer behind the key is the SAME decision — the same text under two
 * rows, or the same CNR and date from two sources — then following the pin lands
 * the advocate on the right authority and there is nothing to repair. Clearing
 * those would destroy correct links to fix nothing.
 *
 * So the pin is classified by what its peers ARE, using
 * `DECISION_IDENTITY_CONTRACT_V1`'s states:
 *
 *   EXACT_DOCUMENT_DUPLICATE        all peers share one non-null content_hash
 *   SAME_DECISION_DIFFERENT_SOURCE  all peers share one non-null CNR and one date
 *   DIFFERENT_COURTS                peers span more than one court
 *   DIFFERENT_DATES                 one court, more than one decision date
 *   UNKNOWN                         none of the above can be established
 *
 * The first two KEEP. The last three CLEAR — `UNKNOWN` included, because
 * `UNKNOWN` stays `UNKNOWN` and an unprovable pin is not a safe one.
 *
 * DRY RUN by default. `--apply` requires `--i-hold-heavy-box`.
 *
 * Usage:
 *   tsx scripts/n2-ambiguous-pin-repair.mts
 *   tsx scripts/n2-ambiguous-pin-repair.mts --apply --i-hold-heavy-box
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/ai/new2-r8/ambiguous-pin-repair.json';
const ROLLBACK = 'docs/ai/new2-r8/ambiguous-pin-rollback.json';

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

const APPLY = process.argv.includes('--apply');
if (APPLY && !process.argv.includes('--i-hold-heavy-box')) {
  console.error('refused: --apply clears thousands of pins. Pass --i-hold-heavy-box only when the lease is yours.');
  process.exit(2);
}

const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 60, connect_timeout: 20 });

/**
 * The classification, in SQL so it runs once over the join rather than pulling
 * 21k rows and their peers into memory.
 *
 * Order note: `EXACT_DOCUMENT_DUPLICATE` is tested before `DIFFERENT_COURTS`,
 * and that is safe rather than lucky — DECISION_IDENTITY_CONTRACT_V1 §2.1
 * measured `NOT_SAME_DECISION` (same text, different courts) at exactly ZERO
 * rows in this corpus, so the two cases cannot both be true.
 */
const CLASSIFY = `
  with resolved as (
    select id, citing_judgment_id, cited_judgment_id, citation_text,
           upper(regexp_replace(citation_text,'[^A-Za-z0-9]','','g')) as k
      from judgment_citations
     where cited_judgment_id is not null
  ), amb as (
    select r.*
      from resolved r
     where (select count(distinct kk.judgment_id)
              from judgment_citation_keys kk
             where kk.citation_key = r.k) > 1
  ), peer as (
    select a.id, a.k, a.cited_judgment_id, a.citing_judgment_id,
           count(distinct j.id)                          as peers,
           count(distinct j.court)                       as courts,
           count(distinct j.judgment_date)               as dates,
           count(distinct j.content_hash)                as hashes,
           count(*) filter (where j.content_hash is null) as null_hash,
           count(distinct j.cnr)                         as cnrs,
           count(*) filter (where j.cnr is null)          as null_cnr
      from amb a
      join judgment_citation_keys kk on kk.citation_key = a.k
      join judgments j               on j.id = kk.judgment_id
     group by a.id, a.k, a.cited_judgment_id, a.citing_judgment_id
  )
  select id, k, cited_judgment_id, citing_judgment_id, peers, courts, dates,
         case
           when hashes = 1 and null_hash = 0            then 'EXACT_DOCUMENT_DUPLICATE'
           when cnrs = 1 and null_cnr = 0 and dates = 1 then 'SAME_DECISION_DIFFERENT_SOURCE'
           when courts > 1                              then 'DIFFERENT_COURTS'
           when dates > 1                               then 'DIFFERENT_DATES'
           else 'UNKNOWN'
         end as identity_state
    from peer
`;

const KEEP = new Set(['EXACT_DOCUMENT_DUPLICATE', 'SAME_DECISION_DIFFERENT_SOURCE']);

async function main() {
  const started = Date.now();
  const rows = await sql.unsafe(CLASSIFY);
  console.log(`classified ${rows.length.toLocaleString()} ambiguous pins in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const tally: Record<string, { pins: number; disposition: string; max_peers: number }> = {};
  const toClear: { id: string; cited_judgment_id: string; key: string; identity_state: string; peers: number }[] = [];

  for (const r of rows as any[]) {
    const st = r.identity_state as string;
    tally[st] ??= { pins: 0, disposition: KEEP.has(st) ? 'KEEP' : 'CLEAR', max_peers: 0 };
    tally[st].pins += 1;
    tally[st].max_peers = Math.max(tally[st].max_peers, Number(r.peers));
    if (!KEEP.has(st)) {
      toClear.push({
        id: r.id,
        cited_judgment_id: r.cited_judgment_id,
        key: r.k,
        identity_state: st,
        peers: Number(r.peers),
      });
    }
  }

  // A pin whose key is absent from the index entirely — a different defect from
  // ambiguity, and it is not repaired here. Counted so it is not lost.
  const [{ n: keyAbsent }] = await sql<{ n: number }[]>`
    select count(*)::int as n from judgment_citations c
     where c.cited_judgment_id is not null
       and not exists (
         select 1 from judgment_citation_keys kk
          where kk.citation_key = upper(regexp_replace(c.citation_text,'[^A-Za-z0-9]','','g')))
  `;

  const [{ n: resolvedTotal }] = await sql<{ n: number }[]>`
    select count(*)::int as n from judgment_citations where cited_judgment_id is not null
  `;

  const report = {
    artifact: 'NEW2_AMBIGUOUS_PIN_REPAIR_V1',
    lane: 'NEW2',
    protocol: 'LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md §7.3',
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    identity_contract: 'docs/ai/new2-r7/DECISION_IDENTITY_CONTRACT_V1.md',
    resolved_pins_total: resolvedTotal,
    ambiguous_pins: rows.length,
    ambiguous_pct: +((rows.length / resolvedTotal) * 100).toFixed(2),
    pins_whose_key_is_absent_from_index: keyAbsent,
    by_identity_state: tally,
    to_clear: toClear.length,
    to_keep: rows.length - toClear.length,
    what_is_preserved: [
      'citation_text', 'normalised_citation', 'char_offset', 'relationship',
      'evidence', 'treatment_provenance', 'citing_judgment_id',
    ],
    what_changes: ['cited_judgment_id -> NULL'],
  };

  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 2), 'utf8');
  // The rollback manifest is written in BOTH modes, and in dry run it is the
  // thing that makes the apply reversible before the apply exists.
  writeFileSync(join(ROOT, ROLLBACK), JSON.stringify(toClear, null, 0), 'utf8');

  console.log('');
  console.log(`resolved pins            ${resolvedTotal.toLocaleString()}`);
  console.log(`ambiguous pins           ${rows.length.toLocaleString()}  (${report.ambiguous_pct}%)`);
  console.log(`key absent from index    ${keyAbsent}  (separate defect, not repaired here)`);
  console.log('');
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1].pins - a[1].pins)) {
    console.log(`  ${v.disposition.padEnd(6)} ${k.padEnd(32)} ${String(v.pins).padStart(6)}  max peers ${v.max_peers}`);
  }
  console.log('');
  console.log(`WOULD CLEAR              ${toClear.length.toLocaleString()}`);
  console.log(`WOULD KEEP               ${(rows.length - toClear.length).toLocaleString()}`);
  console.log(`rollback manifest        ${ROLLBACK} (${toClear.length} rows)`);

  if (!APPLY) {
    console.log('');
    console.log('DRY RUN — nothing written to the database.');
    return;
  }

  // Apply in bounded batches so a kill leaves a known state, and so the
  // rollback manifest on disk always covers at least what was cleared.
  const ids = toClear.map((t) => t.id);
  let cleared = 0;
  for (let i = 0; i < ids.length; i += 2000) {
    const slice = ids.slice(i, i + 2000);
    const res = await sql`
      update judgment_citations set cited_judgment_id = null
       where id = any(${slice}::uuid[]) and cited_judgment_id is not null
    `;
    cleared += res.count;
    console.log(`  cleared ${cleared.toLocaleString()} / ${ids.length.toLocaleString()}`);
  }

  // Prove zero, in the same run, by re-asking the original question.
  const after = await sql.unsafe(CLASSIFY);
  const remainingUnsafe = (after as any[]).filter((r) => !KEEP.has(r.identity_state)).length;
  console.log('');
  console.log(`CLEARED                  ${cleared.toLocaleString()}`);
  console.log(`unsafe ambiguous pins remaining ${remainingUnsafe}`);
  if (remainingUnsafe !== 0) {
    console.error('REPAIR_INCOMPLETE — unsafe pins remain after the pass');
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  await sql.end({ timeout: 10 });
}
