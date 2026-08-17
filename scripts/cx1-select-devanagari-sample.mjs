#!/usr/bin/env node
/**
 * Selects a deterministic, read-only CX1 bake-off manifest from NEW2's
 * Devanagari-bearing cohort. No corpus row is modified and full text is not
 * written to the artifact.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import postgres from 'postgres';

const ROOT = resolve(import.meta.dirname, '..');
const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const OUT = resolve(
  ROOT,
  arg('out', 'docs/ai/cx1-devanagari-results/sample-manifest.json'),
);
const SAMPLE_PERCENT = Number(arg('sample-percent', '4'));
const env = readFileSync(resolve(ROOT, '.env'), 'utf8');
const url = env.match(/^LOCAL_DATABASE_URL=(.*)$/m)?.[1]?.trim();
if (!url || !/^postgres(?:ql)?:\/\/[^/]*@?(?:127\.0\.0\.1|localhost)(?::|\/)/i.test(url)) {
  console.error('REFUSING: LOCAL_DATABASE_URL is absent or is not loopback.');
  process.exit(2);
}

const DEVANAGARI = /[\u0900-\u097f]/u;
const DEVANAGARI_BASE = /[\u0904-\u0939\u0958-\u0961\u0972-\u097f]/u;
const MATRA = /[\u093a-\u094c\u094e-\u094f\u0955-\u0957\u0962-\u0963]/u;
const LATIN1 = /[\u00a0-\u00ff]/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;

function classify(text) {
  let orphanedMatras = 0;
  let controlAdjacency = 0;
  let latin1Bleed = 0;
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const prev = chars[i - 1] ?? '';
    const next = chars[i + 1] ?? '';
    if (MATRA.test(ch) && !DEVANAGARI_BASE.test(prev) && !/[\u093c\u094d]/u.test(prev)) {
      orphanedMatras++;
    }
    if (CONTROL.test(ch) && (DEVANAGARI.test(prev) || DEVANAGARI.test(next))) {
      controlAdjacency++;
    }
    if (LATIN1.test(ch) && DEVANAGARI.test(prev) && DEVANAGARI.test(next)) {
      latin1Bleed++;
    }
  }
  const labels = [];
  if (orphanedMatras) labels.push('orphaned_matra');
  if (controlAdjacency) labels.push('control_adjacency');
  if (latin1Bleed) labels.push('latin1_bleed');
  if (!labels.length) labels.push('clean_control');
  return { orphanedMatras, controlAdjacency, latin1Bleed, labels };
}

function choose(candidates, court, cap) {
  const rows = candidates
    .filter((row) => row.court === court)
    .sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  const selected = [];
  const used = new Set();
  const years = new Set();
  const labels = ['control_adjacency', 'latin1_bleed', 'orphaned_matra', 'clean_control'];
  for (const label of labels) {
    const row = rows.find((item) => !used.has(item.id) && item.defects.labels.includes(label));
    if (row) {
      selected.push(row);
      used.add(row.id);
      years.add(row.year);
    }
  }
  while (selected.length < cap) {
    const row = rows
      .filter((item) => !used.has(item.id))
      .sort((a, b) => {
        const aNewYear = years.has(a.year) ? 0 : 1;
        const bNewYear = years.has(b.year) ? 0 : 1;
        const aSeverity = a.defects.labels[0] === 'clean_control' ? 0 : a.defects.labels.length;
        const bSeverity = b.defects.labels[0] === 'clean_control' ? 0 : b.defects.labels.length;
        return bNewYear - aNewYear || bSeverity - aSeverity || a.id.localeCompare(b.id);
      })[0];
    if (!row) break;
    selected.push(row);
    used.add(row.id);
    years.add(row.year);
  }
  return selected;
}

const sql = postgres(url, { ssl: false, max: 1, idle_timeout: 5 });
try {
  const active = await sql`
    SELECT count(*)::int AS n
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND state <> 'idle'
  `;
  if (active[0].n > 0) {
    console.error(`REFUSING: ${active[0].n} other active backend(s) on the canonical cluster.`);
    process.exitCode = 3;
  } else {
    await sql`BEGIN READ ONLY`;
    await sql`SET LOCAL statement_timeout = '15min'`;
    const rows = await sql.unsafe(`
      SELECT id::text, case_title, neutral_citation, reporter_citations,
             court, extract(year from judgment_date)::int AS year,
             source_url, text_extraction_method, full_text
      FROM judgments TABLESAMPLE SYSTEM (${SAMPLE_PERCENT}) REPEATABLE (170817)
      WHERE court IN ('High Court Of Rajasthan', 'Allahabad High Court', 'Patna High Court')
        AND full_text ~ ('[' || chr(2304) || '-' || chr(2431) || ']')
    `);
    await sql`COMMIT`;
    const candidates = rows.map((row) => ({
      id: row.id,
      caseTitle: row.case_title,
      neutralCitation: row.neutral_citation,
      reporterCitations: row.reporter_citations ?? [],
      court: row.court,
      year: row.year,
      sourceUrl: row.source_url,
      textExtractionMethod: row.text_extraction_method,
      storedTextChars: [...row.full_text].length,
      storedTextSha256: createHash('sha256').update(row.full_text).digest('hex'),
      defects: classify(row.full_text),
    }));
    const selected = [
      ...choose(candidates, 'High Court Of Rajasthan', 12),
      ...choose(candidates, 'Allahabad High Court', 12),
      ...choose(candidates, 'Patna High Court', 8),
    ];
    const artifact = {
      kind: 'cx1_devanagari_bakeoff_manifest',
      createdAt: new Date().toISOString(),
      source: 'NEW2 affected cohort in docs/DEVANAGARI_EXTRACTION_DEFECTS.md',
      selection: {
        tableSampleSystemPercent: SAMPLE_PERCENT,
        repeatableSeed: 170817,
        candidates: candidates.length,
        selected: selected.length,
        courts: [...new Set(selected.map((row) => row.court))],
        years: [...new Set(selected.map((row) => row.year))].sort(),
      },
      documents: selected,
    };
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(`wrote ${selected.length} documents to ${OUT}`);
    for (const court of artifact.selection.courts) {
      const courtRows = selected.filter((row) => row.court === court);
      console.log(`${court}: ${courtRows.length} docs, years ${[...new Set(courtRows.map((r) => r.year))].join(', ')}`);
    }
  }
} finally {
  await sql.end({ timeout: 1 });
}
