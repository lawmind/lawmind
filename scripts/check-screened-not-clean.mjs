#!/usr/bin/env node
/**
 * GUARD — `SCREENED_NO_DAMAGE_FOUND` MUST NEVER BE CALLED "CLEAN".
 *
 * The value means: a named screen ran over this document and did not convict.
 * It does NOT mean the text is good. The English-density screen missed 32 of 43
 * glyph dumps whose signature footer lifts the English rate, and
 * `text_quality >= 0.85` certifies documents that are pure garbage.
 *
 * Renaming UNKNOWN to CLEAN is the failure the whole quality_screen_runs design
 * exists to prevent. This guard makes it a build error rather than a promise,
 * because a promise is not a control.
 *
 * It scans SHIPPING code only -- services/**, packages/**, apps/** -- and skips
 * docs and bus messages, which discuss the rule and would trip a naive grep.
 *
 * Exit 0 clean, 1 on a violation.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOTS = ['services', 'packages', 'apps', 'scripts'];
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.sql']);
const SKIP = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', '.turbo']);
const TOKEN = 'SCREENED_NO_DAMAGE_FOUND';
/* "clean" within this many characters of the token, in either direction. A
 * mention of the word inside a sentence that explicitly DENIES the equivalence
 * is the normal case, so the guard looks for assertion shapes, not the word. */
const WINDOW = 240;
const BAD = [
  /SCREENED_NO_DAMAGE_FOUND[^\n]{0,40}(=|===|==|:|means|is)\s*['"`]?clean/i,
  /clean['"`]?\s*(=|===|==|:)[^\n]{0,40}SCREENED_NO_DAMAGE_FOUND/i,
  /SCREENED_CLEAN/,
];

const files = [];
const walk = (d) => {
  let entries;
  try { entries = readdirSync(d); } catch { return; }
  for (const e of entries) {
    if (SKIP.has(e) || e.startsWith('.')) continue;
    const p = join(d, e);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p);
    else if (EXT.has(extname(e))) files.push(p);
  }
};
for (const r of ROOTS) walk(r);
/* The guard names the forbidden shapes in order to detect them, so it would
 * always convict itself. Excluded explicitly rather than by a clever regex. */
const SELF = join('scripts', 'check-screened-not-clean.mjs');

const violations = [];
for (const f of files) {
  if (f === SELF) continue;
  const src = readFileSync(f, 'utf8');
  if (!src.includes(TOKEN) && !src.includes('SCREENED_CLEAN')) continue;
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    for (const re of BAD) {
      if (re.test(line)) violations.push(`${f}:${i + 1}  ${line.trim().slice(0, 120)}`);
    }
  });
  /* The windowed check, for an equivalence spread over two lines. */
  let idx = src.indexOf(TOKEN);
  while (idx !== -1) {
    /* `'clean'` and `"clean"` are the script_quality VALUE, a datum in a
     * NOT IN list, not a claim about the state. Stripped before the test --
     * an equivalence a human would write is bare English, not a SQL literal. */
    const window = src.slice(Math.max(0, idx - WINDOW), idx + WINDOW)
      .replace(/['"]clean['"]/g, '<literal>');
    if (/\bclean\b/i.test(window) && !/not\s+["'`]?clean|never\s+["'`]?clean|is NOT|MUST NEVER|rather than\s+["'`]?clean/i.test(window)) {
      violations.push(`${f}  "clean" appears within ${WINDOW} chars of ${TOKEN} without a denial`);
      break;
    }
    idx = src.indexOf(TOKEN, idx + 1);
  }
}

console.log(`checked ${files.length} shipping files for ${TOKEN} misuse`);
if (violations.length) {
  console.error(`\n${violations.length} VIOLATION(S) -- SCREENED_NO_DAMAGE_FOUND is not "clean":`);
  for (const v of violations) console.error('  ' + v);
  process.exit(1);
}
console.log('OK -- nothing equates SCREENED_NO_DAMAGE_FOUND with clean.');
