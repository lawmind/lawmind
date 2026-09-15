/**
 * The one part of the staging Gate-S1 runner that fails SILENTLY.
 *
 * `loadPhaseLines` correlates the server's own `search_phase_timing` lines to
 * the requests this runner made. When it is wrong it does not throw: every
 * server-side field reads `null`, which the runner correctly prints as NOT
 * MEASURED — and a whole staging run then produces evidence with no pool wait
 * and no per-arm timing in it, looking exactly like a run made without
 * `--phase-log`. That is a defect you find on the day you needed the numbers.
 *
 * So the three shapes real hosts actually emit are exercised here against a
 * fixture, rather than discovered against staging.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { loadPhaseLines } from './lcc-staging-gate-s1.mjs';

const dir = mkdtempSync(join(tmpdir(), 'lawmind-gate-s1-'));

/** Exactly the object `search/route.ts` hands `emitPhaseTiming`. */
const PHASE = {
  event: 'search_phase_timing',
  request_id: 'req-1',
  query_class: 'structured',
  query_chars: 24,
  result_count: 1,
  degraded: [],
  status: 200,
  admitted: true,
  pool_wait_ms: 29,
  pool_wait_measured: true,
  admission_wait_ms: 0,
  structured_ms: 37,
  sparse_ms: 11,
  serialization_ms: 2,
  unattributed_ms: 32,
  total_ms: 103,
};

function fixture(name, lines) {
  const file = join(dir, name);
  writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}

describe('staging Gate-S1 phase-log correlation', () => {
  it('reads pino JSON straight out of a log file', () => {
    const { byRequest, parsed } = loadPhaseLines(fixture('pino.log', [JSON.stringify(PHASE)]));
    assert.equal(parsed, 1);
    assert.equal(byRequest.get('req-1').pool_wait_ms, 29);
  });

  /** `railway logs` prefixes a timestamp and the service name before the JSON. */
  it('reads a line with a host prefix before the JSON', () => {
    const line = `2026-09-15T09:00:00.000Z api  ${JSON.stringify(PHASE)}`;
    const { byRequest } = loadPhaseLines(fixture('prefixed.log', [line]));
    assert.equal(byRequest.get('req-1').structured_ms, 37);
  });

  /** Several hosts wrap the application's JSON as a string under `message`. */
  it('unwraps one level of host envelope', () => {
    const line = JSON.stringify({ timestamp: 'x', message: JSON.stringify(PHASE) });
    const { byRequest } = loadPhaseLines(fixture('enveloped.log', [line]));
    assert.equal(byRequest.get('req-1').total_ms, 103);
  });

  it('ignores every line that is not a phase line, without throwing', () => {
    const { byRequest, parsed } = loadPhaseLines(
      fixture('mixed.log', [
        'starting up',
        '{"level":30,"msg":"api listening"}',
        '{ not json at all',
        JSON.stringify({ event: 'search_phase_timing' }), // no request_id
        JSON.stringify(PHASE),
      ]),
    );
    assert.equal(parsed, 1);
    assert.equal(byRequest.size, 1);
  });

  /**
   * An empty correlation is the silent failure this file exists for. It must be
   * distinguishable from a run that had no log at all — the runner reports
   * `parsed` so a zero is visible in the evidence rather than inferred from
   * nulls.
   */
  it('reports zero parsed rather than pretending it measured nothing', () => {
    const { byRequest, parsed } = loadPhaseLines(fixture('none.log', ['nothing here']));
    assert.equal(parsed, 0);
    assert.equal(byRequest.size, 0);
  });
});
