/**
 * Short, question-shaped queries — the gap `CURRENT_PLAN.md` §2 proved exists.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SECOND EXTRACTOR AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `build-queries.ts` produces 200–900 character citing passages, which is what
 * the CLERC method yields and is the only thing that gives ground truth with
 * provenance. Measured 9 Aug 2026, that length has a consequence nobody had
 * noticed: `plainto_tsquery` ANDs every lexeme, so over 30 such queries the AND
 * pass returned a **median of 1 candidate out of 38,341** and the OR fallback
 * fired **100% of the time**. Real advocate queries are short and will mostly
 * take the AND path. **We were tuning a configuration our users do not hit**,
 * and `queries.hand.json` does not close it — five queries, all Hindi, 225–268
 * characters.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SOURCE: THE COURT'S OWN STATEMENT OF THE ISSUE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Indian judgments state their question explicitly and formulaically — *"The
 * short question that arises for consideration is whether…"*. That sentence is:
 *
 * - **short**, one or two sentences, which is the whole point;
 * - **question-shaped**, the way an advocate frames a research problem rather
 *   than the way a judgment argues one;
 * - **primary source**, written by the court in the course of deciding a real
 *   matter — not our paraphrase, and not another model's commentary about law,
 *   which `DATASETS.md` forbids;
 * - **provenanced**, because it sits in a judgment whose citation edges give the
 *   gold answers exactly as the CLERC method does.
 *
 * **What it is NOT.** It is not a headnote. A reporter's headnote is the one
 * copyrighted part of a law report (*Eastern Book Company v. D.B. Modak*;
 * `CLAUDE.md` §6), and {@link looksLikeHeadnote} refuses anything carrying its
 * markers. The issue statement is the court's own text in the body of the
 * judgment.
 *
 * These queries are held in their own fixture and **never averaged into the
 * derived set's number** — a metric mixing two query populations reports on
 * neither.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS NOT SOLVED HERE, AND MUST NOT BE PAPERED OVER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **The gold answer.** CLERC works because the citation sits *at* the passage:
 * the judge cited that authority for that sentence, so the link is the judge's
 * own and it is recorded. **An issue statement carries no such link** — it sits
 * near the top of the judgment, and the authorities that answer it are cited
 * pages later, interleaved with the authorities for every other issue the
 * judgment decides.
 *
 * The tempting rule is *"gold = every judgment this one relied on"*. It is
 * available today and it is **weaker than it looks**: a judgment deciding four
 * issues relies on authorities for all four, so a query about issue one would be
 * scored correct for retrieving an authority that answers issue three. That
 * inflates success@5 by an unknown amount in an unknown direction, which is
 * worse than not measuring.
 *
 * So **this file extracts and stops.** It is the query half of a fixture, and
 * the gold half is an open problem — `docs/OPEN_DECISIONS.md` territory, not
 * something to settle by picking whichever rule produces a usable-looking
 * number. Measured on 300 real judgments: **18.7% yield at least one statement,
 * 92 statements in all, median 133 characters.**
 */
import { looksOcrDamaged } from './build-queries.ts';

/**
 * How Indian courts announce the question. Formulaic by convention, which is
 * what makes this extractable at all.
 *
 * Anchored to a sentence start so the phrase cannot fire mid-clause, and each
 * alternative requires the *interrogative* that follows — `whether`, `if`, or a
 * question word. Without that requirement the pattern matches *"the question of
 * limitation was not pressed"*, which announces nothing.
 *
 * **The adjective slot is one generic word, not a list.** A list looked tidier
 * and was wrong on its first contact with real formulations: it enumerated
 * `short|only|sole|principal|substantial|narrow` and therefore missed *"the
 * FIRST question that arises"* and *"the SECOND issue that falls"*, which are
 * ordinary and which a list would have kept missing one word at a time.
 * Over-matching is cheap here because the required interrogative does the real
 * discriminating.
 */
const ISSUE_OPENERS =
  /(?:^|[.?!]\s+)((?:the\s+)?(?:[a-z]+\s+)?(?:question|issue|point|controversy)s?\s+(?:of\s+law\s+)?(?:that\s+|which\s+)?(?:arises?|falls?|requiring|calling|for\s+consideration|before\s+us|involved|is|are)[^.?!]{0,120}?\b(?:whether|if|what|when|which|how)\b[^.?!]{10,400}[.?])/gis;

/** The advocate's own framing, which courts also use. */
const DIRECT_QUESTION = /(?:^|[.?!]\s+)((?:Whether|Can|Does|Is|May|Must)\b[^.?!]{20,300}\?)/g;

export type IssueStatement = {
  /** The court's sentence, cleaned. This is the query. */
  text: string;
  /** Character offset into the source, so the extraction can be checked. */
  offset: number;
  /** Which pattern found it — kept because the two have different reliability. */
  via: 'opener' | 'direct';
};

/**
 * Reporter apparatus, refused outright.
 *
 * A headnote is the reporter's copy-edited work and the one part of a law report
 * that carries copyright. `CLAUDE.md` §6: use raw court text, never a law
 * report's edition of it. Refusing on markers is deliberately blunt — a false
 * refusal costs one query out of thousands, and a false acceptance puts somebody
 * else's copyrighted editorial work into our evaluation set.
 */
export function looksLikeHeadnote(context: string): boolean {
  return /\bHELD\s*[:.]|head\s?note|(?:Allowing|Dismissing|Disposing of) the appeals?, the Court|case\s+law\s+cited|cases?\s+referred/i.test(
    context,
  );
}

/**
 * Bounds, stated before running so the set cannot be tuned toward a number.
 *
 * **The upper bound is the point of the whole file.** 200 characters is the
 * threshold above which `retrieve.ts` stops attempting the AND pass, so a query
 * longer than that would take the OR path and measure exactly what the derived
 * set already measures.
 */
export const ISSUE_BOUNDS = {
  MIN_CHARS: 40,
  MAX_CHARS: 200,
  /** Characters either side of a hit, examined for reporter apparatus. */
  CONTEXT: 600,
} as const;

/** Collapse the whitespace a PDF text layer leaves behind. Nothing else. */
function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Pull every usable issue statement out of one judgment.
 *
 * Returns them in document order. **A judgment yielding none is the normal
 * case** — most judgments never state their question in a form this strict, and
 * a looser rule would return prose that merely mentions a question.
 */
export function extractIssueStatements(fullText: string): IssueStatement[] {
  const found: IssueStatement[] = [];
  const seen = new Set<string>();

  for (const [re, via] of [
    [ISSUE_OPENERS, 'opener'],
    [DIRECT_QUESTION, 'direct'],
  ] as const) {
    re.lastIndex = 0;
    for (const m of fullText.matchAll(re)) {
      const raw = m[1];
      if (!raw) continue;
      const text = tidy(raw);
      if (text.length < ISSUE_BOUNDS.MIN_CHARS || text.length > ISSUE_BOUNDS.MAX_CHARS) continue;

      const offset = (m.index ?? 0) + m[0].indexOf(raw);
      const context = fullText.slice(
        Math.max(0, offset - ISSUE_BOUNDS.CONTEXT),
        offset + ISSUE_BOUNDS.CONTEXT,
      );
      if (looksLikeHeadnote(context)) continue;

      /**
       * A citation inside the question would hand the answer to the retriever,
       * exactly as `build-queries.ts` guards against. Here it is simpler to
       * refuse the sentence than to redact it: these are one sentence long, and
       * a redacted question with `[…]` in the middle is not something anybody
       * would type.
       */
      if (/\(\s*\d{4}\s*\)\s*\d+\s+[A-Z]{2,6}\s+\d+|\bAIR\s+\d{4}\b|\bINSC\s+\d+/i.test(text)) {
        continue;
      }

      /**
       * **A negated formulation states a NON-issue.** Read off the real corpus:
       * *"The question is not whether the discharge of certain functions by the
       * Corporation have statutory backing"* — the court is clearing ground, and
       * as a query it asks for the opposite of what it appears to ask.
       */
      if (/\b(?:is|was|are|were)\s+not\s+(?:whether|if)\b/i.test(text)) continue;

      /**
       * OCR damage, using the rule `build-queries.ts` already owns rather than a
       * second copy of it — `CLAUDE.md` forbids a second implementation of one
       * rule precisely because the two drift. Also read off the corpus:
       * *"…have statutory backing, - <- -+ ."*
       */
      if (looksOcrDamaged(text)) continue;

      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ text, offset, via });
    }
  }

  return found.sort((a, b) => a.offset - b.offset);
}
