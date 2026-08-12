/**
 * `pnpm --filter @lawmind/ingest reextract` — re-extracts documents whose
 * stored text is corrupt, using poppler's `pdftotext` instead of `unpdf`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY: 2,403 BOMBAY JUDGMENTS ARE UNREADABLE, AND IT IS NOT AN OCR PROBLEM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured 12 Aug 2026. Corruption is **entirely confined to Bombay High
 * Court** — 2,403 of 6,493 documents (37.0%), against **0.00%** at the Supreme
 * Court, Patna, Allahabad, Calcutta, Madras and Gauhati.
 *
 * The failure is systematic character DROPPING, not misreading:
 *
 *     stored:  `voc te for t e etitio e`
 *     truth:   `advocate for the petitioner`
 *     stored:  `he S a e f aharash ra`
 *     truth:   `The State of Maharashtra`
 *
 * Those PDFs embed subsetted fonts with an incomplete glyph→Unicode map, and
 * `unpdf` silently drops every glyph it cannot resolve. **No OCR is involved
 * anywhere in this pipeline** — we read the PDF's own text layer — so "a better
 * OCR engine" would not have touched it.
 *
 * `pdftotext` resolves the same fonts correctly. On the first document tested,
 * `unpdf` produced `B MB Y B B niru h Subash aik V S S S a e f Maharash ra`
 * while `pdftotext` produced `IN THE HIGH COURT OF JUDICATURE AT BOMBAY BENCH
 * AT AURANGABAD … Anirudh Suba h Naik VERSUS State Of Mahara htra` — which
 * `text-corruption.ts` scores CLEAN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE THIS OBEYS: NEVER REPLACE GOOD TEXT WITH WORSE TEXT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A row is only rewritten when the stored text is corrupt AND the re-extracted
 * text is clean AND it is not shorter than what is already there. Anything
 * else is left exactly as it was and counted as a refusal. This is a
 * deterministic re-read of the same source PDF — not a model's opinion about
 * what the text should say — but it still writes to canonical `full_text`, so
 * it is dry by default and every decision is reported before any of it runs.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import postgres from 'postgres';

import { classifyCorruption } from './text-corruption.ts';
import { stripUnstorable } from './text.ts';

const APPLY = process.argv.includes('--apply');
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};
const LIMIT = Number(arg('limit', '50'));
const COURT = arg('court', 'Bombay High Court');
/**
 * `corrupt` — only rewrite documents `text-corruption.ts` condemns. That
 *   detector fires on SEVERE damage (a third of tokens reduced to single
 *   letters), which found 2,403 broken Bombay judgments and 0.00% elsewhere.
 *
 * `gain` — rewrite whenever poppler returns materially MORE text, whether or
 *   not the stored text looks corrupt. This exists because the detector's clean
 *   bill of health was a measurement artefact: `extract-audit-cli.ts` compared
 *   lengths directly and found **Allahabad losing 18.1% of its text across
 *   10 of 10 sampled documents**, none of which the detector flags. A document
 *   dropping one glyph in twenty reads fine, scores clean, and is still missing
 *   text.
 *
 * The same audit found the opposite at Punjab and Haryana — poppler returns
 * **54% LESS** there — which is why "never shorter" is enforced in both modes
 * and why this runs per court rather than corpus-wide.
 */
const MODE = arg('mode', 'corrupt') as 'corrupt' | 'gain';
/** In `gain` mode, the percentage more text poppler must return to be worth rewriting. */
const MIN_GAIN = Number(arg('min-gain', '10')) / 100;

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set.');
  process.exit(2);
}
const sql = postgres(dbUrl, { ssl: dbUrl.includes('localhost') ? false : 'require', max: 3 });

const TRANSIENT = /ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|socket|getaddrinfo/i;
async function withDbRetry<T>(what: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const m = err instanceof Error ? `${err.message} ${(err as { code?: string }).code ?? ''}` : String(err);
      if (attempt >= 8 || !TRANSIENT.test(m)) throw err;
      const wait = Math.min(30_000, 1000 * 2 ** attempt);
      console.log(`    db ${what} failed (${m.trim()}) — retry in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

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

function pdftotext(bytes: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), 'lawmind-'));
  try {
    const pdfPath = join(dir, 'in.pdf');
    writeFileSync(pdfPath, bytes);
    // `-q` silences font warnings; `-` writes to stdout. `-layout` is NOT used:
    // it preserves visual columns, which inserts runs of spaces that the
    // downstream citation offsets would then have to account for.
    return execFileSync(PDFTOTEXT, ['-q', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 200e6 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('RE-EXTRACTION — poppler pdftotext over corrupt documents');
console.log('='.repeat(74));
console.log(`court "${COURT}" · mode ${MODE} · limit ${LIMIT} · ${APPLY ? "APPLY (will write full_text)" : "DRY RUN"}`);

/**
 * IDENTIFIERS AND LENGTHS ONLY — never the corpus.
 *
 * The first version selected `full_text` for every document in the court, which
 * for Allahabad is tens of thousands of judgments in a single result set over a
 * shared Railway proxy. The worker sat on that query for minutes before it
 * could touch a document, exactly as `enrich-cli` did before the same fix.
 *
 * `gain` mode never needs the stored text at all — it compares LENGTHS, and the
 * length comes back as a number. `corrupt` mode does need it, so it is fetched
 * per document, only for the documents that reach that branch.
 */
const rows = await withDbRetry(
  'select',
  () => sql<{ id: string; caseTitle: string; sourceUrl: string; storedLength: number }[]>`
    SELECT id, case_title AS "caseTitle", source_url AS "sourceUrl",
           length(full_text) AS "storedLength"
    FROM judgments
    WHERE court = ${COURT} AND full_text IS NOT NULL AND source_url IS NOT NULL
    ORDER BY id`,
);

let examined = 0;
let considered = 0;
let repaired = 0;
let refusedStillCorrupt = 0;
let refusedShorter = 0;
let refusedNoGain = 0;
let fetchFailed = 0;
const started = Date.now();

for (const row of rows) {
  if (repaired + refusedStillCorrupt + refusedShorter + refusedNoGain + fetchFailed >= LIMIT) break;
  examined++;
  /**
   * `corrupt` mode needs the stored text to judge it; `gain` mode does not and
   * must not pay for it. This is the only place the corpus text is read, and
   * only for the documents that actually reach it.
   */
  let before: ReturnType<typeof classifyCorruption> = null;
  if (MODE === 'corrupt') {
    const got = await withDbRetry('load text', () =>
      sql<{ fullText: string }[]>`SELECT full_text AS "fullText" FROM judgments WHERE id = ${row.id}`,
    );
    const stored = got[0]?.fullText;
    if (!stored) continue;
    before = classifyCorruption(stored);
    if (!before?.corrupt) continue;
  }
  // In `gain` mode nothing has been judged corrupt — this counts documents that
  // reached the re-read, which is the honest label for both modes.
  considered++;

  let text: string;
  try {
    const res = await fetch(row.sourceUrl);
    if (!res.ok) throw new Error(`GET ${res.status}`);
    text = stripUnstorable(pdftotext(new Uint8Array(await res.arrayBuffer())));
  } catch (err) {
    fetchFailed++;
    console.log(`  FETCH FAILED ${row.caseTitle.slice(0, 40)} — ${err instanceof Error ? err.message : String(err)}`);
    continue;
  }

  const after = classifyCorruption(text);
  const label = row.caseTitle.slice(0, 42).padEnd(42);

  if (!after || after.corrupt) {
    refusedStillCorrupt++;
    console.log(`  still corrupt   ${label} single=${after?.signals.singleCharRatio.toFixed(2) ?? 'n/a'}`);
    continue;
  }
  /**
   * A shorter result is a worse result even when it scores clean — losing
   * pages to a parser quirk is a silent corpus loss, and the whole point here
   * is to stop losing text. Punjab and Haryana is the live example: poppler
   * returns 54% less there, and without this guard a "repair" pass would have
   * deleted half that court.
   */
  if (text.length < row.storedLength) {
    refusedShorter++;
    console.log(`  refused shorter ${label} ${row.storedLength} -> ${text.length} chars`);
    continue;
  }
  /**
   * In `gain` mode the stored text is not corrupt, so rewriting it must earn
   * its place: a few percent is whitespace handling, not recovered content.
   */
  if (MODE === 'gain' && text.length < row.storedLength * (1 + MIN_GAIN)) {
    refusedNoGain++;
    continue;
  }

  repaired++;
  console.log(
    `  REPAIRED        ${label} ${row.storedLength} -> ${text.length} chars ` +
      `(single ${before?.signals.singleCharRatio.toFixed(2) ?? 'n/a'} -> ${after.signals.singleCharRatio.toFixed(2)})`,
  );
  if (APPLY) {
    await withDbRetry(
      'update',
      () => sql`UPDATE judgments SET full_text = ${text} WHERE id = ${row.id}`,
    );
  }
}

console.log('');
console.log('RESULTS');
console.log('='.repeat(74));
console.log(`examined            ${examined}`);
console.log(`${MODE === 'corrupt' ? 'corrupt found     ' : 'considered        '} ${considered}`);
console.log(`REPAIRED            ${repaired}${APPLY ? ' (written)' : ' (dry run — nothing written)'}`);
console.log(`refused still corrupt ${refusedStillCorrupt}`);
console.log(`refused shorter     ${refusedShorter}`);
console.log(`refused no gain     ${refusedNoGain}`);
console.log(`fetch failed        ${fetchFailed}`);
const attempted = repaired + refusedStillCorrupt + refusedShorter;
console.log(
  `repair rate         ${attempted > 0 ? ((100 * repaired) / attempted).toFixed(1) + '%' : 'n/a'} of documents re-read`,
);
console.log(`wall clock          ${((Date.now() - started) / 1000).toFixed(0)}s`);

await sql.end();
