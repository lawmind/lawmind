/**
 * NEW2 — R8.3 §8.4 / §11 N2-7. The prediction-blind role packet for FIFTH.
 *
 * FIFTH asked (bus 1321) for a reviewer-facing file with **no** prediction, no
 * lexical label and no derived expected label, plus a SEPARATE sealed key.
 *
 * ## Why the packet must be blind in the strict sense
 *
 * A stratified sample leaks its own answer: if the packet says which stratum a
 * passage came from, the stratum IS the prediction and the labelling is no
 * longer independent. So the packet carries text and neutral provenance only,
 * shuffled deterministically, and the strata live in the key.
 *
 * ## Why the class mix is deliberately NOT the corpus mix
 *
 * `REPORTER_EDITORIAL` is 1.57% of the pool and `QUOTED_PRECEDENT` 0.10%. A
 * proportional 200-passage draw would contain 3 and 0 of them, and would
 * therefore be unable to discover an error in exactly the classes that decide
 * whether reporter text can reach an advocate. This packet OVERSAMPLES the rare
 * and unsafe classes on purpose.
 *
 * **Consequence, stated here so it cannot be read off the file by mistake: the
 * packet's class proportions are NOT a prevalence estimate and must never be
 * quoted as one.** Prevalence is `tranche-passage-safety.json`'s job. This file
 * measures the RULES' precision per class, which is the thing R8.3 Correction 3
 * says is missing.
 *
 * Read-only. Writes two files and nothing to the corpus.
 *
 * Usage: services/ingest/node_modules/.bin/tsx scripts/n2-role-blind-packet.mts
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_PACKET = 'docs/ai/new2-r83/role-blind-packet.json';
const OUT_KEY = 'docs/ai/new2-r83/role-blind-key.json';

/** §8.4's operational minimum. Not a confidence bound — an error-discovery floor. */
const MIN_PACKET = 200;
/** Per (role x court) cell. Rare classes will not fill; that is reported, not padded. */
const PER_CELL = 14;
/** How many passages to classify in order to fill the cells. */
const SCAN = Number(process.env.N2_SCAN ?? 60000);

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

type Role =
  | 'SPAN_UNVERIFIABLE'
  | 'DAMAGED_OR_OCR_SUSPECT'
  | 'REPORTER_EDITORIAL'
  | 'CASE_HEADER'
  | 'PARTY_SUBMISSION'
  | 'QUOTED_PRECEDENT'
  | 'PROCEDURAL_HISTORY'
  | 'HOLDING_OPERATIVE'
  | 'COURT_REASONING'
  | 'FACTS'
  | 'OTHER_UNKNOWN';

// eslint-disable-next-line no-control-regex -- detecting control characters is the job
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/;
const COLLAPSED_GLYPH = /([A-Za-z]\s){12,}/;

/**
 * Identical rules to `n2-tranche-passage-safety.mts`, and they return WHICH
 * rule fired as well as the label. The rule id is what makes FIFTH's
 * disagreements diagnostic rather than merely adversarial: a class that fails
 * can be traced to the one regex that produced it.
 */
function classify(text: string, spanOk: boolean): { role: Role; rule: string } {
  if (!spanOk) return { role: 'SPAN_UNVERIFIABLE', rule: 'span:slice-length-mismatch' };
  const t = text.trim();
  if (t.length === 0) return { role: 'SPAN_UNVERIFIABLE', rule: 'span:empty' };

  const ctrl = (t.match(new RegExp(CONTROL_CHARS, 'g')) ?? []).length;
  if (ctrl / t.length > 0.002) return { role: 'DAMAGED_OR_OCR_SUSPECT', rule: 'damage:control-char-density>0.002' };
  if (COLLAPSED_GLYPH.test(t)) return { role: 'DAMAGED_OR_OCR_SUSPECT', rule: 'damage:collapsed-glyph-run' };

  if (/\bheadnote\b|\bHELD\s*:|editorial note|\bsyllabus\b|running head/i.test(t))
    return { role: 'REPORTER_EDITORIAL', rule: 'reporter:headnote|HELD:|syllabus' };
  if (/^\s*(IN THE (HIGH COURT|SUPREME COURT)|BEFORE\b|CORAM\b)|versus\s|\bPetitioner\b.*\bRespondent\b/i.test(t.slice(0, 400)))
    return { role: 'CASE_HEADER', rule: 'header:court-line|versus|petitioner-respondent' };
  if (/learned counsel (for|appearing)|it is (submitted|contended|argued) (by|on behalf)|\bMr\.\s+\w+,?\s+learned/i.test(t))
    return { role: 'PARTY_SUBMISSION', rule: 'party:learned-counsel|it-is-submitted' };
  if (/^\s*["“]|\bthe (Supreme Court|Apex Court) (has )?(held|observed) (in|that)\b.*[:：]\s*["“]/i.test(t))
    return { role: 'QUOTED_PRECEDENT', rule: 'quote:opens-with-quote|apex-court-held-colon-quote' };
  if (/\blisted (on|for)\b|\bregistry\b|\bnotice (be )?issued\b|\badjourn/i.test(t))
    return { role: 'PROCEDURAL_HISTORY', rule: 'procedure:listed|registry|notice-issued|adjourn' };
  if (/\b(appeal|petition|application) is (hereby )?(allowed|dismissed|disposed)\b|\bimpugned (order|judgment) is (set aside|quashed)\b/i.test(t))
    return { role: 'HOLDING_OPERATIVE', rule: 'holding:allowed-dismissed-disposed|set-aside' };
  if (/\b(I|we) am (of the view|satisfied)\b|\bin my (considered )?(view|opinion)\b|\bwe are of the (considered )?opinion\b/i.test(t))
    return { role: 'COURT_REASONING', rule: 'reasoning:first-person-view|opinion' };
  if (/\bprosecution case\b|\bFIR (was )?(registered|lodged)\b|\bbriefly stated,? the facts\b/i.test(t))
    return { role: 'FACTS', rule: 'facts:prosecution-case|FIR-registered' };
  return { role: 'OTHER_UNKNOWN', rule: 'default:no-rule-fired' };
}

/** Deterministic shuffle, so the packet order is reproducible and carries no signal. */
function shuffle<T>(xs: T[], seed: string): T[] {
  return xs
    .map((x, i) => ({ x, k: createHash('md5').update(`${seed}:${i}`).digest('hex') }))
    .sort((a, b) => (a.k < b.k ? -1 : 1))
    .map((v) => v.x);
}

const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 60, connect_timeout: 20 });

async function main(): Promise<void> {
  const [tot] = await sql<{ passages: number }[]>`
    select count(*)::int as passages from new1_tranche_passages`;
  console.log(`tranche          ${tot!.passages.toLocaleString()} passages`);

  // Same deterministic md5 draw as the prevalence study, widened, so the packet
  // is drawn from the same frame that produced the published rates.
  const rows = await sql<
    {
      judgment_id: string;
      chunk_index: number;
      char_offset: number;
      body_length: number;
      court: string | null;
      judgment_date: string | null;
      slice: string | null;
    }[]
  >`
    select p.judgment_id, p.chunk_index, p.char_offset, p.body_length,
           j.court, j.judgment_date::text as judgment_date,
           substr(j.full_text, p.char_offset + 1, p.body_length) as slice
      from new1_tranche_passages p
      join judgments j on j.id = p.judgment_id
     where ('x' || substr(md5(p.judgment_id::text || ':' || p.chunk_index), 1, 8))::bit(32)::bigint % 7 = 0
     limit ${SCAN}`;
  console.log(`classified       ${rows.length.toLocaleString()} passages to fill the cells`);

  type Cand = {
    passage_id: string;
    judgment_id: string;
    chunk_index: number;
    char_offset: number;
    body_length: number;
    court: string | null;
    judgment_date: string | null;
    text: string;
    role: Role;
    rule: string;
    forum: 'SUPREME_COURT' | 'HIGH_COURT';
  };

  const cells = new Map<string, Cand[]>();
  const observed: Record<string, number> = {};
  for (const r of rows) {
    const spanOk = r.slice !== null && r.body_length > 0 && r.slice.length === r.body_length;
    const { role, rule } = classify(r.slice ?? '', spanOk);
    observed[role] = (observed[role] ?? 0) + 1;
    const forum = /supreme/i.test(r.court ?? '') ? 'SUPREME_COURT' : 'HIGH_COURT';
    const key = `${role}|${forum}`;
    const bucket = cells.get(key) ?? [];
    // A span-unverifiable passage has no trustworthy text to review, so it is
    // carried with whatever the slice returned and marked ONLY in the key.
    bucket.push({
      passage_id: `${r.judgment_id}:${r.chunk_index}`,
      judgment_id: r.judgment_id,
      chunk_index: r.chunk_index,
      char_offset: r.char_offset,
      body_length: r.body_length,
      court: r.court,
      judgment_date: r.judgment_date,
      text: r.slice ?? '',
      role,
      rule,
      forum,
    });
    cells.set(key, bucket);
  }

  console.log('\nobserved in the scan (this IS a prevalence frame; the packet below is not):');
  for (const [role, n] of Object.entries(observed).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${role.padEnd(24)} ${String(n).padStart(6)}  ${((n / rows.length) * 100).toFixed(2).padStart(6)}%`);
  }

  // Fill cells deterministically: md5 order inside each cell, PER_CELL each.
  const picked: Cand[] = [];
  const cellReport: { cell: string; available: number; taken: number }[] = [];
  for (const [key, bucket] of [...cells.entries()].sort()) {
    const ordered = shuffle(bucket, `cell:${key}`);
    const take = ordered.slice(0, PER_CELL);
    picked.push(...take);
    cellReport.push({ cell: key, available: bucket.length, taken: take.length });
  }

  console.log('\ncells (available -> taken):');
  for (const c of cellReport) console.log(`  ${c.cell.padEnd(40)} ${String(c.available).padStart(6)} -> ${c.taken}`);

  const packetRows = shuffle(picked, 'packet-order-v1');
  console.log(`\npacket size      ${packetRows.length}${packetRows.length < MIN_PACKET ? '  BELOW THE §8.4 MINIMUM' : ''}`);

  const fingerprint = createHash('sha256')
    .update(packetRows.map((p) => p.passage_id).join('\n'))
    .digest('hex');

  mkdirSync(join(ROOT, dirname(OUT_PACKET)), { recursive: true });

  writeFileSync(
    join(ROOT, OUT_PACKET),
    JSON.stringify(
      {
        artifact: 'NEW2_ROLE_BLIND_PACKET',
        lane: 'NEW2',
        for: 'FIFTH — F-5, bus 1321',
        protocol: 'LAWMIND_FINAL_R8_3_LIMITED_FREEZE_ORCHESTRATION_2026-08-26.md §8.4',
        generated_at: new Date().toISOString(),
        sample_fingerprint: fingerprint,
        contains_predictions: false,
        instructions: [
          'Label each passage with ONE role from `label_options`, plus a confidence.',
          'These fields carry NO prediction: court, judgment_date, char_offset and body_length are provenance, not labels.',
          'The order is a deterministic shuffle and carries no class signal.',
          'The class mix is DELIBERATELY not the corpus mix — rare and unsafe classes are oversampled so errors in them are discoverable. Do NOT read prevalence off this file.',
          'The sealed key is docs/ai/new2-r83/role-blind-key.json and shares this sample_fingerprint.',
        ],
        label_options: [
          'SPAN_UNVERIFIABLE',
          'DAMAGED_OR_OCR_SUSPECT',
          'REPORTER_EDITORIAL',
          'CASE_HEADER',
          'PARTY_SUBMISSION',
          'QUOTED_PRECEDENT',
          'PROCEDURAL_HISTORY',
          'HOLDING_OPERATIVE',
          'COURT_REASONING',
          'FACTS',
          'OTHER_UNKNOWN',
        ],
        count: packetRows.length,
        passages: packetRows.map((p) => ({
          passage_id: p.passage_id,
          judgment_id: p.judgment_id,
          chunk_index: p.chunk_index,
          char_offset: p.char_offset,
          body_length: p.body_length,
          court: p.court,
          judgment_date: p.judgment_date,
          text: p.text,
        })),
      },
      null,
      1,
    ) + '\n',
  );

  writeFileSync(
    join(ROOT, OUT_KEY),
    JSON.stringify(
      {
        artifact: 'NEW2_ROLE_BLIND_KEY',
        lane: 'NEW2',
        sealed_for: 'FIFTH — open only after labelling',
        generated_at: new Date().toISOString(),
        sample_fingerprint: fingerprint,
        scan: {
          scanned: rows.length,
          draw: "md5(judgment_id||':'||chunk_index) % 7 = 0, the widened form of the prevalence draw",
          observed_role_counts: observed,
        },
        design: {
          per_cell: PER_CELL,
          cells: cellReport,
          warning: 'oversampled by design; class proportions here are NOT prevalence',
        },
        predictions: packetRows.map((p) => ({
          passage_id: p.passage_id,
          predicted_role: p.role,
          rule_fired: p.rule,
          forum: p.forum,
        })),
      },
      null,
      1,
    ) + '\n',
  );

  console.log(`\nwrote ${OUT_PACKET}`);
  console.log(`wrote ${OUT_KEY}`);
  console.log(`fingerprint ${fingerprint}`);
}

try {
  await main();
} finally {
  await sql.end();
}
