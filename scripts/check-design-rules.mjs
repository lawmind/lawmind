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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

/** `apps/mobile/src/theme/tokens.ts` — the only hex allowed in a render. */
const PALETTE = new Set(
  [
    '#FBFAF7', '#F2EFE8', '#FFFFFF', '#141B2D', '#5A6478', '#8A8578',
    '#DAD6CB', '#E8E4DA', '#5E1A2B', '#1F6F4A', '#B4690E', '#8A5109',
    '#FBF0DF', '#9E2A33', '#C9A227', '#D9D5CB',
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
    why: 'a score or verdict on a court\'s reasoning cannot be sourced to a primary record.',
    test: (text) => {
      const words = ['probability', 'likelihood', 'winRate', 'soundness', 'vulnerable'];
      return words.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
    },
  },
];

const dir = process.argv[2] ?? 'design/screens';
const files = readdirSync(dir)
  .filter((f) => extname(f) === '.html' || f.endsWith('.dc.html'))
  .filter((f) => statSync(join(dir, f)).isFile());

let failures = 0;
console.log(`checking ${files.length} renders in ${dir}\n`);

for (const file of files) {
  const text = readFileSync(join(dir, file), 'utf8');
  const hits = [];
  for (const rule of RULES) {
    const found = rule.test(text);
    if (found.length > 0) hits.push({ rule, found });
  }
  if (hits.length === 0) continue;

  failures += hits.length;
  console.log(`${file}`);
  for (const { rule, found } of hits) {
    console.log(`  ${rule.id}  ${[...new Set(found)].join(', ')}`);
    console.log(`     ${rule.source}`);
    console.log(`     ${rule.why}`);
  }
  console.log('');
}

if (failures === 0) {
  console.log('all renders pass the written rules');
} else {
  console.log(`${failures} rule violation(s). These are settled rules, not preferences.`);
  process.exitCode = 1;
}
