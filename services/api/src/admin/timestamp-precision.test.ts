/**
 * A TIMESTAMP BIND PARAMETER LOSES ITS MICROSECONDS, AND ONE DIRECTION SKIPS ROWS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW2 bus 1231, found chasing a non-terminating walk in their own lane and
 * reported here because it also sat inside an LCC P0.
 *
 * postgres.js infers a parameter type from the cast it is written against,
 * routes the string through a JavaScript `Date` — millisecond resolution — and
 * PostgreSQL receives a value up to 999 microseconds EARLY:
 *
 *     SELECT ${AT}::timestamptz::text          ->  2026-08-17 16:46:59.812+00
 *     SELECT (${AT}::text)::timestamptz::text  ->  2026-08-17 16:46:59.812119+00
 *
 * Both reproduced here against the live database rather than quoted.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE DIRECTION IS THE WHOLE STORY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Truncation always moves the bound EARLIER. So:
 *
 *   `created_at > cursor`   re-reads rows it already passed. Wasteful, and in
 *                           NEW2's walk non-terminating — 266,124,061 judgments
 *                           re-walked before they killed it at 56 minutes. It
 *                           cannot lose a row.
 *
 *   `created_at < cursor`   EXCLUDES MORE. On the descending keyset cursor in
 *                           `admin/audit.ts` this silently drops audit rows
 *                           between one page and the next.
 *
 * The second is the one that matters, and it is measured below rather than
 * argued: three audit entries written inside a single millisecond, page two
 * returns 0 of the 2 that should follow the cursor. R8.1 §8.1 puts audit
 * integrity in the security gate, which is why a defect this small gets a test.
 *
 * §8.4 asks for BOTH directions to be tested. Both are.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

after(async () => {
  await sql.end({ timeout: 5 });
});

/** Microseconds that no millisecond-resolution path can carry. */
const AT = '2026-08-17 16:46:59.812119+00';

describe('timestamptz bind precision', () => {
  it('the driver TRUNCATES a timestamptz parameter, and a text cast does not', async () => {
    const [bound] = await sql<{ v: string }[]>`SELECT ${AT}::timestamptz::text AS v`;
    const [text] = await sql<{ v: string }[]>`SELECT (${AT}::text)::timestamptz::text AS v`;

    assert.equal(
      bound?.v,
      '2026-08-17 16:46:59.812+00',
      'if this stops truncating, postgres.js changed and the casts below can be simplified',
    );
    assert.equal(text?.v, AT, 'the text cast must preserve every microsecond');
    assert.notEqual(bound?.v, text?.v, 'the whole defect is that these differ');
  });

  it('a DESCENDING cursor skips audit rows when the bind truncates', async () => {
    /**
     * Three rows inside one millisecond — what a burst of admin actions looks
     * like. Written and rolled back; residue asserted afterwards.
     */
    let bindCount = -1;
    let textCount = -1;

    await sql
      .begin(async (tx) => {
        const [seed] = await tx<{ actor_user_id: string }[]>`
          SELECT actor_user_id FROM audit_log LIMIT 1`;
        assert.ok(seed, 'audit_log is empty — this test needs one row to borrow an actor from');

        const base = '2026-08-26 01:00:00.500';
        for (const micros of ['100', '400', '900']) {
          await tx`
            INSERT INTO audit_log (actor_user_id, actor_role, action, target_type, created_at)
            VALUES (${seed.actor_user_id}, 'admin', 'probe.pagination', 'probe',
                    (${`${base}${micros}+00`}::text)::timestamptz)`;
        }

        const rows = await tx<{ ts: string }[]>`
          -- iso-time-exempt: reading the RAW Postgres form is this test's subject — it proves the driver truncates a bind to milliseconds, and isoColumn() would erase the microseconds being measured.
          SELECT created_at::text AS ts FROM audit_log
           WHERE action = 'probe.pagination' ORDER BY created_at DESC`;
        assert.equal(rows.length, 3);

        // Page one ended on the newest row; page two asks for everything before it.
        const cursor = rows[0]!.ts;

        const [bound] = await tx<{ c: number }[]>`
          SELECT count(*)::int AS c FROM audit_log
           WHERE action = 'probe.pagination' AND created_at < ${cursor}::timestamptz`;
        const [text] = await tx<{ c: number }[]>`
          SELECT count(*)::int AS c FROM audit_log
           WHERE action = 'probe.pagination' AND created_at < (${cursor}::text)::timestamptz`;

        bindCount = bound?.c ?? -1;
        textCount = text?.c ?? -1;
        throw new Error('ROLLBACK');
      })
      .catch((e: Error) => {
        if (e.message !== 'ROLLBACK') throw e;
      });

    assert.equal(textCount, 2, 'the correct predicate returns both older rows');
    assert.equal(
      bindCount,
      0,
      'the truncating predicate returns none of them — this is the skip, and if this ' +
        'assertion ever fails because bindCount rose to 2, the driver stopped truncating',
    );

    const [left] = await sql<{ c: number }[]>`
      SELECT count(*)::int AS c FROM audit_log WHERE action = 'probe.pagination'`;
    assert.equal(left?.c, 0, 'probe rows must not survive the rollback');
  });

  it('no shipping query binds a bare timestamptz parameter', async () => {
    /**
     * The durable half. Fixing seven call sites fixes today; this fails the
     * moment an eighth is written, which is how the first seven arrived.
     *
     * `court/guard.ts` DOES use the shape, and is exempt anyway: it binds
     * `at.toISOString()`, and a JavaScript Date has no microseconds for the
     * driver to truncate. That exemption is applied by shape below, never by
     * filename — see the note at the `toISOString` check.
     */
    const { readdirSync, statSync, readFileSync } = await import('node:fs');
    const { join, extname } = await import('node:path');

    const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        if (e === 'node_modules' || e.startsWith('.')) continue;
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (extname(e) === '.ts' && !e.endsWith('.test.ts')) files.push(p);
      }
    };
    walk(root);

    /** `${...}::timestamptz` NOT already wrapped in a `::text` cast. */
    const BARE = /\$\{[^}]*\}::timestamptz/g;
    const offenders: string[] = [];
    for (const f of files) {
      const body = readFileSync(f, 'utf8');
      for (const m of body.matchAll(BARE)) {
        const start = Math.max(0, m.index - 8);
        if (body.slice(start, m.index + m[0].length).includes('::text)::timestamptz')) continue;
        /**
         * Exempt by SHAPE, not by a file allowlist. A JavaScript `Date` has no
         * microseconds, so `${d.toISOString()}` has nothing the driver can
         * truncate. `court/guard.ts` is the current instance; anything else
         * built the same way is equally safe, and an allowlist of filenames
         * would have to be maintained by whoever remembers this rule.
         */
        if (m[0].includes('toISOString()')) continue;
        offenders.push(`${f.slice(root.length)}: ${m[0]}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `these bind a timestamptz directly and lose microseconds. Write ` +
        `(\${x}::text)::timestamptz instead. A > comparison re-reads; a < comparison SKIPS`,
    );
  });
});
