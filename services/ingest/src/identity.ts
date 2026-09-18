/**
 * Canonical document identity — `docs/ai/CANONICAL_IDENTITY.md`, Stage 2 of
 * the data-moat execution program.
 *
 * Pure functions only. No I/O, no model calls, nothing here writes to
 * `judgments` or deletes a row — classification only, per the design doc's
 * own §5. Deliberately NOT built on `judgment_citations`/citation fields:
 * citation is explicitly excluded as an identity key (`CANONICAL_IDENTITY.md`
 * §0) because it is sparse and itself resolved against identity, which would
 * make identity depend on the thing that depends on identity.
 */

/** The minimal row shape every identity function needs — not the full
 * `judgments` row or `JudgmentRecord`, so this module stays decoupled from
 * both the DB schema and the ingest record shape. */
export type IdentityRow = {
  court: string;
  /** ISO `YYYY-MM-DD`. */
  judgmentDate: string;
  caseNumber: string | null;
  cnr?: string | null | undefined;
  contentHash?: string | null | undefined;
  sourceUrl: string;
};

export type IdentityTier = 'cnr' | 'case_number' | 'weak';

export type CaseIdentity = { key: string; tier: IdentityTier };

const blank = (v: string | null | undefined): boolean => !v || v.trim() === '';

/**
 * DOCUMENT identity. `contentHash` is sha256 of `full_text` (migration
 * `0031`) and is the only thing this function reads — never citation, never
 * title, per `CANONICAL_IDENTITY.md` §0.
 *
 * Returns `null`, not a fabricated key, when `contentHash` is not yet
 * computed — a not-yet-hashed row has no DOCUMENT identity, and pretending
 * otherwise would let two never-compared rows appear identical by accident
 * of a shared placeholder.
 */
export function documentKey(row: Pick<IdentityRow, 'contentHash'>): string | null {
  return blank(row.contentHash) ? null : (row.contentHash as string);
}

/**
 * CASE identity, in the priority order `CANONICAL_IDENTITY.md` §2 specifies:
 * CNR first (the eCourts-assigned, cross-source-stable key) — never
 * outranked by a printed case number, because CNR is what eCourts itself
 * resolves on. Falls back to `(court, caseNumber)`, then to the degraded
 * `(court, judgmentDate, contentHash)` tier, tagged `'weak'` so nothing
 * downstream treats it as equivalent to a real match.
 */
export function caseIdentity(row: IdentityRow): CaseIdentity {
  if (!blank(row.cnr)) {
    return { key: `cnr:${(row.cnr as string).trim()}`, tier: 'cnr' };
  }
  if (!blank(row.caseNumber)) {
    return {
      key: `case:${row.court.trim()}::${(row.caseNumber as string).trim()}`,
      tier: 'case_number',
    };
  }
  const hash = documentKey(row) ?? 'nohash';
  return { key: `weak:${row.court.trim()}::${row.judgmentDate}::${hash}`, tier: 'weak' };
}

/** SOURCE_ARTIFACT identity — verbatim `sourceUrl`, already the DB's own
 * unique key (`judgments_source_url_key`). Exists as a named function so
 * callers never reach for `row.sourceUrl` directly and drift from the model. */
export function sourceArtifactKey(row: Pick<IdentityRow, 'sourceUrl'>): string {
  return row.sourceUrl;
}

/** Same DOCUMENT: both rows have a computed hash and the hashes match. Two
 * rows that are both un-hashed are NOT the same document — `null === null`
 * is not identity, it is absence of information. */
export function isSameDocument(
  a: Pick<IdentityRow, 'contentHash'>,
  b: Pick<IdentityRow, 'contentHash'>,
): boolean {
  const ka = documentKey(a);
  const kb = documentKey(b);
  return ka !== null && kb !== null && ka === kb;
}

/**
 * Same CASE: identical key AND identical tier. A `'weak'` match against a
 * `'cnr'` match proves nothing — comparing across tiers would let a
 * low-confidence coincidence masquerade as a high-confidence identity match,
 * exactly the failure `CANONICAL_IDENTITY.md` §2's "necessary, not
 * sufficient" CNR note exists to prevent.
 */
export function isSameCase(a: IdentityRow, b: IdentityRow): boolean {
  const ia = caseIdentity(a);
  const ib = caseIdentity(b);
  return ia.tier === ib.tier && ia.key === ib.key;
}
