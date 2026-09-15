#!/usr/bin/env node
/**
 * Validate delivered design renders against the written rules, before hand-off.
 *
 *   node scripts/check-design-rules.mjs [dir]
 *
 * **Why this exists.** Four renders across two deliveries contradicted rules that
 * were already written down: `state.verified` green used for relationship labels,
 * Devanagari set in letterspaced JetBrains Mono, a second ink-glass surface with
 * an off-palette stroke, and retired footer copy. Individually small; together
 * they meant the hand-off was not being validated against `DESIGN_SYSTEM.md`
 * before delivery, and the client lane was catching them one at a time
 * downstream.
 *
 * Three of the four were mechanically checkable. This is that check, so it costs
 * nothing and runs before anyone builds against a render.
 *
 * It deliberately does NOT try to judge design. It only asserts rules that are
 * already settled and stated elsewhere, and every failure names the rule and its
 * source so the fix is obvious.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

/** `apps/mobile/src/theme/tokens.ts` — the only hex allowed in a render. */
const PALETTE = new Set(
  [
    '#FBFAF7',
    '#F2EFE8',
    '#FFFFFF',
    '#141B2D',
    '#5A6478',
    /**
     * `ink-faint`. `#747064` IS THE SHIPPED VALUE; `#8A8578` is its predecessor.
     *
     * Moved 2 September 2026 because `#8A8578` fails WCAG AA and it is TEXT —
     * citations, dates and metadata, which is the part an advocate reads in a
     * sunlit corridor. `apps/mobile/src/theme/tokens.ts` carries the argument.
     * LCC bus 1757 §5 flagged that this allowlist and `DESIGN_SYSTEM.md` had not
     * followed, which would make this guard reject a render drawn in the colour
     * the app actually ships.
     *
     * BOTH ARE ALLOWED, DELIBERATELY. The 18 existing renders in `design/screens`
     * were drawn against the old value and are visual-language references, not
     * capability truth; rewriting them would be a mass edit to make a guard
     * tidy. New work uses `#747064`.
     */
    '#747064',
    '#8A8578',
    '#DAD6CB',
    '#E8E4DA',
    '#5E1A2B',
    '#1F6F4A',
    '#B4690E',
    '#8A5109',
    '#FBF0DF',
    '#9E2A33',
    '#C9A227',
    '#D9D5CB',
  ].map((h) => h.toUpperCase()),
);

const RULES = [
  {
    id: 'verified-green-in-app',
    source: 'CITATION_HARNESS.md §Rendering — verified is silent',
    why: 'state.verified is the retired verification stamp. It must not appear in an app surface, and it must never label a treatment relationship: verification and treatment are two of the three independent fields.',
    test: (text) => (/#1F6F4A/i.test(text) ? ['#1F6F4A'] : []),
  },
  {
    id: 'retired-copy',
    source: 'DESIGN_SYSTEM.md §Retired / Ships',
    why: 'copy that was explicitly retired must not reappear in a render.',
    test: (text) => {
      const retired = [
        'We verified this citation',
        'Verification failed',
        'citations verified',
        'Safe to file',
      ];
      return retired.filter((phrase) => text.toLowerCase().includes(phrase.toLowerCase()));
    },
  },
  {
    id: 'devanagari-tracking',
    source: 'DESIGN_SYSTEM.md — Devanagari never gets negative tracking',
    why: 'letter-spacing breaks conjuncts. Devanagari must not sit in a mono or tracked style.',
    test: (text) => {
      const found = [];
      // A block carrying Devanagari AND either negative tracking or a mono face.
      const blocks = text.split(/<(?=[a-z])/i);
      for (const b of blocks) {
        if (!/[ऀ-ॿ]/.test(b)) continue;
        if (/letter-spacing:\s*-/.test(b)) found.push('negative tracking on Devanagari');
        if (/JetBrains\s*Mono/i.test(b) && /letter-spacing/.test(b)) {
          found.push('Devanagari in letterspaced JetBrains Mono');
        }
      }
      return found;
    },
  },
  {
    id: 'off-palette-hex',
    source: 'tokens.ts — no hex outside the palette',
    why: 'an off-palette colour is either a new token nobody agreed or a mistake.',
    test: (text) => {
      const seen = new Set();
      for (const m of text.matchAll(/#[0-9A-Fa-f]{6}\b/g)) {
        const hex = m[0].toUpperCase();
        if (!PALETTE.has(hex)) seen.add(hex);
      }
      return [...seen];
    },
  },
  {
    id: 'stale-statute-regime',
    source: 'CLAUDE.md §6 — BNS/BNSS/BSA replaced IPC/CrPC/Evidence Act, July 2024',
    why: 'a render citing IPC or CrPC teaches the wrong regime.',
    test: (text) => {
      const found = [];
      if (/\bIPC\b/.test(text)) found.push('IPC');
      if (/\bCrPC\b/.test(text)) found.push('CrPC');
      return found;
    },
  },
  {
    id: 'unverifiable-verdict',
    source: 'FEATURE_PARITY.md §4 — we decline outcome prediction and soundness rating',
    why: "a score or verdict on a court's reasoning cannot be sourced to a primary record.",
    test: (text) => {
      const words = ['probability', 'likelihood', 'winRate', 'soundness', 'vulnerable'];
      return words.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
    },
  },
];

/**
 * Known violations, carried rather than forgiven.
 *
 * **This gate shipped red, and a permanently red job is a job people learn to
 * ignore.** The three original prototypes predate half the rules they break —
 * `LawMind Screens.dc.html` still carries "Safe to file" because it was drawn
 * before that copy was retired — and the delivered renders carry live
 * divergences the design lane has not fixed yet.
 *
 * A baseline turns the gate into a ratchet: anything already here is reported and
 * counted but does not fail the build; anything NEW does. The known set is
 * printed on every run, so it stays visible instead of quietly becoming the
 * standard. It shrinks by fixing renders, never by re-baselining to go green.
 *
 * Regenerate deliberately, and only alongside the fixes:
 *   node scripts/check-design-rules.mjs design/screens --update-baseline
 */
const BASELINE_FILE = 'scripts/design-rules-baseline.json';

const dir = process.argv[2] ?? 'design/screens';
const updating = process.argv.includes('--update-baseline');

/**
 * **A missing token is not twenty violations. It is one decision.**
 *
 * `#F5EDDC` and `#C3BEB2` were being carried per-file, and the baseline grew by
 * two lines every time a canvas was delivered. That reads as twenty separate
 * mistakes by the design lane. It is not. Counted across all 18 canvases:
 * `#F5EDDC` is the ink on the navy `#141B2D` surface 26 times, and `#C3BEB2` is
 * the dashed edge 9 times out of 9 — unanimous. Both do a job the settled rules
 * REQUIRE (dark surfaces exist; "our own uncertainty is neutral ink with a
 * dashed edge") and for which `tokens.ts` has no token at all.
 *
 * So they are tracked here instead: once, by hex, with the job each one does and
 * the decision owed. This is deliberately NOT forgiveness — the count is printed
 * on every run and the resolution is named. It closes when `tokens.ts` either
 * absorbs them or names a replacement, which is RCC's lane, not this one.
 *
 * Every other off-palette hex still fails the build.
 */
let baseline = {};
let tokenGap = {};
if (existsSync(BASELINE_FILE)) {
  const parsed = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
  baseline = parsed.known ?? {};
  tokenGap = parsed.tokenGap ?? {};
}
const gapHexes = new Set(Object.keys(tokenGap).map((h) => h.toUpperCase()));
/** A violation's identity: which file, which rule, which exact finding. */
const key = (file, ruleId, finding) => `${file} ${ruleId} ${finding}`;
const known = new Set(Object.values(baseline).flat());

const files = readdirSync(dir)
  .filter((f) => extname(f) === '.html' || f.endsWith('.dc.html'))
  .filter((f) => statSync(join(dir, f)).isFile())
  .sort();

let fresh = 0;
let carried = 0;
/** hex → how many canvases use it, so the gap is reported by weight not by row. */
const gapHits = new Map();
const nextBaseline = {};
console.log(`checking ${files.length} renders in ${dir}\n`);

for (const file of files) {
  const text = readFileSync(join(dir, file), 'utf8');
  const lines = [];
  for (const rule of RULES) {
    let found = [...new Set(rule.test(text))];
    if (found.length === 0) continue;

    // Pull the two known token-gap colours out before anything else, and count
    // them by file. They are one open decision, not a violation per canvas.
    if (rule.id === 'off-palette-hex') {
      const gaps = found.filter((f) => gapHexes.has(f.toUpperCase()));
      for (const g of gaps) {
        gapHits.set(g.toUpperCase(), (gapHits.get(g.toUpperCase()) ?? 0) + 1);
      }
      found = found.filter((f) => !gapHexes.has(f.toUpperCase()));
      if (found.length === 0) continue;
    }

    const isNew = found.filter((f) => !known.has(key(file, rule.id, f)));
    const isOld = found.filter((f) => known.has(key(file, rule.id, f)));
    (nextBaseline[file] ??= []).push(...found.map((f) => key(file, rule.id, f)));
    carried += isOld.length;

    if (isNew.length === 0) continue;
    fresh += isNew.length;
    lines.push(`  ${rule.id}  ${isNew.join(', ')}`);
    lines.push(`     ${rule.source}`);
    lines.push(`     ${rule.why}`);
  }
  if (lines.length > 0) console.log(`${file}\n${lines.join('\n')}\n`);
}

if (updating) {
  writeFileSync(
    BASELINE_FILE,
    JSON.stringify(
      {
        note: 'Violations that already existed when the gate landed. New ones still fail. Shrink this by fixing renders, never by regenerating to go green.',
        generated: new Date().toISOString().slice(0, 10),
        known: nextBaseline,
      },
      null,
      2,
    ) + '\n',
  );
  const total = Object.values(nextBaseline).flat().length;
  console.log(
    `wrote ${BASELINE_FILE} — ${total} known violation(s) across ${Object.keys(nextBaseline).length} file(s)`,
  );
  process.exit(0);
}

if (gapHits.size > 0) {
  console.log('token gap — colours the design system uses that tokens.ts does not define:');
  for (const [hex, files_] of [...gapHits].sort((a, b) => b[1] - a[1])) {
    const meta = tokenGap[hex] ?? tokenGap[hex.toLowerCase()] ?? {};
    console.log(`  ${hex}  in ${files_} canvas(es) — ${meta.role ?? 'role not recorded'}`);
    if (meta.resolution) console.log(`     owed: ${meta.resolution}`);
  }
  console.log('  One decision each, not one per render. Closes in tokens.ts (RCC).\n');
}
if (carried > 0) {
  console.log(`${carried} known violation(s) carried in ${BASELINE_FILE} — debt, not permission.`);
}
if (fresh === 0) {
  console.log('no new violations');
} else {
  console.log(`\n${fresh} NEW rule violation(s). These are settled rules, not preferences.`);
  process.exitCode = 1;
}
