#!/usr/bin/env node
/**
 * EVERY JSON CONFIG IN THIS REPO PARSES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 suggested it, and they suggested it because I shipped the thing it
 * catches. I committed a `.vscode/settings.json` with a missing comma between two
 * array elements — 141 lines of `files.watcherExclude` written specifically to
 * stop the IDE language server dying on multi-megabyte lane artifacts.
 *
 * **VS Code does not partially apply a settings file it cannot parse. It
 * discards the whole thing.** So the fix was inert, and the symptom would have
 * looked exactly like the exclusions not being aggressive enough — the worst
 * possible failure mode, because the obvious next move is to add more patterns
 * to a file nobody is reading.
 *
 * `_journal.json` had already taught the same lesson from the other side: a
 * config that silently does nothing is more expensive than one that fails
 * loudly, and neither is caught by a typechecker.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT CHECKS, AND WHAT IT DELIBERATELY DOES NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Only hand-edited configuration. NOT lane run artifacts — `docs/ai/**` holds
 * multi-megabyte generated JSON, and parsing 16 MB of adjacent-date-pairs on
 * every CI run would make this slow enough to skip, which is how a guard dies.
 *
 * `tsconfig*.json` files are JSONC: they legitimately carry comments and trailing
 * commas, so they are checked with a JSONC-tolerant read rather than
 * `JSON.parse`. `.vscode/settings.json` is ALSO JSONC by spec — but this repo's
 * copy uses `"//"` string keys for its comments precisely so it stays strict
 * JSON, and VS Code's own parser is stricter in practice than the spec suggests.
 * It is checked strictly, on purpose.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Checked with strict `JSON.parse`. A comma here is not a matter of taste. */
const STRICT = [
  '.vscode/settings.json',
  'package.json',
  'packages/db/drizzle/meta/_journal.json',
  '.mcp.json',
];

/** Every workspace `package.json`, found rather than listed. */
function workspacePackageJsons() {
  const out = [];
  for (const dir of ['services', 'packages', 'apps']) {
    const root = join(REPO, dir);
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      const p = join(root, entry, 'package.json');
      if (existsSync(p) && statSync(p).isFile()) out.push(`${dir}/${entry}/package.json`);
    }
  }
  return out;
}

/** JSONC: comments and trailing commas are legal, so strip before parsing. */
function stripJsonc(text) {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 1;
      } else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === '/' && next === '/') {
      inLine = true;
      i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlock = true;
      i += 1;
      continue;
    }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

const problems = [];
let checked = 0;

for (const rel of [...STRICT, ...workspacePackageJsons()]) {
  const path = join(REPO, rel);
  if (!existsSync(path)) continue;
  checked += 1;
  try {
    JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    problems.push({ rel, why: err.message, strict: true });
  }
}

for (const rel of ['tsconfig.json', 'tsconfig.base.json']) {
  const path = join(REPO, rel);
  if (!existsSync(path)) continue;
  checked += 1;
  try {
    JSON.parse(stripJsonc(readFileSync(path, 'utf8')));
  } catch (err) {
    problems.push({ rel, why: err.message, strict: false });
  }
}

if (problems.length === 0) {
  console.log(`json configs: OK — ${checked} file(s) parse`);
  process.exit(0);
}

console.log(`json configs: ${problems.length} problem(s)`);
console.log('');
for (const p of problems) {
  console.log(`  ${p.rel}`);
  console.log(`    ${p.why}`);
}
console.log('');
console.log(
  'A config that does not parse is not partially applied — it is DISCARDED.\n' +
    'VS Code drops the whole settings file, which is how 141 lines of watcher\n' +
    'exclusions shipped inert and looked like they simply were not working.',
);
process.exit(1);
