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
  licensedDisplayPermitted,
  renderableLicensedText,
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
  'licensed',
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
  for (const n of ['0022_ecourts_bulk_source', '0024_licensed_source']) {
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
  assert.ok(strengthOf('ecourts_bulk') > strengthOf('licensed'));
  assert.ok(strengthOf('licensed') > strengthOf('corpus'));
  assert.ok(strengthOf('corpus') > strengthOf('none'));
});

test('a licensed assertion never outranks the registry or a human', () => {
  // A publisher's headnote is an editor's reading of a judgment: expert,
  // valuable, and still one organisation's opinion. It must not be able to
  // overwrite a confirmation somebody actually made.
  assert.equal(isUpgrade('ecourts', 'licensed'), false);
  assert.equal(isUpgrade('ecourts_bulk', 'licensed'), false);
  assert.equal(isUpgrade('public_x2', 'licensed'), false);
  // But it does carry editorial judgement our own row does not.
  assert.equal(isUpgrade('corpus', 'licensed'), true);
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

test('licensed content does not render until the terms say it may', () => {
  // Perpetual retention is not perpetual display. Until someone can point at
  // the clause, a licensed headnote is a signal and never a surface.
  delete process.env['LICENSED_DISPLAY_PERMITTED'];
  assert.equal(licensedDisplayPermitted(), false, 'the default must be no');
  assert.equal(renderableLicensedText('their headnote'), null);
});

test('the gate opens only on an exact opt-in, never on a truthy value', () => {
  // 'yes', '1' and 'TRUE' are all things someone types when they are guessing.
  // A permission nobody can point at a clause for should not be reachable by a
  // near miss.
  for (const v of ['1', 'yes', 'TRUE', 'True', '']) {
    process.env['LICENSED_DISPLAY_PERMITTED'] = v;
    assert.equal(licensedDisplayPermitted(), false, `"${v}" opened the gate`);
  }
  process.env['LICENSED_DISPLAY_PERMITTED'] = 'true';
  assert.equal(licensedDisplayPermitted(), true);
  assert.equal(renderableLicensedText('their headnote'), 'their headnote');
  delete process.env['LICENSED_DISPLAY_PERMITTED'];
});

test('a withheld headnote is null, never a truncated version of theirs', () => {
  // A shortened headnote is still their expression, and "we only showed a bit
  // of it" is not a defence anyone wants to make.
  delete process.env['LICENSED_DISPLAY_PERMITTED'];
  assert.equal(renderableLicensedText(null), null);
  assert.equal(renderableLicensedText('a very long headnote '.repeat(50)), null);
});
