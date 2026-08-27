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

import { ISO_8601, isoColumn, isoFromPgText } from './iso-time.ts';
import { collectMetrics } from './admin/metrics.ts';

const sql = postgres(process.env['DATABASE_URL'] ?? '', { max: 2, onnotice: () => {} });

// One pool for the file. Closed at the END of the file, not at the end of the
// first describe -- the payload assertion in the last block needs it, and a
// per-describe `after` closed it out from under that test.
after(async () => {
  await sql.end();
});

describe('isoColumn', () => {
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

describe('isoFromPgText', () => {
  it('renders the exact string that shipped "Invalid Date"', () => {
    assert.equal(isoFromPgText('2026-08-06 20:34:06.383686+00'), '2026-08-06T20:34:06.383Z');
  });

  it('carries a half-hour offset rather than rounding it', () => {
    assert.equal(isoFromPgText('2026-08-06 20:34:06.383686+05:30'), '2026-08-06T15:04:06.383Z');
  });

  it('handles an absent fraction and an already-T form', () => {
    assert.equal(isoFromPgText('2026-08-06 20:34:06+00'), '2026-08-06T20:34:06.000Z');
    assert.equal(isoFromPgText('2026-08-06T20:34:06.383Z'), '2026-08-06T20:34:06.383Z');
  });

  it('returns null rather than a guess', () => {
    assert.equal(isoFromPgText(null), null);
    assert.equal(isoFromPgText(undefined), null);
    assert.equal(isoFromPgText('not a timestamp'), null);
    // A bare date is NOT a timestamptz and must not be silently promoted to midnight.
    assert.equal(isoFromPgText('2026-08-06'), null);
  });

  it('every output it produces satisfies the same grammar the columns must', () => {
    for (const raw of [
      '2026-08-06 20:34:06.383686+00',
      '2026-08-06 20:34:06.3+05:30',
      '2026-12-31 23:59:59.999999-08',
    ]) {
      const iso = isoFromPgText(raw);
      assert.ok(iso, `${raw} did not render`);
      assert.match(iso, ISO_8601);
    }
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SOURCE SWEEP, AND WHY IT NOW HAS AN EXEMPTION IT DID NOT HAVE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The rule in this block's own name is about the **client**. The sweep that
 * enforced it matched `_at::text` anywhere in the service, and those are not the
 * same claim. Two consequences, both live, and they point in OPPOSITE directions:
 *
 * **It over-matched.** `citations/key-freshness.ts` casts `cursor_at::text`
 * because the comparison it feeds is an IDENTITY check and postgres.js truncates
 * a `timestamptz` bind to milliseconds — two cursors 78 microseconds apart would
 * compare equal through a JS `Date`. `admin/timestamp-precision.test.ts` casts to
 * prove that truncation exists at all. `isoColumn()` would break both. The sweep
 * had no way to say so, so the suite carried a permanent red that no correct
 * change could clear — and a permanent red is a guard nobody reads.
 *
 * **It under-matched, and this is the half that mattered.** `_at::text` does not
 * match `max(created_at)::text`. Three parenthesised casts were invisible to it,
 * one of them `key-freshness.ts`'s own `ingestAt`. A guard with a hole is worse
 * than a loud one.
 *
 * And the exemption argument turned out to be true of the CASTS and false of the
 * RESPONSE: `readKeyFreshness()` was spread whole into `/admin/metrics`, so four
 * of those "internal" strings reached an admin client. Fixed at the boundary in
 * `admin/metrics.ts`, not by changing the reads.
 *
 * So the sweep now does three things instead of one:
 *   1. matches the parenthesised form too;
 *   2. accepts a per-line `iso-time-exempt: <reason>` marker, which is auditable
 *      because the reason is required and the FILES holding one are pinned below;
 *   3. is backed by an assertion on the actual payload, because a marker is a
 *      human's claim and the payload is the observation. A cast may be exempt.
 *      A response may not.
 */
const EXEMPT_MARKER = /iso-time-exempt:\s*(\S.*)$/;

/**
 * Files permitted to hold an exemption at all. Pinned so the marker cannot spread
 * quietly: a new file needs this list edited, which is a review, which is the
 * whole point. Line numbers deliberately NOT pinned — they move under every edit
 * above them and a list people re-edit reflexively stops being a list.
 */
const FILES_ALLOWED_EXEMPTIONS = [
  'admin/timestamp-precision.test.ts',
  'citations/key-freshness.ts',
  'citations/key-freshness.test.ts',
  'citations/old-row-backfill-falsifier.test.ts',
  'court/guard.ts',
  'release/candidate.ts',
];

describe('no timestamptz reaches the client as Postgres text', () => {
  const root = fileURLToPath(new URL('./', import.meta.url));

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = `${dir}/${entry}`;
      return statSync(full).isDirectory() ? walk(full) : [full];
    });

  /** Every `<something>_at::text`, including `max(created_at)::text`. */
  const CAST = /_at\)*::text/;

  type Site = { rel: string; line: number; text: string; exemption: string | null };

  const sites = (): Site[] => {
    const found: Site[] = [];
    for (const file of walk(root)) {
      if (!file.endsWith('.ts')) continue;
      const rel = file.slice(root.length).replace(/\\/g, '/').replace(/^\/+/, '');
      // The module that defines the rule and the test that enforces it both quote
      // the broken form in prose. Everything else is a real site.
      if (rel === 'iso-time.test.ts' || rel === 'iso-time.ts') continue;
      // `\r?\n`, not `\n`. Half this service is CRLF and half is LF, and a
      // trailing `\r` is a LINE TERMINATOR to JavaScript's `.` — so `(\S.*)$` in
      // the marker pattern never reached the end of a CRLF line and every
      // exemption in a CRLF file read as unmarked. The old sweep's pattern had no
      // anchor, so this was latent rather than new.
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      for (const [i, line] of lines.entries()) {
        if (!CAST.test(line)) continue;
        // A line that is ITSELF a comment is prose, not a cast. Nothing on it
        // executes, and the alternative is that no file in this service may
        // name the broken form while explaining it -- which is how the rule
        // stops being explainable. `corpus/coverage.test.ts` hit this the hour
        // after the sweep was tightened, describing the very defect it fixed.
        if (/^\s*(\/\/|\*|--)/.test(line)) continue;
        // The marker may sit on the line or on the one above it, because a long
        // SQL line has nowhere to put a comment.
        const own = EXEMPT_MARKER.exec(line);
        const above = i > 0 ? EXEMPT_MARKER.exec(lines[i - 1] ?? '') : null;
        found.push({
          rel,
          line: i + 1,
          text: line.trim(),
          exemption: (own?.[1] ?? above?.[1] ?? null)?.trim() || null,
        });
      }
    }
    return found;
  };

  it('casts no _at column to text anywhere in the service, unmarked', () => {
    const offenders = sites()
      .filter((s) => s.exemption === null)
      .map((s) => `${s.rel}:${s.line}`);
    assert.deepEqual(
      offenders,
      [],
      `these cast a timestamp to Postgres text, which Hermes cannot parse: ${offenders.join(', ')}. ` +
        'Use isoColumn() from src/iso-time.ts. It rendered "Invalid Date" on the verification sheet ' +
        'once. If the value is compared for identity and never rendered, mark the line ' +
        '`iso-time-exempt: <why>` and add the file to FILES_ALLOWED_EXEMPTIONS.',
    );
  });

  it('every exemption names a reason, and lives in a pinned file', () => {
    const exempt = sites().filter((s) => s.exemption !== null);
    // Non-vacuity: if this ever reaches zero the two assertions below are true of
    // nothing, and the sweep would be silently unguarded on the axis it exists for.
    assert.ok(exempt.length > 0, 'no exemptions found — is the marker still being read?');
    for (const s of exempt) {
      assert.ok(
        FILES_ALLOWED_EXEMPTIONS.includes(s.rel),
        `${s.rel}:${s.line} claims an exemption and its file is not pinned: ${s.text}`,
      );
      assert.ok(
        (s.exemption ?? '').length >= 20,
        `${s.rel}:${s.line} claims an exemption without saying why: "${s.exemption}"`,
      );
    }
  });

  it('THE OBSERVATION — the admin metrics payload renders every timestamp as ISO', async () => {
    // The marker above is a human's claim. This is the check. `collectMetrics` is
    // the payload builder behind GET /admin/metrics, called directly so the
    // assertion is about the response shape and not about the auth middleware.
    const { payload } = await collectMetrics(sql);

    const bad: string[] = [];
    const visit = (node: unknown, path: string): void => {
      if (typeof node === 'string') {
        // Anything that looks like a Postgres timestamp is judged; ordinary prose
        // is not. `because[]` carries cursors inside sentences and is exempt by
        // shape — a reason is read by a human, never parsed by a Date.
        if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(node) && !ISO_8601.test(node)) {
          bad.push(`${path} = ${node}`);
        }
        return;
      }
      if (Array.isArray(node)) {
        node.forEach((v, i) => visit(v, `${path}[${i}]`));
        return;
      }
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          if (k === 'because' || k === 'detail') continue;
          visit(v, path ? `${path}.${k}` : k);
        }
      }
    };
    visit(payload, '');

    assert.deepEqual(
      bad,
      [],
      `these reached the client as Postgres text: ${bad.join(', ')}. ` +
        'Render with isoFromPgText() at the boundary.',
    );
  });
});
