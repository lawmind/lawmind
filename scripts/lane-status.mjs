#!/usr/bin/env node
/**
 * `pnpm lane:status` — is the bus actually reaching everyone?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE QUESTION THIS EXISTS TO ANSWER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `lane:inbox` shows the thread. It does not show whether a lane is *receiving*
 * it. Those are different, and today they disagreed: **NEW1, NEW2 and NEW3 have
 * binding files but no cursor files**, while all three plainly have read
 * messages — they quote them back accurately.
 *
 * Both explanations are consistent with that state and they need different
 * fixes:
 *
 * - the hook is not firing for them, and they are reading `lane:inbox` by hand;
 * - or the hook fires but their session id does not match the binding, so it
 *   reports UNBOUND and delivers nothing.
 *
 * The hook itself is correct — it exits before writing a cursor when nothing is
 * pending, which is right — so the absence of a cursor is genuinely ambiguous
 * rather than a bug. **This makes the ambiguity visible instead of leaving each
 * lane to assume it is connected.**
 *
 * A lane that silently receives nothing looks exactly like a lane with no mail,
 * which is the same failure shape as a worker that dies looking like a worker
 * that is busy. That one cost this ring four workers before it was noticed.
 *
 * READ-ONLY. Prints; changes nothing.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUS = join(ROOT, '.agents', 'bus');
const LANES = ['LCC', 'RCC', 'NEW1', 'NEW2', 'NEW3'];
/** Who each lane feeds. RCC sits outside the ring. */
const DOWNSTREAM = { NEW3: 'NEW2', NEW2: 'LCC', LCC: 'NEW1', NEW1: 'NEW3', RCC: '—' };

if (!existsSync(BUS)) {
  console.log('no bus yet.');
  process.exit(0);
}

const files = readdirSync(BUS).filter((f) => /^\d{4}--/.test(f));
const seqOf = (f) => Number(f.slice(0, 4));

const cursor = (lane) => {
  const f = join(BUS, `.cursor-${lane.toLowerCase()}`);
  if (!existsSync(f)) return null; // never delivered to — not the same as zero
  const n = Number(readFileSync(f, 'utf8').replace(/[^0-9]/g, ''));
  return Number.isFinite(n) ? n : null;
};

const bindings = readdirSync(BUS)
  .filter((f) => f.startsWith('.lane-'))
  .map((f) => readFileSync(join(BUS, f), 'utf8').replace(/[^A-Za-z0-9]/g, '').toUpperCase());

console.log('LANE BUS STATUS');
console.log('='.repeat(78));
console.log(`${files.length} messages on the bus\n`);

console.log('lane   bound  cursor   pending  feeds   state');
console.log('-'.repeat(78));

for (const lane of LANES) {
  const inbox = files.filter((f) => f.includes(`-to-${lane}--`));
  const cur = cursor(lane);
  const pending = inbox.filter((f) => seqOf(f) > (cur ?? 0)).length;
  const bound = bindings.filter((b) => b === lane).length;

  /**
   * The distinction that matters: a cursor of `null` means the hook has NEVER
   * advanced one for this lane. With mail waiting, that is a lane which is
   * probably not receiving — worth saying out loud rather than showing as 0.
   */
  const state =
    bound === 0
      ? 'NOT BOUND — no session claims this lane'
      : cur === null && inbox.length > 0
        ? `NEVER DELIVERED — ${inbox.length} message(s) addressed to it, hook may not be firing`
        : cur === null
          ? 'bound, no mail yet'
          : pending > 0
            ? `${pending} waiting`
            : 'up to date';

  console.log(
    `${lane.padEnd(6)} ${String(bound).padStart(5)}  ${String(cur ?? '—').padStart(6)}   ` +
      `${String(pending).padStart(7)}  ${DOWNSTREAM[lane].padEnd(6)}  ${state}`,
  );
}

/* ------------------------------------------------------------ who is talking -- */

const from = new Map();
for (const f of files) {
  const m = /^\d{4}--([A-Z0-9]+)-to-/.exec(f);
  if (m) from.set(m[1], (from.get(m[1]) ?? 0) + 1);
}
console.log('');
console.log('messages sent, by lane (a broadcast counts once per recipient):');
for (const [lane, n] of [...from].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${lane.padEnd(6)} ${n}`);
}

/**
 * Silence is worth flagging in a ring: each lane's output is the next one's
 * input, so a lane that has sent nothing is either blocked or working without
 * telling anyone, and both are worth a question.
 */
const silent = LANES.filter((l) => !from.has(l));
if (silent.length > 0) {
  console.log('');
  console.log(`SENT NOTHING: ${silent.join(', ')} — blocked, or working without saying so?`);
}
