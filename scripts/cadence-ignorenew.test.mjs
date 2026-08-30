#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * A TASK THAT REFUSES ITS OWN TRIGGER IS HEALTHY, AND SAYING OTHERWISE PAGES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured 30 August 2026, from the scheduler rather than from a manual:
 *
 *     Lawmind-paragraphs     State=Running  MultipleInstances=IgnoreNew
 *                            LastResult=0x800710E0  NumberOfMissedRuns=0
 *     Lawmind-citations      identical
 *     Lawmind-citation-keys  identical
 *
 * `enrich-worker.cmd` loops forever; the 15-minute trigger exists only to
 * restart a wrapper that DIED. While one is alive every trigger is refused by
 * the task's own `MultipleInstances = IgnoreNew` — which that file's header
 * calls the real single-owner guarantee — and the scheduler records the refusal
 * as `0x800710E0` (2147946720).
 *
 * Read as a failure, that pages on three healthy workers forever, which is how a
 * monitor teaches its reader to ignore it. `267009` (0x41301, "task is currently
 * running") was already exempt for exactly the same reason; this is the same
 * fact seen from the trigger's side rather than the instance's.
 *
 *   node --test scripts/cadence-ignorenew.test.mjs
 *
 * The narrowness is the point of every case below. `0x800710E0` also means a
 * genuine abort, so it may only be forgiven when BOTH live conditions hold.
 * A test that only proved the forgiving direction would be a test that
 * rubber-stamped the next real failure.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, 'job-health.mjs'), 'utf8');

/**
 * The rule is read out of the source rather than reimplemented.
 *
 * `classifyCadence` is not exported and exporting it purely for a test would
 * change the module's surface to suit the test. What matters is that the guard
 * exists, is conjunctive, and that the refusal branch still fires for everything
 * else — all three are properties of the text, and a future edit that loosens
 * any of them shows up here.
 */
describe('the 0x800710E0 exemption is present and conjunctive', () => {
  const guard = /const refusedBecauseAlreadyRunning =[\s\S]*?;\r?\n/.exec(SRC)?.[0] ?? '';

  it('exists at all', () => {
    assert.notEqual(guard, '', 'the IgnoreNew refusal guard must exist in classifyCadence');
  });

  it('matches the exact return code and nothing broader', () => {
    assert.match(guard, /rc === '2147946720'/, 'the code must be matched exactly, never a range');
  });

  it('requires the policy to actually be IgnoreNew', () => {
    assert.match(guard, /ignorenew/i, 'a task without IgnoreNew returning this code is a real abort');
  });

  it('requires the task to actually be Running', () => {
    assert.match(guard, /running/i, 'a STOPPED task returning this code is a real abort');
  });

  it('is an AND of both conditions, never an OR', () => {
    assert.equal(guard.includes('||'), false, 'either condition alone must not forgive the code');
    assert.equal((guard.match(/&&/g) ?? []).length >= 2, true, 'both conditions must be required');
  });
});

describe('the failure branch still fires for everything else', () => {
  const branch = /if \(rc && rc !== '0' && rc !== '267009'[^)]*\) \{/.exec(SRC)?.[0] ?? '';

  it('still refuses a non-zero code by default', () => {
    assert.notEqual(branch, '', 'the FAILED branch must still exist');
    assert.match(branch, /rc !== '0'/);
  });

  it('keeps the pre-existing 267009 exemption — this change adds one, it replaces none', () => {
    assert.match(branch, /rc !== '267009'/);
  });

  it('applies the new exemption as a negation, so the default is still to fail', () => {
    assert.match(branch, /!refusedBecauseAlreadyRunning/);
  });
});

describe('the sweep actually collects what the guard reads', () => {
  it('asks the scheduler for MultipleInstances', () => {
    // The guard is inert if the field is never populated, and an inert guard
    // reads identically to a working one in every other test in this file.
    assert.match(SRC, /\$_\.Settings\.MultipleInstances/, 'the PowerShell sweep must select the policy');
  });

  it('destructures it out of the sweep line and carries it on the record', () => {
    assert.match(SRC, /taskPath, multipleInstances\] = line\.trim\(\)\.split/);
    assert.match(SRC, /^\s+multipleInstances,$/m, 'the field must reach the task record');
  });
});
