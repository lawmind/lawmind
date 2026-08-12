/**
 * Corpus enrichment — prompt construction, strict parsing, and the source
 * verification that decides whether any of it becomes believable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY EVERY TASK HERE RETURNS SPANS AND NOT ANSWERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/ai/CITATION_CONCORDANCE_EVALUATION.md` measured this model on a task
 * where the correct answer had been removed from its options. It invented an
 * authority **10.8%** of the time rather than refusing, two of those four
 * inventions carried its own `high` confidence, and the audit found it
 * reaching for outside knowledge — *"the Nirbhaya case"* — precisely when the
 * evidence in front of it ran out.
 *
 * The conclusion drawn there is the design rule here: **the model is never
 * asked what is true, only WHERE in this document something is written.**
 * Every task returns a verbatim `evidence` span, and `verifyClaims` locates
 * that span in the source text before anything is believed. A claim whose span
 * cannot be found is rejected with a reason, regardless of how confident the
 * model was or how plausible the claim reads.
 *
 * That turns hallucination from a correctness problem into a throughput
 * problem: an invented judge or citation simply fails to appear in the
 * document, and is dropped. It cannot become legal truth, because the string
 * match, not the model, is what promotes it.
 */
import { createHash } from 'node:crypto';

export const PROMPT_VERSION = 'v1';
export const ENRICH_MODEL = process.env['INFERX_MODEL'] ?? 'deepseek-v4-flash-0731';

export type EnrichTask = 'citation_extraction' | 'metadata' | 'treatment';

export const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

/* ------------------------------------------------------------- excerpting -- */

/**
 * Judgments run to hundreds of thousands of characters and the fields these
 * tasks want cluster at the top (parties, coram, citation) or around citation
 * offsets (treatment). Sending a whole judgment would spend most of the token
 * budget on text that cannot contain the answer.
 *
 * The excerpt is part of `input_hash`, so changing this function invalidates
 * the cache rather than silently mixing answers drawn from different windows.
 */
export function headExcerpt(fullText: string, chars: number): string {
  return fullText.slice(0, chars);
}

export function windowAround(fullText: string, offset: number, before: number, after: number): string {
  return fullText.slice(Math.max(0, offset - before), Math.min(fullText.length, offset + after));
}

/* ---------------------------------------------------------------- prompts -- */

const REFUSAL_CLAUSE = `
RULES, and they matter more than completeness:
- Report ONLY what is written in the TEXT below. You are not being asked to
  recall anything you may know about this case from elsewhere.
- Every item you report MUST include an "evidence" field containing a VERBATIM
  substring of the TEXT, copied exactly, including its punctuation and spacing.
- If the TEXT does not contain the information, return an empty array. An empty
  answer is CORRECT and expected. A plausible guess is a failure.
- Do not normalise, expand, correct or tidy the evidence. Copy it exactly.
Respond with ONLY a single JSON object, no prose and no code fence.`;

export function buildCitationPrompt(text: string): string {
  return `You are extracting case-law citations that appear in an Indian court judgment.

Find every citation to ANOTHER court decision: SCC, AIR, SCR, SCC OnLine,
neutral citations (e.g. 2023:DHC:2720), and reported citations of any Indian
reporter. Do NOT report statute sections, rules, or article numbers.
${REFUSAL_CLAUSE}

{"citations":[{"citation":"<the citation exactly as printed>","case_name":"<the case name printed beside it, or null>","evidence":"<verbatim substring of TEXT containing the citation>"}]}

TEXT:
${text}`;
}

export function buildMetadataPrompt(text: string): string {
  return `You are reading the opening of an Indian court judgment to recover its metadata.
${REFUSAL_CLAUSE}

"judges" are the names of the judges who decided this case, as printed (drop
honorifics like "Hon'ble", "Mr.", "Justice", "J.", "CJ"). "neutral_citation" is
a court-assigned citation such as 2023:DHC:2720 or 2019 INSC 441, if printed.

{"judges":[{"name":"<judge name>","evidence":"<verbatim substring of TEXT>"}],"neutral_citation":{"value":"<citation or null>","evidence":"<verbatim substring of TEXT, or null>"},"case_number":{"value":"<case number or null>","evidence":"<verbatim substring of TEXT, or null>"}}

TEXT:
${text}`;
}

export function buildTreatmentPrompt(text: string, citedCase: string): string {
  return `An Indian court judgment refers to an earlier decision. Decide how THIS
judgment treats that earlier decision, using only the language in the TEXT.

EARLIER DECISION: ${citedCase}

CRITICAL: merely citing or mentioning a decision is NOT treatment. Choose
"cites" unless the TEXT explicitly does something to it. Beware of:
- the word "overruled" appearing inside a quotation of some other judgment;
- a party ARGUING that a case was overruled where the bench does not accept it;
- the court describing another court's reasoning rather than adopting it.

Allowed relationship values: followed, approved, applied, distinguished,
doubted, overruled, overruled_in_part, not_followed, affirmed, reversed,
explained, cites.
${REFUSAL_CLAUSE}

{"relationship":"<one allowed value>","evidence":"<verbatim substring of TEXT showing the treatment, or null>","quoted_or_argued":<true if the treatment language appears only inside a quotation or a party's argument rather than the court's own holding>}

TEXT:
${text}`;
}

/* ----------------------------------------------------------------- parsing -- */

/** Strips a ```json fence if the model added one despite being told not to. */
export function stripFence(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith('```')) return t;
  return t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

export function parseJson(raw: string): unknown | null {
  try {
    return JSON.parse(stripFence(raw));
  } catch {
    // A model that returns prose around the object is common enough to be worth
    // one bounded recovery attempt, and cheap to make safe: take the outermost
    // braces and try once. Anything still unparseable is refused, never coerced.
    const s = stripFence(raw);
    const a = s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try {
      return JSON.parse(s.slice(a, b + 1));
    } catch {
      return null;
    }
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export type Claim = {
  /** What the model asserts — a citation, a judge name, a relationship. */
  readonly value: string;
  /** The span it says proves it. Verified against the source, never trusted. */
  readonly evidence: string | null;
  readonly kind: string;
  readonly extra?: Record<string, unknown>;
};

export function claimsFromCitations(parsed: unknown): Claim[] {
  const rows = (parsed as { citations?: unknown })?.citations;
  if (!Array.isArray(rows)) return [];
  const out: Claim[] = [];
  for (const r of rows) {
    const value = str((r as Record<string, unknown>)?.['citation']);
    if (!value) continue;
    out.push({
      value,
      evidence: str((r as Record<string, unknown>)?.['evidence']),
      kind: 'citation',
      extra: { caseName: str((r as Record<string, unknown>)?.['case_name']) },
    });
  }
  return out;
}

export function claimsFromMetadata(parsed: unknown): Claim[] {
  const p = parsed as Record<string, unknown>;
  const out: Claim[] = [];
  const judges = p?.['judges'];
  if (Array.isArray(judges)) {
    for (const j of judges) {
      const value = str((j as Record<string, unknown>)?.['name']);
      if (value) out.push({ value, evidence: str((j as Record<string, unknown>)?.['evidence']), kind: 'judge' });
    }
  }
  for (const field of ['neutral_citation', 'case_number'] as const) {
    const obj = p?.[field] as Record<string, unknown> | undefined;
    const value = str(obj?.['value']);
    if (value) out.push({ value, evidence: str(obj?.['evidence']), kind: field });
  }
  return out;
}

const TREATMENTS = new Set([
  'followed', 'approved', 'applied', 'distinguished', 'doubted', 'overruled',
  'overruled_in_part', 'not_followed', 'affirmed', 'reversed', 'explained', 'cites',
]);

export function claimsFromTreatment(parsed: unknown): Claim[] {
  const p = parsed as Record<string, unknown>;
  const rel = str(p?.['relationship'])?.toLowerCase();
  if (!rel || !TREATMENTS.has(rel)) return [];
  return [
    {
      value: rel,
      evidence: str(p?.['evidence']),
      kind: 'treatment',
      extra: { quotedOrArgued: p?.['quoted_or_argued'] === true },
    },
  ];
}

/* ------------------------------------------------------------ verification -- */

export type Verdict = {
  readonly claim: Claim;
  readonly verified: boolean;
  readonly reason: string | null;
};

/**
 * Whitespace is the only normalisation applied, and only because PDF text
 * extraction inserts newlines mid-sentence that no model could reproduce. The
 * comparison is otherwise EXACT: no lowercasing, no punctuation stripping, no
 * fuzzy distance. Loosening this is how a fabricated span starts matching
 * something, and the whole safety property here is that it cannot.
 */
const flatten = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * CASE IS NOT IDENTITY FOR A NAME, and insisting it was cost 7 of 41 claims in
 * the first real pilot — every one of them correct.
 *
 * The corpus prints its coram in capitals (`HONOURABLE MR. JUSTICE RAJESH
 * KUMAR VERMA`) and the prompt explicitly instructs the model to drop
 * honorifics, so it returns `Rajesh Kumar Verma`. The span was genuine, the
 * name was genuine, and an exact byte comparison rejected it.
 *
 * **This is case folding, NOT fuzzy matching, and the distinction is the whole
 * safety property.** A substring test that ignores case still cannot find a
 * name the document does not contain — `RANJAN GOGOI` fails against a judgment
 * he did not sit on, in any casing, and a test asserts exactly that. Levenshtein
 * distance or token overlap here would be the step that lets a fabrication
 * through, and neither is used.
 */
const fold = (s: string) => flatten(s).toLowerCase();

/** Minimum evidence length. A two-character "span" matches almost any document. */
export const MIN_EVIDENCE_CHARS = 12;

export function verifyClaims(claims: readonly Claim[], sourceText: string): Verdict[] {
  const haystack = flatten(sourceText);
  return claims.map((claim): Verdict => {
    if (!claim.evidence) return { claim, verified: false, reason: 'no evidence span offered' };
    const needle = flatten(claim.evidence);
    if (needle.length < MIN_EVIDENCE_CHARS) {
      return { claim, verified: false, reason: `evidence shorter than ${MIN_EVIDENCE_CHARS} chars` };
    }
    if (!haystack.includes(needle)) {
      return { claim, verified: false, reason: 'evidence span not found in source text' };
    }
    /**
     * The span exists — now check it actually supports the claim. A real span
     * quoted from elsewhere in the document would otherwise "prove" any value
     * the model attached to it. Citations and metadata must appear INSIDE
     * their own evidence; treatment is exempt because a relationship word is a
     * label for what the span says, not a substring of it.
     */
    if (claim.kind !== 'treatment' && !fold(haystack).includes(fold(claim.value))) {
      return { claim, verified: false, reason: 'claimed value not present in source text' };
    }
    if (claim.kind !== 'treatment' && !fold(needle).includes(fold(claim.value))) {
      return { claim, verified: false, reason: 'evidence span does not contain the claimed value' };
    }
    return { claim, verified: true, reason: null };
  });
}

export function verificationState(verdicts: readonly Verdict[]): 'verified' | 'partial' | 'rejected' | 'unverified' {
  if (verdicts.length === 0) return 'unverified'; // nothing claimed — not a failure
  const ok = verdicts.filter((v) => v.verified).length;
  if (ok === verdicts.length) return 'verified';
  if (ok === 0) return 'rejected';
  return 'partial';
}

export function enrichmentInputHash(task: EnrichTask, promptVersion: string, excerpt: string): string {
  return sha256(`${task}|${promptVersion}|${excerpt}`);
}
