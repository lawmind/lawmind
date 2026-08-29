/**
 * The append-only writer for `ecourts_observation`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES, AND WHY EACH REFUSAL IS THE POINT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **It only accepts parser output.** A caller cannot hand it a court name and a
 * date and have it write "nothing changed". There is no code path from a failed
 * fetch or a failed parse to a row in this table, because the most dangerous
 * object this product can produce is a confident observation nobody observed:
 * a briefing goes out either way, and the advocate cannot tell the difference.
 * "We could not observe" lives on the fetch ledger and the sync row. It is not
 * an observation.
 *
 * **A listing is not a hearing.** `observation_kind` has no `hearing_occurred`
 * value, the CHECK constraint from migration 0061 makes minting one impossible,
 * and this module never derives attendance from a listing. eCourts publishes
 * that a matter was listed. Whether it was heard is a fact from a later
 * artefact, or it is not a fact.
 *
 * **Uncertainty survives the write.** A row we could only partly read is written
 * with `extraction_state = 'partial'` and the reason, never dropped and never
 * promoted into a transition — the same rule as an unverified citation, for the
 * same reason: a silent drop is indistinguishable from a court that said
 * nothing.
 *
 * **Every row names the bytes it came from.** `source_artifact_id` (migration
 * 0096) points at the retained response. Without it, `payload_sha256` proves a
 * hash was computed and nothing about whether the evidence still exists.
 *
 * **Re-reading one response twice writes it once.** The retained artifact is the
 * unit of work — one request, one page, one set of listings — so replaying it
 * (a re-parse after a parser fix, a retried job, two workers handed the same
 * artifact) must not double the record. This table is append-only, so a
 * duplicate cannot be cleaned up afterwards; it is permanent, and it would make
 * "how many matters were listed" wrong by however many times the job ran.
 */
import type { JSONValue } from 'postgres';

import { AUTHORISATION } from './authorisation.ts';
import type { Db, ObservationStrategy } from './guard.ts';

/**
 * The kinds this writer may produce. A deliberate subset of migration 0061's
 * CHECK: the ones a cause list can actually evidence.
 */
export type CauseListObservationKind = 'cause_list_entry';

export type ValidatedCauseListItem = {
  /** As the source printed it. Never normalised into existence. */
  cnr: string | null;
  caseNumber: string | null;
  caseType?: string | null;
  caseYear?: number | null;
  courtNumber: string | null;
  itemNumber: number | null;
  bench?: string | null;
  /** Everything the extractor read for this line, verbatim. */
  raw: Record<string, JSONValue>;
  /** `partial` when a line was only half-read. Never silently dropped. */
  extractionState?: 'parsed' | 'partial';
  extractionNote?: string | null;
};

export type CauseListObservationBatch = {
  court: string;
  courtCode?: string | null;
  /** The date the LIST is for. This is the source's assertion, not ours. */
  listingDate: string;
  /** When WE fetched it. */
  observedAt: Date;
  endpoint: string;
  /** sha over the bytes as received, before parsing. */
  payloadSha256: string;
  /** The retained raw response. Required — see the header. */
  sourceArtifactId: string;
  fetchLedgerId: string;
  strategy: ObservationStrategy;
  items: ValidatedCauseListItem[];
  /**
   * Which extractor read these rows. Required.
   *
   * An observation is only as good as the code that produced it, and the code
   * changes. Without this, a parser bug found in November leaves no way to ask
   * which rows came from the broken version — the rows are append-only, so the
   * answer has to be recorded at write time or it does not exist.
   */
  parserVersion: string;
  /**
   * The SOURCE's own statements about its data — for the cause list, the
   * court's "Cause list displayed may differ from the actual cause list."
   *
   * Carried into every row rather than logged. Master Roadmap v5 and the
   * founder's instruction both require the court's uncertainty to survive as
   * source uncertainty; a derived state of ours must never read as though the
   * court certified it.
   */
  sourceWarnings?: readonly string[];
};

/**
 * The advisory-lock namespace for one artifact's write.
 *
 * The SAME primitive the quota reservation uses — `pg_advisory_xact_lock`,
 * transaction-scoped, released by commit or rollback — deliberately, because a
 * second kind of lock is a second set of semantics to get wrong. A different key
 * space, because this protects a different resource: quota admission is one
 * global budget, this is one artifact at a time.
 *
 * Two classids keep them from ever colliding: the quota lock is the single-arg
 * form (classid 0), this is the two-arg form under a namespace of its own.
 */
export const OBSERVATION_WRITE_LOCK_NAMESPACE = 20_260_829;

export class ObservationWriteRefused extends Error {
  override name = 'ObservationWriteRefused';
}

function refuse(message: string): never {
  throw new ObservationWriteRefused(message);
}

/**
 * Write one parsed cause list.
 *
 * **Call it with a transaction handle.** A half-written list is a list with
 * silently missing matters, which reads downstream as "this matter is not listed
 * today" — the exact false negative a monitoring product cannot afford. Either
 * the whole page's listings are recorded or none are and the sync stays failed.
 * `fetchCauseList` opens the transaction; anything else calling this owes the
 * same.
 */
export async function writeCauseListObservations(
  sql: Db,
  batch: CauseListObservationBatch,
): Promise<string[]> {
  const conditionsVersion = AUTHORISATION?.conditionsVersion;
  if (!conditionsVersion) {
    // Provenance is four NOT NULL columns because a row we cannot place inside
    // the grant is a row we cannot defend. Without the transcribed conditions
    // there is nothing to place it inside.
    refuse(
      'the registrar’s conditions are not transcribed, so no observation can record which ' +
        'grant it was taken under; refusing to write provenance-less rows',
    );
  }
  if (!batch.sourceArtifactId) {
    refuse('an observation must name the retained response it was parsed out of');
  }
  if (!batch.fetchLedgerId) {
    refuse('an observation must name the ledgered request that obtained it');
  }
  if (!/^[0-9a-f]{64}$/.test(batch.payloadSha256)) {
    refuse(`payloadSha256 ${batch.payloadSha256} is not a sha256 over the received bytes`);
  }
  if (!batch.parserVersion) {
    refuse(
      'an observation must name the extractor that produced it; rows whose parser is unknown ' +
        'cannot be re-examined when that parser turns out to be wrong',
    );
  }
  /**
   * IDEMPOTENCY, TAKEN BEFORE THE CHECK RATHER THAN HOPED FOR AFTER IT.
   *
   * `hashtext` gives a stable int4 for the artifact id, and the lock is held
   * until this transaction ends — so two callers handed the same artifact
   * serialise here, and the second one sees the first one's committed rows
   * instead of racing it to insert a second copy. Without the lock this would be
   * the same read-then-act race the quota reservation already had to fix, with a
   * worse failure: the duplicate rows are append-only and permanent.
   */
  await sql`
    SELECT pg_advisory_xact_lock(${OBSERVATION_WRITE_LOCK_NAMESPACE}, hashtext(${batch.sourceArtifactId}))
  `;
  const already = await sql<{ id: string }[]>`
    SELECT id FROM ecourts_observation
     WHERE source_artifact_id = ${batch.sourceArtifactId}::uuid
     ORDER BY item_number NULLS LAST, id
  `;
  if (already.length > 0) {
    /**
     * Not an error. Replaying one artifact is a normal, wanted thing — it is how
     * a parser fix is applied to evidence we already hold — and the honest
     * result is the ids that already exist, so a caller counting observations
     * counts the same list it counted the first time.
     */
    return already.map((row) => row.id);
  }

  if (batch.items.length === 0) {
    // An empty LIST is a real Tuesday and is recorded on `cause_list_syncs` as
    // `empty`. It is not zero observations plus a claim; there is simply
    // nothing to observe, and inventing a placeholder row would make "the court
    // published nothing" and "we read nothing" identical again.
    return [];
  }

  const kind: CauseListObservationKind = 'cause_list_entry';
  const written: string[] = [];

  for (const [index, item] of batch.items.entries()) {
    if (item.cnr === null && item.caseNumber === null) {
      refuse(
        `item ${index} identifies no case: a cause-list line with neither a CNR nor a case ` +
          'number cannot be attached to a matter, and inventing one is the failure this ' +
          'pipeline exists to prevent',
      );
    }
    const state = item.extractionState ?? 'parsed';
    if (state !== 'parsed' && state !== 'partial') {
      refuse(`item ${index} declares an extraction state this writer does not accept: ${state}`);
    }

    /**
     * Provenance and the source's own uncertainty ride INSIDE the payload,
     * under reserved keys, because `ecourts_observation` is append-only and
     * adding columns to it later cannot backfill rows written today.
     */
    const payload: Record<string, JSONValue> = {
      ...item.raw,
      _parserVersion: batch.parserVersion,
      _sourceWarnings: [...(batch.sourceWarnings ?? [])],
    };

    const extractionNote = [
      item.extractionNote ?? null,
      (batch.sourceWarnings ?? []).length > 0
        ? `source states: ${(batch.sourceWarnings ?? []).join(' ')}`
        : null,
    ]
      .filter((v): v is string => Boolean(v))
      .join(' | ');

    const [row] = await sql<{ id: string }[]>`
      INSERT INTO ecourts_observation
        (observation_kind, source, observed_at, source_asserted_at, court, court_code,
         cnr, case_number, case_year, case_type, listing_date, bench, court_number,
         item_number, payload, payload_sha256, endpoint, grant_data_type,
         conditions_version, fetch_ledger_id, extraction_state, extraction_note,
         source_artifact_id)
      VALUES (
        ${kind}, 'ecourts',
        ${batch.observedAt.toISOString()}::timestamptz,
        -- The source dates the LIST; that is what it asserts. It does not assert
        -- when we looked, and a late fetch must not move state backwards.
        ${batch.listingDate}::date,
        ${batch.court}, ${batch.courtCode ?? null},
        ${item.cnr}, ${item.caseNumber}, ${item.caseYear ?? null}, ${item.caseType ?? null},
        ${batch.listingDate}::date,
        ${item.bench ?? null}, ${item.courtNumber}, ${item.itemNumber},
        ${sql.json(payload)}, ${batch.payloadSha256}, ${batch.endpoint},
        'cause_list', ${conditionsVersion}, ${batch.fetchLedgerId},
        ${state}, ${extractionNote === '' ? null : extractionNote}, ${batch.sourceArtifactId}
      )
      RETURNING id
    `;
    written.push(row!.id);
  }

  return written;
}
