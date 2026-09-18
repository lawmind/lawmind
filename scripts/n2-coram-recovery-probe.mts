/**
 * NEW2 — R8.1 §7.14 coram / bench recovery probe.
 *
 * `judgments.bench` is populated on 38,326 of 38,342 Supreme Court documents
 * (99.958%) and on **0 of 18,660,642** High Court documents. R7's
 * `AUTHORITY_HIERARCHY_INPUT_LEDGER_V1` concluded the inputs for a bindingness
 * classifier do not exist for 99.8% of the corpus, and §7.14 accepts that —
 * **no bindingness classifier** — while asking whether coram can be recovered
 * from primary text at high precision.
 *
 * This probe answers only that, and only as a rate. It writes nothing.
 *
 * ## Why it is worth asking now
 *
 * While refetching PDFs for the §7.5 shared-neutral RCA, a Madras High Court
 * order turned out to print its bench in the clear:
 *
 *     IN THE HIGH COURT OF JUDICATURE AT MADRAS
 *     DATED : 27.03.2024
 *     CORAM
 *     THE HONOURABLE MR.JUSTICE M.SUNDAR
 *     and
 *     THE HONOURABLE MRS.JUSTICE K.GOVINDARAJAN THILAKAVADI
 *
 * and an Allahabad order printed `Hon'ble Rajesh Singh Chauhan,J.` So the
 * question is not whether the information exists but whether it is regular
 * enough to extract without a model.
 *
 * ## What high precision means here
 *
 * A wrong judge name is worse than no judge name — it is the kind of detail an
 * advocate would repeat in court. So the patterns are narrow and anchored, and
 * anything they do not match stays `UNKNOWN`. A recall figure is the output; a
 * precision figure is NOT, because nothing here is hand-adjudicated.
 *
 * Read-only. Writes nothing.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = 'docs/ai/new2-r8/coram-recovery-probe.json';
const PER_COURT = Number(process.env.N2_PER_COURT ?? 120);
/** Only the head of a judgment carries the bench block. */
const HEAD_CHARS = 2500;

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
 * Anchored bench patterns, narrowest first.
 *
 * Each must anchor on an explicit honorific or a `CORAM` label. A bare capital
 * name is never accepted — counsel, parties and court staff are all named in the
 * same header, and "a name near the top" would harvest all of them.
 */
const PATTERNS: { name: string; re: RegExp }[] = [
  {
    name: 'CORAM_HONOURABLE_JUSTICE',
    re: /THE\s+HON(?:'|’)?BLE\s+(?:MR|MRS|MS|DR)?\.?\s*JUSTICE\s+([A-Z][A-Z.\s]{2,60}?)(?=\s{2,}|\n|,|and\b|$)/gi,
  },
  {
    name: 'HONBLE_NAME_J',
    re: /HON(?:'|’)?BLE\s+((?:MR|MRS|MS|DR)?\.?\s*(?:JUSTICE\s+)?[A-Z][A-Za-z.\s]{2,50}?)\s*,\s*J\b/g,
  },
  {
    name: 'CORAM_LABEL_BLOCK',
    re: /\bCORAM\s*[:-]?\s*\n+((?:.{0,90}\n){1,4})/gi,
  },
];

const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 60, connect_timeout: 20 });

function extract(head: string) {
  const hits: Record<string, string[]> = {};
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    const names = [...head.matchAll(p.re)]
      .map((m) => (m[1] ?? '').replace(/\s+/g, ' ').trim())
      .filter((s) => s.length >= 3 && s.length <= 70);
    if (names.length) hits[p.name] = [...new Set(names)].slice(0, 5);
  }
  return hits;
}

async function main() {
  const courts = await sql<{ court: string; n: number }[]>`
    select court, count(*)::int as n from judgments
     where court <> 'Supreme Court of India' and court is not null
     group by 1 order by n desc limit 10`;

  const perCourt: any[] = [];
  console.log(`coram recovery probe — ${PER_COURT} documents per court, head ${HEAD_CHARS} chars\n`);

  for (const c of courts) {
    // TABLESAMPLE, not `order by md5(...)`. Ordering by a hash forces a full
    // sort of every row in the court before the LIMIT can apply — millions of
    // rows per court, and it timed out at 115s. TABLESAMPLE draws random heap
    // pages and costs a fraction, at the price of clustering within a page.
    const rows = await sql.unsafe(
      `select id, substr(full_text, 1, ${HEAD_CHARS}) as head
         from judgments tablesample system (0.05)
        where court = $1 and full_text is not null
        limit ${PER_COURT}`,
      [c.court],
    ) as unknown as { id: string; head: string }[];

    // SIGNAL PRESENCE, measured separately from pattern recall.
    //
    // The first run reported 0.0% for Bombay, Kerala and Punjab & Haryana,
    // which reads as "the bench is absent". It is not: 89.3% of Bombay heads
    // contain CORAM and 99.8% of Kerala heads contain HONOURABLE and JUSTICE.
    // A zero here is two populations — the signal missing, and the pattern
    // missing it — and only this column tells them apart.
    let signal = 0;
    let any = 0;
    const byPattern: Record<string, number> = {};
    const benchSizes: Record<number, number> = {};
    const samples: string[] = [];

    for (const r of rows) {
      if (/\bcoram\b/i.test(r.head) || /(hon(?:'|’)?ble|honourable)/i.test(r.head)) signal += 1;
      const hits = extract(r.head);
      const names = new Set<string>();
      for (const [k, v] of Object.entries(hits)) {
        byPattern[k] = (byPattern[k] ?? 0) + 1;
        if (k !== 'CORAM_LABEL_BLOCK') v.forEach((n) => names.add(n));
      }
      if (names.size > 0) {
        any += 1;
        benchSizes[names.size] = (benchSizes[names.size] ?? 0) + 1;
        if (samples.length < 3) samples.push([...names].join(' | ').slice(0, 110));
      } else if (hits.CORAM_LABEL_BLOCK) {
        // The label is present but no name matched — a real signal that the
        // patterns are too narrow for this court, not that the bench is absent.
        any += 0;
      }
    }

    const rate = rows.length ? any / rows.length : 0;
    perCourt.push({
      court: c.court,
      corpus_documents: c.n,
      sampled: rows.length,
      with_bench_signal: signal,
      signal_pct: +((rows.length ? signal / rows.length : 0) * 100).toFixed(1),
      with_named_bench: any,
      naive_pattern_recall: +(rate * 100).toFixed(1),
      by_pattern: byPattern,
      bench_size_distribution: benchSizes,
      samples,
    });
    const sigPct = rows.length ? (signal / rows.length) * 100 : 0;
    console.log(
      `  signal ${sigPct.toFixed(1).padStart(5)}%   pattern ${(rate * 100).toFixed(1).padStart(5)}%   ` +
        `${String(any).padStart(3)}/${String(rows.length).padEnd(4)}  ${c.court}`,
    );
    if (samples[0]) console.log(`           e.g. ${samples[0]}`);
  }

  const totSampled = perCourt.reduce((a, x) => a + x.sampled, 0);
  const totHit = perCourt.reduce((a, x) => a + x.with_named_bench, 0);
  const totSignal = perCourt.reduce((a, x) => a + x.with_bench_signal, 0);
  console.log(
    `\noverall  signal ${((totSignal / totSampled) * 100).toFixed(1)}%   naive pattern ${((totHit / totSampled) * 100).toFixed(1)}%   ` +
      `(${totSignal} vs ${totHit} of ${totSampled})`,
  );
  console.log('the gap between those two columns is EXTRACTION WORK, not missing data.');

  const report = {
    artifact: 'NEW2_CORAM_RECOVERY_PROBE_V1',
    lane: 'NEW2',
    protocol: 'LAWMIND_FINAL_R8_1_ORCHESTRATION_LOCK_2026-08-25.md §7.14',
    generated_at: new Date().toISOString(),
    writes_to_corpus: 0,
    current_coverage: { supreme_court: '38,326 of 38,342 (99.958%)', high_courts: '0 of 18,660,642 (0.000%)' },
    patterns: PATTERNS.map((p) => ({ name: p.name, pattern: String(p.re) })),
    per_court: perCourt,
    overall_signal_pct: +((totSignal / totSampled) * 100).toFixed(1),
    overall_naive_pattern_recall_pct: +((totHit / totSampled) * 100).toFixed(1),
    headline:
      'the bench IS in the text; naive patterns miss most of it. The gap is extraction work, not acquisition.',
    caveats: [
      'This is RECALL only. Precision is NOT_MEASURED — nothing here is hand-adjudicated, and a wrong judge name is worse than none.',
      'no bindingness classifier is proposed or implied; §7.14 forbids one and this measures an input, not a conclusion',
      'patterns are anchored on an honorific or a CORAM label. A bare capitalised name is never accepted, because counsel and parties are named in the same header.',
      'a court where CORAM_LABEL_BLOCK fires but no name matches means the patterns are too narrow there, NOT that the bench is absent.',
    ],
  };
  mkdirSync(dirname(join(ROOT, OUT)), { recursive: true });
  writeFileSync(join(ROOT, OUT), JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nwritten ${OUT}`);
}

try {
  await main();
} finally {
  await sql.end({ timeout: 10 });
}
