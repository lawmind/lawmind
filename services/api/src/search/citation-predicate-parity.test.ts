/**
 * "Which judgment is this citation" is asked on two code paths. They must
 * answer the same.
 *
 * ---------------------------------------------------------------------------
 * THE FAMILY OF DEFECTS THIS GUARDS, WHICH HAS NOW HAPPENED THREE TIMES
 * ---------------------------------------------------------------------------
 *
 *   17 Aug 2026 — `exactCitation` in `retrieve.ts` was rewritten from an
 *                 unindexable `OR` into a `UNION` of indexable arms.
 *   18 Aug 2026 — `cite:` in `qlang/compile.ts` was found to have the SAME
 *                 unindexable shape, untouched by that fix. Measured at a
 *                 31-minute full backward scan; `structuredExactness` was
 *                 0.00% across 120 of 120 real citations.
 *   19 Aug 2026 — this. `qlang`'s `cite:` matched the alias concordance and
 *                 `exactCitation` never did. All 4,394 alias keys resolved on
 *                 one path and none on the other.
 *
 * Each time the correction was applied to the site where the defect was
 * observed, and each time an identical sibling was left behind. The pattern is
 * not carelessness about a particular line; it is that nothing in the repository
 * knew the two sites were the same question. This test knows.
 *
 * ---------------------------------------------------------------------------
 * WHY IT READS SOURCE TEXT, WHICH IS NORMALLY A BAD IDEA
 * ---------------------------------------------------------------------------
 *
 * The honest alternative — seed a judgment and its alias, run both paths,
 * compare — cannot run here. `services/api` tests execute against whatever
 * `DATABASE_URL` names, and in CI that is a freshly migrated EMPTY scratch
 * database. Both paths would return nothing, agree perfectly, and assert
 * nothing at all. A test that passes vacuously on the CI database while the
 * defect ships is worse than no test, and that is precisely how this arm went
 * missing for ten days.
 *
 * So the assertion is structural: every implementation of citation resolution
 * must reference all three sources of citation identity. It is a coarse check
 * and it is honest about being one — it cannot prove the arms are semantically
 * equal, only that no site is missing an entire source of truth, which is the
 * failure that actually occurred. Twice.
 *
 * If a fourth site is added, add it to `SITES`. If a site legitimately should
 * not resolve aliases, that is a decision with a reason — write the reason here
 * and exclude it explicitly, rather than letting the omission be silent.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Every place that answers "which judgment is this citation".
 *
 * `citations/verify.ts` is deliberately NOT here. Tier-3 per-citation
 * confirmation is a different act under a different part of the eCourts grant,
 * it holds no HTTP client, and a test asserts that it never gains one.
 * Collapsing the two is how a bounded permission becomes an unbounded one.
 */
const SITES = [
  { file: join(here, 'retrieve.ts'), what: 'exactCitation — the ordinary /search exact pin' },
  { file: join(here, 'qlang', 'compile.ts'), what: 'cite: — the structured query language field' },
] as const;

/**
 * The three independent places a citation's identity can live. A site missing
 * any one of them answers a strictly narrower question than the others.
 */
const ARMS = [
  {
    name: 'neutral_citation (normalised)',
    pattern: /regexp_replace\(\s*coalesce\(\s*j\.neutral_citation/,
    why: 'the court\'s own neutral citation, normalised the way judgments_neutral_citation_key indexes it',
  },
  {
    name: 'reporter_citations via lawmind_citation_keys',
    pattern: /lawmind_citation_keys\(\s*j\.reporter_citations\s*\)/,
    why: 'what the source reporter printed — one S.C.R. citation per row in this corpus',
  },
  {
    name: 'judgment_citation_aliases (the concordance)',
    pattern: /judgment_citation_aliases/,
    why:
      'the AIR and SCC names advocates actually type. Migration 0027 exists because ' +
      'AIR 1973 SC 1461 — the ordinary way to cite Kesavananda — returned NOTHING, ' +
      'and "a zero result reads as \'no such case\', which is the worst failure ' +
      'available to a product whose promise is that a citation is real."',
  },
] as const;

describe('citation resolution is the same question on every path', () => {
  for (const site of SITES) {
    const source = readFileSync(site.file, 'utf8');
    /**
     * Comments are stripped before matching. This file's own prose names all
     * three arms, and so does the explanatory comment above the new arm in
     * `retrieve.ts` — matching against comment text would let a site pass by
     * MENTIONING the concordance while not querying it, which is the exact
     * shape of a test that looks green and guards nothing.
     */
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    for (const arm of ARMS) {
      it(site.what + ' resolves ' + arm.name, () => {
        assert.ok(
          arm.pattern.test(code),
          site.what + ' does not query ' + arm.name + '.\n' +
            'Why it must: ' + arm.why + '\n' +
            'A citation resolvable on one path and not the other is the defect this file exists for. ' +
            'If the omission is deliberate, say so in SITES with a reason rather than leaving it silent.',
        );
      });
    }
  }

  /**
   * The concordance arm is only affordable because `alias_key` is unique — the
   * `ARRAY(SELECT …)` it builds is then a single element, and the plan is an
   * InitPlan plus an Index Only Scan on `judgments_pkey` (measured 4.2 ms end to
   * end, three arms, zero sequential scans).
   *
   * Asserted against the SOURCE of the migration rather than a live catalogue,
   * so it holds on an empty CI database too. If the uniqueness is ever dropped,
   * the array becomes unbounded and this stops being a cheap arm.
   */
  it('alias_key is unique, which is what bounds the concordance arm', () => {
    const migration = readFileSync(
      join(here, '..', '..', '..', '..', 'packages', 'db', 'drizzle', '0027_citation_aliases.sql'),
      'utf8',
    );
    assert.match(
      migration,
      /judgment_citation_aliases_key[\s\S]{0,120}UNIQUE|UNIQUE[\s\S]{0,120}\(\s*alias_key\s*\)/i,
      'alias_key is no longer unique — the concordance arm builds an unbounded array',
    );
  });
});
