#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * R17_MISSING_TARGET_SITE_MATRIX — every "it is not there" answer, classified
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `ABSENT_FROM_ACTIVE_CORPUS` is not `DOES_NOT_EXIST`. A blue/green activation
 * or a rollback can make a real judgment absent from the generation a request is
 * pinned to, and R17 §1 forbids answering that with a claim the judgment does
 * not exist — which after a rollback is also false.
 *
 * So every missing-target answer in the API needs a CLASSIFICATION, not a
 * blanket rewrite. Rewriting strings blindly would turn honest refusals ("no
 * matter with that id", which is true and actionable) into evasive ones.
 *
 *   A  TRUE IDENTITY NOT FOUND       the identifier is invalid or never existed
 *                                    in the USER-owned namespace it addresses.
 *                                    Honest not-found semantics are preserved.
 *   B  CORPUS TARGET UNAVAILABLE     the id may be valid; the pinned corpus
 *                                    generation cannot hydrate it. Must use
 *                                    `corpus/target-unavailable.ts`.
 *   C  INTERNAL / ADMIN DIAGNOSTIC   not a user-facing legal or product
 *                                    assertion. Not rewritten for consistency.
 *   D  DEAD / UNREACHABLE            current-v1 code nothing routes to.
 *
 * The classification is DERIVED, never typed: the role each module queries comes
 * from `lcc-db-role-audit.mjs` (the same source `db-role-wiring.test.ts` reads),
 * and the noun comes from the refusal's own message. A site is B when a module
 * that reads the CORPUS role refuses over a corpus-owned noun.
 *
 * Usage:  node scripts/lcc-r29-missing-target-matrix.mjs [--json]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditModules } from './lcc-db-role-audit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'services', 'api', 'src');

/**
 * Nouns owned by the CORPUS database — PUBLISHED LAW, not an advocate's row.
 *
 * `authority` is deliberately NOT here. In this codebase an "authority" is a
 * `matter_authorities` row — the advocate's own saved reference, USER-owned and
 * addressed by an `authorityId` they were handed, and R17 §1 uses the word that
 * way too. `no live authority with that id` is therefore class A, and true.
 */
const CORPUS_NOUNS = /\b(judgment|act|section|statute)\b/i;

/**
 * A refusal that claims the target ITSELF is not there, as opposed to one that
 * says what Lawmind holds or can serve. Matched on the claim, never on the word
 * "not" — see the `existential` field below.
 */
const ASSERTS_ABSENCE = new RegExp(
  [
    String.raw`\bno (?:such )?(?:judgment|act|section|statute)\b`,
    String.raw`\b(?:judgment|act|section|statute)[^.]{0,30}\b(?:not found|does not exist)\b`,
    String.raw`\bdoes not exist\b`,
  ].join('|'),
  'i',
);

/** Modules whose refusals are operator-facing, never rendered to an advocate. */
const INTERNAL_PREFIX = /^services\/api\/src\/(admin|ops|training)\//;

/**
 * Every module reachable from the mounted Hono app, by a transitive walk of the
 * relative imports out of `app.ts`.
 *
 * This is the D classification's evidence. A refusal in a module the app never
 * imports is dead in current-v1: it cannot reach an advocate, so rewriting its
 * wording would be polishing code nobody runs. It is reported, not rewritten.
 * `lawmind-built-but-unreachable` is the memory this exists because of.
 */
function reachableFromApp() {
  const seen = new Set();
  /* Two roots: `index.ts` is the process entrypoint and `app.ts` the mounted
   * Hono app. `index.ts` imports `app.ts` and not the reverse, so a module
   * wired only into the bootstrap (better-auth, the role guard) is reachable
   * and must not be reported dead. */
  const queue = [join(SRC, 'index.ts'), join(SRC, 'app.ts')];
  while (queue.length > 0) {
    const file = queue.pop();
    const rel = relative(ROOT, file).split(sep).join('/');
    if (seen.has(rel)) continue;
    let src;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    seen.add(rel);
    for (const m of src.matchAll(/from\s+'(\.[^']*\.ts)'/g)) {
      queue.push(join(dirname(file), m[1]));
    }
  }
  return seen;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) yield p;
  }
}

/**
 * Every `fail(c, CODE, MESSAGE, STATUS)` whose status is 404, plus every
 * `corpusTargetUnavailable(...)`. Matched on the call rather than on the string
 * so a refusal cannot hide behind a constant that is never a literal here.
 */
const FAIL =
  /fail\(\s*c,\s*'([A-Z_]+)',\s*((?:'[^']*'|"[^"]*")(?:\s*\+\s*(?:'[^']*'|"[^"]*"))*),\s*(\d{3})/g;
const HELPER = /corpusTargetUnavailable\(\s*c,\s*'([^']*)'([^)]*)\)/g;

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function literal(raw) {
  return raw
    .split('+')
    .map((p) => p.trim().replace(/^['"]|['"]$/g, ''))
    .join('');
}

export function siteMatrix() {
  const roles = new Map(auditModules().map((r) => [r.module, r.roles]));
  const reachable = reachableFromApp();
  const sites = [];

  for (const file of walk(SRC)) {
    const mod = relative(ROOT, file).split(sep).join('/');
    const src = readFileSync(file, 'utf8');
    const modRoles = roles.get(mod) ?? [];

    for (const m of src.matchAll(HELPER)) {
      sites.push({
        module: mod,
        line: lineOf(src, m.index),
        code: 'CORPUS_TARGET_UNAVAILABLE',
        status: /write:\s*true/.test(m[2] ?? '') ? 409 : 404,
        message: m[1],
        classification: reachable.has(mod) ? 'B' : 'D',
        why: reachable.has(mod)
          ? 'corpus target unavailable, answered through corpus/target-unavailable.ts'
          : 'no import path reaches this module from the mounted app',
        existential: false,
      });
    }

    for (const m of src.matchAll(FAIL)) {
      const [, code, rawMessage, status] = m;
      if (status !== '404') continue;
      const message = literal(rawMessage);
      const corpusNoun = CORPUS_NOUNS.test(message);
      const readsCorpus = modRoles.includes('corpus');

      let classification;
      let why;
      if (!reachable.has(mod)) {
        classification = 'D';
        why = 'no import path reaches this module from the mounted app';
      } else if (INTERNAL_PREFIX.test(mod)) {
        classification = 'C';
        why = 'operator-facing surface; not a product assertion about the law';
      } else if (corpusNoun && readsCorpus) {
        classification = 'B';
        why = 'corpus-owned noun refused by a module that reads the corpus role';
      } else {
        classification = 'A';
        why = 'user-owned namespace; the identifier genuinely does not address a row';
      }

      sites.push({
        module: mod,
        line: lineOf(src, m.index),
        code,
        status: 404,
        message,
        classification,
        why,
        /* The defect: a refusal that ASSERTS THE ABSENCE OF THE THING ITSELF.
         *
         * Not merely a refusal containing the word "not". `We do not hold an Act
         * with that identifier` (`statutes/linked-judgments.ts`) is a statement
         * about OUR HOLDINGS and is already the truthful form — it claims
         * nothing about whether the Act exists. `no judgment with that id` is
         * the opposite: it is a claim about the world, made from a fact about a
         * deployment, and it is the one this matrix exists to drive to zero. */
        existential: classification === 'B' && ASSERTS_ABSENCE.test(message),
      });
    }
  }

  return sites.sort((a, b) => a.module.localeCompare(b.module) || a.line - b.line);
}

const sites = siteMatrix();
const by = (k) => sites.filter((s) => s.classification === k);
const falseExistential = sites.filter((s) => s.existential);

const report = {
  kind: 'lawmind-r17-missing-target-site-matrix',
  generatedAt: new Date().toISOString(),
  counts: {
    sitesFound: sites.length,
    trueNotFound: by('A').length,
    corpusUnavailable: by('B').length,
    internal: by('C').length,
    dead: by('D').length,
    falseExistentialSites: falseExistential.length,
  },
  falseExistentialSites: falseExistential,
  sites,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`R17_SITES_FOUND                  = ${report.counts.sitesFound}`);
  console.log(`R17_TRUE_NOT_FOUND               = ${report.counts.trueNotFound}`);
  console.log(`R17_CORPUS_UNAVAILABLE           = ${report.counts.corpusUnavailable}`);
  console.log(`R17_INTERNAL                     = ${report.counts.internal}`);
  console.log(`R17_DEAD                         = ${report.counts.dead}`);
  console.log(`CURRENT_V1_FALSE_EXISTENTIAL_SITE = ${report.counts.falseExistentialSites}`);
  for (const s of falseExistential) console.log(`  ! ${s.module}:${s.line}  ${s.message}`);
}

process.exitCode = falseExistential.length === 0 ? 0 : 1;
