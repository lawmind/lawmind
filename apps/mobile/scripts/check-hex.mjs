#!/usr/bin/env node
/**
 * A COLOUR LITERAL OUTSIDE `src/theme/tokens.ts` IS A DEFECT.
 *
 * Not a lint preference — the rule that keeps the app and the admin desk on one
 * palette. It cannot be enforced retroactively, which is why this runs from
 * Sprint 0 rather than from whenever someone remembers.
 *
 * Catches hex (#FBFAF7, #fff) and functional colour (rgb/rgba/hsl/hsla).
 * Named CSS colours are not caught: `transparent` and `currentColor` are
 * legitimate and a blocklist of the other 140 would be noise.
 *
 * Scope: this app and `apps/admin`, which imports the same tokens file.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const HERE = resolve(import.meta.dirname, '..');
const ROOTS = [
  { label: 'apps/mobile', dir: HERE },
  { label: 'apps/admin', dir: resolve(HERE, '../admin') },
];

/** The one file allowed to hold a colour. */
const TOKENS = resolve(HERE, 'src/theme/tokens.ts');

const SKIP_DIRS = new Set([
  'node_modules',
  '.expo',
  '.next',
  'dist',
  'build',
  'ios',
  'android',
  'assets',
  '.git',
]);
const EXTS = /\.(ts|tsx|js|jsx|mjs|cjs|css|json)$/;

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const FUNCTIONAL = /\b(?:rgba?|hsla?)\s*\(/g;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (EXTS.test(entry)) yield full;
  }
}

/**
 * A colour in a comment is documentation — the design system is quoted all over
 * this codebase on purpose. Block comments are blanked in place so line numbers
 * still point at the real offence.
 */
const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');

const offences = [];

for (const root of ROOTS) {
  for (const file of walk(root.dir)) {
    if (resolve(file) === TOKENS) continue;
    const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((code, i) => {
      const hits = [...(code.match(HEX) ?? []), ...(code.match(FUNCTIONAL) ?? [])];
      if (hits.length) {
        offences.push(`${relative(resolve(HERE, '../..'), file)}:${i + 1}  ${hits.join(' ')}`);
      }
    });
  }
}

if (offences.length) {
  console.error(`Colour literals outside tokens.ts — ${offences.length}:\n`);
  for (const o of offences) console.error('  ' + o);
  console.error('\nEvery colour lives in apps/mobile/src/theme/tokens.ts. Add it there and import it.');
  process.exit(1);
}

console.log('No colour literal outside apps/mobile/src/theme/tokens.ts.');
