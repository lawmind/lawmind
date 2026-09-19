/**
 * The guard is unit-tested rather than exercised through the CLI on purpose:
 * `release-restore-cli.ts` calls `main()` at import and a test that imported it
 * would run a restore. The SQL that feeds this function is one `pg_constraint`
 * read; the JUDGEMENT is here, and the judgement is the part that can be wrong.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cascadeDamage, cascadeVictims } from './cascade-guard.ts';

describe('TRUNCATE ... CASCADE victims outside a corpus release', () => {
  const RELEASE = ['judgments', 'judgment_citations', 'statutes'];

  it('finds a user/matter table that references the corpus', () => {
    const victims = cascadeVictims([{ child: 'matter_authorities', parent: 'judgments' }], RELEASE);
    assert.deepEqual(victims, [{ table: 'matter_authorities', via: ['judgments'] }]);
  });

  it('does NOT report a table that is itself in the release', () => {
    const victims = cascadeVictims([{ child: 'judgment_citations', parent: 'judgments' }], RELEASE);
    assert.deepEqual(victims, []);
  });

  it('ignores a self reference — judgments.overruled_by_judgment_id', () => {
    const victims = cascadeVictims([{ child: 'judgments', parent: 'judgments' }], RELEASE);
    assert.deepEqual(victims, []);
  });

  /**
   * The reason the walk is transitive. `matter_documents -> matter_authorities
   * -> judgments` is emptied by the same TRUNCATE, and a one-hop guard would
   * have printed a list that was true and incomplete — which is worse than no
   * list, because an operator would have read it as the whole exposure.
   */
  it('follows the cascade transitively', () => {
    const victims = cascadeVictims(
      [
        { child: 'matter_authorities', parent: 'judgments' },
        { child: 'matter_documents', parent: 'matter_authorities' },
      ],
      RELEASE,
    );
    assert.deepEqual(
      victims.map((v) => v.table),
      ['matter_authorities', 'matter_documents'],
    );
  });

  it('reports every parent a victim reaches the release through', () => {
    const victims = cascadeVictims(
      [
        { child: 'citation_checks', parent: 'judgments' },
        { child: 'citation_checks', parent: 'statutes' },
      ],
      RELEASE,
    );
    assert.deepEqual(victims, [{ table: 'citation_checks', via: ['judgments', 'statutes'] }]);
  });

  /**
   * The shape a correct remote-alpha corpus database has: nothing outside the
   * release references it, because the user/matter tables are not there. The
   * guard must be SILENT then, or it becomes a flag everyone passes by habit.
   */
  it('is empty when the target holds only the release', () => {
    assert.deepEqual(
      cascadeVictims([{ child: 'judgment_citations', parent: 'judgments' }], RELEASE),
      [],
    );
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW MUCH DATA — the half `cascadeVictims` cannot answer
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gate C's restore refused with **12 victims** and the operator cleared it with
 * `--allow-cascade-into`, correctly: on a corpus-only target the user tables are
 * present-but-empty and truncating them destroys nothing.
 *
 * The danger is that a shared database produces a byte-identical refusal. An
 * operator trained by routine restores to clear this warning will clear it on the
 * day it means "destroy thirteen saved authorities" — so the decision moved onto
 * ROWS, and these are the cases that decide it.
 */
describe('cascadeDamage — empty victims are not the same as populated ones', () => {
  const via = ['judgments'];

  it('the Gate-C shape: victims exist, all empty, nothing is destroyed', () => {
    const d = cascadeDamage([
      { table: 'matter_authorities', via, rows: 0 },
      { table: 'judgment_annotations', via, rows: 0 },
    ]);
    assert.equal(d.destroys.length, 0, 'an empty victim destroys nothing and must not refuse');
    assert.equal(d.empty.length, 2);
    assert.equal(d.rows, 0);
    assert.equal(d.rowsAreAFloor, false);
  });

  it('the shape Gate C forbids: one populated victim is enough to refuse', () => {
    const d = cascadeDamage([
      { table: 'matter_authorities', via, rows: 13 },
      { table: 'judgment_annotations', via, rows: 0 },
    ]);
    assert.equal(d.destroys.length, 1);
    assert.equal(d.destroys[0]?.table, 'matter_authorities');
    assert.equal(d.rows, 13);
    assert.equal(d.empty.length, 1, 'the empty ones are still reported, just not as damage');
  });

  it('orders the refusal worst-first, so the biggest loss is the line read first', () => {
    const d = cascadeDamage([
      { table: 'alerts', via, rows: 6 },
      { table: 'citation_checks', via, rows: 20307 },
      { table: 'matter_authorities', via, rows: 13 },
    ]);
    assert.deepEqual(
      d.destroys.map((v) => v.table),
      ['citation_checks', 'matter_authorities', 'alerts'],
    );
    assert.equal(d.rows, 20326);
  });

  it('says a bounded count is a FLOOR rather than inventing a total', () => {
    /**
     * The census stops counting at a bound, because the only number that changes
     * the decision is whether it is zero and this runs in front of a multi-hour
     * restore. A bounded count reported as an exact total would be a number
     * nobody measured.
     */
    const d = cascadeDamage([{ table: 'citation_checks', via, rows: 10000, atLeast: true }]);
    assert.equal(d.rowsAreAFloor, true);
    assert.equal(d.rows, 10000);
  });

  it('no victims at all — the correct split-role target', () => {
    const d = cascadeDamage([]);
    assert.equal(d.destroys.length, 0);
    assert.equal(d.empty.length, 0);
    assert.equal(d.rows, 0);
    assert.equal(d.rowsAreAFloor, false);
  });

  it('a zero-row victim never counts toward the destroyed total', () => {
    // Guards the off-by-one that would make every corpus-only restore refuse.
    const d = cascadeDamage([
      { table: 'a', via, rows: 0 },
      { table: 'b', via, rows: 0 },
      { table: 'c', via, rows: 0 },
    ]);
    assert.equal(d.rows, 0);
    assert.equal(d.destroys.length, 0);
  });
});
