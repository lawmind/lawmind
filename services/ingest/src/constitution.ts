/**
 * Parsing the Constitution of India into addressable Articles.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 found it (bus 0115): **the Constitution of India has zero rows in
 * `statutes`**, against 845 Acts that do. It is the one document every
 * constitutional-bench judgment in the corpus is arguing about, and an advocate
 * searching "Article 21" finds nothing.
 *
 * NEW3 then supplied the shape (bus 0143) after `indiacode.nic.in` refused
 * their fetch tools three times: the official Ministry of Law and Justice
 * edition, *"As on 1st May 2024"*, through the 106th Amendment, served from
 * `cdnbbsr.s3waas.gov.in`. **One continuous PDF** — Preamble through Part XXV,
 * all twelve Schedules in the same file.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SHAPE COLLISION THAT MAKES THIS NON-TRIVIAL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An Article opener and a footnote marker are **the same shape at the start of
 * a line**:
 *
 *     1. Name and territory of the Union.—(1) India, that is Bharat…   ← Article
 *     1. Subs. by the Constitution (Forty-second Amendment) Act, 1976…  ← footnote
 *
 * This is the identical trap `statute-amendments.ts` hit earlier in this
 * corpus, where `s. 12` and footnote marker `2. ` could not be told apart by
 * position alone. Measured on the real file: **361 lines match the Article
 * shape and 389 match the footnote shape**, so guessing wrong would roughly
 * double the Article count with amendment prose.
 *
 * The discriminator is the **em-dash after the title**. An Article is
 * `N. Title.—text`; a footnote is `N. Subs. by …` and never carries `.—`.
 * That is a property of the official typesetting, not a heuristic about
 * meaning, which is why it is safe to lean on.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY NOT PARSED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **The Schedules and the appendices.** They are in the same PDF and they are
 * genuinely different documents — the appendices include the 2019 Constitution
 * (Application to Jammu and Kashmir) Order and the Article 370(3) declaration
 * verbatim. Parsing them as if they were Articles would put constitutionally
 * distinct material under Article numbers. Recorded as out of scope rather
 * than silently swept in; a follow-up can add them with their own shape.
 *
 * **The Hindi half.** This is a diglot edition. Article text is extracted with
 * `-enc UTF-8` so Devanagari survives rather than becoming mojibake, but no
 * attempt is made to split or align the two languages.
 */

export type Article = {
  /** `21`, `21A`, `371-I` — the number as printed, never normalised away. */
  readonly number: string;
  readonly title: string;
  readonly text: string;
  /** Byte offset in the extracted text, so every Article resolves to its source. */
  readonly charOffset: number;
};

/**
 * `21. Protection of life and personal liberty.—No person shall be deprived…`
 *
 * The number may carry a letter suffix (`21A`) or a hyphenated one (`371-I`).
 * The title may be wrapped in an amendment marker — `368. 1[Power of Parliament
 * to amend the Constitution].—` — which is stripped rather than treated as part
 * of the name.
 */
const ARTICLE_OPENER =
  /(?:^|[[\]]|\s)(\d{1,3}[A-Z]?(?:-[A-Z]{1,3})?)\.\s+(.{3,150}?)\.\s*—/;

/**
 * THE OPENER IS OFTEN NOT AT THE START OF ITS LINE, and anchoring to `^` lost
 * some of the most-cited provisions in Indian law. Measured against the real
 * document, an `^`-anchored pattern found 383 Articles and **missed 14, 21A,
 * 226 and 370** — Equality before law, Right to education, the High Courts'
 * writ jurisdiction, and the J&K provision. Worse than missing them, it filled
 * their numbers from the Schedules: "Article 14" came back as a Sixth Schedule
 * paragraph on the administration of autonomous districts.
 *
 * Two real shapes defeat `^`:
 *
 *     Right to Equality 14. Equality before law.—The State shall not deny…
 *     2[21A. Right to education.—The State shall provide free and compulsory…
 *
 * The first carries the Part's sub-heading on the same line; the second wraps
 * the number in an amendment footnote marker -- `2[` OPENS the substitution, so
 * the character immediately before the number is `[`, not `]`. Missing that
 * bracket cost Articles 21A, 226 and 370 on the first fix. So the opener may be
 * preceded by a line start, either bracket, or whitespace.
 *
 * **That loosening would admit cross-references**, which is what this guard is
 * for: `in article 32 3***` and `under article 226` must never open an Article.
 * A number preceded by the word "article" is a reference TO one, never the
 * start of one.
 */
const CROSS_REFERENCE = /\barticles?\s*$/i;

/**
 * The Constitution ends at Article 395 ("Repeals"), and that is a fact about
 * the document rather than a tuned threshold. Anything numbered above it came
 * from the Schedules or a page artefact -- the real parse produced exactly one,
 * `731D`, and one wrong Article is one too many in a table an advocate will
 * cite from.
 */
const LAST_ARTICLE = 395;

/** `1[`, `2[` … an amendment footnote marker wrapping substituted text. */
const AMENDMENT_MARKER = /\d+\[|\]/g;

/**
 * Everything before this is the table of contents, which repeats every Article
 * number as a bare heading with no `.—` and would otherwise contribute nothing
 * but noise. Anchored on the first real Article rather than a page number,
 * because the pagination of this edition is not something to depend on.
 */
const FIRST_ARTICLE = /^1\.\s+Name and territory of the Union\.\s*—/m;

export function parseArticles(text: string): Article[] {
  const start = FIRST_ARTICLE.exec(text);
  // Without the anchor we would emit the contents pages as Articles. Better to
  // return nothing and say so than to fill the table with headings.
  if (start === null) return [];

  const body = text.slice(start.index);
  const bodyOffset = start.index;

  const lines: { text: string; offset: number }[] = [];
  let cursor = 0;
  for (const line of body.split('\n')) {
    lines.push({ text: line, offset: cursor });
    cursor += line.length + 1;
  }

  type Draft = { number: string; title: string; start: number; end: number };
  const drafts: Draft[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const m = ARTICLE_OPENER.exec(line.text);
    // `under article 226` is a reference to an Article, never the start of one.
    const isCrossReference = m !== null && CROSS_REFERENCE.test(line.text.slice(0, m.index + 1));
    if (m === null || isCrossReference) {
      if (drafts.length > 0) drafts[drafts.length - 1]!.end = line.offset + line.text.length + 1;
      continue;
    }
    const number = m[1]!;
    // Above the Constitution's own last Article: a Schedule paragraph or an artefact.
    if (Number.parseInt(number, 10) > LAST_ARTICLE) {
      if (drafts.length > 0) drafts[drafts.length - 1]!.end = line.offset + line.text.length + 1;
      continue;
    }
    /**
     * An Article number appears once. A repeat is the running header or a
     * cross-reference that happens to match, and taking it would truncate the
     * real Article at the point of the repeat.
     */
    if (seen.has(number)) {
      if (drafts.length > 0) drafts[drafts.length - 1]!.end = line.offset + line.text.length + 1;
      continue;
    }
    seen.add(number);
    drafts.push({
      number,
      title: m[2]!.replace(AMENDMENT_MARKER, '').replace(/\s+/g, ' ').trim(),
      start: line.offset,
      end: line.offset + line.text.length + 1,
    });
  }

  if (drafts.length > 0) drafts[drafts.length - 1]!.end = body.length;

  return drafts.map((d) => ({
    number: d.number,
    title: d.title,
    text: body.slice(d.start, d.end).trim(),
    charOffset: bodyOffset + d.start,
  }));
}

/** `21` sorts before `21A`, and both before `22`. Printed order, not string order. */
export function articleSortKey(number: string): [number, string] {
  const m = /^(\d+)(.*)$/.exec(number);
  return m ? [Number(m[1]), m[2] ?? ''] : [Number.MAX_SAFE_INTEGER, number];
}
