/**
 * THE SCRUBBER — deliberately the SECOND line of defence, not the first.
 *
 * `events.ts`'s closed property types are the first: there is no free-text
 * field on any event for a search query, a matter note or a client name to
 * occupy. This module exists for when that discipline slips — a future
 * event added in a hurry with a `label: string` or a debug `context: any` —
 * and makes the failure mode "the value never left the device" rather than
 * "we hope nobody added a string field".
 *
 * `docs/PRIVACY_PII.md` / `CLAUDE.md` §6a: sensitive-class data (matter
 * facts, client names, uploaded-document content, search query text) is
 * pseudonymised before any external call, and analytics is an external call
 * like any other. This is intentionally BLUNT rather than a PII detector —
 * Presidio-grade detection is explicitly "not the answer" even for the
 * primary content pipeline (`OD-6`); for a telemetry event it is the wrong
 * tool entirely. The rule here is not "detect and redact names" but "an
 * event may carry only values from `events.ts`'s own closed enums/ids/
 * numbers/booleans — anything else is dropped, never guessed at".
 */

const ALLOWED_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * `true` for exactly the shapes an event property is allowed to be: a
 * boolean, a finite number, or a string that looks like an id/enum value
 * rather than prose. A judgment id, a product id and a cancel-reason enum
 * all match; a search query, a client's name or a matter note does not,
 * because none of them are bounded-length token strings with no whitespace.
 */
function isSafeScalar(value: unknown): boolean {
  if (typeof value === 'boolean' || typeof value === 'number') return Number.isFinite(value) || typeof value === 'boolean';
  if (typeof value === 'string') return ALLOWED_ID_PATTERN.test(value);
  return false;
}

export type ScrubResult<T> = {
  safe: T;
  /** Property names dropped because they were not a safe scalar. Never the VALUES — even in this diagnostic, a stripped value is never echoed back. */
  droppedKeys: string[];
};

/**
 * Strips any property whose value is not a safe scalar. Nested objects and
 * arrays are dropped whole, never recursed into — a nested object is exactly
 * the shape a matter or a document would take, and this function's job is to
 * refuse that shape rather than partially trust it.
 */
export function scrubEventProps<T extends Record<string, unknown>>(
  props: T,
): ScrubResult<Partial<T>> {
  const safe: Record<string, unknown> = {};
  const droppedKeys: string[] = [];

  for (const [key, value] of Object.entries(props)) {
    if (isSafeScalar(value)) {
      safe[key] = value;
    } else {
      droppedKeys.push(key);
    }
  }

  return { safe: safe as Partial<T>, droppedKeys };
}
