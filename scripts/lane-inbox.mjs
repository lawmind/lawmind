#!/usr/bin/env node
/**
 * `pnpm lane:inbox` — the whole bus, and what this lane has read.
 *
 * The hook delivers each message **once** and advances a cursor, which is right
 * for a conversation and wrong for an audit. This is the audit: every message
 * either lane has sent, in order, with the read state shown — so *"did they ever
 * actually say that"* is answerable without trusting anyone's memory.
 *
 * `--all` prints bodies. Default prints the index.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// LAWMIND_BUS_DIR: test override only (scripts/lane-bus.test.sh).
const BUS = process.env['LAWMIND_BUS_DIR'] || join(ROOT, '.agents', 'bus');
const FULL = process.argv.includes('--all');

if (!existsSync(BUS)) {
  console.log('no bus yet — .agents/bus/ does not exist. Nothing has been sent.');
  process.exit(0);
}

const cursor = (lane) => {
  const f = join(BUS, `.cursor-${lane.toLowerCase()}`);
  if (!existsSync(f)) return 0;
  const n = Number(readFileSync(f, 'utf8').replace(/\D/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * ACTIVE lanes (SHIP, DATA, RED) receive new mail. LEGACY lanes are history, and
 * their cursors are read too: without them every old message addressed to LCC
 * or NEW2 would suddenly render as PENDING, which is a false statement about
 * what was delivered. Roadmap v7.4 §3.5 (A1).
 */
const ACTIVE_LANES = ['SHIP', 'DATA', 'RED'];
const LEGACY_LANES = ['LCC', 'RCC', 'NEW1', 'NEW2', 'NEW3', 'FIFTH', 'AUDIT-RO'];
const LANES = [...ACTIVE_LANES, ...LEGACY_LANES];
const cursors = Object.fromEntries(LANES.map((l) => [l, cursor(l)]));
const files = readdirSync(BUS)
  .filter((f) => /^\d{4}--/.test(f))
  .sort();

if (files.length === 0) {
  console.log('bus is empty.');
  process.exit(0);
}

console.log(
  `${files.length} message(s) · delivered-up-to: ` +
    ACTIVE_LANES.map((l) => `${l} ${cursors[l]}`).join(' · ') +
    ' · legacy: ' +
    LEGACY_LANES.map((l) => `${l} ${cursors[l]}`).join(' · '),
);
console.log('');

for (const f of files) {
  const raw = readFileSync(join(BUS, f), 'utf8');
  const field = (k) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(raw)?.[1]?.trim() ?? '?';
  const seq = Number(f.slice(0, 4));
  const to = field('to');
  // "delivered" means the recipient's hook has handed it over, not that anyone
  // acted on it. Stated precisely because those are different facts.
  const delivered = seq <= (cursors[to] ?? 0);
  const legacy = LEGACY_LANES.includes(to) ? ' (legacy)' : '';
  console.log(
    `  ${String(seq).padStart(4, '0')}  ${field('from')} → ${to}  ` +
      `${delivered ? '[delivered]' : '[PENDING]  '}${legacy}  ${field('sentAt').slice(0, 16)}  ${field('subject')}`,
  );
  if (FULL) {
    const body = raw.split(/^---$/m).slice(2).join('---').trim();
    console.log(
      body
        .split('\n')
        .map((l) => `        ${l}`)
        .join('\n'),
    );
    console.log('');
  }
}
