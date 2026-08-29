/**
 * Retain what the court sent, before anything depends on being able to read it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE ORDER MATTERS MORE THAN THE CODE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The grant permits 1,000 requests a day. The FIRST authorised response is
 * worth more than any of them, because it is the only thing that can tell us
 * what a cause list actually looks like — `parseCauseList` is a deliberate stub
 * precisely because nobody has ever seen one. A pipeline that parses first and
 * stores second would spend that request, fail to parse an unfamiliar page,
 * and throw away the sample it needed. That is not a hypothetical: it is the
 * shape every first integration takes.
 *
 * So the bytes are retained on their own terms. Parsing is downstream of
 * retention, never a condition of it, and a parser failure costs nothing but a
 * later re-read.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE IT GOES, AND WHY NOT A NEW TABLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `official_source_artifact` (migration 0090) already is this table: append-only
 * by trigger, `source = 'ecourts'`, `artifact_role = 'cause_list'`,
 * `authorization_basis = 'ecourts_registrar_grant'`, raw bytes or an
 * object-storage key, content type, sha over the bytes as received. Adding a
 * second raw store would give two answers to "what did the source send", and the
 * one that drifts is the one an audit reads.
 *
 * A response is NEVER an observation. An observation is a normalised claim about
 * a case; this is the page it was read from. `ecourts-observation-writer.ts`
 * turns one into the other, and only when a parser actually succeeded.
 */
import { createHash } from 'node:crypto';

import { AUTHORISATION } from './authorisation.ts';
import type { Db } from './guard.ts';

/** How the response ended, from our side. Distinct from what it contained. */
export type CaptureOutcome =
  /** The host answered. Whether we can READ it is a separate question. */
  | 'observed'
  /** No usable response: transport error, or a status we will not parse. */
  | 'fetch_failed';

export type RawCapture = {
  /** The exact URL requested, as requested. */
  sourceUrl: string;
  /** The court key we asked about, as we know it. */
  court: string;
  /** The cause-list date requested, ISO date. */
  listDate?: string | undefined;
  /** The eCourts ledger row that spent the quota for this response. */
  ecourtsFetchLedgerId: string;
  observedAt: Date;
  httpStatus?: number | undefined;
  contentType?: string | undefined;
  /** The bytes as received. Never a re-encoded or normalised copy. */
  body: Buffer;
  outcome: CaptureOutcome;
  /** Free-form: transport error text, or why the parser could not read it. */
  note?: string | undefined;
  /** Anything else worth keeping that has no column. Never legal content. */
  metadata?: Record<string, unknown> | undefined;
};

export type CapturedArtifact = {
  id: string;
  payloadSha256: string;
  payloadBytes: number;
};

/**
 * Bytes above this are stored by reference rather than inline.
 *
 * There is no object store wired for eCourts yet, so exceeding it is recorded
 * honestly as a missing artifact rather than silently truncated — a truncated
 * body that still carries a sha over the whole response is a hash that proves
 * nothing about the row it sits on. Cause lists are HTML pages; 8 MB is far
 * above any of them, so this is a guard rail, not a working path.
 */
export const MAX_INLINE_BYTES = 8 * 1024 * 1024;

/**
 * Write one retained response. Append-only: the trigger on
 * `official_source_artifact` refuses UPDATE and DELETE, so a correction is a new
 * row and history cannot be rewritten to look tidier than it was.
 */
export async function captureRawArtifact(
  sql: Db,
  capture: RawCapture,
): Promise<CapturedArtifact> {
  const payloadSha256 = createHash('sha256').update(capture.body).digest('hex');
  const payloadBytes = capture.body.byteLength;
  const inline = payloadBytes > 0 && payloadBytes <= MAX_INLINE_BYTES;

  const metadata = {
    court: capture.court,
    ...(capture.listDate === undefined ? {} : { listDate: capture.listDate }),
    ...(capture.httpStatus === undefined ? {} : { httpStatus: capture.httpStatus }),
    ...(inline
      ? {}
      : {
          retention: 'NOT_RETAINED_OVER_INLINE_LIMIT',
          retentionNote:
            `${payloadBytes} bytes exceeds the ${MAX_INLINE_BYTES}-byte inline limit and no ` +
            'object store is wired for eCourts yet; the response was not retained.',
        }),
    ...(capture.metadata ?? {}),
  };

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO official_source_artifact
      (source, artifact_role, observation_state, observed_at, source_url,
       source_document_key, content_type, payload_sha256, payload_bytes, raw_bytes,
       metadata, extraction_note, authorization_basis, conditions_version,
       ecourts_fetch_ledger_id)
    VALUES (
      'ecourts', 'cause_list', ${capture.outcome},
      ${capture.observedAt.toISOString()}::timestamptz,
      ${capture.sourceUrl},
      ${capture.listDate ? `${capture.court}/${capture.listDate}` : capture.court},
      ${capture.contentType ?? null},
      ${payloadSha256}, ${payloadBytes},
      ${inline ? capture.body : null},
      ${sql.json(metadata)},
      ${capture.note ?? null},
      'ecourts_registrar_grant',
      ${AUTHORISATION?.conditionsVersion ?? null},
      ${capture.ecourtsFetchLedgerId}
    )
    RETURNING id
  `;

  return { id: row!.id, payloadSha256, payloadBytes };
}
