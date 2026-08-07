/**
 * The timestamp rule, asserted two ways.
 *
 * **This bug shipped.** The API emitted `2026-08-06 20:34:06.383686+00` and a
 * Galaxy S24 rendered the literal string "Invalid Date" next to "Safe to file" on
 * the verification sheet. Every test passed, because the suite runs on Node's V8,
 * which parses that string, and the phone runs Hermes, which does not — and only
 * Hermes is following the specification.
 *
 * So neither assertion below is `new Date(x)` succeeded. **That test passes on
 * Node against the raw broken value and ships the bug anyway.** They assert the
 * STRING against the ES-262 grammar instead.
 *
 * The second test is a source-level sweep, because this rule is enforced by an
 * absence — no `timestamptz` is ever cast to text — and absences rot silently. It
 * rotted once already: three of the offending casts were written by this lane an
 * hour after RCC diagnosed the failure on a device.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';

import postgres from 'postgres';

import { ISO_8601, isoColumn } from './iso-time.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

describe('isoColumn', () => {
  after(async () => {
    await sql.end();
  });

  it('renders a timestamptz in the form ECMA-262 requires every engine to parse', async () => {
    // A literal, so this needs no corpus and cannot skip. The value carries
    // microseconds and a non-UTC offset — the two things that broke the phone.
    const [row] = await sql<{ iso: string }[]>`
      SELECT ${sql.unsafe(isoColumn(`'2026-08-06 20:34:06.383686+05:30'::timestamptz`))} AS iso
    `;
    assert.ok(row);
    assert.match(row.iso, ISO_8601);
    // Normalised to UTC, and the half-hour offset is carried, not rounded.
    assert.equal(row.iso, '2026-08-06T15:04:06.383Z');
    assert.ok(!Number.isNaN(Date.parse(row.iso)));
  });

  it('produces null for a null timestamp rather than a string that looks like one', async () => {
    const [row] = await sql<{ iso: string | null }[]>`
      SELECT ${sql.unsafe(isoColumn(`NULL::timestamptz`))} AS iso
    `;
    assert.equal(row?.iso, null);
  });

  it('rejects the shape that actually shipped', () => {
    // Kept as a literal so the regression is legible without archaeology.
    assert.ok(!ISO_8601.test('2026-08-06 20:34:06.383686+00'));
    assert.ok(!ISO_8601.test('2026-08-06T20:34:06.383686+00'));
    assert.ok(ISO_8601.test('2026-08-06T20:34:06.383Z'));
  });
});

describe('no timestamptz reaches the client as Postgres text', () => {
  const root = fileURLToPath(new URL('./', import.meta.url));

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = `${dir}/${entry}`;
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  it('casts no _at column to text anywhere in the service', () => {
    // `_date::text` is deliberately NOT caught: a `date` column casts to
    // `YYYY-MM-DD`, which the specification does require every engine to parse.
    // Only `timestamptz` produces the space-separated form that broke Hermes.
    const offenders: string[] = [];
    for (const file of walk(root)) {
      if (!file.endsWith('.ts')) continue;
      const rel = file.slice(root.length).replace(/\\/g, '/').replace(/^\/+/, '');
      // The module that defines the rule and the test that enforces it both quote
      // the broken form in prose. Everything else is a real offender.
      if (rel === 'iso-time.test.ts' || rel === 'iso-time.ts') continue;
      const source = readFileSync(file, 'utf8');
      for (const [i, line] of source.split('\n').entries()) {
        if (/_at::text/.test(line)) offenders.push(`${rel}:${i + 1}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `these cast a timestamp to Postgres text, which Hermes cannot parse: ${offenders.join(', ')}. ` +
        'Use isoColumn() from src/iso-time.ts. It rendered "Invalid Date" on the verification sheet once.',
    );
  });
});
