#!/usr/bin/env node
/**
 * Assert that `design/screens/SCREENS.md` tells the truth about the renders
 * directory, in both directions.
 *
 * **Why this exists.** The inventory drifted from the filesystem twice in one
 * week, in opposite directions, and both cost real work:
 *
 * 1. `design/SCREENS.md` said "None is drawn" for rows 88–99 while seven of those
 *    screens had renders on disk. LCC believed the table, told the founder six
 *    screens needed designing, and wrote six briefs for screens that already
 *    existed.
 * 2. `design/screens/SCREENS.md` listed `renders/77-library-three@2x.png` against
 *    the court-rules reader and the fee calculator. That render is the dictionary
 *    only — those two had never been drawn.
 *
 * A table nobody checks is a table that lies. This checks it.
 *
 * **The rule, both ways:**
 * - every render a row names must exist on disk — a row cannot promise a file
 *   that is not there;
 * - a row marked NOT YET DESIGNED must not have an obvious render sitting next to
 *   it — that is how case (1) happened.
 *
 * It deliberately does NOT try to judge whether a render depicts the right
 * screen. `77-library-three` was a correctly-named file pointed at by the wrong
 * rows, and only a human looking at the image could have caught that. This
 * catches the mechanical half.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const INVENTORY = 'design/screens/SCREENS.md';
const RENDER_DIR = 'design/screens/renders';

if (!existsSync(INVENTORY)) {
  console.error(`${INVENTORY} is missing — the screen inventory is the design authority.`);
  process.exit(1);
}

const md = readFileSync(INVENTORY, 'utf8');
const onDisk = new Set(readdirSync(RENDER_DIR));
/**
 * A screen can be delivered as a PNG render OR as a design-canvas `.dc.html`
 * beside the inventory. Both are real deliverables — the August bundle shipped
 * the court-rules reader and the fee calculator as HTML, and a checker that only
 * knew about PNGs would have called them missing.
 */
const canvasOnDisk = new Set(readdirSync('design/screens').filter((f) => f.endsWith('.dc.html')));

const problems = [];

/** Every `renders/…` path the inventory names, with the line it sits on. */
const referenced = new Map();
const canvasReferenced = new Map();
for (const [i, line] of md.split('\n').entries()) {
  // TABLE ROWS ONLY. Prose in this file legitimately quotes filenames that do not
  // exist — the correction notes name the very renders that were missing — and a
  // checker that cannot tell a row from a sentence fails on its own documentation.
  // The rows are the promise; the prose is commentary.
  if (!line.trimStart().startsWith('|')) continue;
  for (const m of line.matchAll(/renders\/([A-Za-z0-9@._-]+\.(?:png|jpg|svg|webp))/g)) {
    if (!referenced.has(m[1])) referenced.set(m[1], i + 1);
  }
  // Backtick-delimited, because canvas filenames contain spaces —
  // `LawMind Admin.dc.html`. A character class without a space silently
  // captured a suffix and reported a file that was never named.
  for (const m of line.matchAll(/`([^`]+\.dc\.html)`/g)) {
    if (!canvasReferenced.has(m[1])) canvasReferenced.set(m[1], i + 1);
  }
}

for (const [file, line] of referenced) {
  if (!onDisk.has(file)) {
    problems.push(`${INVENTORY}:${line} names renders/${file}, which is not on disk`);
  }
}

for (const [file, line] of canvasReferenced) {
  if (!canvasOnDisk.has(file)) {
    problems.push(`${INVENTORY}:${line} names ${file}, which is not in design/screens/`);
  }
}

/**
 * A row that claims to be undrawn while a plausibly-matching render exists.
 *
 * Matching is by the row's screen name against render filenames, which is loose
 * on purpose: this is a prompt to go and look, not a verdict.
 */
for (const [i, line] of md.split('\n').entries()) {
  if (!/NOT YET DESIGNED/i.test(line)) continue;
  const name = line.split('|')[2]?.replace(/\*\*/g, '').trim();
  if (!name) continue;
  const words = name
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 3);
  if (words.length === 0) continue;

  const suspects = [...onDisk].filter((f) => {
    const stem = f.toLowerCase();
    return words.filter((w) => stem.includes(w)).length >= Math.min(2, words.length);
  });
  if (suspects.length > 0) {
    problems.push(
      `${INVENTORY}:${i + 1} marks "${name}" NOT YET DESIGNED, but these renders look like it: ${suspects.join(', ')}. ` +
        `Look at them before believing the row.`,
    );
  }
}

if (problems.length > 0) {
  console.error(`design inventory disagrees with ${RENDER_DIR}:\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    `\nThis has cost real work twice. Fix the row or add the render — do not ignore it.`,
  );
  process.exit(1);
}

console.log(
  `design deliverables ok · ${referenced.size} renders + ${canvasReferenced.size} canvases referenced, ` +
    `all present · ${onDisk.size} renders and ${canvasOnDisk.size} canvases on disk`,
);
