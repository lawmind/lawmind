/**
 * WHY A REJECTED CLAIM WAS REJECTED — the diagnosis, not the count.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE QUESTION THIS ANSWERS, AND THE ONE IT REFUSES TO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The first 100-document `case_structure` pass verified 1,011 claims and
 * rejected 278 — a 78.4% verification rate. The wrong response to that number
 * is to edit the prompt until it goes up, because a rejection rate is an
 * aggregate over at least five different causes and only ONE of them is the
 * model inventing law:
 *
 *   1. the model fabricated or paraphrased           → prompt/model problem
 *   2. the quote is real but cased or punctuated     → VERIFIER problem
 *      differently from the source
 *   3. the source text is damaged by extraction      → INGEST problem
 *   4. the quote crosses the excerpt's elision       → EXCERPT problem
 *   5. the verifier's own rules rejected a good span → VERIFIER problem
 *
 * Four of those five are ours, not the model's, and a prompt edit fixes none of
 * them. So this module takes each failing claim and asks which of the five it
 * is, by applying progressively weaker normalisations to the SAME substring
 * test and recording the FIRST one under which the quote appears.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A DIAGNOSTIC. IT NEVER PROMOTES ANYTHING
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The loosened comparisons below — case folding, punctuation canonicalisation,
 * alphanumeric-only collapse, longest-common-substring — exist to CLASSIFY a
 * failure, and none of them is wired into `verifyClaims`. `enrich.ts` says it
 * plainly and it still holds: *"Do NOT add a kind here to make a failing
 * verification pass."* The same applies to a normalisation. A bucket count is
 * evidence for a decision about the verifier; it is not the decision, and this
 * file writes nothing to the database.
 */

/** The verifier's own normalisation, reproduced exactly. Whitespace only. */
export const flatten = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Canonicalises the characters a PDF and a language model disagree about, and
 * nothing else. Every entry here was chosen because a real rejection in the
 * corpus turned on it, not because a Unicode chart lists it.
 *
 * Deliberately NOT here: letter substitutions (`rn`→`m`, `l`→`1`), which are
 * the classic OCR confusions. Those change words, and a diagnostic that says
 * "this quote matches if you allow letters to be different letters" has stopped
 * measuring anything.
 */
export function canonPunct(s: string): string {
  return (
    s
      .normalize('NFKC')
      /*
       * Zero-width and soft hyphen: invisible, and `\s` does not match them.
       *
       * ALTERNATION, not a character class, because U+200D ZERO WIDTH JOINER
       * inside a class trips `no-misleading-character-class` \u2014 a class holding a
       * joiner can silently denote a joined sequence rather than the individual
       * codepoints. Alternation says one-of-these-five and cannot be read any
       * other way. Semantically identical, verified against the previous
       * implementation on the full sample plus Devanagari.
       */
      .replace(/\u00AD|\u200B|\u200C|\u200D|\uFEFF/g, '')
      /* every dash a court's typesetter or a model might choose */
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
      /* curly quotes, both directions, both heights */
      .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
      .replace(/\u2026/g, '...')
  );
}

/** Alphanumerics only. Collapses spacing, hyphenation and punctuation at once. */
export const alnum = (s: string) =>
  canonPunct(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/** The elision marker `legalObjectExcerpt` inserts. A quote containing it is proof. */
export const ELISION_MARKER = 'omitted from this excerpt';

/**
 * Longest substring of `needle` that occurs in `haystack`, in characters.
 *
 * Full LCS is O(n·m) and the haystack is a whole judgment, so this walks anchor
 * positions and binary-searches the match length at each — approximate for the
 * anchors it skips, exact for the ones it takes. It only has to separate
 * "shares a long real passage" from "shares nothing", and a stride of 8 does
 * that without pretending to more precision than the bucket needs.
 */
export function longestMatch(needle: string, haystack: string, stride = 8): number {
  let best = 0;
  for (let s = 0; s < needle.length; s += stride) {
    if (needle.length - s <= best) break;
    let lo = best;
    let hi = needle.length - s;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (haystack.includes(needle.slice(s, s + mid))) lo = mid;
      else hi = mid - 1;
    }
    if (lo > best) best = lo;
  }
  return best;
}

/**
 * CAN THE QUOTE BE REBUILT FROM THE SOURCE IF WE ALLOW THE SOURCE TO CONTAIN
 * THINGS THE QUOTE SKIPPED?
 *
 * This is the test that turned a 47.5% "the model drifts on long quotes" bucket
 * into a named, fixable ingest defect. A judgment PDF's page furniture — the
 * page number, the running header, the neutral-citation stamp — is extracted
 * into `full_text` INLINE, in the middle of a sentence:
 *
 *     …the petitioner had filed an appeal - 6 - HC-KAR NC: 2026:KHC:23440
 *     WP No. 39444 of 2025 which also culminated in an order…
 *
 * A model asked to quote the sentence quotes the SENTENCE. It is reading
 * correctly and the verifier is what is wrong: the document does contain those
 * words, contiguously, in every sense a lawyer would recognise.
 *
 * So this walks the quote greedily against the source, allowing the source to
 * skip forward by up to `maxSkip` characters between matched runs, and returns
 * what was skipped. **The skipped text is the evidence** — page furniture reads
 * as page furniture, and a skipped clause reads as a skipped clause. Nothing is
 * concluded from the fact of a gap alone.
 */
export type Skip = { readonly text: string; readonly atQuoteChar: number };
export type Reconstruction = {
  readonly ok: boolean;
  readonly skips: readonly Skip[];
  readonly matched: number;
};

export function reconstructWithSkips(
  quote: string,
  sourceText: string,
  /**
   * A running header carries the cause title, and an Indian cause title with
   * both parties and a connected-matter list runs well past 300 characters —
   * measured on this corpus, the first value tried, which silently left 71
   * furniture cases in the residual bucket. Raising it does NOT loosen
   * attribution: `looksLikePageFurniture` still caps furniture at 160
   * characters, so a longer gap lands in the model's bucket, not ours.
   */
  maxSkip = 1_500,
  maxSkips = 8,
  minRun = 12,
): Reconstruction {
  const q = canonPunct(flatten(quote)).toLowerCase();
  const src = canonPunct(flatten(sourceText)).toLowerCase();
  const skips: Skip[] = [];
  let qi = 0;
  let si = src.indexOf(q.slice(0, Math.min(minRun, q.length)));
  if (si < 0) return { ok: false, skips: [], matched: 0 };

  const runAt = (a: number, b: number): number => {
    let n = 0;
    while (a + n < q.length && b + n < src.length && q[a + n] === src[b + n]) n++;
    return n;
  };

  while (qi < q.length) {
    const n = runAt(qi, si);
    qi += n;
    si += n;
    if (qi >= q.length) return { ok: true, skips, matched: qi };
    if (skips.length >= maxSkips) return { ok: false, skips, matched: qi };
    /* Find where the quote resumes, preferring the SHORTEST skip that yields a
     * run long enough not to be a coincidence. A short accidental alignment is
     * how a gap-tolerant matcher starts finding text that is not there. */
    let bestJ = -1;
    let bestRun = 0;
    for (let j = si + 1; j <= si + maxSkip && j < src.length; j++) {
      const r = runAt(qi, j);
      if (r > bestRun) {
        bestRun = r;
        bestJ = j;
      }
      if (bestRun >= q.length - qi) break;
    }
    if (bestJ < 0 || bestRun < minRun) return { ok: false, skips, matched: qi };
    skips.push({ text: src.slice(si, bestJ), atQuoteChar: qi });
    si = bestJ;
  }
  return { ok: true, skips, matched: qi };
}

/**
 * SINGLE-CHARACTER DISAGREEMENTS between the quote and the document, aligned
 * from the longest common prefix and tolerating substitutions only.
 *
 * The residual after skips is dominated by pairs like `Frocedure`/`Procedure`,
 * `Ied`/`led`, `permitted`/`permifted` — one character, in an otherwise
 * identical run of hundreds. Insertions and deletions are NOT tolerated,
 * because tolerating them is how an alignment starts finding words that are not
 * there; a substitution keeps both texts the same length and the same shape.
 *
 * The DIRECTION is what matters and is returned rather than judged here. If the
 * implausible letter is in the document, our extractor damaged it. If it is in
 * the quote, the model mis-transcribed. Both are real; they have different
 * owners and different fixes.
 */
export type CharDiff = {
  readonly at: number;
  readonly quoteChar: string;
  readonly sourceChar: string;
};

export function substitutionAlign(
  quote: string,
  sourceText: string,
  maxRate = 0.05,
  minAnchor = 16,
): { readonly ok: boolean; readonly diffs: readonly CharDiff[] } {
  const q = flatten(quote);
  const src = flatten(sourceText);
  if (q.length < minAnchor) return { ok: false, diffs: [] };
  /**
   * Anchor on the LONGEST clean prefix, not a fixed-length one. A fixed anchor
   * only finds substitutions that happen to fall after it, so `Ied`/`led` at
   * character 19 was invisible to a 24-character anchor — the exact confusion
   * this function exists to name.
   */
  let lo = 0;
  let hi = q.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (src.includes(q.slice(0, mid))) lo = mid;
    else hi = mid - 1;
  }
  if (lo < minAnchor) return { ok: false, diffs: [] };
  const anchor = src.indexOf(q.slice(0, lo));
  if (anchor < 0) return { ok: false, diffs: [] };
  const budget = Math.max(1, Math.floor(q.length * maxRate));
  const diffs: CharDiff[] = [];
  for (let i = 0; i < q.length; i++) {
    const s = src[anchor + i];
    if (s === undefined) return { ok: false, diffs };
    if (q[i] !== s) {
      if (diffs.length >= budget) return { ok: false, diffs };
      diffs.push({ at: i, quoteChar: q[i] ?? '', sourceChar: s });
    }
  }
  /**
   * A BUDGET ALONE IS NOT ENOUGH, and the first version of this proved it: on a
   * 272-character quote the 5% allowance quietly absorbed the last six
   * characters — a quote that ran straight into a page header — and reported it
   * as a typo. Four of the first twelve drilled cases were that shape.
   *
   * An OCR substitution is INTERIOR and SHORT. A quote colliding with page
   * furniture diverges at the END and never converges. So a run of three or
   * more adjacent disagreements, or any disagreement touching the quote's last
   * character, is not a substitution and is refused — leaving the claim in the
   * unexplained bucket, which is the correct place for something we cannot name.
   */
  let run = 1;
  for (let k = 1; k < diffs.length; k++) {
    run = diffs[k]!.at === diffs[k - 1]!.at + 1 ? run + 1 : 1;
    if (run >= 3) return { ok: false, diffs };
  }
  const last = diffs[diffs.length - 1];
  if (last && last.at >= q.length - 1) return { ok: false, diffs };
  return { ok: true, diffs };
}

/**
 * Does a skipped run look like page furniture rather than legal text?
 *
 * Deliberately narrow. It asks whether the run is short, mostly non-prose, and
 * built from the things a court stamps on a page — a page number between rules,
 * a neutral-citation stamp, a case number, a repeated cause title. A skipped
 * CLAUSE fails this and stays attributed to the model, which is the point: a
 * matcher that called every gap "furniture" would launder real omissions.
 */
/**
 * The furniture vocabulary, EXTRACTED FROM THE CORPUS rather than reasoned
 * about — `RING_PROGRAM.md`'s own lesson, learned the expensive way on headnote
 * dispositions. Measured over a 2,864-judgment `TABLESAMPLE BERNOULLI` draw on
 * 15 Aug 2026: `digitally signed by` 12.8% of documents · `signature not
 * verified` 5.7% · a bare `- N -` page rule 5.7%.
 *
 * These are e-signature panels and page rules that the PDF extractor lifts into
 * the prose stream mid-sentence. They are removed here before the prose test
 * below, because a signature panel contains real words (`signed`, `location`,
 * a judge's name) and would otherwise read as legal text.
 */
const FURNITURE_PATTERNS: readonly RegExp[] = [
  /digitally signed by[^]{0,80}?(?=\s|$)/gi,
  /signed by:\s*[a-z. ]{0,40}/gi,
  /signing time:\s*[0-9/: ]{0,24}(?:am|pm)?/gi,
  /signature (?:not )?verified/gi,
  /location:\s*high court[a-z ]{0,40}/gi,
  /verification:?\s*/gi,
  /page\s*[0-9]{1,4}\s*(?:of\s*[0-9]{1,4})?/gi,
  /-\s*[0-9]{1,4}\s*-/g,
  /:\s*[0-9]{1,4}\s*:/g,
  /\b(?:nc|neutral citation)\s*:?\s*[0-9]{4}:[a-z]{2,5}:[0-9]+(?:-db)?/gi,
  /\bhc-[a-z]{2,4}\b/gi,
  /\b(?:crl|crl\.a|crl\.p|crl\.rp|wp|wpc|rsa|rfa|sa|ca|mfa|cri?minal|civil)?\.?\s*(?:appeal|petition|revision)?\s*no\.?\s*[0-9]{1,6}\s*(?:of|\/)\s*[0-9]{2,4}/gi,
  /\bc\/w\b/gi,
];

export function looksLikePageFurniture(text: string): boolean {
  const t = text.trim();
  if (t.length === 0 || t.length > 260) return false;
  let stripped = t;
  for (const p of FURNITURE_PATTERNS) stripped = stripped.replace(p, ' ');
  const words = stripped.split(/\s+/).filter((w) => /^[a-z]{3,}$/i.test(w));
  /* What survives must be almost nothing. A skipped CLAUSE of the court's own
   * reasoning fails here and stays attributed to the model — which is the
   * point. A detector that called every gap furniture would launder real
   * omissions into an ingest ticket nobody could act on. */
  const prosey = words.filter(
    (w) =>
      !/^(no|nos|hc|kar|nc|of|and|batch|crl|wp|wpc|rsa|rfa|sa|ca|mfa|appeal|petition|revision|vs|the|in|dated|page|high|court|karnataka|kerala|india|between|db)$/i.test(
        w,
      ),
  );
  return prosey.length <= 2 && /[0-9]/.test(t);
}

/**
 * WHERE a long quote stops matching, which is the only thing that separates
 * "our text is damaged here" from "the model rewrote a word here".
 *
 * A 98%-verbatim quote is not evidence of either on its own. Both produce the
 * same aggregate; they differ entirely in what the next character is. So this
 * finds the longest PREFIX of the quote that occurs in the source, locates it,
 * and hands back both continuations side by side for a human to read.
 */
export type Divergence = {
  /** Characters of the quote matched before the two texts parted. */
  readonly at: number;
  /** What the quote says next. */
  readonly quoteNext: string;
  /** What the document says next, at the same point. */
  readonly sourceNext: string;
  /** Where the matched prefix was found, or -1 if nothing matched. */
  readonly sourceIndex: number;
};

export function divergence(quote: string, sourceText: string, window = 48): Divergence {
  const q = flatten(quote);
  const src = flatten(sourceText);
  let lo = 0;
  let hi = q.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (src.includes(q.slice(0, mid))) lo = mid;
    else hi = mid - 1;
  }
  const idx = lo === 0 ? -1 : src.indexOf(q.slice(0, lo));
  return {
    at: lo,
    quoteNext: q.slice(lo, lo + window),
    sourceNext: idx < 0 ? '' : src.slice(idx + lo, idx + lo + window),
    sourceIndex: idx,
  };
}

/**
 * The buckets, and the owner of each. The owner is the point of the exercise:
 * a rejection nobody owns gets answered with a prompt edit.
 */
export type Bucket =
  | 'fabrication'
  | 'paraphrase'
  | 'case_only'
  | 'punctuation_only'
  | 'ocr_spacing'
  | 'source_page_furniture'
  | 'source_interpolation'
  | 'char_transcription'
  | 'elision_boundary'
  | 'internal_ellipsis'
  | 'unexplained_drift'
  | 'verifier_min_length'
  | 'no_evidence';

export const BUCKET_OWNER: Record<Bucket, 'model' | 'verifier' | 'ingest' | 'excerpt'> = {
  fabrication: 'model',
  paraphrase: 'model',
  case_only: 'verifier',
  punctuation_only: 'verifier',
  ocr_spacing: 'ingest',
  source_page_furniture: 'ingest',
  source_interpolation: 'model',
  /* Direction decides the real owner per claim; the bucket only says the
   * disagreement is one character wide. `--drill char_transcription` prints the
   * pairs so the split can be read rather than assumed. */
  char_transcription: 'ingest',
  elision_boundary: 'excerpt',
  internal_ellipsis: 'model',
  unexplained_drift: 'ingest',
  verifier_min_length: 'verifier',
  no_evidence: 'model',
};

export type Diagnosis = {
  readonly bucket: Bucket;
  /** How much of the quote occurs verbatim in the source, as a fraction. */
  readonly matchRatio: number;
  readonly longest: number;
  readonly quoteLen: number;
};

export type TriageInput = {
  /** The claim's evidence span, exactly as the model returned it. */
  readonly quote: string;
  /** The full judgment text — what `verifyClaims` actually checks against. */
  readonly sourceText: string;
  /** The excerpt the model was shown, so an excerpt artefact is provable. */
  readonly excerpt: string;
  readonly minEvidenceChars: number;
};

/**
 * ORDER IS THE ARGUMENT. Each test is strictly weaker than the one above it, so
 * the first that succeeds is the LEAST forgiving explanation that fits — which
 * is the only way a ladder like this stays honest. Run loosest-first and
 * everything looks like an OCR artefact.
 */
export function diagnose(input: TriageInput): Diagnosis {
  const { quote, sourceText, excerpt, minEvidenceChars } = input;
  const q = flatten(quote);
  const src = flatten(sourceText);
  const exc = flatten(excerpt);
  const measure = (bucket: Bucket): Diagnosis => {
    const longest = longestMatch(q, src);
    return {
      bucket,
      longest,
      quoteLen: q.length,
      matchRatio: q.length === 0 ? 0 : longest / q.length,
    };
  };

  if (!quote) return measure('no_evidence');

  /* The verifier's own floor, applied before any content question is asked. A
   * real, correctly-copied 10-character quote fails here and it is not the
   * model's doing. */
  if (q.length < minEvidenceChars) return measure('verifier_min_length');

  /* Already passes. Reaching here means the caller handed us a verified claim,
   * which is a bug in the caller, not a bucket. */
  if (src.includes(q)) return measure('verifier_min_length');

  /* PROVABLE EXCERPT ARTEFACT: the quote exists in what the model was SHOWN and
   * not in the document. Only the elision join can do that, and no amount of
   * prompting can prevent a model quoting across a gap it cannot see. */
  if (q.includes(ELISION_MARKER) || exc.includes(q)) return measure('elision_boundary');

  const qc = canonPunct(q);
  const sc = canonPunct(src);

  /* The model joined two real passages with an ellipsis of its own. Both halves
   * are genuine; the concatenation is not. That is the model disobeying "copy
   * it exactly", so it is the model's bucket, not ours. */
  if (/\.\.\./.test(qc)) {
    const parts = qc.split(/\s*\.\.\.\s*/).filter((p) => p.length >= 12);
    if (parts.length >= 2 && parts.every((p) => sc.includes(p)))
      return measure('internal_ellipsis');
  }

  if (sc.toLowerCase().includes(qc.toLowerCase())) {
    /* Distinguish "only the case differs" from "only the punctuation differs",
     * because they have different fixes and one of them is already half-made:
     * the verifier case-folds for the value check and not for the span check. */
    if (sc.includes(qc)) return measure('punctuation_only');
    if (src.toLowerCase().includes(q.toLowerCase())) return measure('case_only');
    return measure('punctuation_only');
  }

  /* Everything that is not a letter or digit removed. What survives this and
   * still matches is a spacing, hyphenation or line-break artefact of PDF
   * extraction — the ingest lane's, not the model's. */
  if (alnum(src).includes(alnum(q))) return measure('ocr_spacing');

  /* THE QUOTE IS PRESENT BUT INTERRUPTED. Every word, in order, with something
   * in between that the model declined to copy. What that something IS decides
   * whose defect it is — our extractor's, if it is page furniture; the model's,
   * if it silently dropped a clause of the court's own text. */
  const rec = reconstructWithSkips(q, src);
  if (rec.ok && rec.skips.length > 0) {
    return measure(
      rec.skips.every((s) => looksLikePageFurniture(s.text))
        ? 'source_page_furniture'
        : 'source_interpolation',
    );
  }

  /* One character wide, in an otherwise identical run. Checked AFTER the skip
   * test so a page break is never mistaken for a typo. */
  if (substitutionAlign(q, src).ok) return measure('char_transcription');

  const d = measure('fabrication');
  /* A long verbatim passage that stops matching partway is a quote the model
   * really copied from a document whose text differs from ours mid-span. */
  if (d.longest >= 40 && d.matchRatio >= 0.5) return { ...d, bucket: 'unexplained_drift' };
  /* Real words, real fragments, assembled into a sentence the judgment does not
   * contain. This is the summarisation the design exists to reject. */
  if (d.longest >= 20) return { ...d, bucket: 'paraphrase' };
  return d;
}
