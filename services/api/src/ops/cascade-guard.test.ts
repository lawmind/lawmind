/**
 * The guard is unit-tested rather than exercised through the CLI on purpose:
 * `release-restore-cli.ts` calls `main()` at import and a test that imported it
 * would run a restore. The SQL that feeds this function is one `pg_constraint`
 * read; the JUDGEMENT is here, and the judgement is the part that can be wrong.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cascadeVictims } from './cascade-guard.ts';

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
