/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ROLE SENTINELS — §13, AND THEY TEST THE DETECTOR AS WELL AS ITS EFFECT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A guard that never fires and a guard that cannot fire look identical from the
 * outside. So this asserts both directions on every case: the wrong role throws,
 * the right role does not, and `offendingTable` names the table it objected to.
 *
 * No database. The point is that a wrong-role query is refused BEFORE it is
 * sent, which is what makes the check work in `single` mode — the configuration
 * every developer actually runs, and the one in which every wrong-role query
 * otherwise succeeds.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WrongRoleQueryError, offendingTable, roleGuarded } from './db-role-guard.ts';

/** A stand-in for postgres.js: records what it was asked to send. */
function fakeSql() {
  const sent: string[] = [];
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    sent.push(strings.join(' ? '));
    return Promise.resolve([{ values: values.length }]);
  }) as unknown as {
    (strings: TemplateStringsArray, ...v: unknown[]): Promise<unknown[]>;
    sent: string[];
    unsafe: (s: string) => Promise<unknown[]>;
    begin: (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
  };
  sql.sent = sent;
  sql.unsafe = (s: string) => {
    sent.push(s);
    return Promise.resolve([]);
  };
  sql.begin = (fn: (tx: unknown) => Promise<unknown>) => fn(sql);
  return sql;
}

const tag = (s: string) => Object.assign([s], { raw: [s] }) as unknown as TemplateStringsArray;

describe('offendingTable', () => {
  it('names a USER table asked for through the corpus role', () => {
    assert.equal(offendingTable('SELECT * FROM matters WHERE id = $1', 'corpus'), 'matters');
  });

  it('names a CORPUS table asked for through the user role', () => {
    assert.equal(offendingTable('SELECT * FROM judgments WHERE id = $1', 'user'), 'judgments');
  });

  it('permits a table the role owns — so the two answers are not the same answer', () => {
    assert.equal(offendingTable('SELECT * FROM judgments WHERE id = $1', 'corpus'), null);
    assert.equal(offendingTable('SELECT * FROM matters WHERE id = $1', 'user'), null);
  });

  it('permits a corpus-to-corpus join, which the split does not break', () => {
    assert.equal(
      offendingTable(
        'SELECT j.id FROM judgments j LEFT JOIN judgments o ON o.id = j.overruled_by_judgment_id',
        'corpus',
      ),
      null,
    );
  });

  it('catches the wrong role in a JOIN, not only in the FROM', () => {
    assert.equal(
      offendingTable('SELECT * FROM matters m JOIN judgments j ON j.id = m.id', 'user'),
      'judgments',
    );
  });

  it('catches writes as well as reads', () => {
    assert.equal(offendingTable('INSERT INTO citation_checks (id) VALUES ($1)', 'corpus'), 'citation_checks');
    assert.equal(offendingTable('UPDATE saved_searches SET last_seen_at = now()', 'corpus'), 'saved_searches');
    assert.equal(offendingTable('DELETE FROM judgment_annotations WHERE id = $1', 'corpus'), 'judgment_annotations');
  });

  it('does not mistake a CTE for the table it shares a name with', () => {
    /* A statement-local name is not a table. Excluding it by name rather than by
     * scope is the documented limit of a syntactic check, and it fails in the
     * safe direction: it can only ever permit, never refuse. */
    assert.equal(
      offendingTable('WITH matters AS (SELECT 1 AS id) SELECT * FROM matters', 'corpus'),
      null,
    );
  });

  it('ignores a table nobody has classified', () => {
    assert.equal(offendingTable('SELECT * FROM pg_stat_activity', 'user'), null);
  });
});

describe('roleGuarded', () => {
  it('throws on a wrong-role statement and never sends it', () => {
    const raw = fakeSql();
    const guarded = roleGuarded(raw as never, 'corpus');
    assert.throws(
      () => (guarded as never as (s: TemplateStringsArray) => unknown)(tag('SELECT * FROM matters')),
      WrongRoleQueryError,
    );
    assert.equal(raw.sent.length, 0, 'the statement reached the connection anyway');
  });

  it('passes a right-role statement straight through', async () => {
    const raw = fakeSql();
    const guarded = roleGuarded(raw as never, 'corpus');
    await (guarded as never as (s: TemplateStringsArray) => Promise<unknown>)(
      tag('SELECT * FROM judgments'),
    );
    assert.equal(raw.sent.length, 1);
  });

  it('checks inside a transaction too — that is where the writes are', async () => {
    const raw = fakeSql();
    const guarded = roleGuarded(raw as never, 'corpus');
    await assert.rejects(
      () =>
        (guarded as never as { begin: (fn: (tx: never) => Promise<unknown>) => Promise<unknown> }).begin(
          async (tx: never) => (tx as unknown as (s: TemplateStringsArray) => unknown)(tag('INSERT INTO matters (id) VALUES ($1)')),
        ),
      WrongRoleQueryError,
    );
    assert.equal(raw.sent.length, 0);
  });

  it('checks `unsafe`, which is the obvious way around a template check', () => {
    const raw = fakeSql();
    const guarded = roleGuarded(raw as never, 'user');
    assert.throws(
      () => (guarded as never as { unsafe: (s: string) => unknown }).unsafe('SELECT * FROM judgments'),
      WrongRoleQueryError,
    );
    assert.equal(raw.sent.length, 0);
  });

  it('never retries against the other role — the error is the whole behaviour', () => {
    const raw = fakeSql();
    const guarded = roleGuarded(raw as never, 'corpus');
    try {
      (guarded as never as (s: TemplateStringsArray) => unknown)(tag('SELECT * FROM matters'));
      assert.fail('the wrong-role query was permitted');
    } catch (err) {
      assert.ok(err instanceof WrongRoleQueryError);
      assert.equal(err.table, 'matters');
      assert.match(err.message, /no fallback/);
    }
  });
});
