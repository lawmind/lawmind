/**
 * LCC R32B — the handles `index.ts` passes to background writers.
 *
 * `lcc-db-role-audit.mjs` derives which ROLE each module's SQL needs. It cannot
 * see which handle `index.ts` actually passes, and `index.ts` cannot be imported
 * by a test because importing it boots the server. So this reads its source.
 *
 * The defect it pins: `new ActivationOutbox(rawSql)`. `activation_events` is a
 * USER table (`ops/db-roles.ts`), `rawSql` is the CORPUS core pool, and on the
 * first split deployment (DigitalOcean Gate C) every activation write went to
 * the corpus database and failed `activation_events_user_id_fkey` against its
 * empty `users`. The outbox retried, logged, and dropped the event. Nothing
 * failed a request, so nothing noticed.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { USER_TABLES } from './ops/db-roles.ts';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('index.ts wiring', () => {
  it('activation_events is a USER table', () => {
    assert.ok(USER_TABLES.includes('activation_events'));
  });

  it('the activation outbox is constructed on the USER handle', () => {
    const calls = [...source.matchAll(/new\s+ActivationOutbox\(\s*([A-Za-z_.]+)\s*\)/g)].map((m) => m[1]);
    assert.ok(calls.length > 0, 'index.ts no longer constructs an ActivationOutbox; update this test');
    for (const arg of calls) assert.equal(arg, 'userSql', `ActivationOutbox(${arg}) writes a USER table`);
  });
});
