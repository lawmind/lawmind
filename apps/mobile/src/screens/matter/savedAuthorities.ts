import type { MatterAuthority, MatterAuthorityUnavailable } from '../../api/contract';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE SAVED-AUTHORITY LIST OUT OF TWO SERVER ARRAYS — R17 §1.
 *
 * `GET /matters/:id/authorities` answers with `authorities[]` (the saved rows
 * whose target the request-pinned corpus generation resolves) and
 * `unavailableAuthorities[]` (the saved rows whose target it does not). Both are
 * the advocate's own records; only one of them can be told anything about the
 * law right now.
 *
 * WHY THIS IS ONE LIST AND NOT TWO SECTIONS. The matter file answers "what am I
 * relying on in this case". A saved authority that a corpus release cannot
 * currently resolve is still something the advocate is relying on, and filing it
 * under a separate heading would answer a question they did not ask — worse, it
 * would read as a category of law rather than as a fact about our index. The
 * arrays are merged back into the single `addedAt`-descending history the
 * endpoint split apart, and the contract forbids omitting the unavailable one
 * from that history.
 *
 * IDENTITY IS `authorityId`, THE USER-DATABASE ROW ID — never `judgmentId`.
 * `judgmentId` is a corpus pointer and the same judgment may legitimately be
 * saved once per matter; `authorityId` is what the DELETE takes and what the
 * server promises never changes across a corpus generation swap.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export type SavedAuthorityRow =
  | { kind: 'available'; authorityId: string; addedAt: string; authority: MatterAuthority }
  | {
      kind: 'unavailable';
      authorityId: string;
      addedAt: string;
      authority: MatterAuthorityUnavailable;
    };

/**
 * Merge the two arrays into the rendered history.
 *
 * ORDERING IS `addedAt` DESCENDING, tie-broken by `authorityId`, because the
 * server orders WITHIN each array and says nothing about the two together. Two
 * rows saved in the same millisecond are possible (one request, a retry) and a
 * comparator that returned 0 for them would let the merged order depend on
 * which array the server happened to fill first — a list that reshuffles itself
 * between reads for no reason the advocate can see.
 *
 * A DUPLICATE `authorityId` RESOLVES TO THE AVAILABLE ROW. The server cannot
 * emit one today — it iterates the saved rows once and pushes each into exactly
 * one array — so this is defence against a future split-brain read, not a case
 * that exists. Available wins because it is the row with evidence behind it: the
 * shell asserts nothing, so preferring it would hide corpus facts that were
 * successfully read, while preferring the resolved row shows only what the
 * server actually observed this request.
 *
 * `unavailable` is tolerated as `undefined` for the R16 server the contract
 * still permits, and that is the ONLY thing an absent array means. An EMPTY
 * array means "nothing unavailable" and nothing else — R17 servers always send
 * it — so neither case may be read as evidence of the server's revision.
 */
export function mergeSavedAuthorities(
  available: readonly MatterAuthority[],
  unavailable: readonly MatterAuthorityUnavailable[] | undefined,
): SavedAuthorityRow[] {
  const rows = new Map<string, SavedAuthorityRow>();

  for (const a of unavailable ?? []) {
    rows.set(a.authorityId, {
      kind: 'unavailable',
      authorityId: a.authorityId,
      addedAt: a.addedAt,
      authority: a,
    });
  }
  for (const a of available) {
    rows.set(a.authorityId, {
      kind: 'available',
      authorityId: a.authorityId,
      addedAt: a.addedAt,
      authority: a,
    });
  }

  return [...rows.values()].sort((x, y) => {
    if (x.addedAt !== y.addedAt) return x.addedAt < y.addedAt ? 1 : -1;
    return x.authorityId < y.authorityId ? -1 : x.authorityId > y.authorityId ? 1 : 0;
  });
}

/**
 * The rows this screen draws: still saved, in either state.
 *
 * REMOVAL IS A TIMESTAMP, NEVER A DELETE, so the endpoint returns removed rows
 * in both arrays. They are filtered out here by the SAME rule for both, which is
 * what keeps the unavailable array from being singled out: the reason a removed
 * row is not drawn is that the advocate took it out, and that reason does not
 * change with whether the corpus can currently resolve it.
 */
export function liveSavedAuthorities(rows: readonly SavedAuthorityRow[]): SavedAuthorityRow[] {
  return rows.filter((r) => r.authority.removedAt === null);
}
