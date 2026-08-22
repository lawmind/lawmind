/**
 * One row per search, carrying everything operations needs and nothing an
 * advocate typed.
 *
 * The rule, from the binding addendum: *"Raw query content should be omitted by
 * default... Saved searches are a separate explicit user feature and may store
 * the user's query intentionally. Do not confuse analytics events with
 * saved-search content."*
 *
 * `0075_search_events.sql` carries the reasoning in full. The short version: a
 * legal query names a client, an allegation and a court in one string, and the
 * questions we actually ask of telemetry — is it slow, which class, did an arm
 * time out, are we returning nothing — are answered by the SHAPE of the query.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FAILURE HERE MUST NEVER FAIL A SEARCH
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Telemetry is not the product. The write is fire-and-forget with its own
 * catch: a full disk, a lock, or a migration that has not run yet costs a
 * metric, never an advocate's answer. It is deliberately NOT awaited by the
 * handler — the row is about a response that has already been decided.
 */
import { createHmac } from 'node:crypto';

import type { Sql } from 'postgres';

import { buildSha } from '../build-info.ts';
import { logger } from '../logger.ts';

export type SearchEvent = {
  queryClass: string;
  queryChars: number;
  latencyMs: number;
  resultCount: number;
  degraded: readonly string[];
  /** False when the admission gate refused this request. */
  admitted: boolean;
  /**
   * The HTTP status the advocate actually got.
   *
   * Added after a real incident on this box: 48 case-name searches recorded
   * `result_count = 0` and an EMPTY `degraded` array, which reads as "the corpus
   * has nothing" — and were in fact 500s, from an unbounded query cancelled at
   * the statement timeout while a backup saturated the database. Without the
   * status there is no way to tell those two apart in this table, which is
   * exactly the silent drop the wire exists to prevent, hiding in the telemetry
   * instead of in the response.
   */
  status: number;
  requestId: string | undefined;
  /** The raw identity — hashed here, never stored. */
  subject: string | undefined;
};

/**
 * The salt for `subject_hash`.
 *
 * Per-deployment and secret: an unsalted hash of an email or a user id is
 * reversible by anyone holding a list of candidates, which for a product whose
 * users are a professional register is everybody. Falls back to the auth secret
 * — already required to start, already secret, already per-deployment — rather
 * than to a constant, because a constant salt is no salt.
 *
 * When neither is set (a CLI, a test), the subject is simply not recorded. An
 * absent correlation key is a smaller loss than a reversible one.
 */
function salt(): string | null {
  return process.env['TELEMETRY_SALT'] ?? process.env['AUTH_SECRET'] ?? null;
}

export function subjectHash(subject: string | undefined): string | null {
  if (!subject) return null;
  const key = salt();
  if (!key) return null;
  return createHmac('sha256', key).update(subject).digest('hex').slice(0, 32);
}

export function recordSearchEvent(sql: Sql, event: SearchEvent): void {
  void sql`
    INSERT INTO search_events
      (query_class, query_chars, latency_ms, result_count, degraded, zero_result,
       admitted, http_status, build_sha, request_id, subject_hash)
    VALUES
      (${event.queryClass}, ${event.queryChars}, ${event.latencyMs}, ${event.resultCount},
       ${[...event.degraded]}, ${event.resultCount === 0}, ${event.admitted}, ${event.status},
       ${buildSha}, ${event.requestId ?? null}, ${subjectHash(event.subject)})
  `.catch((error: unknown) => {
    logger.warn({ err: error }, 'search telemetry write failed — the search itself was unaffected');
  });
}
