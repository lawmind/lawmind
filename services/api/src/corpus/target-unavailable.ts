/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ABSENT FROM THE ACTIVE CORPUS IS NOT "DOES NOT EXIST".
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every route below reads the CORPUS role. Under the physical split a corpus
 * generation is a DEPLOYMENT fact: a blue/green activation, or a rollback to the
 * previous verified generation, can make a perfectly real judgment absent from
 * the generation this request is pinned to. It comes back on the next read
 * against a generation that carries it, with no user-data write of any kind
 * (`RCC_V1_API_CONTRACT_R17_AMENDMENT.md` §1, §2).
 *
 * So the sentence *"no judgment with that id"* is not merely forbidden by R17 —
 * after a rollback it is FALSE. It converts infrastructure availability into a
 * legal claim about whether an authority exists, on a citation surface, to an
 * advocate who may be standing up in court. `CLAUDE.md` §2 is what that costs.
 *
 * `matters/authorities.ts` already refuses this way for the R17 §1 write. This
 * module is the same refusal written once, so that the other eight call sites
 * cannot each invent their own wording — and so that adding a ninth corpus read
 * has one obvious thing to call.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY WRITES ARE 409 AND READS ARE 404
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The CODE and the MESSAGE carry the semantic; the status carries HTTP.
 *
 *   WRITE  `409 CORPUS_TARGET_UNAVAILABLE` — exact parity with R17 §1's released
 *          write shape. The request asked to record something ABOUT a target
 *          this generation cannot validate, and nothing was written.
 *
 *   READ   `404 CORPUS_TARGET_UNAVAILABLE` — RFC 9110 §15.5.5 defines 404 as
 *          "did not find a CURRENT REPRESENTATION for the target resource",
 *          which is precisely, and only, what is true here. A read has no saved
 *          row to answer with R17's unavailable shell, and 409 on a GET would
 *          claim a conflict that no client can resolve. The status stays where
 *          every existing client already expects it; the false half — the code
 *          and the sentence — is what changes.
 *
 * Both carry `details.availability = 'corpus_unavailable'`, the same term R17 §1
 * puts on the unavailable shell, so a client keys on a field rather than on a
 * string match. `details` is additive (`envelope.ts`) — a client that ignores it
 * behaves exactly as before.
 *
 * `SOURCE_UNAVAILABLE` is deliberately NOT reused: that means an upstream source
 * could not be observed. This means the selected corpus generation does not
 * contain an immutable target. Neither is a legal conclusion, and they are not
 * the same non-conclusion.
 */
import type { Context } from 'hono';
import { fail } from '../envelope.ts';

/** The R17 §1 vocabulary for "this generation does not carry the target". */
export const CORPUS_TARGET_UNAVAILABLE = 'CORPUS_TARGET_UNAVAILABLE';

/** The term R17 §1 puts on the unavailable shell, echoed in `details`. */
export const CORPUS_UNAVAILABLE_AVAILABILITY = 'corpus_unavailable';

/**
 * What the corpus could not hydrate. Only affects the noun in the sentence — the
 * claim made about it is identical, because the reason is identical.
 */
export type CorpusTargetKind = 'judgment';

const NOUN: Record<CorpusTargetKind, string> = {
  judgment: 'That judgment',
};

/**
 * Copy is licence protection, not an audit (`CLAUDE.md` §6). It states what is
 * true of THIS release and claims nothing about the authority: not that it is
 * gone, not that it was never there, not that it is unverified, not that it is
 * still good law. It also must not read as an outage — "we are having trouble"
 * would be a different claim, and a false one.
 */
export function corpusTargetUnavailableMessage(kind: CorpusTargetKind, action: string): string {
  return `${NOUN[kind]} is not available in the selected corpus release, so ${action}.`;
}

/**
 * Refuse a CORPUS target this generation cannot hydrate, without claiming it
 * does not exist.
 *
 * @param action  what could not be done, completing "…so <action>." Written from
 *                the advocate's side and in the present tense, e.g.
 *                `'it cannot be annotated right now'`.
 * @param write   true for a request that would have written; see the status note
 *                above. Defaults to false — reads are the majority.
 */
export function corpusTargetUnavailable(
  c: Context,
  action: string,
  opts: { write?: boolean; kind?: CorpusTargetKind } = {},
) {
  const kind = opts.kind ?? 'judgment';
  return fail(
    c,
    CORPUS_TARGET_UNAVAILABLE,
    corpusTargetUnavailableMessage(kind, action),
    opts.write ? 409 : 404,
    { availability: CORPUS_UNAVAILABLE_AVAILABILITY },
  );
}
