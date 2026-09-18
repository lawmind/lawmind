/**
 * How one judgment treated another — the citator.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GAP, MEASURED 9 AUGUST 2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **22 judgments flagged out of 38,341.** Of 192,197 citation edges, **180,432
 * — 94% — sit in the generic `cites` bucket**, and only 95 carry any treatment
 * at all. Meanwhile 3,549 judgments contain overruling language. The citator is
 * the moat and it is very nearly empty.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SOURCE: THE REPORTER PRINTS THE TREATMENT, IN A FIXED SHAPE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Read off the corpus, not imagined. Two forms, both consistent:
 *
 *     Raj Kumar Karwal v. Union of India (1990) 2 SCC 409: [1990] 2 SCR 63 – overruled.
 *     Tukaram Maruti Chavan v. Maruti Narayan Chavan … [2008] 13 SCR 508 – partly overruled.
 *     New India Assurance Co. Ltd. v. Prabhu Lal … (2007) 12 SCR 724 - Not correct law.
 *
 * and the SCR's own reference table:
 *
 *     Case Law Reference
 *     [1987] 2 SCR 398   referred to        Para 6
 *     [2016] 2 SCR 1074  held per incuriam  Para 19
 *     [2002] 1 SCR 845   partly overruled   Para 23
 *
 * **This is an editor stating a treatment, not prose to be interpreted.** That
 * is what makes high precision reachable without a model — and reading the
 * report's own words is a primary source, where `DATASETS.md` forbids training
 * on a machine's opinion about law.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE NEGATION TRAP, WHICH IS REAL AND IS IN THE CORPUS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two phrases, one word apart, opposite meanings — both found in real judgments:
 *
 *     … – held not good law.        →  the case IS overruled
 *     … – held NOT per incuriam.    →  the case is UNDISTURBED
 *
 * A keyword matcher reads "per incuriam" in the second and flags a judgment that
 * was expressly upheld. **`overruled_status` drives the LAW MOVED mark and
 * `set_aside` disables add-to-matter**, so that error tells an advocate a good
 * authority is dead. The stale-overruled threshold is 0 for the same reason.
 *
 * So negation is handled per phrase rather than globally: `not` inverts
 * *"good law"* and *"correct law"*, and cancels *"per incuriam"* and
 * *"overruled"* to no treatment at all. **When the reading is unclear the answer
 * is `null`** — silence, never a guess.
 */

/** Mirrors the `overruled_status` enum on `judgments`. */
export type OverruledStatus = 'set_aside' | 'partly_set_aside' | 'doubted';

/** Mirrors the `relationship` enum on `judgment_citations`. */
export type Relationship =
  | 'overruled'
  | 'overruled_in_part'
  | 'doubted'
  | 'followed'
  | 'approved'
  | 'distinguished'
  | 'cites';

export type Treatment = {
  readonly relationship: Relationship;
  /**
   * What this implies for the CITED judgment, or null when the treatment says
   * nothing about whether it is still good law. `followed` and `distinguished`
   * are real treatments that leave the authority standing.
   */
  readonly overruled: OverruledStatus | null;
  /** The exact words matched, so a human can check the reading. */
  readonly evidence: string;
};

/**
 * The vocabulary, longest first.
 *
 * **Order is load-bearing.** `partly overruled` must be tested before
 * `overruled`, or every partial overruling is recorded as a total one — which
 * would tell an advocate a judgment is entirely dead when parts of it still
 * bind. Regexes are checked in array order for exactly that reason.
 */
const PHRASES: readonly {
  re: RegExp;
  relationship: Relationship;
  overruled: OverruledStatus | null;
}[] = [
  // ── Partial, before total. ────────────────────────────────────────────────
  { re: /partly\s+overruled/i, relationship: 'overruled_in_part', overruled: 'partly_set_aside' },
  {
    re: /overruled\s+to\s+an?\s+extent/i,
    relationship: 'overruled_in_part',
    overruled: 'partly_set_aside',
  },
  {
    re: /partially\s+overruled/i,
    relationship: 'overruled_in_part',
    overruled: 'partly_set_aside',
  },
  {
    re: /overruled\s+in\s+part/i,
    relationship: 'overruled_in_part',
    overruled: 'partly_set_aside',
  },

  // ── Negated forms, before the positive ones they contain. ─────────────────
  // "held not per incuriam" is an EXPRESS UPHOLDING and must never read as the
  // criticism it contains.
  { re: /not\s+per\s+incuriam/i, relationship: 'cites', overruled: null },
  { re: /not\s+overruled/i, relationship: 'cites', overruled: null },

  // "not good law" / "not correct law" are overrulings stated in the negative.
  {
    re: /(?:held\s+)?not\s+(?:to\s+be\s+)?good\s+law/i,
    relationship: 'overruled',
    overruled: 'set_aside',
  },
  {
    re: /(?:held\s+)?not\s+(?:the\s+)?correct\s+law/i,
    relationship: 'overruled',
    overruled: 'set_aside',
  },
  { re: /no\s+longer\s+good\s+law/i, relationship: 'overruled', overruled: 'set_aside' },
  {
    re: /does\s+not\s+lay\s+down\s+the\s+correct\s+law/i,
    relationship: 'overruled',
    overruled: 'set_aside',
  },

  // ── Total overruling. ─────────────────────────────────────────────────────
  { re: /overruled/i, relationship: 'overruled', overruled: 'set_aside' },

  /**
   * Per incuriam — decided in ignorance of binding authority, so not binding
   * itself. Recorded as **doubted, not set aside**: it is a criticism by a
   * later bench rather than a formal overruling, and `set_aside` disables
   * add-to-matter. Overstating it would refuse an advocate an authority that
   * may still be argued.
   */
  { re: /per\s+incuriam/i, relationship: 'doubted', overruled: 'doubted' },
  { re: /\bdoubted\b/i, relationship: 'doubted', overruled: 'doubted' },

  // ── Treatments that leave the authority standing. ─────────────────────────
  { re: /distinguished/i, relationship: 'distinguished', overruled: null },
  { re: /relied\s+(?:on|upon)/i, relationship: 'followed', overruled: null },
  { re: /\bfollowed\b/i, relationship: 'followed', overruled: null },
  /**
   * Its own relationship, not folded into `followed` — `docs/ai/
   * CITATION_GRAPH_STAGE7.md`. A 2,000-row sample found `– approved` (the
   * same table-annotation shape as `– followed`/`– overruled`) 61 times,
   * comparable in frequency to `– followed` itself (84) — a real, distinct,
   * printed word the reporter chooses deliberately, not a synonym. Stage 7
   * of the DATA -> RETRIEVAL EXECUTION PROGRAM names `approves` as its own
   * graph edge; this is the extractor half of that.
   */
  { re: /\bapproved\b/i, relationship: 'approved', overruled: null },
];

/**
 * How far after a citation the reporter's treatment may sit.
 *
 * **80, and the number was set by a failing test rather than by taste.** At 40
 * this missed a real and important case — the reporter routinely prints the
 * PARALLEL citation between a judgment and its treatment:
 *
 *     [2005] 2 SCR 954 : (2005) 3 SCC 711 – held not per incuriam.
 *
 * At 40 characters the window ended mid-word at `per incur`, no phrase matched,
 * and the function returned null. Null is safe here, but it silently loses the
 * one reading that most needs to be right.
 *
 * **Widening is safe only because {@link CLAUSE_END} stops first.** A full stop,
 * a semicolon or the start of another case name ends the clause well before 80
 * characters in every list-of-authorities shape in the corpus — which is what
 * stops a followed case borrowing the next entry's overruling.
 */
const WINDOW = 80;

/**
 * A treatment clause ends here. Beyond it we are reading about another case.
 *
 * `Para 13` earns its place from a real result: the SCR reference table has no
 * full stops between rows, so a clause ran on into the next entry and produced
 * the evidence *"not good law Para 13 [1995] 2 SCR 1015 relied on Para 15 …"*.
 * The treatment read was still correct — it sits at the front — but evidence
 * that quotes two other authorities cannot be checked by a human, and evidence
 * nobody can check is the thing this file promises not to produce.
 */
const CLAUSE_END = /[.;]|\bPara\.?\s*\d+|\bv\.?\s+\p{Lu}/u;

/**
 * Read the treatment printed immediately after a citation.
 *
 * `following` is the text starting AT the citation. **Returns null far more
 * often than not**, which is correct: most citations are neutral references, and
 * `cites` is the honest answer for them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE OTHER TREATMENT WRITER IS `detectTreatment` IN `citations.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Different vocabulary, different trigger, both legitimate: that one runs at
 * EXTRACTION on every edge with a dash plus ten markers; this one runs over
 * RESOLVED edges only and is much wider.
 *
 * NEW2 (bus 1099) re-derived all 16,001 treatment-bearing edges against
 * `detectTreatment` alone and it reported 1,680 rows "wrong" — this function's
 * legitimate output read as corruption. Applying that diff would have deleted
 * **1,624 real treatment claims**. Against both writers the real number is 19.
 *
 * Never audit treatment against a single writer.
 * */
export function readTreatment(citation: string, following: string): Treatment | null {
  const flat = following.replace(/\s+/g, ' ');
  const cite = citation.replace(/\s+/g, ' ').trim();
  const start = flat.indexOf(cite);
  if (start < 0) return null;

  const after = flat.slice(start + cite.length, start + cite.length + WINDOW);

  /**
   * **A separator is required.** The reporter writes `– overruled` or
   * `, overruled`; bare adjacency is ordinary prose that happens to contain the
   * word, and reading that as a treatment is how *"the Collector, overruling the
   * objection of the Corporation"* becomes a citator entry.
   */
  if (!/^\s*[–—\-:,]|\s+(?:held|referred|relied|followed|approved|distinguished)\b/i.test(after)) {
    return null;
  }

  const stop = after.search(CLAUSE_END);
  const clause = stop >= 0 ? after.slice(0, stop) : after;

  for (const p of PHRASES) {
    const m = p.re.exec(clause);
    if (m) {
      return { relationship: p.relationship, overruled: p.overruled, evidence: clause.trim() };
    }
  }
  return null;
}

/**
 * The SCR's own reference table: `<citation> <treatment> Para <n>`.
 *
 * A different shape from the headnote list — no dash, and a paragraph pinpoint
 * at the end — so it needs its own reader rather than a looser rule in the one
 * above. **A looser rule would be the whole risk**: everything that makes the
 * function above safe is the requirement that a separator appear.
 */
export function readReferenceTableEntry(line: string): Treatment | null {
  const flat = line.replace(/\s+/g, ' ').trim();
  // Must end with a paragraph pinpoint — that is what marks it as a table row.
  if (!/\bPara\.?\s*\d+\s*$/i.test(flat)) return null;
  const body = flat.replace(/\bPara\.?\s*\d+\s*$/i, '');

  for (const p of PHRASES) {
    const m = p.re.exec(body);
    if (m) {
      return { relationship: p.relationship, overruled: p.overruled, evidence: flat };
    }
  }
  return null;
}
