#!/usr/bin/env node
/**
 * THE SUNLIGHT CHECK — Gate S0, item 9.
 *
 * `design/DESIGN_SYSTEM.md` §Touch and ergonomics: "The sunlight test is a
 * design gate, not a checkbox — every component is checked at contrast 0.5 /
 * brightness 1.3" (`renders/38-stress-sunlight@2x.png`).
 *
 * An advocate reads this app standing in a court corridor on a cheap Android
 * panel at noon. Contrast that is comfortable indoors can vanish there, and the
 * text that vanishes first is `ink-faint` — which is what citations, dates and
 * CNR numbers are set in.
 *
 * WHAT THIS SCRIPT DOES AND DOES NOT DO.
 *
 * It computes WCAG relative-luminance contrast for every pair the app actually
 * ships, at normal brightness and again under the washout transform. It FAILS
 * only on the sourced rule — WCAG AA, 4.5:1 for body text and 3:1 for large —
 * measured at normal brightness.
 *
 * It does NOT invent a pass mark for the washed-out figures, because
 * `DESIGN_SYSTEM.md` does not state one. Those are printed for a human to
 * judge, which is what "a design gate" means. Automating the arithmetic is not
 * the same as automating the decision, and pretending otherwise would turn a
 * gate into a checkbox — the exact thing the design note warns against.
 *
 * Run: `node scripts/check-sunlight.mjs`
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tokensPath = join(here, '..', 'src', 'theme', 'tokens.ts');
const source = readFileSync(tokensPath, 'utf8');

/** Reads a hex token out of `tokens.ts` — the one file allowed to hold one. */
function token(name) {
  const match = new RegExp(`${name}:\\s*'(#[0-9A-Fa-f]{6})'`).exec(source);
  if (!match) throw new Error(`No token "${name}" in tokens.ts`);
  return match[1];
}

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

/**
 * The washout, in the order a screen applies it: contrast first, then
 * brightness. Both clamp — a display cannot render beyond its own white.
 */
const CONTRAST = 0.5;
const BRIGHTNESS = 1.3;
const clamp = (v) => Math.min(1, Math.max(0, v));
const washOut = (rgb) => rgb.map((c) => clamp(clamp((c - 0.5) * CONTRAST + 0.5) * BRIGHTNESS));

/** WCAG 2.1 relative luminance. */
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (fg, bg) => {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/**
 * Every pair the app actually renders. `large` marks text at 23px or above,
 * where WCAG AA is 3:1 rather than 4.5:1.
 */
const PAIRS = [
  { what: 'Body text · ink on paper', fg: 'ink', bg: 'paper' },
  { what: 'Body text · ink on card', fg: 'ink', bg: 'card' },
  { what: 'Secondary · inkMuted on paper', fg: 'inkMuted', bg: 'paper' },
  { what: 'Secondary · inkMuted on card', fg: 'inkMuted', bg: 'card' },
  { what: 'Citations and dates · inkFaint on paper', fg: 'inkFaint', bg: 'paper' },
  { what: 'Citations and dates · inkFaint on card', fg: 'inkFaint', bg: 'card' },
  { what: 'Case name (large) · ink on paper', fg: 'ink', bg: 'paper', large: true },
  { what: 'Primary action label · card on oxblood', fg: 'card', bg: 'oxblood' },
  { what: 'Accent link · oxblood on paper', fg: 'oxblood', bg: 'paper' },
  { what: 'LAW MOVED · cautionText on cautionWash', fg: 'cautionText', bg: 'cautionWash' },
  { what: 'Set aside · danger on card', fg: 'danger', bg: 'card' },
  { what: 'Danger band label · card on danger', fg: 'card', bg: 'danger' },
];

const AA_BODY = 4.5;
const AA_LARGE = 3;

let failures = 0;
const rows = [];

for (const pair of PAIRS) {
  const fg = hexToRgb(token(pair.fg));
  const bg = hexToRgb(token(pair.bg));
  const normal = ratio(fg, bg);
  const sun = ratio(washOut(fg), washOut(bg));
  const required = pair.large ? AA_LARGE : AA_BODY;
  const passes = normal >= required;
  if (!passes) failures += 1;
  rows.push({ what: pair.what, normal, sun, required, passes });
}

const pad = (s, n) => String(s).padEnd(n);
const num = (n) => `${n.toFixed(2)}:1`;

console.log('\nSUNLIGHT CHECK — contrast 0.5 / brightness 1.3\n');
console.log(`${pad('Pair', 46)}${pad('Normal', 10)}${pad('Sunlight', 10)}${pad('AA', 8)}`);
console.log('-'.repeat(74));
for (const r of rows) {
  console.log(
    `${pad(r.what, 46)}${pad(num(r.normal), 10)}${pad(num(r.sun), 10)}${pad(
      `${r.passes ? 'pass' : 'FAIL'} ${r.required}`,
      8
    )}`
  );
}

const worst = rows.reduce((a, b) => (a.sun < b.sun ? a : b));
console.log(
  `\nWeakest under sunlight: ${worst.what} at ${num(worst.sun)}.` +
    '\nThe washed-out figures are reported, not gated — DESIGN_SYSTEM.md sets no' +
    '\npass mark for them, and inventing one would turn a design gate into a' +
    '\ncheckbox. A human confirms them against renders/38-stress-sunlight@2x.png.\n'
);

if (failures > 0) {
  console.error(`${failures} pair(s) below WCAG AA at normal brightness.`);
  process.exit(1);
}
console.log('Every shipped pair meets WCAG AA at normal brightness.\n');
