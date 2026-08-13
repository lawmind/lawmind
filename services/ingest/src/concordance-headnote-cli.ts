/**
 * `npx tsx --env-file=.env services/ingest/src/concordance-headnote-cli.ts [--apply]`
 *
 * Harvests the SCR↔SCC concordance the Supreme Court prints in its own headnote
 * "Case Law" lists, and writes it to `judgment_citation_aliases`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A SECOND CONCORDANCE SOURCE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `concordance-cli.ts` finds parallel citations by ADJACENCY — an SCR form
 * printed within 55 characters of an SCC form in running text. That works and
 * it is already deployed.
 *
 * Headnote Case Law lists are a different shape entirely: a structured,
 * semicolon-separated table where the reporter itself prints both forms
 * separated by a colon.
 *
 *     P Kannadasan v. State of Tamil Nadu [1996] Supp. 4 SCR 92 : (1996) 5 SCC 670
 *
 * **This is the court's own official equivalence, not our inference from
 * proximity.** `overruled-resolve-cli` names the blocker for all 34 unresolved
 * `overruled` edges as *"the SCC/AIR → S.C.R. identity gap"* — and 657
 * judgments we already hold print the mapping directly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT REUSES THE EXISTING DISCIPLINE RATHER THAN INVENTING A SECOND ONE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `reconcile()` and `aliasKey()` come from `concordance.ts` unchanged, so the
 * rule that matters most is inherited automatically: **an alias seen pointing at
 * two different judgments is DROPPED, not guessed.** A citation string means
 * exactly one judgment, and picking one is the confident wrong answer this
 * product cannot afford.
 *
 * The SCR side resolves against `judgments.reporter_citations` **in memory**.
 * `concordance-cli.ts` does that join in SQL and claims a *"migration 0026
 * expression index"* — there is no such index, only a plain GIN over the raw
 * array, which cannot serve a `regexp_replace` per element. See the note at the
 * resolution step; the first run of this CLI died there.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT WILL NOT DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Writes ONLY to `judgment_citation_aliases` — never to `cited_judgment_id`,
 * never to `overruled_status`, never to `verification_state`. An alias widens
 * the ways a judgment we ALREADY hold can be named; it cannot invent an
 * identity, because `judgment_id` is NOT NULL and must be resolved first.
 *
 * DRY RUN by default. `--apply` writes.
 */
import type { ParallelPair } from './concordance.ts';
import { aliasKey, reconcile } from './concordance.ts';
import { openDb } from './db-host.ts';
import { concordancePairs, parseHeadnoteDispositions } from './headnote-dispositions.ts';

/**
 * ONE printing is enough here, unlike the adjacency pass which requires two.
 *
 * The justification is the source, not optimism: an adjacency sighting is our
 * inference that two nearby citations refer to the same case, so corroboration
 * guards against a coincidence of layout. A headnote Case Law entry is the
 * official reporter stating the equivalence in a structured field with an
 * explicit `:` separator. There is no layout coincidence to guard against.
 *
 * `reconcile()` still drops anything contradicted, which is the protection that
 * actually matters.
 */
const MIN_CORROBORATIONS = 1;

const dbUrl = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set. Run with `npx tsx --env-file=.env`.');
  process.exit(2);
}
const apply = process.argv.includes('--apply');
const sql = await openDb(dbUrl, 4);

try {
  console.log(`harvesting headnote concordance${apply ? '' : ' (DRY RUN)'}…`);

  /**
   * **Scoped to the Supreme Court, and the reason is not performance alone.**
   *
   * SCR *is* the Supreme Court Reports, and the headnote "Case Law" apparatus —
   * grouped `– overruled.` markers with paired `SCR : SCC` citations — is that
   * reporter's own editorial structure. A High Court judgment cites cases; it
   * does not carry an SCR headnote.
   *
   * It also matters practically: an unrestricted `full_text ~ …` is a sequential
   * scan over ~9 GB across 850k rows, then ships ~500 KB per hit through a proxy
   * that 24 ingest workers are already saturating. The first attempt ran for
   * minutes without producing a row. Scoped, it reads ~38k rows.
   *
   * **TESTED BOTH WAYS, and the scoping turns out to cost nothing.**
   *
   * The SQL predicate matches **1,793** Supreme Court judgments and **1,891**
   * across all courts. That looked like scoping was discarding ~98 judgments'
   * worth of concordance — so `--all-courts` was run to find out.
   *
   * It produced **identical** downstream numbers: 5,787 sightings, 3,927
   * aliases, 3,873 resolved. **Those ~98 High Court judgments yield ZERO
   * pairs.** They quote a paired citation in running prose; they do not carry a
   * Case Law list with disposition markers, so the parser correctly rejects
   * them.
   *
   * So the SQL predicate is a coarse pre-filter and the parser is the real
   * gate — which is the right division. `--all-courts` remains for re-testing
   * this whenever the corpus shape changes; scoped is the default because it is
   * ~20x cheaper and, measured, loses nothing.
   */
  const allCourts = process.argv.includes('--all-courts');
  /**
   * `String.raw` and a bound parameter, NOT an inline literal — this repo has
   * now lost time to backslash collapse **four times**.
   *
   * The measurement that was about to justify writing 2,514 rows used
   * `'SCR [0-9]+ : \([0-9]{4}\)'` inline. Inside a template literal a lone
   * backslash before `(` is dropped, so Postgres received `([0-9]{4})` — a
   * CAPTURE GROUP rather than a literal paren — and quietly matched a different,
   * much smaller population: **659 instead of 1,890**. No error, just a wrong
   * number that looked plausible enough to reason about for an hour.
   *
   * With `String.raw` what is written is what Postgres receives.
   */
  const PAIRED_IN_TEXT = String.raw`SCR [0-9]+ : \([0-9]{4}\)`;
  const judgments = await sql<{ id: string; neutral_citation: string | null; full_text: string }[]>`
    SELECT id, neutral_citation, full_text
      FROM judgments
     WHERE full_text ~ ${PAIRED_IN_TEXT}
       ${allCourts ? sql`` : sql`AND court ILIKE '%supreme%'`}`;
  console.log(
    `  ${judgments.length} judgments print a paired SCR : SCC citation` +
      `${allCourts ? ' (all courts)' : ' (Supreme Court only — --all-courts to sweep everything)'}`,
  );

  const sightings: ParallelPair[] = [];
  for (const j of judgments) {
    for (const p of concordancePairs(parseHeadnoteDispositions(j.full_text ?? ''))) {
      sightings.push({
        alias: p.scc,
        aliasReporter: 'SCC',
        scr: p.scr,
        evidence: `${p.name} — printed in ${j.neutral_citation ?? j.id}`,
      });
    }
  }
  console.log(`  ${sightings.length} paired sightings parsed from Case Law lists`);

  const candidates = reconcile(sightings);
  const contradicted = new Set(sightings.map((s) => aliasKey(s.alias))).size - candidates.length;
  console.log(`  ${candidates.length} distinct aliases survived reconciliation`);
  console.log(`  ${contradicted} DROPPED because sightings disagreed about the target`);

  const trusted = candidates.filter((c) => c.corroborations >= MIN_CORROBORATIONS);

  /**
   * RESOLVED IN MEMORY, and the SQL version it replaces is why.
   *
   * `concordance-cli.ts` does this join in Postgres and its comment says it uses
   * *"the expression migration 0026 indexes"*. **That index does not exist.**
   * The only index on the column is `judgments_reporter_citations_gin`, a plain
   * GIN over the raw array — and the query applies
   * `upper(regexp_replace(rc, …))` to every element, which no GIN on the raw
   * values can serve.
   *
   * So it degrades to a nested scan: 3,927 keys × 38,342 judgments × unnest ×
   * a regexp per element, roughly 150M regexp calls. The first run of this CLI
   * died there with no error — the process simply went away mid-query.
   *
   * The same claim-a-guard-that-was-never-wired-in shape as `CURRENT_PLAN.md`
   * Q1.23, and worth noting that the existing pass carries the same latent cost;
   * it survives only because it feeds far fewer keys.
   *
   * Only **38,342** judgments carry `reporter_citations` at all — exactly the
   * Supreme Court, which independently corroborates the scoping above. That is
   * a trivial amount to pull and key locally with the same `aliasKey()` the
   * candidates were built with, which also removes any chance of the SQL and TS
   * normalisations drifting apart.
   */
  const holders = await sql<{ id: string; reporter_citations: string[] | null }[]>`
    SELECT id::text, reporter_citations
      FROM judgments
     WHERE reporter_citations IS NOT NULL AND array_length(reporter_citations, 1) > 0`;

  const keyToIds = new Map<string, Set<string>>();
  for (const h of holders) {
    for (const rc of h.reporter_citations ?? []) {
      const k = aliasKey(rc);
      if (!k) continue;
      const set = keyToIds.get(k) ?? new Set<string>();
      set.add(h.id);
      keyToIds.set(k, set);
    }
  }
  console.log(`  ${holders.length} judgments carry reporter_citations · ${keyToIds.size} distinct keys`);

  const scrKeys = [...new Set(trusted.map((c) => c.scrKey))];
  const resolved = scrKeys
    .map((key) => {
      const ids = keyToIds.get(key);
      return ids ? { key, id: [...ids][0]!, n: ids.size } : null;
    })
    .filter((r): r is { key: string; id: string; n: number } => r !== null);

  const byKey = new Map(resolved.map((r) => [r.key, r]));
  // An SCR form matching two held judgments is the same contradiction as an
  // alias pointing two ways. Refuse it for the same reason.
  const ambiguous = resolved.filter((r) => r.n > 1).length;
  const final = trusted
    .map((c) => ({ c, r: byKey.get(c.scrKey) }))
    .filter((x): x is { c: (typeof trusted)[number]; r: { key: string; id: string; n: number } } =>
      Boolean(x.r && x.r.n === 1),
    )
    .map((x) => ({ ...x.c, judgmentId: x.r.id }));

  console.log(`  ${byKey.size} of ${scrKeys.length} SCR forms resolve to a held judgment`);
  console.log(`  ${ambiguous} refused — the SCR form matched more than one judgment`);
  console.log(`\n  ${final.length} aliases ready`);

  const existing = await sql<{ n: number }[]>`
    SELECT count(*)::int n FROM judgment_citation_aliases
     WHERE alias_key = ANY(${final.map((f) => f.aliasKey)})`;
  console.log(`  ${existing[0]?.n ?? 0} already recorded · ${final.length - (existing[0]?.n ?? 0)} new`);

  for (const f of final.slice(0, 10)) {
    console.log(`    ${f.alias.padEnd(22)} → ${f.judgmentId.slice(0, 8)}  ${f.evidence.slice(0, 58)}`);
  }

  // Does this actually move the thing it was built for?
  const unresolved = await sql<{ n: number }[]>`
    SELECT count(DISTINCT normalised_citation)::int n
      FROM judgment_citations
     WHERE relationship IN ('overruled','overruled_in_part','doubted')
       AND cited_judgment_id IS NULL
       AND upper(regexp_replace(normalised_citation, '[^A-Za-z0-9]', '', 'g')) = ANY(${final.map((f) => f.aliasKey)})`;
  console.log(`\n  of the 34 unresolved adverse edges, ${unresolved[0]?.n ?? 0} are named by an alias this pass produces`);

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  } else {
    // Batched: one statement per alias is thousands of round trips over a
    // proxy, which is the latency lesson already paid for in concordance-cli.
    const CHUNK = 500;
    let written = 0;
    for (let i = 0; i < final.length; i += CHUNK) {
      const batch = final.slice(i, i + CHUNK).map((f) => ({
        judgment_id: f.judgmentId,
        alias: f.alias,
        alias_key: f.aliasKey,
        alias_reporter: f.aliasReporter,
        corroborations: f.corroborations,
        evidence: f.evidence.slice(0, 500),
      }));
      await sql`
        INSERT INTO judgment_citation_aliases ${sql(batch)}
        ON CONFLICT (alias_key) DO UPDATE SET corroborations = EXCLUDED.corroborations`;
      written += batch.length;
      process.stdout.write(`\r  written ${written}/${final.length}`);
    }
    console.log(`\n\nWROTE ${written} aliases. cited_judgment_id, overruled_status and verification_state are untouched.`);
  }
} finally {
  await sql.end();
}
