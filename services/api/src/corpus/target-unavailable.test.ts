/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PERMANENT GUARD: NO CORPUS MODULE MAY CLAIM A JUDGMENT DOES NOT EXIST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two halves, for the reason `db-role-wiring.test.ts` has two halves.
 *
 *   1. The BEHAVIOUR of `corpusTargetUnavailable` — the code, the status, the
 *      additive `details`, and what the sentence may and may not say.
 *   2. A STATIC SWEEP of every module that queries the CORPUS role, asserting
 *      that none of them answers an absent target with an existential claim.
 *      The integration matrix proves the routes somebody drove; this proves the
 *      route added next month that nobody added to the matrix.
 *
 * The guard is a RATCHET, not a taste check. It fires on the exact shape that
 * was wrong across eight call sites — a refusal whose own words say the thing
 * is not there — and only inside modules that read published law. A module that
 * touches only user-owned tables answers `no matter with that id` truthfully and
 * is not swept.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { Hono } from 'hono';

import { auditModules } from '../../../../scripts/lcc-db-role-audit.mjs';
import {
  CORPUS_TARGET_UNAVAILABLE,
  corpusTargetUnavailable,
  corpusTargetUnavailableMessage,
} from './target-unavailable.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

type Envelope = { ok: boolean; error?: { code: string; message: string; details?: unknown } };

function appEmitting(opts: { write?: boolean }) {
  const app = new Hono();
  app.get('/probe', (c) => corpusTargetUnavailable(c, 'it cannot be opened right now', opts));
  return app;
}

describe('corpusTargetUnavailable', () => {
  it('answers a WRITE with R17 §1’s released 409 CORPUS_TARGET_UNAVAILABLE', async () => {
    const res = await appEmitting({ write: true }).request('/probe');
    const body = (await res.json()) as Envelope;
    assert.equal(res.status, 409);
    assert.equal(body.ok, false);
    assert.equal(body.error?.code, CORPUS_TARGET_UNAVAILABLE);
  });

  /**
   * RFC 9110 §15.5.5: 404 means the origin server "did not find a current
   * representation for the target resource". That is exactly, and only, what is
   * true of a read against a generation that does not carry the target — and it
   * is the status every existing client already routes. The false half was never
   * the status; it was the code and the sentence.
   */
  it('answers a READ with 404, because a read has no conflict to resolve', async () => {
    const res = await appEmitting({}).request('/probe');
    const body = (await res.json()) as Envelope;
    assert.equal(res.status, 404);
    assert.equal(body.error?.code, CORPUS_TARGET_UNAVAILABLE);
  });

  it('carries the R17 §1 availability term in additive details', async () => {
    const res = await appEmitting({}).request('/probe');
    const body = (await res.json()) as Envelope;
    assert.deepEqual(body.error?.details, { availability: 'corpus_unavailable' });
  });

  /**
   * `CLAUDE.md` §6: copy is licence protection, not an audit. The sentence may
   * say the target is not in THIS release. It may not say the judgment does not
   * exist, was removed from the law, is unverified, or is still good law — and
   * it may not read as an outage, which would be a different and equally false
   * claim (`SOURCE_UNAVAILABLE` is a separate term for a separate fact).
   */
  it('says what is true of the release and claims nothing about the judgment', () => {
    const m = corpusTargetUnavailableMessage('judgment', 'it cannot be opened right now');
    assert.match(m, /not available in the selected corpus release/i);
    assert.doesNotMatch(
      m,
      /does not exist|no such|not found|no judgment with|removed from the law|unverified|good law|having trouble|try again/i,
    );
  });
});

/* ── the static sweep ────────────────────────────────────────────────────── */

/**
 * A refusal that ASSERTS ABSENCE. Matched on the wire words a client can render,
 * never on comments: the sweep strips comments first, so a module may still
 * explain in prose why the forbidden sentence is forbidden.
 */
const EXISTENTIAL = [
  /no judgment with that id/i,
  /no such judgment/i,
  /judgment (?:was )?not found/i,
  /(?:that )?judgment does not exist/i,
  /no authority with that id/i,
  /authority (?:was )?not found/i,
];

/** Comments carry the reasoning, not the wire. They are not the guard's business. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('no corpus-reading module makes an existential claim', () => {
  const corpusModules = auditModules().filter((r: { roles: string[] }) =>
    r.roles.includes('corpus'),
  );

  it('finds corpus-reading modules to sweep at all', () => {
    /* A sweep over zero files passes for the wrong reason. `document-vector-staging`
     * is the memory this assertion exists because of. */
    assert.ok(corpusModules.length >= 20, `only ${corpusModules.length} corpus modules found`);
  });

  it('CURRENT_V1_FALSE_EXISTENTIAL_SITE = 0', () => {
    const offenders: string[] = [];
    for (const row of corpusModules as { module: string }[]) {
      const src = stripComments(readFileSync(join(ROOT, row.module), 'utf8'));
      for (const pattern of EXISTENTIAL) {
        const hit = src.match(pattern);
        if (hit) offenders.push(`${row.module}: ${hit[0]}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'a module that reads published law answered an absent target by claiming it does not exist:\n' +
        offenders.join('\n'),
    );
  });
});
