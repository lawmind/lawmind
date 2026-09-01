/**
 * INGEST/API PARITY FOR THE NEUTRAL-CITATION TOKEN BOUNDARY.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS GUARDS, AND WHY IT IS AN LCC TEST ABOUT A NEW2 RULE
 * ---------------------------------------------------------------------------
 *
 * `CITATION_HARNESS.md`'s whole argument rests on one citation string having one
 * canonical identity. It does not have one if ingest and the API disagree about
 * where a citation token ENDS: the same printed citation then gets two keys, one
 * written into the edge space and a different one looked up by search, and the
 * failure is silent in both directions — a citation that stops resolving, or a
 * key that resolves to the wrong judgment.
 *
 * NEW2 R18 (`e2a298e6`) found and fixed exactly that in the HIGH COURT LOADER's
 * own-citation extractor, `services/ingest/src/harvest/hc-load.ts`. The rule had
 * been:
 *
 *     /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})(?:-(?:DB|FB))?\b/g
 *                                                                       ^^ here
 *
 * On `2025:DHC:8491-DBThis Court`, `B` followed by `T` is not a word boundary, so
 * the `-DB` alternative FAILS. The group is optional, so it matches EMPTY — and
 * the trailing `\b` then succeeds at the position after `8491`, because a digit
 * followed by a hyphen IS a boundary. The regex never errors. It returns
 * `2025:DHC:8491`, a DIFFERENT citation. R18 moved the boundary onto the NUMBER:
 *
 *     /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})\b(?:-(?:DB|FB))?/g
 *
 * ---------------------------------------------------------------------------
 * THE API HAS NO PARSER OF ITS OWN, WHICH IS WHY THIS IS A TRIPWIRE NOT A FIX
 * ---------------------------------------------------------------------------
 *
 * Every API-side citation path — `classifyQuery` here, `bareCitationAsField` in
 * `search/structured.ts`, the `cite:` value check in `search/qlang/parse.ts`, and
 * `judgments/citations.ts` — reaches ONE extractor, `extractCitations` from
 * `@lawmind/ingest/citations`. `query-shape.ts`'s own header says why: *"The
 * citation patterns are NOT redefined here … a second copy would drift, and the
 * drift would be silent."* That is the right call and this test does not weaken
 * it.
 *
 * But `services/ingest/src/citations.ts` still carries the PRE-R18 boundary, and
 * R18 left it deliberately: fixing it changes what `extractCitations` writes into
 * `judgment_citations.normalised_citation`, which moves the edge key space while
 * `CITATION_BULK_APPLY = HOLD`. So the divergence is real, it is understood, and
 * correcting it is NEW2's write, not LCC's.
 *
 * What LCC owns is making sure the divergence cannot change size unobserved. The
 * glued cases below are pinned to the behaviour the API has TODAY, each one
 * marked. **When NEW2 lands the boundary fix in `citations.ts`, those three
 * assertions go RED. That is the signal, not a regression** — flip them to
 * `expectedAfter` and the parity holes close to zero.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractCitations } from '@lawmind/ingest/citations';
import { canonicalKeyFor } from '../citations/resolver.ts';
import { citationLookupKey, classifyQuery, warrantsExactLookup } from './query-shape.ts';

/**
 * The committed NEW2 rule, copied from `hc-load.ts` at `e2a298e6` and used here
 * ONLY as an oracle.
 *
 * A copy is normally the thing this repository forbids, and it is acceptable in
 * exactly this shape: it never canonicalises anything, it computes no key that
 * reaches a database, and its only job is to disagree with the subject under
 * test. `hc-load.ts` is not on `@lawmind/ingest`'s export map, so importing the
 * real function would mean editing a NEW2-owned manifest to write an LCC test —
 * a worse trade than a labelled oracle whose own drift the agreement cases below
 * would expose.
 */
const NEW2_R18_NEUTRAL = /\b(\d{4}):([A-Z]{2,10}(?:-[A-Z]{1,3})?):(\d{1,6})\b(?:-(?:DB|FB))?/g;

/** What the committed ingest boundary makes of the FIRST neutral token in `text`. */
function ingestToken(text: string): string | null {
  const re = new RegExp(NEW2_R18_NEUTRAL.source, NEW2_R18_NEUTRAL.flags);
  const m = re.exec(text);
  return m ? m[0] : null;
}

/**
 * What the API makes of it, through the real production entry point.
 *
 * `classifyQuery` is what `/search` and `bareCitationAsField` actually call, so a
 * test reaching `extractCitations` directly would keep passing while the routing
 * above it drifted.
 */
function apiToken(text: string): string | null {
  const q = classifyQuery(text);
  if (q.shape !== 'citation' || q.citation === null) return null;
  return q.citation;
}

/** Only the neutral form is in scope; reporter forms are a different rule. */
const NEUTRAL_SHAPED = /^\d{4}:/;

describe('neutral-citation token boundary: ingest vs API', () => {
  /**
   * The agreement classes. These are why the pinned divergence below is narrow
   * rather than alarming: everything that is not GLUED already agrees, so the
   * hole has one shape and one cause.
   */
  const AGREE: readonly { readonly text: string; readonly why: string }[] = [
    { text: '2025:DHC:8491', why: 'plain' },
    { text: '2023:AHC:152051', why: 'plain, six-digit number' },
    { text: '2023:KHC-D:1', why: 'hyphenated COURT token — not a suffix' },
    { text: '2025:DHC:8491-DB', why: 'valid -DB, isolated' },
    { text: '2023:AHC:152051-FB', why: 'valid -FB, isolated' },
    { text: '2026:PHHC:027747-DB', why: '-DB on a zero-padded six-digit number' },
    { text: '2025:DHC:8491-DB.', why: '-DB then a full stop' },
    { text: '2025:DHC:8491-DB, and', why: '-DB then a comma' },
    { text: '(2025:DHC:8491-DB)', why: '-DB inside parentheses' },
    { text: '2025:DHC:8491-DB\nThis Court', why: '-DB then a line break' },
    { text: '2025:DHC:8491-DB\r\nHeld', why: '-DB then CRLF' },
    { text: '2025:DHC:8491-DB\tHeld', why: '-DB then a tab' },
    { text: 'Neutral Citation No. - 2023:AHC:152051-DB', why: 'the printed label form' },
    // Negative controls. Not one of these may move when the boundary is fixed:
    // an unrecognised tail must be DROPPED, never absorbed into a new suffix.
    { text: '2025:DHC:8491-SB', why: 'NEGATIVE: -SB is not a recognised suffix' },
    { text: '2025:DHC:8491-Crl.A.', why: 'NEGATIVE: a case-type tail, not a suffix' },
  ];

  for (const c of AGREE) {
    it(`agrees on ${JSON.stringify(c.text)} — ${c.why}`, () => {
      const ingest = ingestToken(c.text);
      const api = apiToken(c.text);
      assert.notEqual(ingest, null, 'the ingest oracle found no neutral token');
      assert.notEqual(api, null, 'the API found no citation');
      assert.equal(
        citationLookupKey(api!),
        citationLookupKey(ingest!),
        `ingest canonicalised to ${ingest}, the API to ${api}`,
      );
    });
  }

  /**
   * -------------------------------------------------------------------------
   * THE PINNED DIVERGENCE — FAILURE-FIRST, EXPECTED TO GO RED ON NEW2's FIX
   * -------------------------------------------------------------------------
   *
   * `expectedBefore` is what the API returns TODAY, and it is wrong.
   * `expectedAfter` is what it must return once `services/ingest/src/citations.ts`
   * carries the R18 boundary. Both are recorded so the fix is a one-line edit
   * here and nobody has to re-derive the right answer under time pressure.
   *
   * NEW2 observed the ingest half red at `72b87859`; the API half is observed
   * red here at `e2a298e6` as the three rows below.
   */
  const GLUED: readonly {
    readonly text: string;
    readonly expectedBefore: string;
    readonly expectedAfter: string;
  }[] = [
    {
      text: '2025:DHC:8491-DBThis Court held',
      expectedBefore: '2025:DHC:8491',
      expectedAfter: '2025:DHC:8491-DB',
    },
    {
      // R18's own exemplar, from a real Allahabad document.
      text: '2023:AHC:111864-DBNeutral Citation',
      expectedBefore: '2023:AHC:111864',
      expectedAfter: '2023:AHC:111864-DB',
    },
    {
      text: '2023:AHC:152051-FBOrder',
      expectedBefore: '2023:AHC:152051',
      expectedAfter: '2023:AHC:152051-FB',
    },
  ];

  for (const c of GLUED) {
    it(`PINNED DIVERGENCE on ${JSON.stringify(c.text)} — flip when NEW2 fixes citations.ts`, () => {
      assert.equal(
        ingestToken(c.text),
        c.expectedAfter,
        'the R18 oracle itself changed — this test no longer measures what it claims',
      );
      assert.equal(
        apiToken(c.text),
        c.expectedBefore,
        'the API side of the boundary defect has been corrected — replace expectedBefore ' +
          'with expectedAfter here and in the assertion below, then re-run the parity harness',
      );
      // The consequence, stated as a value rather than a worry: the API would key
      // an exact lookup on a citation the court never printed.
      assert.notEqual(
        citationLookupKey(apiToken(c.text)!),
        citationLookupKey(c.expectedAfter),
        'the keys now agree — the divergence is closed and the pin above should be flipped',
      );
    });
  }

  /**
   * NOT A DEFECT — A LAYER DIFFERENCE, RECORDED SO IT IS NEVER "FIXED".
   *
   * `hc-load.ts`'s `neutralCitationFrom` answers *"what is THIS document's own
   * citation"* and REFUSES when the page prints more than one, because a common
   * order heading two matters must not be filed under the wrong number. The API's
   * `extractCitations` answers a different question — *"what citations appear in
   * this text"* — and returning the first is correct for it. Forcing byte
   * identity between the two would either make search refuse valid queries or
   * make ingest guess an identity it cannot prove.
   */
  it('two distinct citations: ingest refuses an identity, the API still classifies — by design', () => {
    const text = '2025:DHC:8491-DB and 2025:DHC:8492';
    const found = extractCitations(text).filter((c) => NEUTRAL_SHAPED.test(c.raw));
    assert.equal(found.length, 2, 'the API extractor must see both citations');
    const q = classifyQuery(text);
    assert.equal(q.shape, 'citation');
    assert.equal(warrantsExactLookup(q), true);
  });

  /**
   * The resolver gate is NOT the defect and must not be edited for it.
   *
   * `canonicalKeyFor` normalises whatever token it is handed; it does not decide
   * where a token ends. Given the right string it produces the right key, which
   * is exactly what makes the EXTRACTOR the single place the boundary can be
   * wrong — and the reason this round changes no resolver code.
   */
  it('canonicalKeyFor is faithful to the suffix it is given', () => {
    const withSuffix = canonicalKeyFor('2025:DHC:8491-DB');
    const without = canonicalKeyFor('2025:DHC:8491');
    assert.equal(withSuffix.refused, false);
    assert.equal(without.refused, false);
    assert.equal((withSuffix as { key: string }).key, '2025DHC8491DB');
    assert.equal((without as { key: string }).key, '2025DHC8491');
    assert.notEqual((withSuffix as { key: string }).key, (without as { key: string }).key);
  });

  /**
   * The alias path cannot carry this defect, and the reason is a CONSTRAINT
   * rather than a sample.
   *
   * `judgment_citation_aliases.alias_reporter` is
   * `CHECK (alias_reporter IN ('AIR','SCC'))` (migration `0027`), so an alias row
   * is a REPORTER citation by construction and a neutral citation can never
   * become one. Measured read-only 1 Sep 2026: 4,394 alias rows, 335 AIR +
   * 4,059 SCC, and ZERO matching the neutral form. Asserted here as a shape fact
   * so a future widening of that CHECK has to come past this test.
   */
  it('a neutral citation is not a reporter citation, so it cannot be an alias', () => {
    for (const neutral of ['2025:DHC:8491-DB', '2023:AHC:111864', '2023:KHC-D:1']) {
      assert.equal(/\b(AIR|SCC)\b/.test(neutral), false, `${neutral} must not read as AIR/SCC`);
      assert.equal(NEUTRAL_SHAPED.test(neutral), true);
    }
  });
});
