/**
 * The 1 July 2024 criminal-law transition, as a backend fact rather than a
 * prompt instruction.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FAILURE THIS EXISTS FOR, VERBATIM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW1's adversarial fixture `adv-5-no-date-so-no-regime`, captured 18 Aug 2026
 * (`docs/ai/new1-post-0055/adversarial-fixed.json`), asked:
 *
 *     "My client is charged with cheating. What is the punishment and which
 *      section applies?"
 *
 * and was answered:
 *
 *     "The charge of cheating under the Indian Penal Code is generally covered
 *      by Section 417 for simple cheating, with punishment of imprisonment up to
 *      one year… Section 420 may apply, carrying a higher punishment of up to
 *      seven years."
 *
 * No refusal, no hedge, no question about when the offence is alleged to have
 * happened, no mention of BNS or 2024. **The date was never asked for, and the
 * date is the only thing that decides the answer.** An offence alleged on 30
 * June 2024 is charged under the IPC; one alleged on 2 July 2024 is not.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT "MENTION BNS IN THE PROMPT"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A prompt line saying "remember BNS exists" produces a model that mentions BNS
 * and still guesses. The thing that was missing is not a reminder, it is a
 * DECISION PROCEDURE with an input the model does not have:
 *
 *   · the commencement date is READ FROM THE DATABASE, from rows sourced to
 *     indiacode.nic.in, with the source URL carried through to the caller —
 *     not from this file, and not from a model. If the row is missing this
 *     module REFUSES rather than falling back to a constant, because a
 *     hardcoded 1 July 2024 that silently disagreed with the statute table
 *     would be exactly the invented legal fact `DOMAIN_TRUTH.md` forbids;
 *   · the offence date is an INPUT. When it is absent the verdict is
 *     `indeterminate`, and the only correct output is a question;
 *   · corresponding provisions come from `statute_mappings` and nowhere else.
 *     That table held 0 rows on 19 Aug 2026 and holds **226 on 20 Aug** — the
 *     BPR&D tables parsed and loaded in between. Coverage is still thin where it
 *     matters most: **4 of the BNS's 358 sections**, 24 of 531 BNSS, 101 of 170
 *     BSA. So this module still reports "we do not hold the correspondence" for
 *     almost every criminal section, and that sentence must read as UNMAPPED —
 *     nobody has looked — never as *no counterpart exists*, which is a positive
 *     legislative finding with its own `no_equivalent` value and its own source
 *     requirement.
 *     Every row now carries `authority_class`, and **all 226 are
 *     `OFFICIAL_CORRESPONDENCE`, none is `ENACTED_STATUTE`**: Parliament enacted
 *     the Sanhitas, the BPR&D wrote a concordance to them, and only the first
 *     would win an argument. `DOMAIN_TRUTH.md`: *"Never hardcode a mapping in
 *     application code. Never let a model generate one."* A thin table is a
 *     known gap; a fabricated mapping is a wrong answer that looks like
 *     knowledge, and 1.1% coverage is when that temptation is strongest.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE WILL NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It never names a section, never states a punishment, and never asserts an
 * old↔new equivalence. It answers exactly one question — *which regime governs,
 * or can we not tell* — and reports the evidence for its answer.
 */
import type { Sql } from 'postgres';

/** Which body of criminal law governs. There is no third answer. */
export type Regime = 'pre_bns' | 'post_bns';

export type CommencementFact = {
  /** As printed in `statutes.short_title`. */
  readonly shortTitle: string;
  /** `statutes.enforcement_date`, ISO date. */
  readonly commencedOn: string;
  /** indiacode.nic.in permalink, carried so the claim is checkable. */
  readonly sourceUrl: string | null;
};

export type TransitionEvidence = {
  readonly commencement: readonly CommencementFact[];
  /** The single date all three share, or null if the rows disagree. */
  readonly commencedOn: string | null;
};

/**
 * Evidence that has already passed the "all three rows agree on one date" gate.
 *
 * A separate type rather than a non-null assertion at each use. `determinate`
 * and `indeterminate` are only ever constructed AFTER that check returns
 * `unavailable` for the null case, so the invariant is real — and stating it in
 * the type means a future branch that forgets the check fails to compile instead
 * of printing "On null the codes came into force".
 */
export type SettledEvidence = TransitionEvidence & { readonly commencedOn: string };

export type TransitionVerdict =
  /** Not a criminal-law question. The transition simply does not arise. */
  | { readonly kind: 'not_criminal' }
  /**
   * Criminal, and the offence date settles it.
   *
   * `regime` is derived by comparison, not looked up in a table of cases: an
   * offence date strictly before the commencement date is governed by the old
   * codes, on or after it by the new ones.
   */
  | {
      readonly kind: 'determinate';
      readonly regime: Regime;
      readonly offenceDate: string;
      readonly evidence: SettledEvidence;
    }
  /**
   * Criminal, and we cannot tell. **This is the state adv-5 should have
   * reached.** `mustAsk` names the one fact that would resolve it, so the
   * surface asks a specific question instead of hedging.
   */
  | {
      readonly kind: 'indeterminate';
      readonly mustAsk: 'offence_date';
      readonly why: string;
      readonly evidence: SettledEvidence;
    }
  /**
   * The statute rows this module depends on are absent. Refuses rather than
   * guessing — see the header.
   */
  | { readonly kind: 'unavailable'; readonly why: string };

/**
 * The three Acts, matched on `statutes.short_title`.
 *
 * Titles, not act numbers or a hardcoded date: the row carries the
 * commencement, and this list only says WHICH rows to read.
 */
const NEW_CODE_TITLES = [
  'The Bharatiya Nyaya Sanhita, 2023',
  'The Bharatiya Nagarik Suraksha Sanhita, 2023',
  'The Bharatiya Sakshya Adhiniyam, 2023',
] as const;

/**
 * Does this text raise a criminal-law question at all.
 *
 * ── WHY A SECOND MARKER LIST EXISTS, DELIBERATELY
 *
 * `services/harness/src/fusion-routing-feasibility-cli.ts` holds a criminal
 * marker list too. That one is an OFFLINE RETRIEVAL EXPERIMENT: it needs two
 * distinct hits before routing a query criminal, because its cost of a false
 * positive is a mis-measured recall figure.
 *
 * The cost here is the opposite shape. A false positive asks an advocate one
 * unnecessary question; a false negative hands them a confident answer under the
 * wrong code. So this list is BROADER and the threshold is ONE.
 *
 * And it had to be broader for a concrete reason: **adv-5 hits none of the
 * harness markers.** "My client is charged with cheating. What is the punishment
 * and which section applies?" contains no code name, no `bail`, no `FIR`, no
 * `accused` — the harness list would have routed it non-criminal at any
 * threshold. Offence and sentencing vocabulary is what actually appears in the
 * question an advocate types.
 *
 * These are ROUTING words, not legal assertions. Nothing here claims a section
 * number, a punishment or a mapping — the three things `DOMAIN_TRUTH.md`
 * forbids stating from memory.
 */
const CRIMINAL_MARKERS: readonly RegExp[] = [
  // ── the codes, both sides of the transition
  /bharatiya nyaya sanhita/i,
  /bharatiya nagarik suraksha sanhita/i,
  /bharatiya sakshya adhiniyam/i,
  /\bbnss?\b/i,
  /\bbsa\b/i,
  /indian penal code/i,
  /\bipc\b/i,
  /code of criminal procedure/i,
  /\bcr\.?\s?p\.?\s?c\.?\b/i,
  /indian evidence act/i,
  // ── special criminal statutes
  /\bpocso\b/i,
  /\bndps\b/i,
  /\buapa\b/i,
  /prevention of corruption act/i,
  /protection of children from sexual offences/i,
  /narcotic drugs/i,
  // ── procedure
  /\bbail\b/i,
  /\bacquitt/i,
  /\bconvict/i,
  /\baccused\b/i,
  /\bprosecut/i,
  /charge\s?sheet/i,
  /\bcharged with\b/i,
  /\bfir\b/i,
  /first information report/i,
  /\bremand\b/i,
  /\bcustody\b/i,
  /criminal (?:appeal|revision|case|proceeding)/i,
  /sessions (?:judge|court)/i,
  /beyond reasonable doubt/i,
  /investigating officer/i,
  // ── sentencing
  /\bpunishment\b/i,
  /\bsentenc/i,
  /\bimprisonment\b/i,
  /life imprisonment/i,
  /death sentence/i,
  /capital punishment/i,
  /rarest of rare/i,
  // ── offence vocabulary. The half the harness list omits, and the half adv-5
  //    is written in.
  /\boffen[cs]e\b/i,
  /\bcheating\b/i,
  /criminal breach of trust/i,
  /\bforgery\b/i,
  /\btheft\b/i,
  /\brobbery\b/i,
  /\bdacoity\b/i,
  /\bextortion\b/i,
  /\bmurder\b/i,
  /culpable homicide/i,
  /\bkidnapp?ing\b/i,
  /\babduction\b/i,
  /\brape\b/i,
  /\bdowry\b/i,
  /grievous hurt/i,
  /criminal conspiracy/i,
  /\babetment\b/i,
  /\bdefamation\b/i,
  /\bmischief\b/i,
  /criminal intimidation/i,
];

/** One hit is enough. See the note on {@link CRIMINAL_MARKERS}. */
export function raisesCriminalQuestion(text: string): boolean {
  return CRIMINAL_MARKERS.some((re) => re.test(text));
}

/**
 * Read the commencement rows. Cached per process — the statute table does not
 * change under a running API, and this sits on a request path.
 */
let cached: TransitionEvidence | null = null;

export async function commencementEvidence(sql: Sql): Promise<TransitionEvidence> {
  if (cached) return cached;
  const rows = await sql<
    { short_title: string; enforcement_date: Date | null; source_url: string | null }[]
  >`
    SELECT short_title, enforcement_date, source_url
      FROM statutes
     WHERE short_title = ANY(${NEW_CODE_TITLES as unknown as string[]})
     ORDER BY short_title
  `;

  const commencement: CommencementFact[] = rows
    .filter((r) => r.enforcement_date !== null)
    .map((r) => ({
      shortTitle: r.short_title,
      // toISOString() would apply the process timezone to a date-only value and
      // can move it a day. The date is formatted from its own UTC parts.
      commencedOn: r.enforcement_date!.toISOString().slice(0, 10),
      sourceUrl: r.source_url,
    }));

  const distinct = new Set(commencement.map((c) => c.commencedOn));
  cached = {
    commencement,
    // If the three rows ever disagree, this is null and every verdict below
    // becomes `unavailable`. Three codes that commenced on different days would
    // make "the regime" a question per code rather than per date, and silently
    // picking one row's date would answer a question nobody asked.
    commencedOn: distinct.size === 1 ? [...distinct][0]! : null,
  };
  return cached;
}

/** Testing seam. The cache is per process and would otherwise outlive a fixture. */
export function resetCommencementCache(): void {
  cached = null;
}

export type AssessInput = {
  /** The advocate's question, as typed. */
  readonly text: string;
  /**
   * When the offence is alleged to have occurred — NOT when the case was filed,
   * decided, or when the question is being asked. Those three are routinely
   * different and only this one governs.
   */
  readonly offenceDate?: string | null | undefined;
};

/**
 * The whole decision, in one function, with its evidence attached.
 */
export async function assessTransition(sql: Sql, input: AssessInput): Promise<TransitionVerdict> {
  if (!raisesCriminalQuestion(input.text)) return { kind: 'not_criminal' };

  const evidence = await commencementEvidence(sql);
  if (evidence.commencement.length !== NEW_CODE_TITLES.length || evidence.commencedOn === null) {
    return {
      kind: 'unavailable',
      why:
        'the commencement dates of the 2023 codes are not readable from `statutes` ' +
        '(found ' +
        evidence.commencement.length +
        ' of ' +
        NEW_CODE_TITLES.length +
        (evidence.commencedOn === null && evidence.commencement.length > 0
          ? ', and the rows found do not agree on a single date'
          : '') +
        '). This module refuses to substitute a date of its own.',
    };
  }

  // Past the guard above, so the invariant SettledEvidence states is established.
  const settled = evidence as SettledEvidence;

  const offenceDate = (input.offenceDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(offenceDate)) {
    return {
      kind: 'indeterminate',
      mustAsk: 'offence_date',
      why:
        'The governing code depends entirely on when the offence is alleged to have ' +
        'occurred, and no such date was given. Before ' +
        humanDate(settled.commencedOn) +
        ' the old codes govern; on or after it, the 2023 codes do. Answering without ' +
        'the date means guessing which of two different provisions and two different ' +
        'punishment ranges applies.',
      evidence: settled,
    };
  }

  return {
    kind: 'determinate',
    // String comparison is exact for ISO dates and avoids constructing a Date,
    // which is where the timezone slips in.
    regime: offenceDate < settled.commencedOn ? 'pre_bns' : 'post_bns',
    offenceDate,
    evidence: settled,
  };
}

export type CorrespondenceRow = {
  readonly newAct: string;
  readonly newSection: string;
  readonly oldAct: string;
  readonly oldSection: string;
  readonly relationship: string;
  readonly note: string | null;
  /**
   * WHOSE correspondence this is. `ENACTED_STATUTE` would be law; everything we
   * currently hold is `OFFICIAL_CORRESPONDENCE` — the executive's concordance,
   * not the Sanhitas. Carried on every row so a caller cannot present one at the
   * other's weight by forgetting to look it up.
   */
  readonly authorityClass: string;
  /** Named for a reader: "BPR&D comparative table", not a `bprd.nic.in` URL. */
  readonly authorityBody: string | null;
};

export type Correspondence =
  | { readonly held: true; readonly rows: readonly CorrespondenceRow[] }
  | { readonly held: false; readonly why: string };

/**
 * Corresponding provisions, from `statute_mappings` and nothing else.
 *
 * **Measured 20 Aug 2026: `statute_mappings` holds 226 rows.** (This comment
 * previously said 0, measured 19 Aug, and was true when written — the BPR&D
 * tables have since been parsed and loaded.) All 226 are
 * `authority_class = 'OFFICIAL_CORRESPONDENCE'` and **none is
 * `ENACTED_STATUTE`**, which is the distinction migration 0065 exists to carry:
 * Parliament enacted the Sanhitas, the BPR&D wrote a concordance to them, and
 * only the first would win an argument.
 *
 * ── COVERAGE, AND WHY THE `held: false` WORDING MATTERS MORE THAN THE ROWS
 *
 *     act    sections held   with a mapping   coverage
 *     bns              358               14       3.9%
 *     bnss             531               88      16.6%
 *     bsa              170              117      68.8%
 *
 * (Re-measured live 21 Aug 2026. This table previously read 4 / 24 / 101 and
 * was true when written; the BPR&D parser improved and the loader ran again. A
 * coverage figure in a comment goes stale in silence, so these carry the date
 * they were taken.)
 *
 * **Fourteen of the BNS's 358 sections have a mapping**, and the BNS replaced the
 * Indian Penal Code. So the overwhelmingly common outcome of this function is
 * `held: false`, and what that sentence says is the product.
 *
 * It must say UNMAPPED — *nobody has read the correspondence for this section* —
 * and never anything a reader could take as *there is no counterpart*. Those are
 * our ignorance and a positive legislative finding, and `statute_relationship`
 * has a separate `no_equivalent` value for the second, CHECK-constrained to
 * require an official source. Absence of a row is only ever the first.
 *
 * The alternative — letting a model supply the missing mapping — is the outcome
 * `DOMAIN_TRUTH.md` names twice: *"Never hardcode a mapping in application code.
 * Never let a model generate one."* At 1.1% coverage that temptation is at its
 * strongest, which is exactly when the rule matters.
 */
export async function correspondingProvisions(
  sql: Sql,
  act: string,
  section: string,
): Promise<Correspondence> {
  const rows = await sql<
    {
      new_act: string;
      new_section: string;
      old_act: string;
      old_section: string;
      relationship: string;
      note: string | null;
      authority_class: string;
      authority_body: string | null;
    }[]
  >`
    SELECT new_act::text, new_section, old_act::text, old_section, relationship::text, note,
           authority_class, authority_body
      FROM statute_mappings
     WHERE (old_act::text = ${act} AND old_section = ${section})
        OR (new_act::text = ${act} AND new_section = ${section})
     -- Strongest authority first, so a caller that renders only the head row
     -- renders the best-supported one rather than whichever the heap returned.
     ORDER BY authority_rank DESC, new_section
  `;
  if (rows.length === 0) {
    return {
      held: false,
      why:
        'no correspondence is held for ' +
        act +
        ' ' +
        section +
        '. ' +
        'This means UNMAPPED — nobody has read the correspondence for this section — ' +
        'and NOT that no counterpart exists. Coverage of the official BPRD comparison ' +
        'tables is presently 4 of 358 BNS sections, 24 of 531 BNSS and 101 of 170 BSA, ' +
        'so a gap here is the expected case rather than a finding. A mapping is never ' +
        'generated; where the source itself splits or merges sections, a single ' +
        'equivalent may not exist at all.',
    };
  }
  return {
    held: true,
    rows: rows.map((r) => ({
      newAct: r.new_act,
      newSection: r.new_section,
      oldAct: r.old_act,
      oldSection: r.old_section,
      relationship: r.relationship,
      note: r.note,
      authorityClass: r.authority_class,
      authorityBody: r.authority_body,
    })),
  };
}

/**
 * `2024-07-01` → `1 July 2024`.
 *
 * Not cosmetic. An ISO date is the wrong register for a legal answer — no
 * advocate writes "the code changed on 2024-07-01" — and the commencement date
 * is a fact the reader needs stated, not a machine field. Measured consequence:
 * with the ISO form the model paraphrased the change without ever repeating the
 * date, so a reader was told the law had changed and not told WHEN.
 *
 * The ISO form is kept everywhere else in the verdict, because comparison and
 * logging want the sortable one. Only the prose is rendered.
 */
function humanDate(iso: string): string {
  const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + m[1];
}

/**
 * The verdict as a block of FACTS for a generation prompt.
 *
 * Facts and one constraint, never a persona or a reminder. The model is not
 * asked to remember that BNS exists; it is told what the statute table says and
 * what it is not permitted to do without an input it can see is missing.
 *
 * Returns null when there is nothing to say, so callers append nothing rather
 * than an empty header.
 */
export function transitionContext(verdict: TransitionVerdict): string | null {
  switch (verdict.kind) {
    case 'not_criminal':
      return null;

    case 'unavailable':
      return [
        'CRIMINAL LAW REGIME — CANNOT BE ESTABLISHED',
        verdict.why,
        'Do not state which code governs. Say that this cannot be confirmed.',
      ].join('\n');

    case 'indeterminate':
      return [
        'CRIMINAL LAW REGIME — UNDETERMINED, AND THIS IS THE ANSWER',
        '',
        'On ' + humanDate(verdict.evidence.commencedOn) + ' the Bharatiya Nyaya Sanhita,',
        '2023, the Bharatiya Nagarik Suraksha Sanhita, 2023 and the Bharatiya Sakshya',
        'Adhiniyam, 2023 came into force, replacing the Indian Penal Code, 1860, the Code',
        'of Criminal Procedure, 1973 and the Indian Evidence Act, 1872. Source: statutes',
        'table, indiacode.nic.in.',
        '',
        verdict.why,
        '',
        'REQUIRED: ask when the offence is alleged to have occurred. Do NOT name a',
        'section number, do NOT state a punishment, and do NOT assume either code',
        'applies. The offence date is the question, not a detail to be filled in later.',
        '',
        // The reader is being asked for a date; they cannot supply a useful one
        // without knowing which side of what line it falls. Omitting the
        // commencement turns a specific question into a vague one.
        'STATE the commencement date, ' + humanDate(verdict.evidence.commencedOn) + ', so the',
        'advocate can see which side of it their facts fall on.',
      ].join('\n');

    case 'determinate': {
      const old = verdict.regime === 'pre_bns';
      return [
        'CRIMINAL LAW REGIME — ESTABLISHED FROM THE OFFENCE DATE',
        '',
        'Offence date given: ' + humanDate(verdict.offenceDate),
        'The 2023 codes commenced ' +
          humanDate(verdict.evidence.commencedOn) +
          ' (source: statutes table, indiacode.nic.in).',
        '',
        old
          ? 'The offence predates commencement, so the Indian Penal Code, 1860, the Code of ' +
            'Criminal Procedure, 1973 and the Indian Evidence Act, 1872 govern. Do not answer ' +
            'under BNS, BNSS or BSA.'
          : 'The offence is on or after commencement, so the Bharatiya Nyaya Sanhita, 2023, ' +
            'the Bharatiya Nagarik Suraksha Sanhita, 2023 and the Bharatiya Sakshya Adhiniyam, ' +
            '2023 govern. Do not answer under the IPC, CrPC or Evidence Act.',
        '',
        'Cite a section only from the provided evidence. Do not state a corresponding',
        'section under the other code from your own knowledge — the correspondence is held',
        'in a database table and is supplied here when it exists.',
      ].join('\n');
    }
  }
}
