/**
 * NEW2 — R9 §4. Link the corpus's Indian Evidence Act references to the Act we
 * now hold.
 *
 * ## Why this is a targeted linker and not a re-run of the plan
 *
 * `n2-statute-link-plan.mts` builds the whole `(act_key, act_named)` classification
 * and `n2-statute-link-apply.mts` writes it. Re-running that pair to pick up ONE
 * newly-held Act would also re-link the 1,179 references the R8.3 name-only
 * precision repair deliberately unlinked — the apply's own header records that a
 * post-apply step is mandatory for exactly this reason. Re-introducing a known
 * bad population to gain a new one is not a trade worth making, so this writes
 * only rows that name this Act.
 *
 * ## The rules, all deterministic, no model
 *
 * 1. **`act_key` must be the canonical `INDIAN EVIDENCE ACT`.** That key is
 *    produced by `canonicalAct`, the same function ingest wrote with and
 *    `/search` reads with.
 * 2. **`act_named` must actually name this Act.** An allowlist, not a
 *    blocklist: the printed name must contain `Indian Evidence Act` and must
 *    carry either no year or `1872`. This refuses `Indian Evidence Act, 1972`
 *    and `Indian Evidence Act, 1882` — neither Act exists, so both are
 *    extraction damage, and a linker that "corrects" them is guessing. It also
 *    refuses the OCR wreckage the key attracts (`D Evidence Act`,
 *    `Evidence G Act`), which carry a stray letter where a word was lost.
 * 3. **Bare `Evidence Act` with no `Indian` is refused on and after 1 July
 *    2024.** From that date the Bharatiya Sakshya Adhiniyam governs, courts call
 *    it "the Evidence Act" too, and chronology cannot separate them — BSA (2023)
 *    is older than any such judgment. This is the one place where the safe
 *    answer is to leave the reference unresolved.
 * 4. **The cited section must exist in the Act.** `REFUSE_SECTION_ABSENT` from
 *    the R8.3 precision repair, unchanged.
 * 5. **Chronology.** No link where the judgment predates the Act. Vacuous for an
 *    1872 Act and included anyway, because the guard belongs to the rule and not
 *    to the Act that happened to need it.
 *
 * Rollback manifest written BEFORE the transaction. Dry run by default.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-iea-link.mts
 *   services/ingest/node_modules/.bin/tsx scripts/n2-iea-link.mts --apply
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/ai/new2-r9/iea-link.json';
const ROLLBACK = 'docs/ai/new2-r9/iea-link-rollback.json';
const ACT_ID = 'INDIACODE_547533_iea_1872';
const BSA_COMMENCEMENT = '2024-07-01';
const APPLY = process.argv.includes('--apply');

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

/** Rule 2. The printed name names THIS Act, or it does not get linked. */
function namesThisAct(actNamed: string): { ok: boolean; reason: string } {
  const n = actNamed.replace(/\s+/g, ' ').trim();
  const years = [...n.matchAll(/\b(1[6-9]\d{2}|20\d{2})\b/g)].map((m) => m[1]!);
  if (years.some((y) => y !== '1872')) return { ok: false, reason: `REFUSE_WRONG_YEAR_PRINTED:${years.join(',')}` };
  if (/\bindian?\s+evidence\s+act\b/i.test(n)) return { ok: true, reason: 'NAMED_INDIAN_EVIDENCE_ACT' };
  if (/^(the\s+)?evidence\s+act\b/i.test(n)) return { ok: true, reason: 'NAMED_EVIDENCE_ACT_BARE' };
  return { ok: false, reason: 'REFUSE_NAME_NOT_THIS_ACT' };
}

async function main() {
  const sql = postgres(databaseUrl(), { max: 2, prepare: false, idle_timeout: 20 });
  const takenAt = new Date().toISOString();

  const [act] = await sql<{ id: string; short_title: string; act_year: number }[]>`
    SELECT id::text, short_title, act_year FROM statutes WHERE act_id = ${ACT_ID}
  `;
  if (!act) throw new Error(`statute ${ACT_ID} not held — run n2-act-acquire.mts --act=evidence --apply first`);
  const [secCount] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM statute_sections WHERE statute_id = ${act.id}::uuid
  `;
  console.log(`target  ${act.short_title} (${act.act_year})  statute_id ${act.id}  sections ${secCount!.n}`);

  const candidates = await sql<{
    id: string;
    act_key: string;
    act_named: string;
    section_number: string;
    judgment_date: string | null;
    section_exists: boolean;
  }[]>`
    SELECT r.id::text,
           r.act_key,
           r.act_named,
           r.section_number,
           j.judgment_date::text AS judgment_date,
           EXISTS (
             SELECT 1 FROM statute_sections ss
              WHERE ss.statute_id = ${act.id}::uuid AND ss.section_number = r.section_number
           ) AS section_exists
    FROM judgment_statute_refs r
    JOIN judgments j ON j.id = r.judgment_id
    WHERE r.statute_id IS NULL
      AND r.act_key = 'INDIAN EVIDENCE ACT'
  `;
  console.log(`candidate unlinked refs under the canonical key: ${candidates.length.toLocaleString()}`);

  const refuse: Record<string, number> = {};
  const link: string[] = [];
  const byNamed: Record<string, { linked: number; refused: number }> = {};
  for (const c of candidates) {
    byNamed[c.act_named] ??= { linked: 0, refused: 0 };
    const named = namesThisAct(c.act_named);
    let reason: string | null = null;
    if (!named.ok) reason = named.reason;
    else if (named.reason === 'NAMED_EVIDENCE_ACT_BARE' && c.judgment_date != null && c.judgment_date >= BSA_COMMENCEMENT) {
      reason = 'REFUSE_BARE_NAME_POST_BSA';
    } else if (!c.section_exists) reason = 'REFUSE_SECTION_ABSENT';
    else if (c.judgment_date != null && Number(c.judgment_date.slice(0, 4)) < act.act_year) {
      reason = 'REFUSE_CHRONOLOGY';
    }
    if (reason) {
      refuse[reason] = (refuse[reason] ?? 0) + 1;
      byNamed[c.act_named]!.refused++;
    } else {
      link.push(c.id);
      byNamed[c.act_named]!.linked++;
    }
  }

  const report = {
    takenAt,
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    statuteId: act.id,
    actId: ACT_ID,
    sectionsHeld: Number(secCount!.n),
    candidates: candidates.length,
    wouldLink: link.length,
    refusedByReason: refuse,
    byPrintedName: Object.entries(byNamed)
      .map(([act_named, v]) => ({ act_named, ...v }))
      .sort((a, b) => b.linked + b.refused - (a.linked + a.refused))
      .slice(0, 40),
  };
  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 2));

  console.log(`WOULD LINK  ${link.length.toLocaleString()}`);
  console.log(`refused     ${JSON.stringify(refuse)}`);
  for (const r of report.byPrintedName.slice(0, 14)) {
    console.log(`   ${String(r.linked).padStart(6)} linked · ${String(r.refused).padStart(5)} refused   ${JSON.stringify(r.act_named)}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
    await sql.end();
    return;
  }

  const rollback = { takenAt, script: 'scripts/n2-iea-link.mts', restoreSql: 'UPDATE judgment_statute_refs SET statute_id = NULL WHERE id = ANY($1::uuid[])', refIds: link };
  const rollbackJson = JSON.stringify(rollback, null, 2);
  writeFileSync(join(ROOT, ROLLBACK), rollbackJson);
  console.log(`rollback manifest ${ROLLBACK}  sha256=${createHash('sha256').update(rollbackJson).digest('hex').slice(0, 16)}`);

  let updated = 0;
  await sql.begin(async (tx) => {
    for (let i = 0; i < link.length; i += 1000) {
      const chunk = link.slice(i, i + 1000);
      const res = await tx`
        UPDATE judgment_statute_refs SET statute_id = ${act.id}::uuid WHERE id = ANY(${chunk}::uuid[])
      `;
      updated += res.count;
    }
  });
  console.log(`APPLIED — ${updated.toLocaleString()} references linked`);

  const [after] = await sql<{ n: string; bad: string }[]>`
    SELECT count(*)::text AS n,
           count(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM statute_sections ss WHERE ss.statute_id = ${act.id}::uuid AND ss.section_number = r.section_number
           ))::text AS bad
    FROM judgment_statute_refs r WHERE r.statute_id = ${act.id}::uuid
  `;
  console.log(`RE-CHECK  refs now pointing at this Act: ${after!.n}; of those citing a section it does NOT contain: ${after!.bad}`);
  writeFileSync(join(ROOT, OUT), JSON.stringify({ ...report, applied: updated, recheck: { linkedRefs: Number(after!.n), sectionAbsent: Number(after!.bad) } }, null, 2));
  await sql.end();
}

await main();
