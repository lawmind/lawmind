/**
 * `verified_by_source` — ordering, upgrade rules, and the wire boundary.
 *
 * The column has seven values. The API contract has five. Those two facts have
 * been true and unenforced since S0: `citations/check.ts` read
 * `verified_by_source` straight out of the row and handed it to the client,
 * which types it as a four-value union and looks its label up in a `Record`.
 * Nothing has broken only because nothing has ever written the diagnostic
 * values. That is an absent check, not a negative result — this module is the
 * check.
 *
 * Three separate jobs live here because they are three views of one ordering:
 *
 *  1. **Strength** — which confirmation outranks which.
 *  2. **Upgrades** — a row's source may climb, never fall.
 *  3. **The wire** — one exhaustive mapping, so adding an eighth database value
 *     is a compile error rather than an `undefined` label on an advocate's
 *     screen.
 */

/** Every value the `verified_by_source` Postgres enum can hold. */
export type DbVerifiedBySource =
  | 'corpus'
  | 'indiankanoon'
  | 'aws_s3'
  | 'public_x2'
  | 'ecourts'
  | 'ecourts_bulk'
  | 'licensed'
  | 'none';

/**
 * What the API is permitted to emit. `docs/API_CONTRACTS.md`.
 *
 * `ecourts_bulk` was added 8 Aug 2026 — additive and provisional, per
 * `CLAUDE.md` §6b. Nothing writes it yet: bulk CNR resolution is not built. It
 * is declared now so the boundary is exhaustive from the first line of that
 * work rather than retrofitted onto it.
 */
export type WireVerifiedBySource =
  'corpus' | 'public_x2' | 'ecourts' | 'ecourts_bulk' | 'licensed' | 'none';

/**
 * Strength, strongest first. `docs/CITATION_HARNESS.md`.
 *
 *   ecourts       a named human looked and vouched
 *   public_x2     two INDEPENDENT public sources agreed
 *   ecourts_bulk  the registry answered us directly, under the grant
 *   corpus        we hold the judgment ourselves
 *
 * `ecourts_bulk` sits below `public_x2` on purpose. Independence is what
 * catches a systematic error at the source; one authoritative source answering
 * cannot. It sits above `corpus` because the registry is the registry.
 *
 * `indiankanoon` and `aws_s3` are diagnostic records — ONE public source
 * matched and the other did not. Our own rule requires both to agree, so a
 * single match confirms nothing and they rank with `none`.
 */
const STRENGTH: Readonly<Record<DbVerifiedBySource, number>> = {
  ecourts: 5,
  public_x2: 4,
  ecourts_bulk: 3,
  /**
   * A commercial publisher's editorial view, bought. Above `corpus` because it
   * carries editorial judgement our own row does not; below `ecourts_bulk`
   * because a publisher is not the registry.
   *
   * **The only value here that can go stale by contract.** Everything else
   * rests on a fact; this rests on an agreement that can end.
   */
  licensed: 2,
  corpus: 1,
  indiankanoon: 0,
  aws_s3: 0,
  none: 0,
};

export function strengthOf(source: DbVerifiedBySource): number {
  return STRENGTH[source];
}

/**
 * May a row recorded as `from` be rewritten as `to`?
 *
 * Only upward. The case this exists to forbid: a bulk resolution pass sweeping
 * the corpus and overwriting a row an advocate personally confirmed. A human's
 * word is not superseded by a machine re-reading the same page — and the
 * damage would be invisible, because both values are spelled with the word
 * "ecourts".
 *
 * Equal strength is not an upgrade. Re-writing a row with what it already says
 * is a no-op worth skipping, and `indiankanoon` → `aws_s3` is two different
 * failures, not progress.
 */
export function isUpgrade(from: DbVerifiedBySource, to: DbVerifiedBySource): boolean {
  return STRENGTH[to] > STRENGTH[from];
}

/**
 * The single boundary between the column and the client.
 *
 * The diagnostic values collapse to `none` because that is what they honestly
 * mean to a reader: nobody confirmed this. A row carrying `indiankanoon` is a
 * row where IndianKanoon matched and the AWS datasets did not, which under
 * `CITATION_HARNESS.md` step 5 is not a confirmation at all — its
 * `verification_state` is `unverified`. Emitting the source name would suggest
 * a confirmation our own rule does not recognise.
 *
 * The switch is exhaustive over `DbVerifiedBySource`. Add a value to the
 * Postgres enum without deciding what an advocate sees and this stops
 * compiling.
 */
export function toWireSource(source: DbVerifiedBySource): WireVerifiedBySource {
  switch (source) {
    case 'corpus':
    case 'public_x2':
    case 'ecourts':
    case 'ecourts_bulk':
    case 'licensed':
    case 'none':
      return source;
    case 'indiankanoon':
    case 'aws_s3':
      return 'none';
    default: {
      const unreachable: never = source;
      throw new Error(`unmapped verified_by_source: ${String(unreachable)}`);
    }
  }
}

/**
 * The same mapping for a value that arrived as an unconstrained string — a raw
 * `postgres` row, where the driver hands back `string`.
 *
 * An unrecognised value throws rather than defaulting. A source we cannot name
 * is not one we may quietly render as `none`: `none` is a claim ("nobody
 * confirmed this"), and guessing it for a value written by code we have not
 * read is exactly the silent degradation this module exists to stop.
 */
export function toWireSourceUnsafe(source: string): WireVerifiedBySource {
  if (!(source in STRENGTH)) {
    throw new Error(`unknown verified_by_source read from the database: ${source}`);
  }
  return toWireSource(source as DbVerifiedBySource);
}

/* ------------------------------------------------ the licensed display gate -- */

/**
 * **May licensed content be shown to a user?**
 *
 * Perpetual retention is not perpetual display, and the two are separate clauses
 * in any publisher's terms. We may end up entitled to HOLD a headnote — to index
 * it, to rank on it, to fill the citator from it — without being entitled to put
 * it on an advocate's screen.
 *
 * **Default false, and deliberately so.** Until the written terms say otherwise,
 * licensed content is a signal and never a surface. A flag enforces that; a
 * convention does not, because the person who renders it in four months will not
 * have read this file.
 *
 * `LICENSED_DISPLAY_PERMITTED=true` turns it on, and it should be set **only**
 * when someone can point at the clause. Same discipline as the eCourts
 * conditions: a permission that is not written down does not exist, and an
 * absent term must never read as consent.
 */
export function licensedDisplayPermitted(): boolean {
  return process.env['LICENSED_DISPLAY_PERMITTED'] === 'true';
}

/**
 * What a caller may do with a piece of licensed text right now.
 *
 * Returns the text when display is permitted, and **null when it is not** —
 * never a truncated or paraphrased version. A shortened headnote is still their
 * expression, and "we only showed a bit of it" is not a defence anybody wants to
 * make. Null forces the caller to render our own row instead, which is what
 * `CITATION_HARNESS.md` step 8 requires anyway.
 */
export function renderableLicensedText(text: string | null): string | null {
  if (text === null) return null;
  return licensedDisplayPermitted() ? text : null;
}
