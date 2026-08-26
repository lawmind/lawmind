/**
 * NEW2 — R8.1 §7.9 SCR / reporter apparatus structural attribution.
 *
 * ## Why this is not a licensing task
 *
 * §7.9 says to keep legal/licensing policy separate from epistemic attribution,
 * and this script is only the second. Whether we may hold the SCR edition is a
 * founder/counsel question already in `FOUNDER_QUEUE.md`. Whether a sentence
 * printed by a law reporter may be shown to an advocate as something *the court
 * said* is a data-truth question, and the answer is no.
 *
 * ## Why it is urgent rather than tidy
 *
 * Two independent R8 findings collided here:
 *
 *   - The Supreme Court corpus is the cleanest and most-cited part of the
 *     corpus — 99.3% of highly-cited authorities, 0.00% measured damage — and
 *     R7 measured 35,570 of its 38,342 documents carrying a reporter running
 *     head. **Its readability and its apparatus have the same cause.**
 *   - R7's treatment pilot refuted 11 of 11 candidates, and at least four were
 *     refuted *because the evidence window was reporter apparatus* — an SCR
 *     headnote list, margin letters, a pin-cite like `[801-G-H; 802-A-B]`.
 *
 * So apparatus is not a cosmetic problem. It is already manufacturing evidence
 * in the one place the product cannot afford it.
 *
 * ## What "structural" means here
 *
 * Detection is by TYPOGRAPHIC SHAPE, not vocabulary. A headnote does not
 * announce itself, but a reporter's page furniture has a form that court prose
 * never takes: margin letters alone on a line, page-and-paragraph pin-cites,
 * a running head repeating the case name, `HEADNOTE:` blocks, and the
 * `[Para 30]` cross-reference style. Vocabulary detection would convict a court
 * quoting a headnote, which is a different thing.
 *
 * Read-only. Writes nothing.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/ai/new2-r8/reporter-apparatus.json';
const SAMPLE = Number(process.env.N2_SAMPLE ?? 1200);

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

/**
 * Structural markers of reporter page furniture.
 *
 * Each is a SHAPE a court's own prose does not produce. They are deliberately
 * narrow: a marker that also fires on judicial text would convert this from a
 * measurement into a smear.
 */
const MARKERS: { name: string; re: RegExp; why: string }[] = [
  {
    name: 'MARGIN_LETTER_LINE',
    re: /^[ \t]*[A-H][ \t]*$/gm,
    why: 'a single margin letter alone on a line — SCR/AIR column guides, never court prose',
  },
  {
    name: 'PAGE_PARA_PINCITE',
    re: /\[\s*\d{1,4}\s*-\s*[A-H](\s*,\s*[A-H])*\s*(;\s*\d{1,4}\s*-\s*[A-H](\s*,\s*[A-H])*\s*)*\]/g,
    why: 'reporter pin-cite to page and margin letter, e.g. [801-G-H; 802-A-B]',
  },
  {
    name: 'HEADNOTE_BLOCK',
    re: /^\s*(HEADNOTES?|HEAD ?NOTE)\s*[:\-—]/gim,
    why: 'an explicit headnote heading — the reporter editor summarising the case',
  },
  {
    name: 'PARA_CROSSREF',
    re: /\[\s*Paras?\.?\s*\d+(\s*[,and]+\s*\d+)*\s*\]/gi,
    why: 'editorial cross-reference into the judgment body, added by the reporter',
  },
  {
    name: 'RUNNING_HEAD',
    re: /^\s*\d{0,4}\s*S\.?C\.?R\.?\s*(\[|\()?\s*\d{4}/gm,
    why: 'a page running head carrying the reporter name and year',
  },
  {
    name: 'DISPOSAL_APPARATUS',
    re: /^\s*(CIVIL|CRIMINAL) APPELLATE JURISDICTION\s*[:\-]?\s*$/gim,
    why: 'the reporter\'s standard jurisdiction banner above the case',
  },
];

const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 60, connect_timeout: 20 });

function markerHits(text: string) {
  const hits: Record<string, number> = {};
  let total = 0;
  for (const m of MARKERS) {
    const n = (text.match(m.re) ?? []).length;
    hits[m.name] = n;
    total += n;
  }
  return { hits, total };
}

async function main() {
  // Supreme Court is the population §7.9 is about — R7 measured the running
  // head on 35,570 of 38,342 SC documents. High Courts are sampled alongside as
  // a CONTROL: if the markers fire at the same rate there, they are detecting
  // something other than reporter apparatus.
  const rows = await sql<{ id: string; court: string; full_text: string }[]>`
    (select id, court, full_text from judgments
      where court = 'Supreme Court of India' and full_text is not null
      order by md5(id::text) limit ${SAMPLE})
    union all
    (select id, court, full_text from judgments
      where court <> 'Supreme Court of India' and full_text is not null
      order by md5(id::text) limit ${SAMPLE})`;

  const groups: Record<string, {
    documents: number;
    with_any_marker: number;
    marker_totals: Record<string, number>;
    docs_with_marker: Record<string, number>;
    apparatus_chars: number;
    total_chars: number;
  }> = {};

  for (const r of rows) {
    const g = r.court === 'Supreme Court of India' ? 'SUPREME_COURT' : 'HIGH_COURTS_CONTROL';
    groups[g] ??= { documents: 0, with_any_marker: 0, marker_totals: {}, docs_with_marker: {}, apparatus_chars: 0, total_chars: 0 };
    const grp = groups[g];
    grp.documents += 1;
    grp.total_chars += r.full_text.length;

    const { hits, total } = markerHits(r.full_text);
    if (total > 0) grp.with_any_marker += 1;
    for (const [k, n] of Object.entries(hits)) {
      grp.marker_totals[k] = (grp.marker_totals[k] ?? 0) + n;
      if (n > 0) grp.docs_with_marker[k] = (grp.docs_with_marker[k] ?? 0) + 1;
    }

    // A crude but honest apparatus-volume proxy: characters on lines that are
    // margin letters or that contain a pin-cite. It UNDERSTATES headnote
    // volume, because a headnote paragraph reads like prose and only its
    // heading is structural. Recorded as a floor, never as the share.
    for (const line of r.full_text.split(/\r?\n/)) {
      if (/^[ \t]*[A-H][ \t]*$/.test(line) || MARKERS[1].re.test(line)) grp.apparatus_chars += line.length;
      MARKERS[1].re.lastIndex = 0;
    }
  }

  console.log('structural reporter-apparatus markers\n');
  for (const [g, v] of Object.entries(groups)) {
    console.log(`${g}   ${v.documents} documents`);
    console.log(`  any marker present      ${v.with_any_marker}  (${((v.with_any_marker / v.documents) * 100).toFixed(1)}%)`);
    for (const m of MARKERS) {
      const d = v.docs_with_marker[m.name] ?? 0;
      console.log(`    ${m.name.padEnd(20)} in ${String(d).padStart(5)} docs (${((d / v.documents) * 100).toFixed(1).padStart(5)}%)   ${v.marker_totals[m.name] ?? 0} hits`);
    }
    console.log(`  apparatus chars (FLOOR) ${((v.apparatus_chars / v.total_chars) * 100).toFixed(3)}% of text\n`);
  }

  const report = {
    artifact: 'NEW2_REPORTER_APPARATUS_V1',
    lane: 'NEW2',
    protocol: 'LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md §7.9',
    generated_at: new Date().toISOString(),
    detection: 'structural / typographic shape, NOT vocabulary',
    markers: MARKERS.map((m) => ({ name: m.name, why: m.why, pattern: String(m.re) })),
    groups,
    scope_note:
      'High Courts are a CONTROL group. If the markers fire at the same rate there, they are not detecting reporter apparatus.',
    caveats: [
      'apparatus_chars is a FLOOR. It counts margin-letter lines and pin-cite lines only; a headnote paragraph reads like prose and only its heading is structural.',
      'no document is reclassified and nothing is written. This measures; it does not act.',
      'precision against hand adjudication is NOT_MEASURED.',
      'OFFICIAL_REPORTER classification of the SC corpus is asserted from R7 (35,570 of 38,342 carry a running head), not re-derived here.',
    ],
  };
  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 2), 'utf8');
  console.log(`written ${OUT}`);
}

try {
  await main();
} finally {
  await sql.end({ timeout: 10 });
}
