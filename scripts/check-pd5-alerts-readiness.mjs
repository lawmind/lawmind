#!/usr/bin/env node
/**
 * FUTURE PD-5 / PD-6 READINESS GATE — not a current-v1 CI requirement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT CHANGED, 18 Sep 2026 (SHIP S4-T0.3)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This file is unchanged below except for this banner and its name. It was
 * `scripts/check-alert-coverage.mjs`, it ran in `.github/workflows/ci.yml` and
 * in `pnpm ci:local`, and it was RED every time — which made repository CI red
 * every time, for six weeks after the last workflow run, over a fact everybody
 * already knew.
 *
 * It is not wrong. It measures the RIGHT thing for the WRONG gate. It asks
 * whether all four PD-5 triggers can fire, and two of them cannot because
 * `monitoring.user_product` and `documents.upload_and_ocr` are explicitly
 * DISABLED in the current capability registry. A gate that fails because a
 * deliberately-disabled capability is disabled is a gate that teaches everyone
 * to ignore it — and building the two missing producers to turn this green
 * would ship monitoring and uploads that the founder has not scoped.
 *
 * So it moves to the front of a DIFFERENT queue:
 *
 *   REQUIRED BEFORE  any capability claims full PD-5 / PD-6 behaviour — before
 *                    `monitoring.user_product` or `briefing.daily_loop` may read
 *                    anything other than DISABLED, and before any surface says
 *                    "four things" again.
 *   NOT REQUIRED BY  Gate D, current-v1 CI, or `pnpm ci:local`.
 *   RUN IT WITH      node scripts/check-pd5-alerts-readiness.mjs
 *
 * What replaced it in CI is `scripts/check-alert-surface-truth.mjs`, which asks
 * the question current v1 actually has to answer: does the product PROMISE any
 * alert it cannot deliver? That one is green, and it is green because the
 * promise was removed rather than because the rule was loosened.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Every PD-5 trigger must have an alert kind AND something that writes it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A GATE AND NOT A TEST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `services/api/src/citations/fanout.test.ts` already proves the two
 * implemented triggers fire, end to end, with the right severity and audience.
 * A drill re-testing those would mostly duplicate it.
 *
 * The failure it cannot see is an ABSENCE — a PD-5 trigger with no enum value
 * and no writer anywhere. Nothing throws, no test goes red, and the product
 * simply never notifies anyone. That is what happened: S6 recorded "every alert
 * fires in a drill", no drill ever ran, and **two of PD-5's four triggers have
 * never been capable of firing.** Rules enforced by an absence rot silently,
 * which is exactly the shape this repo keeps building gates for.
 *
 * Worse than the silence: `users` carries `alert_own_matter_judgment` and
 * `alert_unknown_listing`, both defaulting true, and `PATCH /me/alerts`
 * persists them. The app offers an advocate two switches governing
 * notifications the system cannot produce.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS RED, AND IT IS NOT WIRED INTO ci:local YET
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Same precedent as `check-amber-reservation.mjs`: a gate is built when the
 * violation is found, and wired in when the violations are fixed. A permanently
 * red step teaches everyone to ignore the pipeline, which costs more than the
 * gate is worth. Wire it in the commit that adds the fourth trigger.
 *
 *   node scripts/check-pd5-alerts-readiness.mjs
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * PD-5's four triggers, transcribed with the decision's own words, each paired
 * with the `alert_kind` it would need.
 *
 * Transcribed rather than parsed out of the markdown on purpose. A parser over
 * prose would quietly return three triggers if someone reformatted the list,
 * and a coverage checker that miscounts what it is covering is worse than none.
 * The transcription is checked against `PRODUCT_DECISIONS.md` below, so it
 * cannot drift silently either.
 */
const PD5_TRIGGERS = [
  {
    kind: 'saved_authority_moved',
    quote: 'An authority saved to a matter is set aside or overruled',
    settingsColumn: 'alert_saved_authority_moved',
  },
  {
    kind: 'filed_citation_moved',
    quote: 'an authority cited in a filed draft is set aside',
    settingsColumn: null,
  },
  {
    kind: 'own_matter_judgment',
    quote: "a judgment in one of the advocate's own matters is uploaded",
    settingsColumn: 'alert_own_matter_judgment',
  },
  {
    kind: 'unknown_listing',
    quote: 'a matter is listed on a date they did not know about',
    settingsColumn: 'alert_unknown_listing',
  },
];

/**
 * PD-6's two standing exceptions that push immediately. Both are named against
 * the trigger they belong to, because an exception to a trigger that cannot
 * fire cannot fire either — and that is the more serious of the two here.
 */
const PD6_IMMEDIATE = [
  { needs: 'filed_citation_moved', what: 'set_aside on a citation in an EXPORTED draft' },
  { needs: 'unknown_listing', what: 'a newly discovered listing for TOMORROW' },
];

const decisions = readFileSync('PRODUCT_DECISIONS.md', 'utf8');
const schema = readFileSync('packages/db/src/schema.ts', 'utf8');

/** The values `alert_kind` can actually hold. */
const enumBlock = /alertKindEnum\s*=\s*pgEnum\('alert_kind',\s*\[([^\]]*)\]/s.exec(schema);
if (!enumBlock) {
  console.error('could not find alertKindEnum in packages/db/src/schema.ts');
  process.exit(2);
}
const declaredKinds = [...enumBlock[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

/** Anything that writes an alerts row, named by the kind it writes. */
function hasWriter(kind) {
  try {
    const out = execFileSync(
      'git',
      ['grep', '-l', '--', `'${kind}'`, '--', 'services/*/src/**/*.ts'],
      { encoding: 'utf8' },
    );
    return out
      .split('\n')
      .filter(Boolean)
      .some((f) => !f.includes('.test.'));
  } catch {
    return false;
  }
}

const problems = [];

// The transcription above must still match the decision it claims to transcribe.
for (const t of PD5_TRIGGERS) {
  const needle = t.quote.toLowerCase().replace(/\s+/g, ' ');
  if (!decisions.toLowerCase().replace(/\s+/g, ' ').includes(needle)) {
    problems.push(
      `PD-5 transcription drift: this script believes PD-5 names "${t.quote}" ` +
        'and PRODUCT_DECISIONS.md no longer says so. Re-read the decision before trusting anything below.',
    );
  }
}

for (const t of PD5_TRIGGERS) {
  const declared = declaredKinds.includes(t.kind);
  const written = declared && hasWriter(t.kind);

  if (!declared) {
    problems.push(
      `PD-5 "${t.quote}" has NO alert_kind value. It can never fire.` +
        (t.settingsColumn
          ? `\n      users.${t.settingsColumn} exists and PATCH /me/alerts persists it — ` +
            'the app offers a switch for a notification the system cannot produce.'
          : ''),
    );
  } else if (!written) {
    problems.push(
      `PD-5 "${t.quote}" has alert_kind '${t.kind}' but nothing outside tests writes it. ` +
        'An enum value with no writer is how the last two gaps were created.',
    );
  }
}

for (const e of PD6_IMMEDIATE) {
  if (!declaredKinds.includes(e.needs)) {
    problems.push(
      `PD-6 immediate exception "${e.what}" cannot fire: it needs alert_kind '${e.needs}', which does not exist.`,
    );
  }
}

const covered = PD5_TRIGGERS.filter((t) => declaredKinds.includes(t.kind) && hasWriter(t.kind));
console.log(
  `alert coverage · ${covered.length} of ${PD5_TRIGGERS.length} PD-5 triggers can fire · ` +
    `alert_kind holds [${declaredKinds.join(', ')}]`,
);

if (problems.length === 0) {
  console.log('every PD-5 trigger and every PD-6 immediate exception has a path to an advocate.');
  process.exit(0);
}

console.error('');
for (const p of problems) console.error(`  ${p}`);
console.error('');
console.error(
  'PD-5 and PD-6 are SETTLED decisions. A trigger that cannot fire is not a\n' +
    'deferred feature — it is a decision the product silently does not implement,\n' +
    'and the advocate finds out when they miss a hearing.',
);
process.exit(1);
