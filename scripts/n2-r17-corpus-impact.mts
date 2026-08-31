/**
 * NEW2 — R17 §4. WHAT THE CANDIDATE RULE WOULD DO TO THE CORPUS.
 *
 * The frozen evaluation population is deliberately ENRICHED with defects — 109
 * of its 550 documents are known-wrong rows — so its precision is a property of
 * that population and **must never be quoted as a corpus rate**. This prices the
 * same two rules on a blind random draw instead: for every document, what does
 * the shipping rule say, what does the candidate say, and how often do they
 * differ and in which direction.
 *
 * No ground truth here on purpose. This answers "how much would change", not
 * "how often is it right" — the frozen set answers that.
 *
 * Read-only. Database, no network.
 *
 * Usage:
 *   services/ingest/node_modules/.bin/tsx scripts/n2-r17-corpus-impact.mts [--anchors 60000]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { neutralCitationFrom } from '../services/ingest/src/harvest/hc-load.ts';
import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
function arg(name: string, dflt: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : (process.argv[i + 1] ?? dflt);
}
const OUT = join(ROOT, arg('out', 'docs/ai/new2-r17/corpus-impact.json'));
const ANCHORS = Number(arg('anchors', '60000'));
const SEED = arg('seed', 'NEW2-R17-IMPACT');

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(Number.parseInt(createHash('sha256').update(SEED).digest('hex').slice(0, 8), 16));
const HEX = '0123456789abcdef';
function randomUuid(): string {
  let s = '';
  for (let i = 0; i < 32; i++) s += HEX[Math.floor(rnd() * 16)];
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

/** The rule that ships today, reproduced here so both arms run on the same text. */
const NEUTRAL_ONE = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/;
function armOld(t: string, year: number): string | null {
  const m = NEUTRAL_ONE.exec(t.slice(0, 3000));
  if (!m) return null;
  const c = Number(m[1]);
  return c === year || c === year - 1 ? m[0] : null;
}

type Row = {
  id: string;
  court: string;
  case_number: string | null;
  cnr: string | null;
  neutral_citation: string | null;
  source_url: string | null;
  full_text: string | null;
};

const sql = postgres(databaseUrl(), { max: 3, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  const takenAt = new Date().toISOString();
  const anchors: string[] = [];
  for (let i = 0; i < ANCHORS; i++) anchors.push(randomUuid());

  const seen = new Set<string>();
  const t2 = { both: 0, agree: 0 } as Record<string, number>;
  /** What a damage screen on top of the shipped rule would cost and buy. */
  const damageScreen = { damagedDocuments: 0, damagedAndAnswered: 0 };
  const transitions: Record<string, number> = {};
  const byCourt: Record<string, { n: number; oldAns: number; newAns: number; lost: number; gained: number; changed: number }> = {};
  const samples: Record<string, { court: string; caseNumber: string | null; old: string | null; cand: string | null; evidence: string }[]> = {};
  let n = 0;

  const BATCH = 250;
  for (let i = 0; i < anchors.length; i += BATCH) {
    const rows = await sql<Row[]>`
      SELECT DISTINCT ON (j.id) j.id, j.court, j.case_number, j.cnr, j.neutral_citation, j.source_url, j.full_text
        FROM unnest(${anchors.slice(i, i + BATCH)}::uuid[]) AS a(anchor)
        CROSS JOIN LATERAL (
          SELECT * FROM judgments x
           WHERE x.id >= a.anchor
             AND x.judgment_date >= DATE '2023-01-01'
             AND x.full_text IS NOT NULL
             AND x.source_url LIKE '%indian-high-court-judgments%'
             AND x.source_url NOT LIKE '%bench=testcase%'
           ORDER BY x.id
           LIMIT 1) j`;
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const t = r.full_text ?? '';
      const py = /year=(\d{4})/.exec(r.source_url ?? '');
      if (!py) continue;
      const year = Number(py[1]);
      n++;

      let ctrl = 0;
      for (let k = 0; k < t.length; k++) {
        const cc = t.charCodeAt(k);
        if ((cc < 32 && cc !== 9 && cc !== 10 && cc !== 13) || (cc >= 0xe000 && cc <= 0xf8ff)) ctrl++;
      }
      const words = t.match(/[A-Za-z]{3,}/g) ?? [];
      const damaged = t.length === 0 || ctrl / t.length > 0.02 || words.length / Math.max(1, t.length / 6) < 0.35;
      if (damaged) damageScreen.damagedDocuments++;

      const o = armOld(t, year);
      const c = neutralCitationFrom(t, year, { caseNumber: r.case_number, cnr: r.cnr });

      if (damaged && c !== null) damageScreen.damagedAndAnswered++;
      const kind =
        o === c ? (o === null ? 'both_null' : 'same_citation') : o === null ? 'gained' : c === null ? 'withdrawn' : 'changed';
      transitions[kind] = (transitions[kind] ?? 0) + 1;
      if (o === c) t2['agree']++;

      const court = r.court || 'unknown';
      byCourt[court] ??= { n: 0, oldAns: 0, newAns: 0, lost: 0, gained: 0, changed: 0 };
      const b = byCourt[court]!;
      b.n++;
      if (o !== null) b.oldAns++;
      if (c !== null) b.newAns++;
      if (kind === 'withdrawn') b.lost++;
      if (kind === 'gained') b.gained++;
      if (kind === 'changed') b.changed++;

      if (kind !== 'both_null' && kind !== 'same_citation') {
        samples[kind] ??= [];
        if (samples[kind]!.length < 40) {
          const at = t.indexOf(o ?? c ?? '');
          samples[kind]!.push({
            court,
            caseNumber: r.case_number,
            old: o,
            cand: c,
            evidence: t.slice(Math.max(0, at - 170), at + 110).replace(/\s+/g, ' ').trim(),
          });
        }
      }
    }
    if ((i / BATCH) % 20 === 0) console.log(`[impact] ${i + BATCH}/${anchors.length} anchors, ${n} documents`);
  }

  const oldAnswers = (transitions['same_citation'] ?? 0) + (transitions['withdrawn'] ?? 0) + (transitions['changed'] ?? 0);
  const newAnswers = (transitions['same_citation'] ?? 0) + (transitions['gained'] ?? 0) + (transitions['changed'] ?? 0);
  const artifact = {
    artifact: 'NEW2_R17_CORPUS_IMPACT',
    lane: 'NEW2',
    takenAt,
    seed: SEED,
    scope: '2023+ AWS Open Data High Court rows with retained text, bench=testcase excluded, random uuid anchors',
    note: 'no ground truth here on purpose — this prices HOW MUCH would change, not how often either rule is right. The frozen evaluation population answers that, and its precision is not a corpus rate.',
    documents: n,
    transitions,
    rates: {
      oldAnswerRate: Number((oldAnswers / n).toFixed(5)),
      candidateAnswerRate: Number((newAnswers / n).toFixed(5)),
      withdrawnRate: Number(((transitions['withdrawn'] ?? 0) / n).toFixed(5)),
      gainedRate: Number(((transitions['gained'] ?? 0) / n).toFixed(5)),
      changedRate: Number(((transitions['changed'] ?? 0) / n).toFixed(5)),
      withdrawnShareOfOldAnswers: oldAnswers === 0 ? null : Number(((transitions['withdrawn'] ?? 0) / oldAnswers).toFixed(5)),
    },
    damageScreen: {
      note: 'a damage screen was measured as arm CAND_D_FURNITURE on the frozen population and is NOT part of the shipped rule; this is what adding it would cost on a blind draw',
      ...damageScreen,
      shareOfCandidateAnswersItWouldWithdraw: newAnswers === 0 ? null : Number((damageScreen.damagedAndAnswered / newAnswers).toFixed(5)),
    },
    byCourt: Object.fromEntries(Object.entries(byCourt).sort((a, b) => b[1].n - a[1].n)),
    samples,
  };
  const body = JSON.stringify(artifact, null, 2);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, body + '\n');
  console.log('[impact] documents', n);
  console.log('[impact] transitions', JSON.stringify(transitions));
  console.log('[impact] rates', JSON.stringify(artifact.rates, null, 1));
  console.log('[impact] wrote', OUT);
} finally {
  await sql.end();
}
