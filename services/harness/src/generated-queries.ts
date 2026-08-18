/**
 * GENERATED retrieval-test material — never gold, never truth.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE RULE THIS MODULE EXISTS TO ENFORCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **A model may rewrite a QUESTION. It may never decide the ANSWER.**
 *
 * Founder direction, NEW1, 14 Aug 2026: *"Do not use DeepSeek as the gold-label
 * authority… Use DeepSeek to enlarge the evaluation/search test space, not to
 * manufacture truth."* And `LANE_PROTOCOL.md` §4 already measured what happens
 * when that line is crossed — `docs/ai/CITATION_CONCORDANCE_EVALUATION.md`
 * found DeepSeek inventing an authority **10.8%** of the time when the right
 * answer was absent, two of four inventions at its own `high` confidence.
 *
 * So the gold label of every item this module produces is **INHERITED, not
 * generated**: a variant of query Q keeps Q's own `goldJudgmentIds`, which came
 * from a verified citation edge in this corpus. The model never sees a judgment
 * id, is never asked which authority is correct, and its output is never
 * consulted about relevance. The only thing it contributes is different words
 * for the same question.
 *
 * That is what makes these independently validatable: *"retrieval found the
 * known-correct authority for the original phrasing — does it still find THAT
 * SAME authority when an advocate phrases it differently?"* is a question whose
 * answer does not depend on trusting the model at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE PROVENANCE TAG IS A REQUIRED FIELD AND NOT A CONVENTION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `provenance: 'GENERATED'` is a literal type with one member. There is no
 * value that can be assigned to it that means anything else, so a generated
 * item cannot be constructed without carrying the mark, and it cannot be
 * widened into a gold fixture's shape by accident — `GoldQuery` has no
 * `provenance` field at all, so the two are structurally incompatible in both
 * directions. `generated-queries.test.ts` asserts that no fixture file under
 * `src/fixtures/` ever contains a `GENERATED` marker, which is the half the
 * type system cannot check (a file written by hand, or by a future CLI that
 * forgot).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CACHING, AND WHY IT IS CONTENT-ADDRESSED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Founder: *"Cache and record all calls."* Two separate obligations, met two
 * separate ways:
 *
 * - **Recorded** — every call goes through `callModel`, which writes an
 *   `llm_calls` row with `data_class` and `pseudonymised` on success AND on
 *   failure (`CLAUDE.md` §5, no exceptions). This module adds no second path to
 *   the network, so there is no way for a call to escape the ledger.
 * - **Cached** — keyed on `sha256(promptVersion + model + kind + input)`. The
 *   prompt version is IN the key deliberately: a changed prompt is a different
 *   experiment, and silently serving the old answer for a new prompt is how a
 *   cache turns into a source of fabricated consistency. Bump `PROMPT_VERSION`
 *   and every entry re-derives.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MODEL AVAILABILITY IS NOT A DEPENDENCY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Founder: *"Continue the current retrieval program independently of model
 * availability."* `generate()` returns `{ ok: false, reason }` and callers
 * treat an unavailable model as **zero extra test material**, never as an
 * error that stops a measurement. The InferX free pool 429s under burst
 * (`RETRIEVAL_PROGRAM.md`) and `deepseek-v4-flash` vs `-0731` is a known 401
 * trap (`LANE_PROTOCOL.md` §5) — both are ordinary, both degrade to "we got
 * fewer stress queries this run", neither blocks the decomposition work.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * What a generated artifact IS. Every member is a rephrasing task; none asks
 * the model for a fact, an authority, or a relevance judgement.
 *
 * The founder's priority list, in their order, with what each is FOR:
 */
export type GeneratedKind =
  /** Same question, different words. Tests lexical/semantic robustness. */
  | 'query_expansion'
  /** Indian-legal synonym candidates ("bail" / "anticipatory bail" / "s.438"). */
  | 'terminology_synonym'
  /** The same citation typeset differently. Tests the exact-citation path. */
  | 'citation_phrasing'
  /** The same case named differently ("Bommai" / "S.R. Bommai v. Union of India"). */
  | 'case_name_variation'
  /** Deliberately hard: near-miss phrasing, distractor terms, wrong-but-plausible. */
  | 'adversarial'
  /** A label for WHY a query is hard. Not a query; a proposed taxonomy term. */
  | 'difficulty_label';

/**
 * A generated item. **Note what is NOT here: no judgment id chosen by the
 * model, no relevance score, no confidence.** `goldJudgmentIds` is copied from
 * the source query and the model never sees it.
 */
export type GeneratedItem = {
  /** Single-member literal. A generated item cannot claim to be anything else. */
  readonly provenance: 'GENERATED';
  readonly kind: GeneratedKind;
  /** The generated text — a QUERY or a LABEL, never an answer. */
  readonly text: string;
  /** The already-validated query this varies. Its gold is inherited unchanged. */
  readonly sourceQueryId: string;
  /**
   * Inherited from the source query, which got it from a verified citation
   * edge in this corpus. **Never produced by, shown to, or influenced by the
   * model.** This is the field that makes a generated item independently
   * checkable rather than circular.
   */
  readonly inheritedGoldJudgmentIds: readonly string[];
  /**
   * `null` until a corpus check runs. `true`/`false` afterwards. A
   * `citation_phrasing` or `case_name_variation` item is checkable against the
   * corpus directly (does this string resolve to the same judgment?); a
   * `query_expansion` is not, and stays `null` forever rather than being given
   * a fake tick. **`null` means UNKNOWN and must never be read as "fine".**
   */
  readonly corpusValidated: boolean | null;
  readonly model: string;
  readonly promptVersion: string;
  readonly generatedAt: string;
};

/**
 * Bump on ANY prompt change. It is part of the cache key, so a bump
 * invalidates every cached response derived from the old wording — a cache
 * that serves an old answer for a new prompt manufactures a consistency the
 * experiment never had.
 */
export const PROMPT_VERSION = 'v1-2026-08-14';

/** How many variants to ask for per source query. Small on purpose: this is a
 * stress-test multiplier over 288 real queries, not a corpus. */
export const VARIANTS_PER_QUERY = 4;

const CACHE_DIR = new URL('../.generated-cache/', import.meta.url);

function cacheKey(kind: GeneratedKind, input: string, model: string): string {
  return createHash('sha256').update(`${PROMPT_VERSION} ${model} ${kind} ${input}`).digest('hex');
}

function cachePath(key: string): URL {
  return new URL(`${key}.json`, CACHE_DIR);
}

export function readCache(kind: GeneratedKind, input: string, model: string): string | null {
  const p = cachePath(cacheKey(kind, input, model));
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

export function writeCache(kind: GeneratedKind, input: string, model: string, raw: string): void {
  const p = cachePath(cacheKey(kind, input, model));
  mkdirSync(dirname(fileURLToPath(p)), { recursive: true });
  writeFileSync(p, raw);
}

/**
 * The prompts. Each one is written so that a correct answer requires **no legal
 * knowledge the model would have to invent** — only rewording.
 *
 * Deliberately absent: any prompt asking "which case establishes X", "is this
 * citation real", "which authority is most relevant". Those are the questions
 * the concordance evaluation measured a 10.8% fabrication rate on, and they are
 * not asked here at any confidence threshold.
 */
export function promptFor(kind: GeneratedKind, input: string): string {
  const noPreamble =
    'Return ONLY a JSON array of strings. No prose, no explanation, no markdown fence.';
  switch (kind) {
    case 'query_expansion':
      return (
        'You are helping test a legal search engine for Indian advocates. Rewrite the ' +
        `following search query ${VARIANTS_PER_QUERY} different ways. Keep the SAME legal ` +
        'question and the SAME facts. Vary only the wording, order and level of formality — ' +
        'as different advocates would type the same search. Do NOT add case names, citations ' +
        'or section numbers that are not already in the text. Do NOT answer the question.\n\n' +
        `${noPreamble}\n\nQUERY:\n${input}`
      );
    case 'terminology_synonym':
      return (
        'You are helping test a legal search engine for Indian advocates. For the Indian legal ' +
        `term below, list up to ${VARIANTS_PER_QUERY} alternative ways an advocate might write ` +
        'the SAME term — abbreviations, expansions, common spellings, and the statutory phrase ' +
        'if the term is a colloquial name for one. Do NOT list related-but-different concepts. ' +
        'Do NOT explain the term.\n\n' +
        `${noPreamble}\n\nTERM:\n${input}`
      );
    case 'citation_phrasing':
      return (
        'A citation to an Indian judgment is written below. Write it up to ' +
        `${VARIANTS_PER_QUERY} other ways the SAME citation is commonly typeset — punctuation, ` +
        'spacing, abbreviation of the reporter, order of elements. It must remain the SAME ' +
        'citation: do NOT change the year, volume, page or reporter. Do NOT invent a ' +
        'parallel citation in a different reporter.\n\n' +
        `${noPreamble}\n\nCITATION:\n${input}`
      );
    case 'case_name_variation':
      return (
        'An Indian case title is written below. Write up to ' +
        `${VARIANTS_PER_QUERY} other ways an advocate would refer to the SAME case in writing ` +
        '— short form, first party only, common abbreviation, "v." vs "versus". The case ' +
        'identity must not change. Do NOT add a citation.\n\n' +
        `${noPreamble}\n\nCASE TITLE:\n${input}`
      );
    case 'adversarial':
      return (
        'You are red-teaming a legal search engine for Indian advocates. Below is a search ' +
        `query. Write ${VARIANTS_PER_QUERY} HARDER versions of the same query that a real ` +
        'advocate might plausibly type: keep the same underlying legal question, but make it ' +
        'harder to match — use a colloquial name for the doctrine, drop the distinctive terms, ' +
        'add a common but non-discriminating phrase, or state it more abstractly. Do NOT ' +
        'change the legal question. Do NOT add facts.\n\n' +
        `${noPreamble}\n\nQUERY:\n${input}`
      );
    case 'difficulty_label':
      return (
        'Below is a search query that a legal search engine FAILED to answer correctly. ' +
        `Propose up to ${VARIANTS_PER_QUERY} short kebab-case labels naming WHY this query is ` +
        'hard to match against judgment text (for example: abstract-doctrine-no-distinctive-terms, ' +
        'boilerplate-heavy, multi-issue). Labels only. Do NOT name, guess at or reason about ' +
        'the correct authority. Do NOT explain.\n\n' +
        `${noPreamble}\n\nQUERY:\n${input}`
      );
  }
}

/**
 * Parse the model's reply into strings, refusing anything that is not a clean
 * JSON array of non-empty strings.
 *
 * **Strict on purpose.** A lenient parser that "recovers" a list out of prose
 * is a parser that invents content when the model rambled, and this whole
 * module exists to keep model invention out of the measurement. A malformed
 * reply produces zero items and that is a correct outcome, not a bug to patch.
 */
export function parseStringArray(raw: string): string[] {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  for (const v of parsed) {
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (s.length === 0) continue;
    out.push(s);
  }
  return out;
}

/**
 * Build items from parsed strings. Gold is COPIED from the source; the model's
 * output reaches only the `text` field.
 *
 * `corpusValidated` starts `null` for every kind, including the checkable ones
 * — validation is a separate step against the database, and pre-marking
 * anything `true` here would be a claim made before the check.
 */
export function toItems(
  kind: GeneratedKind,
  texts: readonly string[],
  source: { id: string; goldJudgmentIds: readonly string[] },
  model: string,
  now: () => string = () => new Date().toISOString(),
): GeneratedItem[] {
  const seen = new Set<string>();
  const out: GeneratedItem[] = [];
  for (const text of texts) {
    // Identical-to-source variants are dropped: they add a duplicate row to
    // the benchmark and no new information about robustness.
    const norm = text.trim().toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({
      provenance: 'GENERATED',
      kind,
      text,
      sourceQueryId: source.id,
      inheritedGoldJudgmentIds: [...source.goldJudgmentIds],
      corpusValidated: null,
      model,
      promptVersion: PROMPT_VERSION,
      generatedAt: now(),
    });
  }
  return out;
}

/**
 * The only two kinds whose text makes a checkable claim about the corpus.
 *
 * A `citation_phrasing` variant claims *"this string denotes the same
 * judgment"*, and the corpus can settle that: normalise it and look it up. A
 * `case_name_variation` claims the same about a title. Everything else —
 * expansions, adversarial rewrites, difficulty labels — makes no corpus claim,
 * so there is nothing to check and `corpusValidated` stays `null`. Reporting
 * `null` as a distinct state from `false` is the point: *not checked* and
 * *checked and wrong* are different facts, and `LANE_PROTOCOL.md` §4 requires
 * UNKNOWN to stay UNKNOWN.
 */
export const CORPUS_CHECKABLE_KINDS: readonly GeneratedKind[] = ['citation_phrasing', 'case_name_variation'];

export function isCorpusCheckable(kind: GeneratedKind): boolean {
  return CORPUS_CHECKABLE_KINDS.includes(kind);
}
