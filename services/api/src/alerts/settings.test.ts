/**
 * `route.test.ts` needs a live Postgres. This rule does not, and it is the one
 * that decides whether the product lies to an advocate about a notification, so
 * it should be checkable without infrastructure.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { unavailableSettings } from './route.ts';

test('THE TWO TRIGGERS THAT CANNOT FIRE ARE NAMED IN THE RESPONSE', () => {
  /**
   * `scripts/check-alert-coverage.mjs`: 2 of 4 PD-5 triggers can fire. The
   * columns exist and PATCH persists them, so an advocate can switch on "tell
   * me when a matter is listed on a date I did not know about", watch it save,
   * and be told nothing ever. **They find out by missing a hearing.**
   */
  const unavailable = unavailableSettings(['saved_authority_moved', 'filed_citation_moved']);
  assert.deepEqual([...unavailable].sort(), ['ownMatterJudgment', 'unknownListing']);
});

test('a setting whose producer SHIPS drops off the list by itself', () => {
  // Derived from the enum, never listed. Adding the enum value is the only
  // thing anyone has to remember — a hard-coded list would be correct today and
  // silently wrong the moment a producer lands.
  assert.deepEqual(
    unavailableSettings(['saved_authority_moved', 'filed_citation_moved', 'unknown_listing']),
    ['ownMatterJudgment'],
  );
});

test('when every producer exists the list is EMPTY, not absent', () => {
  // An empty array and a missing key say different things to a client: one is
  // "everything works", the other is "this server is too old to know".
  const unavailable = unavailableSettings([
    'saved_authority_moved',
    'filed_citation_moved',
    'own_matter_judgment',
    'unknown_listing',
  ]);
  assert.ok(Array.isArray(unavailable));
  assert.deepEqual(unavailable, []);
});

test('the settings that DO work are never reported unavailable', () => {
  assert.ok(!unavailableSettings(['saved_authority_moved']).includes('savedAuthorityMoved'));
});
