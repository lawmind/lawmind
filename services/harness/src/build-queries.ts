/**
 * Build the fixed query set FROM THE CORPUS, so ground truth is derived rather
 * than asserted.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE METHOD, AND WHY THIS ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `LCC_MASTER_PLAN.md` A1.1 requires provenance for every gold answer — "a
 * column, a citation-graph edge, a section number", never an opinion. The
 * problem that requirement creates is real: nobody here is a practising
 * advocate, and a query set whose answers we chose ourselves measures our own
 * guesses about relevance.
 *
 * **CLERC solves it by letting judges write the ground truth** (arXiv
 * 2406.17186, NAACL 2025, built on the Caselaw Access Project). Their pipeline
 * takes the sentence in which a case cites a precedent, strips the citation out
 * of it, and treats the cited case as the gold answer. The relevance judgement
 * is then a judge's, made in the course of deciding a real matter, and it is
 * recorded in a primary source. We hold the same structure: 44,785 resolved
 * edges in `judgment_citations`, each with `char_offset` into the citing
 * judgment's `full_text`.
 *
 * **What we take from CLERC is the method, not the data.** CLERC is US federal
 * case law and would be useless as Indian authority. `DATASETS.md`'s rule is
 * about training on another model's commentary about law; a query built from an
 * Indian judge's own citation of an Indian judgment is a primary record on both
 * ends.
 *
 * **IL-TUR (arXiv 2407.05399, ACL 2024) was the obvious alternative and is
 * ruled out — on licence, not on quality.** Its IL-PCR prior-case-retrieval set
 * is Indian, well built, and exactly the right shape. It is released
 * **CC BY-NC-SA**. Lawmind is a commercial product, so the non-commercial term
 * excludes it, and ShareAlike would reach anything derived from it. That is a
 * legal conclusion recorded so nobody re-opens it hopefully in six months: the
 * benchmark is off-limits for us, and its absence is not an oversight. (Its
 * published task definitions and metrics are ideas, not expression, and remain
 * free to learn from — which is what §A0.3 of the plan actually needed.)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LEAKAGE — the part that decides whether the number means anything
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A citing passage names the case it cites. Leave that in and the "retrieval"
 * task collapses into a string lookup, and precision@5 reports on our LIKE
 * operator. Three removals, in order of how much damage each prevents:
 *
 *   1. The citation string itself (`citation_text`, verbatim as it appeared).
 *   2. Every neutral and reporter citation the cited judgment carries — the
 *      same authority is cited in several formats and only one of them is in
 *      `citation_text`.
 *   3. The distinctive words of the cited case's title. "State of Punjab v.
 *      Baldev Singh" leaves "Baldev" in the passage; a retriever matching on
 *      that has not understood anything.
 *
 * What is deliberately NOT removed: the surrounding legal reasoning, section
 * numbers, and doctrinal vocabulary. Those are the query. An advocate describes
 * a problem in exactly those terms.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FILTERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * - **Self-citation excluded.** A judgment citing itself is not retrieval.
 * - **The cited judgment must hold embedded chunks.** Otherwise the query is
 *   unanswerable by construction and measures ingest, not retrieval.
 * - **Over-cited authorities excluded** (`MAX_INBOUND`). *Kesavananda* is cited
 *   everywhere; a set full of famous cases rewards a popularity prior, which is
 *   the specific way legal IR benchmarks flatter themselves.
 * - **Under-cited excluded** (`MIN_INBOUND`). An edge appearing once is more
 *   likely an extraction artefact than a considered reliance.
 * - **Passage length bounded.** Too short is not a question; too long is a
 *   document, and the advocate is typing a sentence or two.
 * - **One query per cited judgment**, so no authority dominates the score.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS SCRIPT DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It does not write the Hindi or the BNS/BNSS/BSA queries. Those two groups
 * cannot be derived this way and are held in `queries.hand.json` with their own
 * provenance — see that file's header. Mixing a derived set and a hand-built
 * one silently would hide which is which.
 *
 * Run:  pnpm --filter @lawmind/harness build:queries [--dry]
 */
import { writeFileSync } from 'node:fs';

import postgres, { type Sql } from 'postgres';

/** Bounds, stated before running so the set cannot be tuned toward a number. */
export const SELECTION = {
  /** Cited by at least this many distinct judgments — one edge is likely noise. */
  MIN_INBOUND: 2,
  /** And at most this many — a famous case rewards a popularity prior. */
  MAX_INBOUND: 60,
  /** Characters of citing text either side of the citation offset. */
  WINDOW: 700,
  /** After redaction. Shorter is not a question; longer is a document. */
  MIN_QUERY_CHARS: 200,
  MAX_QUERY_CHARS: 900,
  /** Words of the cited case title short enough to be generic, left alone. */
  TITLE_STOPWORDS: new Set([
    'state',
    'of',
    'v',
    'vs',
    'versus',
    'union',
    'india',
    'and',
    'the',
    'ors',
    'anr',
    'others',
    'another',
    'in',
    're',
    'commissioner',
    'income',
    'tax',
    'ltd',
    'limited',
    'co',
    'company',
    'corporation',
    'govt',
    'government',
    'municipal',
    'board',
    'council',
    'appellant',
    'respondent',
    'petitioner',
  ]),
} as const;

type Candidate = {
  citing_judgment_id: string;
  citing_title: string;
  citing_court: string;
  citing_date: string;
  citing_case_type: string | null;
  cited_judgment_id: string;
  cited_title: string;
  cited_court: string;
  cited_date: string;
  cited_neutral: string | null;
  cited_reporters: string[];
  citation_text: string;
  relationship: string;
  char_offset: number;
  inbound: number;
  passage: string;
};

/**
 * Escape a string for use inside a RegExp. Titles carry `.`, `(`, `&`.
 */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Citation-shaped spans, for counting rather than for extracting. Shares its
 * forms with `services/api/src/documents/route.ts` because the same four
 * conventions are what an Indian judgment actually uses.
 */
const CITATION_SHAPES = [
  /\b\d{4}\s+INSC\s+\d+\b/gi,
  /\(\s*\d{4}\s*\)\s*\d+\s+[A-Z]{2,6}\s+\d+/g,
  /\bAIR\s+\d{4}\s+[A-Z]{2,4}\s+\d+\b/gi,
  /\[\s*\d{4}\s*\]\s*\d*\s*[A-Z.]{2,8}\s*\d+/g,
];

/**
 * The first pass produced ten perfectly-formed queries that were all useless,
 * and the failure is worth keeping written down because it is invisible in the
 * metric.
 *
 * `char_offset` points at a citation. In a Supreme Court judgment the densest
 * concentration of citations is not the reasoning — it is the **"Case Law
 * Cited" block**, a list of authorities with no argument attached. Sampling by
 * citation therefore samples that block preferentially. A window centred there
 * yields a query that reads as a bibliography, and a retriever scored on it is
 * being asked to match a list of case names, which is not the task.
 *
 * Worse, it would have looked fine: the redaction fired, the length passed, the
 * provenance was real. Only reading the text showed it.
 *
 * So a passage must look like somebody arguing:
 *
 * - **Not inside a listing block.** Those blocks announce themselves.
 * - **Few remaining citations.** After redaction, a passage still carrying
 *   several other authorities is a list. Three is the line — a judge
 *   distinguishing two cases in one paragraph is real and common.
 * - **Real sentences.** Three of at least forty characters. A citation list has
 *   many full stops and no sentences.
 */
export function passageLooksLikeReasoning(raw: string, redacted: string): boolean {
  if (/case\s+law\s+cited|cases?\s+referred|headnote|\bcitator\b/i.test(raw)) return false;

  /**
   * Reporter headnote blocks, which this corpus carries inline.
   *
   * `Allowing the appeal, the Court HELD: 1.1. ...` is the Supreme Court
   * Reports' editorial summary, not the judgment. Two reasons to refuse it, and
   * either alone would do. It is a summary of reasoning rather than reasoning,
   * so a retriever scored on it is being asked to match an abstract. And it is
   * **the reporter's copy-edited work** — the one part of a law report that
   * carries copyright (`Eastern Book Company v. D.B. Modak`; `CLAUDE.md` §6:
   * use raw court text, never a law report's edition of it).
   */
  if (/\bHELD\s*[:.]|(?:Allowing|Dismissing|Disposing of) the appeals?, the Court/i.test(raw)) {
    return false;
  }

  // `... – referred to.` and `... – relied on.` close a list of authorities.
  // One case name is under the density threshold, so the marker has to be named.
  if (/[–-]\s*(?:referred to|relied (?:on|upon)|distinguished)\b/i.test(redacted)) return false;

  let residual = 0;
  for (const re of CITATION_SHAPES) residual += [...redacted.matchAll(re)].length;
  if (residual > 3) return false;

  /**
   * The citation-shape count was not enough on its own, and the second pass
   * showed why: reporter formats we do not match (`(2009) 318 (AT) 394 (ITAT
   * Mum)`, `[1961) 1SCR809` with a scanning error in the bracket) sail past a
   * regex list, and a list of them reads as a query.
   *
   * **Case names are the format-independent tell.** A judge reasoning names one
   * authority, occasionally two. A list names five. Counting `v.` catches every
   * reporter convention at once, including the ones we have not seen, which is
   * the property a hard-coded list of formats can never have.
   */
  const caseNames = [...redacted.matchAll(/\b(?:v|vs|versus)\.?\s+\p{Lu}/giu)].length;
  if (caseNames > 2) return false;

  // Semicolon-separated runs are the punctuation of a list, not of an argument.
  if ((redacted.match(/;/g) ?? []).length > 4) return false;

  // A bench line — `[... AND S.H. KAPADIA, JJ]` — means the window landed in the
  // report's front matter rather than in the judgment.
  if (/\bJJ\.?\s*\]|\bJ\.\s*\]|,\s*JJ\b/.test(redacted)) return false;

  const sentences = redacted.split(/(?<=[.?!])\s+/).filter((s) => s.trim().length >= 40);
  return sentences.length >= 3;
}

/**
 * Strip everything that identifies the answer, and say what was stripped.
 *
 * Returns the redacted passage and the list of removals, because a query whose
 * redaction cannot be inspected is a query nobody can check.
 */
export function redact(
  passage: string,
  opts: { citationText: string; neutral: string | null; reporters: string[]; citedTitle: string },
): { text: string; removed: string[] } {
  const removed: string[] = [];
  let out = passage;

  const kill = (needle: string, label: string) => {
    if (!needle || needle.length < 3) return;
    const re = new RegExp(escapeRe(needle), 'gi');
    if (re.test(out)) {
      out = out.replace(re, ' […] ');
      removed.push(label);
    }
  };

  kill(opts.citationText, `citation_text:${opts.citationText}`);
  if (opts.neutral) kill(opts.neutral, `neutral:${opts.neutral}`);
  for (const r of opts.reporters ?? []) kill(r, `reporter:${r}`);

  /**
   * Distinctive title words. A four-letter threshold plus the stopword list
   * keeps "State", "Union" and "India" — which carry no identifying force in
   * Indian case titles — while removing the party name that does.
   */
  for (const raw of opts.citedTitle.split(/[^\p{L}\p{N}]+/u)) {
    const w = raw.toLowerCase();
    if (w.length < 4) continue;
    if (SELECTION.TITLE_STOPWORDS.has(w)) continue;
    kill(raw, `title-word:${raw}`);
  }

  out = out
    .replace(/(\s*\[…\]\s*)+/g, ' […] ')
    .replace(/\s+/g, ' ')
    .trim();
  return { text: out, removed };
}

/**
 * A fixed-width window cuts mid-word at both ends. Snap in to whole sentences
 * so the query reads as something a person could have typed — the first
 * candidates began "s seeds, affecting maintenance of public order", which is
 * noise a real query would not carry and which the embedding has to spend
 * capacity on.
 */
export function snapToSentences(text: string): string | null {
  let out = text;

  /**
   * Start at a sentence boundary or not at all. Returning the fragment when no
   * boundary is near would quietly re-admit exactly what this function exists
   * to remove, and a caller cannot tell a snapped string from an unsnapped one.
   */
  if (!/^["“'(\p{Lu}]/u.test(out)) {
    const firstStop = out.search(/[.?!]\s+["“'(\p{Lu}]/u);
    if (firstStop < 0 || firstStop > 400) return null;
    out = out.slice(firstStop + 1);
  }

  if (out.length > SELECTION.MAX_QUERY_CHARS) out = out.slice(0, SELECTION.MAX_QUERY_CHARS);

  const lastStop = out.search(/[.?!][^.?!]*$/);
  if (lastStop > SELECTION.MIN_QUERY_CHARS) out = out.slice(0, lastStop + 1);

  return out.trim();
}

/**
 * Much of this corpus was OCR'd from scanned reports, and the damage is
 * localised: `mem· hers`, `posSEs-`, `l!-egulations`. A query carrying it
 * measures the retriever's tolerance for scanning artefacts rather than its
 * grasp of the law, and the advocate's real query will never contain them.
 *
 * The interpunct is the reliable tell in this corpus — it appears where a
 * scanner mistook a hyphenation or a marginal mark, and almost nowhere else.
 */
export function looksOcrDamaged(text: string): boolean {
  // The interpunct and the tilde are this corpus's two reliable tells: both
  // appear where a scanner mistook a hyphenation or a marginal mark, and almost
  // nowhere in real prose. `mem· hers`, `essentia~`.
  if ((text.match(/·/g) ?? []).length > 1) return true;
  if (text.includes('~')) return true;

  // A lowercase letter immediately followed by two capitals inside one word:
  // `posSEs`, `ANVERSIN`. Real legal prose has abbreviations, but they follow a
  // space or a full stop.
  if (/\p{Ll}\p{Lu}{2}/u.test(text)) return true;

  // Spaces lost around a case-name separator — `SHEONANDANPASWANv.STATEOF`.
  // Worth its own test because it also defeats the case-name density count,
  // which is precisely what let this one through the previous pass.
  if (/\p{L}v\.\p{Lu}/u.test(text)) return true;

  // A digit or a comma inside a word: `c9nverse`, `T,he`. Both are scanner
  // substitutions and neither occurs in typed legal prose.
  if (/\p{L}[\d,]\p{Ll}/u.test(text)) return true;

  /**
   * Supreme Court Reports print a marginal letter A–H down the side of each
   * page to locate a passage. Scanning interleaves them into the running text —
   * `the second contention of the appellant's counsel. B c D` — and they are
   * indistinguishable from real single-letter tokens once there.
   *
   * Density rather than presence, because a lone `A` is usually the article.
   */
  return [...text.matchAll(/\s[B-H]\s/g)].length > 1;
}

async function fetchCandidates(sql: Sql, caseType: 'criminal' | 'civil', limit: number) {
  return sql<Candidate[]>`
    WITH inbound AS (
      SELECT cited_judgment_id, count(DISTINCT citing_judgment_id)::int AS n
      FROM judgment_citations
      WHERE cited_judgment_id IS NOT NULL
      GROUP BY 1
    ),
    embedded AS (
      SELECT DISTINCT judgment_id FROM judgment_chunks WHERE embedding IS NOT NULL
    )
    SELECT jc.citing_judgment_id,
           ci.case_title       AS citing_title,
           ci.court            AS citing_court,
           ci.judgment_date::text AS citing_date,
           ci.case_type::text  AS citing_case_type,
           jc.cited_judgment_id,
           cd.case_title       AS cited_title,
           cd.court            AS cited_court,
           cd.judgment_date::text AS cited_date,
           cd.neutral_citation AS cited_neutral,
           coalesce(cd.reporter_citations, '{}') AS cited_reporters,
           jc.citation_text,
           jc.relationship,
           jc.char_offset,
           inbound.n           AS inbound,
           substring(ci.full_text
                     FROM greatest(1, jc.char_offset - ${SELECTION.WINDOW})
                     FOR ${SELECTION.WINDOW * 2}) AS passage
      FROM judgment_citations jc
      JOIN judgments ci ON ci.id = jc.citing_judgment_id
      JOIN judgments cd ON cd.id = jc.cited_judgment_id
      JOIN inbound     ON inbound.cited_judgment_id = jc.cited_judgment_id
      JOIN embedded    ON embedded.judgment_id = jc.cited_judgment_id
     WHERE jc.cited_judgment_id IS NOT NULL
       AND jc.citing_judgment_id <> jc.cited_judgment_id
       AND ci.case_type::text = ${caseType}
       AND inbound.n BETWEEN ${SELECTION.MIN_INBOUND} AND ${SELECTION.MAX_INBOUND}
       AND jc.char_offset > ${SELECTION.WINDOW}
       AND length(ci.full_text) > ${SELECTION.WINDOW * 3}
       -- Deterministic, so the same corpus yields the same set. Ordering by a
       -- hash rather than by citation count avoids re-introducing the
       -- popularity prior the MAX_INBOUND filter just removed.
     ORDER BY md5(jc.id::text)
     LIMIT ${limit}
  `;
}

export type BuiltQuery = {
  id: string;
  group: 'criminal' | 'civil';
  language: 'en' | 'hi';
  query: string;
  goldJudgmentIds: string[];
  provenance: {
    method: 'citation-edge';
    citingJudgmentId: string;
    citingCase: string;
    citingCourt: string;
    citingDate: string;
    relationship: string;
    citedCase: string;
    citedCourt: string;
    citedDate: string;
    inboundCitations: number;
    redacted: string[];
  };
};

function toQuery(c: Candidate, group: 'criminal' | 'civil'): BuiltQuery | null {
  const { text, removed } = redact(c.passage, {
    citationText: c.citation_text,
    neutral: c.cited_neutral,
    reporters: c.cited_reporters,
    citedTitle: c.cited_title,
  });

  // The citation itself must have been found and removed. If it was not, the
  // offset and the text disagree and the passage is not the one we think.
  if (!removed.some((r) => r.startsWith('citation_text:'))) return null;
  if (text.length < SELECTION.MIN_QUERY_CHARS) return null;
  if (!passageLooksLikeReasoning(c.passage, text)) return null;

  if (looksOcrDamaged(text)) return null;

  const trimmed = snapToSentences(text);
  if (trimmed === null || trimmed.length < SELECTION.MIN_QUERY_CHARS) return null;

  return {
    id: `${group}-${c.cited_judgment_id.slice(0, 8)}`,
    group,
    language: 'en',
    query: trimmed,
    goldJudgmentIds: [c.cited_judgment_id],
    provenance: {
      method: 'citation-edge',
      citingJudgmentId: c.citing_judgment_id,
      citingCase: c.citing_title,
      citingCourt: c.citing_court,
      citingDate: c.citing_date,
      relationship: c.relationship,
      citedCase: c.cited_title,
      citedCourt: c.cited_court,
      citedDate: c.cited_date,
      inboundCitations: c.inbound,
      redacted: removed,
    },
  };
}

async function main() {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) {
    console.error('CORPUS_DATABASE_URL is not set.');
    process.exit(2);
  }
  const dry = process.argv.includes('--dry');
  const sql = postgres(url, { ssl: url.includes('localhost') ? false : 'require', max: 3 });

  try {
    const out: BuiltQuery[] = [];
    for (const group of ['criminal', 'civil'] as const) {
      const seen = new Set<string>();
      // Over-fetch: redaction rejects candidates, and one query per cited
      // judgment means duplicates are dropped rather than replaced.
      const candidates = await fetchCandidates(sql, group, 4000);
      for (const c of candidates) {
        if (out.filter((q) => q.group === group).length >= 10) break;
        if (seen.has(c.cited_judgment_id)) continue;
        const q = toQuery(c, group);
        if (!q) continue;
        seen.add(c.cited_judgment_id);
        out.push(q);
      }
    }

    const doc = {
      version: 1,
      builtAt: new Date().toISOString(),
      method: 'citation-edge (CLERC-style; see build-queries.ts header)',
      selection: {
        MIN_INBOUND: SELECTION.MIN_INBOUND,
        MAX_INBOUND: SELECTION.MAX_INBOUND,
        WINDOW: SELECTION.WINDOW,
        MIN_QUERY_CHARS: SELECTION.MIN_QUERY_CHARS,
        MAX_QUERY_CHARS: SELECTION.MAX_QUERY_CHARS,
      },
      queries: out,
    };

    for (const g of ['criminal', 'civil'] as const) {
      console.log(`${g}: ${out.filter((q) => q.group === g).length} of 10`);
    }

    if (dry) {
      for (const q of out.slice(0, 2)) {
        console.log('\n---', q.id, '→', q.provenance.citedCase);
        console.log(q.query.slice(0, 400));
        console.log('redacted:', q.provenance.redacted.join(' · '));
      }
      return;
    }

    const path = new URL('./fixtures/queries.derived.json', import.meta.url);
    writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`\nwrote ${out.length} queries → src/fixtures/queries.derived.json`);
  } finally {
    await sql.end();
  }
}

await main();
