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
