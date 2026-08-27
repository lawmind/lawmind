/**
 * Every timestamp this API emits, in the one format the client can actually parse.
 *
 * **This shipped "Invalid Date" onto the verification sheet.** `created_at::text`
 * renders a Postgres timestamp — `2026-08-06 20:34:06.383686+00` — with a space
 * instead of `T`, six fractional digits, and a two-digit offset. That is not
 * ISO-8601 and it is not what ECMA-262 specifies `Date.parse` must accept.
 *
 * V8 parses it anyway. **Hermes does not**, and Hermes is what runs on the phone.
 * So every test passed on Node, and a Galaxy S24 rendered the literal string
 * "Invalid Date" beside "Safe to file" — on the one surface in this product whose
 * entire job is to be trusted. RCC found it on a device and patched the client
 * defensively, which is correct and is not a reason to keep sending a shape no
 * standard requires anyone to accept.
 *
 * `AT TIME ZONE 'UTC'` then `.MS` gives exactly the ES-spec form:
 * `2026-08-06T20:34:06.383Z` — three fractional digits, `T`, trailing `Z`.
 *
 * **Use this for every `timestamptz`.** A bare `date` column is exempt and safe:
 * `date::text` is already `YYYY-MM-DD`, which the spec does require every engine
 * to parse.
 *
 * The lesson worth keeping: **the test suite runs on a more forgiving engine than
 * the phone.** A test asserting `new Date(x)` succeeded passes on Node against
 * the raw value and ships the bug anyway. Assert the string.
 */

/** ES-spec: `YYYY-MM-DDTHH:mm:ss.sssZ`. Nothing looser is guaranteed to parse. */
export const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * The SQL expression that produces it. Interpolate with `sql.unsafe` — the
 * argument is always a literal column reference written here in this codebase,
 * never anything derived from a request.
 */
export function isoColumn(column: string): string {
  return `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

/**
 * The same rendering, applied to a value ALREADY read as Postgres text.
 *
 * Some reads cast to text deliberately and correctly. `citations/key-freshness.ts`
 * compares cursors for IDENTITY, and postgres.js truncates a `timestamptz` bind to
 * millisecond resolution — two cursors 78 microseconds apart would compare equal
 * through a JS `Date`. Rendering those with `isoColumn()` would break the one thing
 * they exist to do.
 *
 * **The cast is not the defect. Putting the cast's OUTPUT on the wire is.** That is
 * exactly what happened: `readKeyFreshness()` was spread whole into the
 * `/admin/metrics` payload, so four Postgres-text timestamps reached a client out of
 * a function whose casts had been argued to be internal — the argument was true of
 * the casts and false of the response. Converting HERE, at the boundary, keeps the
 * full-precision string where the comparison needs it and gives the client the one
 * form every engine is required to parse.
 *
 * Returns `null` for `null` and — deliberately — for anything it cannot parse. A
 * timestamp we cannot render is absent. It is never a guess.
 */
export function isoFromPgText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  // 2026-08-06 20:34:06.383686+05:30 — also accepts a `T`, an absent fraction, and
  // a bare-hour offset (`+00`), which is the shape that shipped "Invalid Date".
  const m =
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(
      value.trim(),
    );
  if (!m) return null;
  const [, date, time, frac = '', offsetRaw] = m;
  const ms = (frac + '000').slice(0, 3);
  let offset = 'Z';
  if (offsetRaw && offsetRaw !== 'Z') {
    const sign = offsetRaw[0];
    const digits = offsetRaw.slice(1).replace(':', '');
    offset = `${sign}${digits.slice(0, 2)}:${(digits.slice(2) || '00').padEnd(2, '0')}`;
  }
  const parsed = Date.parse(`${date}T${time}.${ms}${offset}`);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}
