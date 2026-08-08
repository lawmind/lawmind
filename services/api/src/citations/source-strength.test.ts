/**
 * The rules this file guards are all rules of ABSENCE — "a bulk pass must never
 * overwrite a human confirmation", "a diagnostic value must never reach a
 * client". Nothing fails when they are broken. That is why they are tested
 * rather than merely written down.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  type DbVerifiedBySource,
  isUpgrade,
  strengthOf,
  toWireSource,
  toWireSourceUnsafe,
} from './source-strength.ts';

const ALL: DbVerifiedBySource[] = [
  'corpus',
  'indiankanoon',
  'aws_s3',
  'public_x2',
  'ecourts',
  'ecourts_bulk',
  'none',
];

/**
 * The list above is a transcription, and transcriptions drift. This reads the
 * enum back out of the migration history so adding an eighth value without
 * touching this file fails here rather than in production.
 */
test('the module knows every value the Postgres enum can hold', () => {
  const initial = readFileSync(
    new URL('../../../../packages/db/drizzle/0001_initial_schema.sql', import.meta.url),
    'utf8',
  );
  const created = /CREATE TYPE "?public"?\."?verified_by_source"?[^(]*\(([^)]*)\)/i.exec(initial);
  assert.ok(created, 'verified_by_source is not created in 0001 — find where it moved');
  const fromCreate = [...created[1]!.matchAll(/'([a-z_0-9]+)'/g)].map((m) => m[1]!);

  const added: string[] = [];
  for (const n of ['0022_ecourts_bulk_source']) {
    const sqlText = readFileSync(
      new URL(`../../../../packages/db/drizzle/${n}.sql`, import.meta.url),
      'utf8',
    );
    for (const m of sqlText.matchAll(
      /ALTER TYPE "?verified_by_source"? ADD VALUE (?:IF NOT EXISTS )?'([a-z_0-9]+)'/gi,
    )) {
      added.push(m[1]!);
    }
  }

  assert.deepEqual([...fromCreate, ...added].sort(), [...ALL].sort());
});

test('every database value maps to something a client can render', () => {
  for (const v of ALL) assert.doesNotThrow(() => toWireSource(v));
});

test('a bulk eCourts row never wears the badge a human earned', () => {
  // The whole reason `ecourts_bulk` exists. If this ever returns 'ecourts',
  // "VERIFIED BY YOU" appears beside a citation nobody looked at.
  assert.equal(toWireSource('ecourts_bulk'), 'ecourts_bulk');
  assert.notEqual(toWireSource('ecourts_bulk'), 'ecourts');
});

test('a single public source is not a confirmation on the wire', () => {
  // CITATION_HARNESS.md step 5 requires BOTH to agree. One match is a
  // diagnostic record, and its verification_state is `unverified`.
  assert.equal(toWireSource('indiankanoon'), 'none');
  assert.equal(toWireSource('aws_s3'), 'none');
});

test('the strength order is the one CITATION_HARNESS records', () => {
  assert.ok(strengthOf('ecourts') > strengthOf('public_x2'));
  assert.ok(strengthOf('public_x2') > strengthOf('ecourts_bulk'));
  assert.ok(strengthOf('ecourts_bulk') > strengthOf('corpus'));
  assert.ok(strengthOf('corpus') > strengthOf('none'));
});

test('a bulk pass cannot overwrite a human confirmation', () => {
  assert.equal(isUpgrade('ecourts', 'ecourts_bulk'), false);
  assert.equal(isUpgrade('ecourts', 'corpus'), false);
  assert.equal(isUpgrade('ecourts', 'public_x2'), false);
});

test('an advocate confirming a bulk-resolved citation IS an upgrade', () => {
  assert.equal(isUpgrade('ecourts_bulk', 'ecourts'), true);
  assert.equal(isUpgrade('corpus', 'ecourts_bulk'), true);
  assert.equal(isUpgrade('none', 'corpus'), true);
});

test('rewriting a row with what it already says is not an upgrade', () => {
  for (const v of ALL) assert.equal(isUpgrade(v, v), false);
  // Two different failures are not progress from one to the other.
  assert.equal(isUpgrade('indiankanoon', 'aws_s3'), false);
});

test('a value we cannot name throws rather than guessing `none`', () => {
  // `none` is a claim — "nobody confirmed this". Defaulting to it for a value
  // written by code we have not read is the silent degradation this prevents.
  assert.throws(() => toWireSourceUnsafe('ecourts_v2'), /unknown verified_by_source/);
  assert.equal(toWireSourceUnsafe('public_x2'), 'public_x2');
});
