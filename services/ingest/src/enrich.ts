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

export type EnrichTask =
  | 'citation_extraction'
  | 'metadata'
  | 'treatment'
  | 'document_class'
  /* ---- the structured legal object, added 14 Aug 2026 ------------------- */
  | 'case_structure'
  | 'holding'
  | 'arguments'
  | 'authorities'
  | 'topics'
  /* ---- the ATOMIC vocabulary, migration 0054 · builders in `enrich-atomic.ts`
     ---- one proposition per claim, because `holding` was too big to verify -- */
  | 'issue'
  | 'relief'
  | 'procedural_event'
  | 'date_event'
  | 'fact_proposition'
  | 'party_action'
  | 'court_action'
  | 'reasoning_proposition'
  | 'statute_role';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STRUCTURED LEGAL OBJECT — AND WHY EVERY FIELD IS A QUOTE, NOT A SUMMARY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The five tasks above recover what a judgment SAYS: its facts, issues,
 * procedural history, arguments, holding, reasoning, relief, the authorities it
 * leans on and the topics it belongs to. That is a summarisation task in every
 * other product, and summarisation is exactly the shape this pipeline refuses.
 *
 * `verifyClaims` can only prove one thing: that a string appears in the
 * document. A paraphrase never does — *"the appellant challenged the
 * conviction"* is nowhere in a judgment that says *"the appellant assails the
 * judgment of conviction dated 12.03.2019"*. So a paraphrase can only be
 * verified by weakening the check, and `LABEL_KINDS` above says plainly why
 * that door stays shut.
 *
 * **So the model is asked to QUOTE, and the quote is the value.** Each item is
 * `{quote, label}`: the `quote` is a verbatim span and becomes `Claim.value`
 * AND `Claim.evidence`, so it goes through the full-strength check with no new
 * label kind; the `label` is the model's own short gloss, carried in `extra`
 * for readability and **never verified, never promoted, never displayed as
 * fact**. If the model invents a sentence the judgment does not contain, the
 * item is rejected — the paraphrase cannot smuggle it in, because the
 * paraphrase is not what is checked.
 *
 * The cost of this design is recall, and it is the right cost: a holding the
 * model cannot find words for is dropped rather than written from memory.
 */

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

/**
 * Classify a High Court document that the RULE-BASED classifier could not.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A MODEL IS JUSTIFIED HERE, WHEN IT IS NOT ELSEWHERE IN THIS FILE'S LANE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `hc-classify.ts` decides from `disposal_nature` and text shape, deterministically,
 * and it is always tried FIRST. It settles 136,009 documents on its own and this
 * prompt never sees them.
 *
 * It cannot settle **159,439**, and the reason is visible in its own method
 * labels: `unclassified_disposal:DISPOSED OF`, `DISPOSED OFF`, `DISPOSED`. The
 * source field carries no information — the registry typed "disposed of" and
 * stopped. Whether that document is a bail order, a withdrawal, or a reasoned
 * decision is written only in the text, and reading it is a judgment call.
 *
 * **That is the boundary**: deterministic where the data decides, a model only
 * where it provably does not. Applying it the other way round — a model where
 * a rule already works — is how a citation graph starts carrying opinion.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT STILL CANNOT BE BELIEVED WITHOUT A SPAN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The class is a CLAIM, verified like any other: the model must quote the words
 * that decide it, and `verifyClaims` locates that span in the source text before
 * anything is written. A class with no locatable evidence is rejected.
 *
 * And the refusal has to be cheap, because the honest answer here is often
 * "the text does not say" — a short order that records an outcome and nothing
 * else genuinely cannot be classified, and `unknown` must stay `unknown`.
 */
export function buildDocumentClassPrompt(text: string): string {
  return `You are reading an Indian High Court document to decide what KIND of
document it is. This is not a legal judgment about the case — only about the
document's nature.
${REFUSAL_CLAUSE}

Choose exactly one class:
- "bail_order": grants, rejects, cancels or modifies bail, anticipatory bail or suspension of sentence.
- "procedural_disposal": ends WITHOUT deciding the merits — withdrawn, dismissed for non-prosecution, abated, infructuous, disposed as settled, remanded purely on procedure.
- "reference_stub": contains no reasoning of its own and points elsewhere — "as per separate order", "in terms of the judgment in", a bare tabular result.
- "decided": decides the merits AND contains reasoning.
- "decided_brief": decides the merits but is too short to contain reasoning.

Rules:
- Use ONLY the TEXT. Do not infer from what such a case usually is.
- "evidence" MUST be a verbatim substring of TEXT that shows the class. Never paraphrase.
- If the TEXT does not make the class clear, return "class":null. Guessing is worse than refusing.

{"class":"<one of the five, or null>","evidence":"<verbatim substring of TEXT, or null>"}

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

/* ------------------------------------------- the structured legal object -- */

/**
 * Shared by all five legal-object prompts. Stricter than `REFUSAL_CLAUSE`
 * because these tasks are the ones a model most wants to answer from general
 * knowledge: it has read thousands of judgments and can write a plausible
 * "holding" for an Indian criminal appeal without reading this one.
 */
const QUOTE_CLAUSE = `
RULES, and they outrank completeness:
- Every item MUST contain a "quote" that is a VERBATIM substring of the TEXT
  below, copied character for character. Do not tidy, join, shorten with an
  ellipsis, fix spelling, or expand an abbreviation.
- A quote must be a meaningful stretch of the judgment's own words — at least a
  full clause, not a fragment of a few words.
- "label" is YOUR short description of that quote, at most 15 words. It is
  never treated as fact; the quote is the only thing that will be believed.
- If the TEXT does not contain something, return an empty array for it. An
  empty array is CORRECT. Writing something plausible is the one real failure.
- Never quote from a passage the judgment is itself quoting from another case
  as if it were this court's own words.
Respond with ONLY a single JSON object, no prose and no code fence.`;

/** Facts, issues, procedural history, chronology, relief sought. */
export function buildCaseStructurePrompt(text: string): string {
  return `You are reading an Indian court judgment and locating the passages that
carry its structure. You are NOT summarising it.
${QUOTE_CLAUSE}

- "facts": what happened between the parties, before any court got involved.
- "issues": the questions this court says it has to decide.
- "procedural_history": what earlier courts or authorities did with this matter.
- "chronology": passages that fix a date to an event.
- "relief_sought": what the party bringing this proceeding asked for.

{"facts":[{"quote":"<verbatim>","label":"<=15 words>"}],"issues":[{"quote":"<verbatim>","label":"<=15 words>"}],"procedural_history":[{"quote":"<verbatim>","label":"<=15 words>"}],"chronology":[{"quote":"<verbatim>","label":"<=15 words>"}],"relief_sought":[{"quote":"<verbatim>","label":"<=15 words>"}]}

TEXT:
${text}`;
}

/** Holdings, reasoning, relief granted, and the propositions of law laid down. */
export function buildHoldingPrompt(text: string): string {
  return `You are reading an Indian court judgment and locating the passages where
the court DECIDES, as opposed to where it recites facts or arguments.
${QUOTE_CLAUSE}

- "holdings": the court's own conclusion on an issue it had to decide.
- "reasoning": the passages giving the court's reason for a conclusion.
- "relief_granted": the operative direction — what the court actually orders.
- "propositions": statements of law stated generally, not tied to these parties.

Be strict about the difference between the court's own voice and everything
else. A submission recorded as "learned counsel contends" is NOT a holding. A
passage introduced by "it was held in" is another court's holding, not this
one's.

{"holdings":[{"quote":"<verbatim>","label":"<=15 words>"}],"reasoning":[{"quote":"<verbatim>","label":"<=15 words>"}],"relief_granted":[{"quote":"<verbatim>","label":"<=15 words>"}],"propositions":[{"quote":"<verbatim>","label":"<=15 words>"}]}

TEXT:
${text}`;
}

/** What each side argued, kept attributed and kept apart from the holding. */
export function buildArgumentsPrompt(text: string): string {
  return `You are reading an Indian court judgment and locating what each side
ARGUED. You are not deciding who was right, and you are not recording what the
court concluded.
${QUOTE_CLAUSE}

- "petitioner": contentions of the party who brought this proceeding (appellant,
  petitioner, applicant, complainant, prosecution — whichever this judgment uses).
- "respondent": contentions of the opposing party (respondent, State, accused,
  defendant — whichever this judgment uses).
- "side" in each item is the word the JUDGMENT uses for that party.

A passage where the court accepts or rejects a contention is a holding, not an
argument. Leave it out.

{"petitioner":[{"quote":"<verbatim>","label":"<=15 words>","side":"<the word the judgment uses>"}],"respondent":[{"quote":"<verbatim>","label":"<=15 words>","side":"<the word the judgment uses>"}]}

TEXT:
${text}`;
}

/**
 * Which authorities the court actually LEANED ON, and what for.
 *
 * Deliberately not an extraction of citations — `citations.ts` does that
 * deterministically and better, and `CLAUDE.md` is explicit that a model must
 * not be paid to do work a regex already does. What no regex can decide is
 * whether an authority was load-bearing or merely listed, and what proposition
 * it was invoked for. That judgement is the only thing asked for here.
 */
export function buildAuthoritiesPrompt(text: string): string {
  return `You are reading an Indian court judgment. Some earlier decisions and
statutory provisions it mentions are load-bearing — the court relies on them to
reach its conclusion. Others are merely listed, or cited by a party and not
adopted. Identify only the load-bearing ones.
${QUOTE_CLAUSE}

- "authorities": earlier court decisions the court RELIES ON. "name" is the case
  name as printed. "proposition" is what the court uses it for, in your words.
- "provisions": statutory provisions the court APPLIES. "provision" is the
  section/article as printed, e.g. "Section 138 of the Negotiable Instruments
  Act" or "Article 226".

Do not list an authority that appears only in a party's submission which the
court does not adopt.

{"authorities":[{"name":"<as printed>","quote":"<verbatim>","proposition":"<=20 words>"}],"provisions":[{"provision":"<as printed>","quote":"<verbatim>","proposition":"<=20 words>"}]}

TEXT:
${text}`;
}

/**
 * Topic taxonomy and the queries this judgment should answer.
 *
 * `search_concepts` exists for retrieval, not for display: `NEW1`'s benchmark
 * measures `HELD_NOT_RETRIEVED` at 48.6%, and a judgment that never states the
 * words an advocate would search for is one mechanism for that. Every concept
 * still has to be anchored to a quote, so this cannot become a keyword-stuffing
 * layer detached from the document.
 */
export function buildTopicsPrompt(text: string): string {
  return `You are reading an Indian court judgment and placing it in a subject
taxonomy, then writing the questions a practising advocate would type to find it.
${QUOTE_CLAUSE}

- "topics": areas of law this judgment is about, most specific first, e.g.
  "dishonour of cheque", "anticipatory bail", "specific performance".
- "search_concepts": the phrasings an advocate would actually search. These are
  YOUR words and go in "label"; the "quote" must still be the passage in this
  judgment that makes that search a correct hit.

{"topics":[{"quote":"<verbatim>","label":"<the topic>"}],"search_concepts":[{"quote":"<verbatim>","label":"<what an advocate would search>"}]}

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

/** The five the rule-based classifier uses. A sixth value is a fabrication. */
const DOCUMENT_CLASSES = new Set([
  'bail_order', 'procedural_disposal', 'reference_stub', 'decided', 'decided_brief',
]);

export function claimsFromDocumentClass(parsed: unknown): Claim[] {
  const value = str((parsed as Record<string, unknown>)?.['class']);
  // null is a REFUSAL and a valid outcome, not a failure. An out-of-vocabulary
  // class is a fabrication and is dropped rather than coerced to a neighbour.
  if (!value || !DOCUMENT_CLASSES.has(value)) return [];
  return [{ value, evidence: str((parsed as Record<string, unknown>)?.['evidence']), kind: 'document_class' }];
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

/* --------------------------------- the structured legal object: claims -- */

/**
 * `{quote, label}[]` under a set of named buckets → `Claim[]`.
 *
 * **The quote becomes the `value`, which is the entire point.** A `Claim` whose
 * value and evidence are the same verbatim span passes `verifyClaims` only if
 * that span is genuinely in the document — the strongest check this pipeline
 * has, and the same one a citation gets. The model's `label` rides along in
 * `extra` and is never checked, because nothing downstream is allowed to treat
 * it as fact.
 *
 * `kind` is `<task field>` (`fact`, `issue`, `holding`, …) so a consumer can
 * tell a holding from a submission without re-reading the prompt, and so the
 * training-set export can filter by role.
 */
function claimsFromQuoteBuckets(
  parsed: unknown,
  buckets: readonly (readonly [field: string, kind: string])[],
  extraKeys: readonly string[] = [],
): Claim[] {
  const p = parsed as Record<string, unknown> | null;
  if (!p || typeof p !== 'object') return [];
  const out: Claim[] = [];
  for (const [field, kind] of buckets) {
    const rows = p[field];
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      const row = r as Record<string, unknown>;
      const quote = str(row?.['quote']);
      if (!quote) continue;
      const extra: Record<string, unknown> = { label: str(row?.['label']) };
      for (const k of extraKeys) extra[k] = str(row?.[k]);
      out.push({ value: quote, evidence: quote, kind, extra });
    }
  }
  return out;
}

export function claimsFromCaseStructure(parsed: unknown): Claim[] {
  return claimsFromQuoteBuckets(parsed, [
    ['facts', 'fact'],
    ['issues', 'issue'],
    ['procedural_history', 'procedural_history'],
    ['chronology', 'chronology'],
    ['relief_sought', 'relief_sought'],
  ]);
}

export function claimsFromHolding(parsed: unknown): Claim[] {
  return claimsFromQuoteBuckets(parsed, [
    ['holdings', 'holding'],
    ['reasoning', 'reasoning'],
    ['relief_granted', 'relief_granted'],
    ['propositions', 'proposition'],
  ]);
}

export function claimsFromArguments(parsed: unknown): Claim[] {
  return claimsFromQuoteBuckets(
    parsed,
    [
      ['petitioner', 'argument_petitioner'],
      ['respondent', 'argument_respondent'],
    ],
    ['side'],
  );
}

/**
 * Authorities and provisions carry a `name`/`provision` the model read off the
 * page. That name is NOT verified by `verifyClaims` — the quote is — so it is
 * kept in `extra` beside the proposition rather than becoming the claim value.
 * Resolving a name to a judgment id is `citations.ts`'s deterministic job and
 * is deliberately not attempted here.
 */
export function claimsFromAuthorities(parsed: unknown): Claim[] {
  return [
    ...claimsFromQuoteBuckets(parsed, [['authorities', 'authority_relied_on']], ['name', 'proposition']),
    ...claimsFromQuoteBuckets(parsed, [['provisions', 'provision_applied']], ['provision', 'proposition']),
  ];
}

export function claimsFromTopics(parsed: unknown): Claim[] {
  return claimsFromQuoteBuckets(parsed, [
    ['topics', 'topic'],
    ['search_concepts', 'search_concept'],
  ]);
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

/**
 * Kinds whose value is a LABEL rather than a quotation.
 *
 * A citation or a judge's name must appear inside its own evidence span — that
 * is what makes the span proof. A treatment (`followed`, `overruled`) is a word
 * WE assign to what the span says; no judgment contains the token `overruled_in_part`.
 * `document_class` is the same shape: no Indian judgment contains the string
 * `bail_order`.
 *
 * **This is a real reduction in guarantee and it should be named as one.** For
 * these kinds the span proves only that the quoted words EXIST in the document,
 * not that they mean what the label says. The mapping from span to label is the
 * model's judgment and nothing here checks it.
 *
 * That is acceptable only because the alternative is worse — demanding a label
 * be a substring of a judgment would reject every true classification — and
 * because the vocabulary is closed, so a fabricated label is dropped before it
 * reaches this function. Do NOT add a kind here to make a failing verification
 * pass.
 */
const LABEL_KINDS = new Set(['treatment', 'document_class']);

export function verifyClaims(claims: readonly Claim[], sourceText: string): Verdict[] {
  const haystack = flatten(sourceText);
  return claims.map((claim): Verdict => {
    if (!claim.evidence) return { claim, verified: false, reason: 'no evidence span offered' };
    const needle = flatten(claim.evidence);
    if (needle.length < MIN_EVIDENCE_CHARS) {
      return { claim, verified: false, reason: `evidence shorter than ${MIN_EVIDENCE_CHARS} chars` };
    }
    /**
     * CASE-FOLDED, AS OF 15 AUG 2026 — and this is the SAME decision already
     * recorded above for the value check, applied to the check it was never
     * applied to.
     *
     * The two tests disagreed with each other: the value had to appear
     * case-insensitively, while the span it came from had to appear
     * case-sensitively. That inconsistency was measured rather than argued
     * about. Triaging all 278 `case_structure` rejections
     * (`enrich-triage-cli.ts`, `docs/ai/ENRICHMENT_REJECTION_TRIAGE.md`) put
     * **45 of them — 16.2% — in a bucket where case was the ONLY difference**,
     * every one a real passage of the judgment the model had copied correctly.
     * Indian judgments print prayers, cause titles and exhibit lists in full
     * capitals and the model returns sentence case, which is exactly the
     * `HONOURABLE MR. JUSTICE …` problem that forced folding on the value check
     * in the first pilot.
     *
     * **The safety property is unchanged and that is the whole argument.** A
     * case-insensitive substring test still cannot find a passage the document
     * does not contain: a fabricated sentence fails in every casing, a real
     * span from a DIFFERENT judgment fails in every casing, and
     * `enrich.test.ts` asserts both. This is folding, not fuzziness — no
     * distance, no token overlap, no punctuation stripping. Those would each
     * admit something new, and none of them is here.
     */
    if (!fold(haystack).includes(fold(needle))) {
      return { claim, verified: false, reason: 'evidence span not found in source text' };
    }
    /**
     * The span exists — now check it actually supports the claim. A real span
     * quoted from elsewhere in the document would otherwise "prove" any value
     * the model attached to it. Citations and metadata must appear INSIDE
     * their own evidence; treatment is exempt because a relationship word is a
     * label for what the span says, not a substring of it.
     */
    if (!LABEL_KINDS.has(claim.kind) && !fold(haystack).includes(fold(claim.value))) {
      return { claim, verified: false, reason: 'claimed value not present in source text' };
    }
    if (!LABEL_KINDS.has(claim.kind) && !fold(needle).includes(fold(claim.value))) {
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
