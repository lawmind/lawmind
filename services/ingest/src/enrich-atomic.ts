/**
 * The ATOMIC legal objects — one proposition per claim, migration `0054`'s
 * vocabulary given the prompt builders it never had.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY ATOMIC AT ALL, WHEN `holding` ALREADY EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `0054`'s own header: *"the unit `holding` was too big to verify."* A composite
 * task returns four buckets at once and a document comes back `partial` when any
 * one of them misses — the live factory reports 79.8% of claims verified and
 * `partial 28 / verified 27 / rejected 3` per 60 documents, which says almost
 * nothing about WHICH proposition failed. An atomic task asks for one kind of
 * object, so a rejection names one object.
 *
 * The nine tasks here are exactly `0054`'s CHECK constraint, spelled the way the
 * database spells them. `statute_role` is NOT renamed to `section_role`: the
 * constraint, the migration and `0045`'s sibling `statute_reference` all use
 * `statute_role`, and a second naming style one column over is how a vocabulary
 * starts drifting.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY OBJECT CARRIES ITS OWN SPAN, AND THE SPAN IS WHAT IS VERIFIED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The shape is the same for all nine: `{"objects":[{"quote":…,"value":…}]}`.
 *
 * - `quote` is verbatim source text. `verifyClaims` string-matches it against
 *   the judgment; a claim whose span is not found is REJECTED, and the founder's
 *   requirement is exactly that — *"verifier rejects output without evidence."*
 * - `value` is the object itself, in the model's words, kept in `extra` rather
 *   than becoming the claim value. **The claim value stays the QUOTE**, because
 *   that is the only half a string match can prove. `claimsFromQuoteBuckets`
 *   already made that choice for the composite tasks and this follows it rather
 *   than inventing a second convention.
 * - Task-specific fields (`party`, `section`, `role`, `date`) ride in `extra`
 *   too, and are likewise unverified. Naming them unverified in one place beats
 *   discovering per-field which ones were checked.
 *
 * Paragraph/page location is NOT asked of the model. `locateSpan` computes the
 * character offset of the verified span deterministically, and `0049`'s
 * `judgment_paragraphs` carries offsets to resolve it to a paragraph. A location
 * a model asserts is one more thing to verify; a location we compute from a span
 * that already verified is free and cannot be fabricated.
 */
import type { Claim } from './enrich.ts';

/** `0054`'s CHECK constraint, in its own spelling. Adding one here without adding it there fails at INSERT. */
export const ATOMIC_TASKS = [
  'issue',
  'relief',
  'procedural_event',
  'date_event',
  'fact_proposition',
  'party_action',
  'court_action',
  'reasoning_proposition',
  'statute_role',
] as const;

export type AtomicTask = (typeof ATOMIC_TASKS)[number];

export const isAtomicTask = (t: string): t is AtomicTask => (ATOMIC_TASKS as readonly string[]).includes(t);

/**
 * Repeated verbatim in every atomic prompt. `enrich.ts`'s composite prompts
 * carry the same clause; it is restated rather than imported because these
 * prompts are hashed into `input_hash` and a shared constant that changes would
 * silently invalidate stored outputs for tasks that did not change.
 */
const QUOTE_CLAUSE = `
Every object MUST carry "quote": text copied EXACTLY from the judgment below,
character for character, long enough to be found again (at least 12 characters).
Do not paraphrase inside "quote". Do not join two separate passages. If you
cannot find a passage that carries the object, omit the object entirely — an
omission is correct and an invented quote is not.

Return ONLY JSON. No commentary, no markdown fence.`;

/** One object type per task. The `extra` columns each one adds beyond `quote` + `value`. */
type Spec = {
  readonly what: string;
  readonly rules: readonly string[];
  readonly fields: readonly string[];
};

const SPECS: Record<AtomicTask, Spec> = {
  issue: {
    what: 'a QUESTION the court framed for its own decision',
    rules: [
      'Only questions this court says it must decide. A question a party posed and the court did not adopt is not an issue.',
      'One question per object. Two questions joined by "and" are two objects.',
    ],
    fields: [],
  },
  relief: {
    what: 'RELIEF that was SOUGHT, and by whom',
    rules: [
      'What was asked for, not what was granted — what the court ordered is a court_action.',
      '"party" is the word the JUDGMENT uses for the party who sought it.',
    ],
    fields: ['party'],
  },
  procedural_event: {
    what: 'a STEP IN THIS CASE\'S OWN HISTORY as the judgment recites it',
    rules: [
      'Remand, transfer, consolidation, earlier dismissal, leave granted — steps already taken before or below.',
      'NOT something this court is doing now. That is a court_action.',
    ],
    fields: [],
  },
  date_event: {
    what: 'a DATE the judgment asserts, bound to what happened on it',
    rules: [
      'The date must appear in the quote. Never infer a date from context and never convert one.',
      '"date" is the date exactly as the judgment prints it.',
    ],
    fields: ['date'],
  },
  fact_proposition: {
    what: 'a FINDING OF FACT, as found',
    rules: [
      'A fact the court finds or records as established — not a fact a party alleged.',
      'If the passage is introduced by "it was submitted" or "according to the petitioner", it is not a finding.',
    ],
    fields: [],
  },
  party_action: {
    what: 'something a PARTY DID, attributed to that party',
    rules: [
      'Filing, applying, paying, refusing, appearing, abandoning a ground.',
      '"party" is the word the JUDGMENT uses.',
    ],
    fields: ['party'],
  },
  court_action: {
    what: 'something THE COURT DID',
    rules: [
      'Allowed, dismissed, stayed, remitted, set aside, issued a direction, granted leave.',
      '"court" is the court that did it as the judgment names it — this court, or a court below.',
    ],
    fields: ['court'],
  },
  reasoning_proposition: {
    what: 'ONE STEP of the reasoning that links a fact to a conclusion',
    rules: [
      'One inferential step per object. A whole paragraph of reasoning is several objects, not one.',
      'The court\'s own voice only. A step attributed to counsel or to another judgment is not this court\'s reasoning.',
    ],
    fields: [],
  },
  statute_role: {
    what: 'the ROLE a statutory provision plays in the decision',
    rules: [
      '"section" is the provision as printed, e.g. "Section 138 of the Negotiable Instruments Act", "Article 226".',
      '"role" is one of: applied, distinguished, interpreted, read_down, held_ultra_vires, not_applicable.',
      'That a section was merely cited is recorded elsewhere. Only record what the court DID with it.',
    ],
    fields: ['section', 'role'],
  },
};

function shape(spec: Spec): string {
  const extras = spec.fields.map((f) => `,"${f}":"<${f}>"`).join('');
  return `{"objects":[{"quote":"<verbatim>","value":"<the object, <=25 words>"${extras}}]}`;
}

/** The prompt for one atomic task. Pure — same input, same string, so `input_hash` is stable. */
export function buildAtomicPrompt(task: AtomicTask, text: string): string {
  const spec = SPECS[task];
  return `You are reading an Indian court judgment and extracting ONE kind of object:
${spec.what}.

Extract nothing else. Other kinds of object are handled by other passes, and an
object of the wrong kind here is discarded.
${QUOTE_CLAUSE}

${spec.rules.map((r) => `- ${r}`).join('\n')}
- "value" states the object in your own words, at most 25 words.

${shape(spec)}

TEXT:
${text}`;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/**
 * Claims from one atomic response.
 *
 * The claim VALUE is the quote, not the model's `value` — a string match can
 * prove a quote is in the document and can prove nothing about a paraphrase.
 * `value` and the task's own fields are kept in `extra`, unverified, exactly as
 * `claimsFromAuthorities` keeps a case name it does not verify.
 */
export function claimsFromAtomic(task: AtomicTask, parsed: unknown): Claim[] {
  const rows = (parsed as { objects?: unknown } | null)?.objects;
  if (!Array.isArray(rows)) return [];
  const spec = SPECS[task];
  const out: Claim[] = [];
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const quote = str(row?.['quote']);
    if (!quote) continue;
    const extra: Record<string, unknown> = { objectValue: str(row?.['value']) };
    for (const f of spec.fields) extra[f] = str(row?.[f]);
    out.push({ value: quote, evidence: quote, kind: task, extra });
  }
  return out;
}

/**
 * Where a verified span sits in the source, computed rather than asserted.
 *
 * Returns the character offset in the ORIGINAL text, or null when the span is
 * not found — which for a verified claim means the whitespace-collapsed match
 * that `verifyClaims` made cannot be reproduced against the raw text, and a
 * location that cannot be reproduced is not recorded.
 */
export function locateSpan(sourceText: string, span: string): number | null {
  const direct = sourceText.indexOf(span);
  if (direct !== -1) return direct;

  // `verifyClaims` compares whitespace-collapsed text, so a span that verified
  // may differ from the raw text only in its line breaks. Walk the raw text
  // once, collapsing as we go, and remember where each collapsed index came from.
  const needle = span.replace(/\s+/g, ' ').trim();
  if (!needle) return null;
  const map: number[] = [];
  let collapsed = '';
  let previousWasSpace = false;
  for (let i = 0; i < sourceText.length; i++) {
    const ch = sourceText[i]!;
    if (/\s/.test(ch)) {
      if (previousWasSpace || collapsed === '') continue;
      collapsed += ' ';
      map.push(i);
      previousWasSpace = true;
      continue;
    }
    collapsed += ch;
    map.push(i);
    previousWasSpace = false;
  }
  const at = collapsed.indexOf(needle);
  return at === -1 ? null : (map[at] ?? null);
}
