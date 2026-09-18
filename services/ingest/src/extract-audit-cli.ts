/**
 * `pnpm --filter @lawmind/ingest extract:audit` — re-extracts a sample of
 * documents with poppler and compares the result against what is stored, per
 * court.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE QUESTION THIS ANSWERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `text-corruption.ts` deliberately only fires on SEVERE damage — a third of
 * tokens reduced to single letters. That found 2,403 broken Bombay judgments
 * and 0.00% everywhere else, but it says nothing about **partial** loss: a
 * document that drops one glyph in twenty reads fine, scores clean, and is
 * still missing text.
 *
 * So this compares lengths directly rather than trusting the detector. If
 * poppler consistently returns materially more text than what we stored, we are
 * losing content across the whole corpus and not merely at one court, and the
 * detector's clean bill of health is a measurement artefact.
 *
 * READ-ONLY. It writes nothing, changes nothing, and exists purely to size the
 * problem before anyone decides to re-extract 79,000 documents.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import postgres from 'postgres';
import { sslFor } from './db-ssl';

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(dbUrl, { ssl: sslFor(dbUrl), max: 2 });

const arg = (n: string, d: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d;
};
const PER_COURT = Number(arg('per-court', '12'));

/**
 * Poppler ships with Git for Windows but is NOT on the PATH of a process
 * launched outside Git Bash. A detached worker started from PowerShell died on
 * `spawnSync pdftotext ENOENT` for every document, while the identical command
 * worked interactively — so the binary is resolved explicitly, with the bare
 * name kept as the fallback for machines where it is properly installed.
 * `PDFTOTEXT_PATH` overrides both.
 */
const PDFTOTEXT =
  process.env['PDFTOTEXT_PATH'] ??
  (existsSync('C:/Program Files/Git/mingw64/bin/pdftotext.exe')
    ? 'C:/Program Files/Git/mingw64/bin/pdftotext.exe'
    : 'pdftotext');

function pdftotext(bytes: Uint8Array): string | null {
  let dir: string | null = null;
  try {
    dir = mkdtempSync(join(tmpdir(), 'lawmind-audit-'));
    const p = join(dir, 'in.pdf');
    writeFileSync(p, bytes);
    return execFileSync(PDFTOTEXT, ['-q', p, '-'], { encoding: 'utf8', maxBuffer: 200e6 });
  } catch {
    return null;
  } finally {
    if (dir !== null) rmSync(dir, { recursive: true, force: true });
  }
}

console.log('EXTRACTION AUDIT — stored (unpdf) vs poppler, by court');
console.log('='.repeat(78));

const courts = await sql<{ court: string; n: number }[]>`
  SELECT court, count(*)::int AS n FROM judgments
  WHERE full_text IS NOT NULL AND source_url IS NOT NULL
  GROUP BY 1 HAVING count(*) >= 20 ORDER BY 2 DESC`;

type Row = {
  court: string;
  sampled: number;
  better: number;
  worse: number;
  same: number;
  gainPct: number;
};
const out: Row[] = [];

for (const c of courts) {
  const rows = await sql<{ sourceUrl: string; fullText: string }[]>`
    SELECT source_url AS "sourceUrl", full_text AS "fullText"
    FROM judgments WHERE court = ${c.court} AND full_text IS NOT NULL AND source_url IS NOT NULL
    ORDER BY md5(id::text || 'audit-v1') LIMIT ${PER_COURT}`;

  let sampled = 0;
  let better = 0;
  let worse = 0;
  let same = 0;
  let storedTotal = 0;
  let popplerTotal = 0;

  for (const r of rows) {
    let text: string | null;
    try {
      const res = await fetch(r.sourceUrl);
      if (!res.ok) continue;
      text = pdftotext(new Uint8Array(await res.arrayBuffer()));
    } catch {
      continue;
    }
    if (text === null) continue;
    sampled++;
    storedTotal += r.fullText.length;
    popplerTotal += text.length;
    // 5% either way is noise: whitespace handling differs between the two.
    const ratio = text.length / Math.max(1, r.fullText.length);
    if (ratio > 1.05) better++;
    else if (ratio < 0.95) worse++;
    else same++;
  }

  if (sampled === 0) continue;
  const gainPct = storedTotal > 0 ? (100 * (popplerTotal - storedTotal)) / storedTotal : 0;
  out.push({ court: c.court, sampled, better, worse, same, gainPct });
  console.log(
    `  ${c.court.slice(0, 34).padEnd(34)} n=${String(sampled).padStart(3)}  ` +
      `poppler bigger ${String(better).padStart(3)} · same ${String(same).padStart(3)} · smaller ${String(worse).padStart(3)}  ` +
      `total text ${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%`,
  );
}

console.log('');
console.log('READING THIS');
console.log('='.repeat(78));
const lossy = out.filter((r) => r.gainPct > 10);
if (lossy.length === 0) {
  console.log('No court shows material text loss beyond the ones already repaired.');
} else {
  console.log('Courts where poppler recovers materially more text than we stored:');
  for (const r of lossy.sort((a, b) => b.gainPct - a.gainPct)) {
    console.log(
      `  +${r.gainPct.toFixed(1)}%  ${r.court} (${r.better}/${r.sampled} documents bigger)`,
    );
  }
  console.log('');
  console.log('A positive figure is text we HAVE but never extracted — not new acquisition.');
}

await sql.end();
