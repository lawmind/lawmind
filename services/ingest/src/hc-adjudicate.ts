/**
 * The DIFFICULT SUBSET only — what deterministic rules explicitly refused.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS COVERS, AND — SAID FIRST — WHAT IT NEVER WILL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `RING_PROGRAM.md` §2b: *a pass with no stated scope silently acquires an
 * infinite one*. So the scope is stated before the mechanism.
 *
 * Measured 14 Aug 2026 over the whole corpus (487 distinct `disposal_nature`
 * values, 4,398,309 rows carrying one). After the vocabulary extension in
 * `hc-classify.ts` claimed 773,096 further rows deterministically, what is left
 * unclaimed is **~1.72M rows**, and it is dominated by a handful of words that
 * genuinely do not say what happened:
 *
 *     DISPOSED OFF        687,076      DISPOSED OF NO COSTS   115,541
 *     DISPOSED OF         497,294      CLOSED                  54,241
 *     DISPOSED            227,304      ORDERED                 34,422
 *
 * **This pass will not classify 1.72M documents and is not trying to.** The
 * DeepSeek grant is a capacity-limited free tier that already returns HTTP 429
 * under this repo's own load (`docs/ai/DEEPSEEK_DATA_MOAT.md` §1), and
 * enrichment against an ingest running at ~170,000 documents/hour can never
 * cover a corpus — the same arithmetic `RING_PROGRAM.md` §2b uses to explain
 * why LCC's queue is prioritised rather than uniform. This is a **bounded,
 * prioritised sample**, and its output is a candidate, never a fact.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DETERMINISTIC FIRST — THE MODEL NEVER SEES WHAT A RULE COULD ANSWER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `selectsForModel` is the whole gate, and it is deliberately a *refusal* test
 * rather than a *selection* test: a row qualifies only because
 * `classifyHcDocument` recorded that it declined to claim it. A row no rule has
 * been run against at all does NOT qualify — that is a backfill, not a hard
 * case, and sending it to a model would be paying tokens for something a regex
 * answers exactly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY ANSWER IS VERIFIED AGAINST THE SOURCE, OR IT IS DISCARDED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/ai/CITATION_CONCORDANCE_EVALUATION.md` measured this exact model
 * inventing an authority **10.8%** of the time when the right answer was
 * absent, two of four inventions at its own `high` confidence — so a model's
 * stated confidence is not evidence and is never treated as any.
 *
 * The mechanism instead: the model must quote the document's own words, and
 * `verifyEvidenceSpan` checks that quote appears **verbatim in the source
 * text**. A quote that is not there means the answer was composed rather than
 * read, and the whole answer is refused — not downgraded, not kept with a
 * caveat. That is the only claim this module makes about correctness, and it is
 * deliberately a narrow one: a verified span proves the model READ the document,
 * never that it reasoned about it correctly.
 */
import { createHash } from 'node:crypto';

import type { HcDocumentClass } from './hc-classify.ts';

/**
 * The methods that mean *a rule looked at this row and declined to claim it*.
 *
 * `no_disposal_nature` is included and `(never ran)` is not — see the header.
 * Matched as a prefix because `classifyHcDocument` appends the offending value:
 * `unclassified_disposal:DISPOSED OFF`.
 */
export function selectsForModel(hcClassMethod: string | null | undefined): boolean {
  if (typeof hcClassMethod !== 'string' || hcClassMethod === '') return false;
  return (
    hcClassMethod.startsWith('unclassified_disposal:') || hcClassMethod === 'no_disposal_nature'
  );
}

/** What the model is allowed to answer. Exactly the existing classes, plus a refusal. */
export const ADJUDICABLE_CLASSES = [
  'decided',
  'decided_brief',
  'procedural_disposal',
  'bail_order',
  'reference_stub',
] as const satisfies readonly HcDocumentClass[];

export type AdjudicationInput = {
  readonly judgmentId: string;
  /** Verbatim from the source, e.g. `DISPOSED OFF`. Shown to the model as-is. */
  readonly disposalNature: string | null;
  readonly caseNumber: string | null;
  readonly fullText: string;
};

export type Adjudication = {
  readonly documentClass: HcDocumentClass | null;
  /** The model's verbatim quote from the document. Never edited or summarised. */
  readonly evidence: string;
  readonly reasoning: string;
  /** The model's own word. Recorded, never acted on — see the header. */
  readonly statedConfidence: 'high' | 'low';
};

/**
 * How much of the document the model is shown.
 *
 * The operative direction of an Indian High Court order is at the END — "the
 * petition is accordingly disposed of", "rule is made absolute" — while the
 * opening is the cause title and the advocates' appearances. A head-only window
 * would systematically show the model the one part of the document that never
 * states the outcome. So both ends are sent, and the middle recital is what is
 * dropped when a document is long.
 */
export const HEAD_CHARS = 2_000;
export const TAIL_CHARS = 4_000;

export function textWindow(fullText: string): string {
  if (fullText.length <= HEAD_CHARS + TAIL_CHARS) return fullText;
  return `${fullText.slice(0, HEAD_CHARS)}\n\n[… middle of the document omitted …]\n\n${fullText.slice(-TAIL_CHARS)}`;
}

/**
 * Whitespace-insensitive containment.
 *
 * PDF extraction leaves line breaks and runs of spaces exactly where the
 * original page wrapped, and a model asked to quote will normalise them. A
 * strict `includes` would therefore reject correct quotes and let this module
 * report fabrication where there was none — the false-alarm direction is just
 * as damaging here, because it would discard good answers while looking like
 * diligence.
 */
const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Whitespace removed entirely — the second chance, added after measuring.
 *
 * The first 40-document run refused 8 spans. Triaged against the real
 * documents, **7 were genuine fabrication and 1 was this checker's own fault**:
 * the model quoted `AllPetitionsaredisposedofintheseterms.Therewillbenoorders
 * astocosts.` — the words are in the document, the spaces are not. Extraction
 * from a PDF loses inter-word spacing often enough that a space-sensitive check
 * discards correct answers, and over-refusal is not the safe direction here: it
 * looks like diligence while throwing away good work.
 *
 * This stays strict where it matters. A run of 24+ characters of matching
 * letters is not something a fabricated sentence produces by accident, so
 * dropping spaces costs no real discrimination — the 7 genuine fabrications
 * above fail this comparison too, which is how it was checked rather than
 * assumed.
 */
const strip = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/**
 * Did the model quote something the document actually says?
 *
 * A short quote is refused as well as a missing one: three words appear in
 * every order ever written, so a span that short cannot distinguish reading
 * from guessing, which is the only thing this check exists to do.
 */
export const MIN_EVIDENCE_CHARS = 24;

export type SpanVerdict = 'verified' | 'span_not_found' | 'span_too_short';

export function verifyEvidenceSpan(evidence: string, fullText: string): SpanVerdict {
  const needle = squash(evidence);
  if (needle.length < MIN_EVIDENCE_CHARS) return 'span_too_short';
  if (squash(fullText).includes(needle)) return 'verified';
  return strip(fullText).includes(strip(evidence)) ? 'verified' : 'span_not_found';
}

/**
 * The prompt.
 *
 * Two things in it are load-bearing rather than stylistic. It states that
 * "cannot be determined" is a correct answer — the concordance evaluation's
 * fabrication rate was measured specifically on prompts where the true answer
 * was absent, so a prompt that offers no way to say *no* is a prompt that asks
 * for an invention. And it demands the quote BEFORE the class in the output
 * shape, so the model commits to evidence it must then live with rather than
 * justifying a conclusion it already wrote.
 */
export function buildPrompt(input: AdjudicationInput): string {
  return `You are reading ONE document from an Indian High Court and deciding what KIND of document it is. You are not deciding whether it is good law and not summarising it.

The court's own registry recorded its outcome as: ${input.disposalNature ?? '(the registry recorded no outcome at all)'}
Case number: ${input.caseNumber ?? '(none recorded)'}

That recorded outcome is AMBIGUOUS — it is why this document was sent to you. Words like "DISPOSED OF" cover a fully reasoned decision, a consent order, and the closing of an application that had become pointless. Decide from the DOCUMENT'S OWN WORDS, not from the registry's label.

Choose exactly one:
- "decided" — the court decided the matter on its merits AND the reasoning is in this document
- "decided_brief" — decided on the merits, but too short to contain the reasoning
- "procedural_disposal" — the case ended WITHOUT a decision on the merits (withdrawn, infructuous, abated, not pressed, transferred, settled)
- "bail_order" — this is an application for bail, granted or refused
- "reference_stub" — the reasoning is in ANOTHER document that this one points to
- "cannot_determine" — the document does not say. THIS IS A CORRECT AND EXPECTED ANSWER. Prefer it over a guess.

DOCUMENT:
"""
${textWindow(input.fullText)}
"""

Reply with ONLY this JSON object and nothing else:
{
  "evidence": "<a sentence or clause COPIED WORD FOR WORD from the document above that shows what kind of document it is — at least 24 characters. Do not paraphrase. Do not correct its spelling or spacing. If you cannot find such a sentence, use cannot_determine as your class.>",
  "class": "<one of: decided | decided_brief | procedural_disposal | bail_order | reference_stub | cannot_determine>",
  "reasoning": "<one sentence, why that class follows from that quote>",
  "confidence": "<high | low>"
}`;
}

/**
 * Strict parse. Anything unexpected returns `null` and the caller records a
 * parse failure — a partially-understood model reply is not repaired into a
 * usable one, because repairing it means inventing the missing half here
 * instead of in the model.
 */
export function parseAdjudication(raw: string): Adjudication | null {
  // The model wraps JSON in a fenced block often enough to be worth handling,
  // but nothing beyond locating the object is reconstructed.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const p = parsed as Record<string, unknown>;

  const evidence = p['evidence'];
  const cls = p['class'];
  const reasoning = p['reasoning'];
  const confidence = p['confidence'];
  if (typeof evidence !== 'string' || typeof cls !== 'string') return null;

  const documentClass = (ADJUDICABLE_CLASSES as readonly string[]).includes(cls)
    ? (cls as HcDocumentClass)
    : null;
  // `cannot_determine` is the ONLY non-class string accepted. Any other value
  // means the model answered something that was not offered, which is a parse
  // failure and not a refusal.
  if (documentClass === null && cls !== 'cannot_determine') return null;

  return {
    documentClass,
    evidence,
    reasoning: typeof reasoning === 'string' ? reasoning : '',
    statedConfidence: confidence === 'high' ? 'high' : 'low',
  };
}

export type AdjudicationOutcome = {
  readonly judgmentId: string;
  /** NULL whenever the answer was refused for ANY reason — never a fallback class. */
  readonly documentClass: HcDocumentClass | null;
  readonly verdict: SpanVerdict | 'cannot_determine' | 'unparseable' | 'call_failed';
  readonly evidence: string;
  readonly reasoning: string;
  readonly statedConfidence: 'high' | 'low' | null;
  readonly inputHash: string;
};

/**
 * Turn a raw model reply into an outcome, refusing on every failure path.
 *
 * There is deliberately no branch that keeps a class whose span did not verify.
 */
export function adjudicate(input: AdjudicationInput, raw: string | null): AdjudicationOutcome {
  const inputHash = adjudicationInputHash(input);
  const base = {
    judgmentId: input.judgmentId,
    evidence: '',
    reasoning: '',
    statedConfidence: null,
    inputHash,
  } as const;

  if (raw === null) return { ...base, documentClass: null, verdict: 'call_failed' };

  const parsed = parseAdjudication(raw);
  if (parsed === null) return { ...base, documentClass: null, verdict: 'unparseable' };

  if (parsed.documentClass === null) {
    return {
      ...base,
      documentClass: null,
      verdict: 'cannot_determine',
      evidence: parsed.evidence,
      reasoning: parsed.reasoning,
      statedConfidence: parsed.statedConfidence,
    };
  }

  const verdict = verifyEvidenceSpan(parsed.evidence, input.fullText);
  return {
    judgmentId: input.judgmentId,
    // The refusal that matters: an unverified span discards the class entirely.
    documentClass: verdict === 'verified' ? parsed.documentClass : null,
    verdict,
    evidence: parsed.evidence,
    reasoning: parsed.reasoning,
    statedConfidence: parsed.statedConfidence,
    inputHash,
  };
}

/**
 * The cache key: same document, same recorded outcome, same text → same call,
 * never repeated. Hashes the FULL text rather than the window so that a change
 * to `HEAD_CHARS`/`TAIL_CHARS` does not silently reuse an answer formed from a
 * different view of the document.
 */
export function adjudicationInputHash(input: AdjudicationInput): string {
  return createHash('sha256')
    .update(`${input.judgmentId}|${input.disposalNature ?? ''}|`)
    .update(createHash('sha256').update(input.fullText).digest('hex'))
    .digest('hex');
}
