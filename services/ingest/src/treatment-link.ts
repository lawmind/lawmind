/**
 * HELD_UNALIASED — link an adverse citation edge to the judgment we already
 * hold, using only the equivalence the reporter itself printed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE POPULATION, AND WHY IT IS THE MOST DANGEROUS ONE WE HAVE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/TREATMENT_MANIFEST_V1.md` §1b: five edges whose target IS in the corpus
 * and whose `cited_judgment_id` is null, so `overruled-cli` cannot reach them
 * and `judgments.overruled_status` stays `none`. P. Kannadasan — overruled by a
 * nine-judge bench in *MADA v. SAIL* — renders today as live good law.
 * `CLAUDE.md` §6 puts the stale-overruled threshold at ZERO.
 *
 * They are unresolved for one reason: **every Supreme Court judgment we hold
 * carries an S.C.R. citation and none carry SCC or AIR** (`AUTHORITY_COVERAGE.md`
 * §1), and the citing bench prints the SCC or AIR form.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE EVIDENCE IS A PAIRING THE COURT PRINTED, NOT A MATCH WE COMPUTED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * *MADA v. SAIL*'s own Case Law list prints:
 *
 *     P Kannadasan v. State of Tamil Nadu [1996] Supp. 4 SCR 92 : (1996) 5 SCC 670
 *
 * The colon is the Supreme Court's own statement that those two citations name
 * one judgment. `headnote-dispositions.ts` already reads that construction and
 * its own header says the pairing half is sound while the disposition half is
 * not — so this module takes the pairing and takes the RELATIONSHIP from the
 * `judgment_citations` row that already exists, never from a marker.
 *
 * Two differences from `headnote-dispositions.parseHeadnoteDispositions`, both
 * deliberate:
 *
 * 1. **Pairings are harvested from the whole text, not from inside a
 *    disposition group.** A pairing's validity does not depend on where a group
 *    starts — that module says so itself — and requiring a recognised `–` marker
 *    would drop pairings printed in prose or under an unrecognised marker.
 * 2. **The AIR form is paired too.** *Aligarh Muslim University* prints
 *    `S Azeez Basha v. Union of India [1968] 1 SCR 833 : AIR 1968 SC 662`. Same
 *    construction, same colon, same authority; the existing regexes only knew
 *    SCC.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUR GUARDS, EACH OF WHICH REFUSES ON ITS OWN
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A wrong resolution points an advocate at the wrong case, so nothing here
 * relies on the pairing being right by itself:
 *
 * 1. **EXACTLY ONE TARGET.** The S.C.R. key must reach exactly one judgment.
 *    Two is a refusal, not a coin toss — `resolve-cli`'s rule.
 * 2. **THE NAME MUST AGREE — by CONTAINMENT, not by Jaccard.** Every
 *    distinctive token of the target's `case_title` has to appear in the name
 *    the citing bench printed. Jaccard was the first version and it refused two
 *    correct rows: the Supreme Court's reports print a bench line immediately
 *    before the list (`… Case Law Cited In the Judgment of Dr Dhananjaya Y
 *    Chandrachud, CJI.`), it lands inside the 110-character name window with no
 *    punctuation this parser can cut on, and eight extra tokens dropped
 *    *Synthetics and Chemicals* to 0.18 against a title whose every token was
 *    present. A symmetric measure punishes a noisy PREFIX exactly as hard as a
 *    wrong name; containment asks the question actually being asked — does the
 *    name printed beside this citation contain the target's own words. Two
 *    distinct tokens must be shared where the title HAS two — a three-word title
 *    cannot be carried by one common word. Where the whole distinctive title is
 *    one token (*V Revathi v. Union of India* tokenises to `REVATHI`, the rest
 *    being stopwords) the floor is that one token, because a rule of "two" there
 *    is not a stricter check, it is an impossibility: it refused a printed name
 *    matching the target's title EXACTLY, at Jaccard 1.00.
 * 3. **THE YEAR WINDOW IS ASYMMETRIC.** A report published in year Y carries a
 *    judgment decided in Y or earlier — never later. Accepts Y and Y-1
 *    (reporting lag), which is `internal-concordance.ts`'s measured window.
 * 4. **NEVER OVERWRITES.** Only `cited_judgment_id IS NULL` rows are touched.
 *
 * Everything in this file is pure over text the caller fetched: no model, no
 * network, no case name recalled from memory. Every value returned is a
 * substring of its input.
 */
import { jaccardSimilarity, tokenizeName } from './concordance-adjudicate.ts';

/**
 * Page furniture PDF extraction injects INTO the middle of a citation. Copied
 * in behaviour from `headnote-dispositions.ts` — a running header left in place
 * makes `(2017) 1574 [2024] 7 S.C.R.Digital Supreme Court Reports 12 SCC 1`
 * read as volume 1574.
 */
const INTERPOLATED_HEADER =
  /\d*\s*\[\d{4}\]\s*\d+\s*S\.C\.R\.\s*(?:Digital\s+Supreme\s+Court\s+Reports)?\s*/gi;

/** `[1996] Supp. 4 SCR 92` — the form every Supreme Court judgment we hold carries. */
const SCR_SRC = String.raw`\[(\d{4})\]\s*(Supp\.?\s*)?(\d+)\s*S\.?\s?C\.?\s?R\.?\s*(\d+)`;
/** `(1996) 5 SCC 670` — the form advocates and citing benches print. */
const SCC_SRC = String.raw`\((\d{4})\)\s*(Supp\.?\s*)?(\d+)\s*S\.?\s?C\.?\s?C\.?\s*(\d+)`;
/** `AIR 1968 SC 662`. */
const AIR_SRC = String.raw`AIR\s*(\d{4})\s*SC\s*(\d+)`;

/**
 * Both orders occur for both alternative forms, so all four are matched. The
 * colon is mandatory in every one of them: NEW3 measured 6 false positives in
 * 21 raw proximity hits, one of them a running page header. Punctuation-level
 * adjacency, not distance.
 */
const PAIRINGS: readonly { re: RegExp; alt: 'SCC' | 'AIR'; scrFirst: boolean }[] = [
  { re: new RegExp(`${SCR_SRC}\\s*:\\s*${SCC_SRC}`, 'gi'), alt: 'SCC', scrFirst: true },
  { re: new RegExp(`${SCC_SRC}\\s*:\\s*${SCR_SRC}`, 'gi'), alt: 'SCC', scrFirst: false },
  { re: new RegExp(`${SCR_SRC}\\s*:\\s*${AIR_SRC}`, 'gi'), alt: 'AIR', scrFirst: true },
  { re: new RegExp(`${AIR_SRC}\\s*:\\s*${SCR_SRC}`, 'gi'), alt: 'AIR', scrFirst: false },
];

/** A case name longer than this is prose that happens to precede a citation. */
const MAX_NAME_CHARS = 110;

export interface Pairing {
  /** Case name as printed immediately before the pairing. Never normalised, never recalled. */
  readonly name: string;
  /** The S.C.R. form, exactly as printed. */
  readonly scr: string;
  /** The SCC or AIR form, exactly as printed. */
  readonly alt: string;
  readonly altForm: 'SCC' | 'AIR';
  /** The whole printed construction, for the evidence column. */
  readonly evidence: string;
  /** Publication year of the S.C.R. form — the year guard's left-hand side. */
  readonly scrYear: number;
}

/** `[1996] Supp. 4 S.C.R. 92` and `[1996] Supp. 4 SCR 92` produce the same key — `lawmind_citation_keys`'s rule, restated so a caller can key before querying. */
export function citationKey(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/**
 * The name is whatever precedes the pairing, back to the nearest separator the
 * reports actually print. Taking it any other way would mean inventing a
 * boundary the text does not draw.
 *
 * **A bare `. ` is NOT a separator here**, and that cost two fixtures: every
 * Indian case name contains one — `v.`, `Ltd.`, `P.`, `D.Y.` — so cutting on it
 * returned `State of Tamil Nadu` for *P Kannadasan v. State of Tamil Nadu* and
 * `Union of India` for *S Azeez Basha v. Union of India*. A sentence end is a
 * period after a word of three or more LOWERCASE letters (`Reports.`,
 * `overruled.`); an abbreviation is not. Semicolons, newlines and a colon after
 * a bench line (`… CJI:`) are separators outright — those are what the Case Law
 * lists print between entries.
 *
 * **A NEWLINE IS NOT A BOUNDARY EITHER, and that cost the row this whole module
 * was written for.** PDF extraction wraps mid-name: MADA's list holds
 * `State of Tamil\nNadu`, so treating `\n` as a separator returned the printed
 * name as `Nadu`, the name guard scored 0.33 against
 * *P. KANNADASAN … STATE OF TAMIL NADU*, and P. Kannadasan — the one authority
 * in the manifest confirmed to be rendering as live good law — refused itself.
 * The text is whitespace-collapsed before anything is matched, so a wrap cannot
 * split a name, a citation, or the colon that joins a pair.
 */
const NAME_BOUNDARY = /[;]|:\s|(?<=[a-z]{3})\.\s/g;

function nameBefore(text: string, at: number): string {
  const window = text.slice(Math.max(0, at - MAX_NAME_CHARS), at);
  NAME_BOUNDARY.lastIndex = 0;
  let cut = 0;
  let m: RegExpExecArray | null;
  while ((m = NAME_BOUNDARY.exec(window)) !== null) cut = m.index + m[0].length;
  return window
    .slice(cut)
    .replace(/\s+/g, ' ')
    .replace(/^[\s;,:.]+|[\s;,:.]+$/g, '')
    .trim();
}

/** Every `SCR : SCC` / `SCR : AIR` pairing printed anywhere in one judgment's text. */
export function harvestPairings(fullText: string): Pairing[] {
  const text = fullText.replace(/\s+/g, ' ').replace(INTERPOLATED_HEADER, ' ');
  const out: Pairing[] = [];
  const seen = new Set<string>();

  for (const { re, alt, scrFirst } of PAIRINGS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const whole = m[0];
      const parts = whole.split(':');
      if (parts.length < 2) continue;
      const scr = (scrFirst ? parts[0] : parts.slice(1).join(':'))!.trim();
      const altText = (scrFirst ? parts.slice(1).join(':') : parts[0])!.trim();
      const name = nameBefore(text, m.index);
      if (name.length < 4) continue;

      const scrYear = Number(/\[(\d{4})\]/.exec(scr)?.[1] ?? 0);
      if (!scrYear) continue;

      const dedup = `${citationKey(scr)}|${citationKey(altText)}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);

      out.push({
        name,
        scr,
        alt: altText,
        altForm: alt,
        evidence: `${name} ${whole.replace(/\s+/g, ' ').trim()}`,
        scrYear,
      });
    }
  }
  return out;
}

export interface NameVerdict {
  readonly agrees: boolean;
  readonly jaccard: number;
  /** Share of the TARGET's distinctive tokens found in the printed name. The verdict. */
  readonly coverage: number;
  readonly sharedTokens: number;
}

/**
 * Guard 2. Corroborates an exact citation-key match; it never decides one on its
 * own.
 *
 * `coverage` is the share of the TARGET's distinctive tokens present in the
 * printed name. `jaccard` is still computed and reported — it is the number the
 * refusal line quotes and it is what makes a near-miss legible — but the verdict
 * is the containment test, for the reason in this file's header.
 */
export const MIN_NAME_COVERAGE = 0.6;
/** Capped at the target's own token count — see the header on *V Revathi*. */
export const MIN_SHARED_TOKENS = 2;

export function nameAgrees(printed: string, caseTitle: string): NameVerdict {
  const a = tokenizeName(printed);
  const b = tokenizeName(caseTitle);
  const jaccard = jaccardSimilarity(a, b);
  const setA = new Set(a);
  const targetTokens = new Set(b);
  let shared = 0;
  for (const t of targetTokens) if (setA.has(t)) shared++;
  const coverage = targetTokens.size === 0 ? 0 : shared / targetTokens.size;
  const floor = Math.min(MIN_SHARED_TOKENS, targetTokens.size);
  return {
    agrees: targetTokens.size > 0 && coverage >= MIN_NAME_COVERAGE && shared >= floor,
    jaccard,
    coverage,
    sharedTokens: shared,
  };
}

/**
 * Guard 3. A judgment decided AFTER its own law report was published cannot be
 * the one the report carries; a one-year lag is ordinary.
 */
export function yearAgrees(scrYear: number, judgmentDate: string | null): boolean {
  if (!judgmentDate) return false;
  const year = Number(judgmentDate.slice(0, 4));
  if (!year) return false;
  return year === scrYear || year === scrYear - 1;
}
