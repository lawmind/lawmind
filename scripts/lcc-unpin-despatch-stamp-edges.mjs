#!/usr/bin/env node
/**
 * UNPIN REGISTRY DESPATCH STAMPS IN `judgment_citations`.
 *
 * The sibling of `lcc-purge-despatch-stamp-keys.mjs`, and the reason it needs a
 * sibling at all is the finding NEW2 sent in bus 1223 — which generalises well
 * past this one class:
 *
 *     **A citation can be pinned to an authority in THREE places, and a fix to
 *     one is not a fix to the others.**
 *
 *       1. `judgment_citation_keys`     the key index      — purged 24 Aug
 *       2. `resolver.ts` at lookup time  the live answer    — gated 24 Aug
 *       3. `judgment_citations.cited_judgment_id`           — **still pinned**
 *
 * The third is a MATERIALISED edge written by the extraction pass. It predates
 * both fixes, and a gate that refuses a stamp at lookup does not un-write an
 * edge that was resolved before the gate existed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS ACTUALLY WRONG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `judgments.neutral_citation` on 431 Madras judgments holds a despatch or
 * upload timestamp — `2011:FEBRUARY:11` — rather than a citation. The extractor
 * read the same string out of a CITING document's running text and the resolver
 * matched the two. NEW2 measured, live:
 *
 *     827 rows whose citation_text is a despatch stamp
 *      61 of them carry a cited_judgment_id  <-- pinned to one judgment each
 *      35 distinct stamps · 35 distinct targets · 61 citing documents
 *
 * Nothing cites `2011:FEBRUARY:11`. `docs/CITATION_HARNESS.md` forbids pinning a
 * citation to an authority on evidence that does not support it, and this is the
 * worse direction: **verified is silent**, so an advocate sees nothing at all to
 * distrust.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NULL AND NOT DELETE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `citation_text` is untouched. The extraction record survives and the row
 * becomes an UNRESOLVED reference rather than disappearing — silent-drop rate is
 * held at a threshold of zero and deleting the row would be a silent drop. It is
 * also reversible from the stamp itself.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ONE DEFINITION OF "IS THIS A CITATION", NOT TWO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW2 proposed the same regex `resolver.ts` already holds, and copying it into
 * SQL would make two definitions of citation identity that can drift — which is
 * exactly how a resolver and its index came to disagree in the first place.
 *
 * So the SQL pattern here is only a cheap PREFILTER, deliberately over-broad, and
 * every candidate it returns is then confirmed by `canonicalKeyFor` — the real
 * predicate, the one the resolver and the key builder both use. A row is unpinned
 * only when the authoritative function says "registry despatch stamp, not a
 * citation". If the two ever disagree, this script reports it rather than
 * silently trusting the prefilter.
 *
 *   node scripts/lcc-unpin-despatch-stamp-edges.mjs          dry run (default)
 *   node scripts/lcc-unpin-despatch-stamp-edges.mjs --apply
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');

/**
 * The prefilter. Over-broad on purpose: it costs an index-free scan of the
 * already-small resolved subset, and being over-broad is safe because
 * `canonicalKeyFor` has the final say. Being over-NARROW would not be safe —
 * a stamp it failed to return would stay pinned and nothing would say so.
 */
const PREFILTER = String.raw`^[0-9]{4}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*[0-9]{1,2}$`;

function databaseUrl() {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL'].trim();
  const m = readFileSync(join(REPO, '.env'), 'utf8').match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error('no DATABASE_URL');
  return m[1].trim();
}

async function main() {
  const { canonicalKeyFor } = await import('../services/api/src/citations/resolver.ts');
  const { default: postgres } = await import(
    '../services/ingest/node_modules/postgres/src/index.js'
  );
  const sql = postgres(databaseUrl(), { max: 1, onnotice: () => {} });

  try {
    const candidates = await sql`
      SELECT id::text AS id, citation_text, cited_judgment_id::text AS cited, relationship
        FROM judgment_citations
       WHERE cited_judgment_id IS NOT NULL
         AND upper(regexp_replace(citation_text, '[^A-Za-z0-9]', '', 'g')) ~ ${PREFILTER}`;

    console.log(`prefilter returned ${candidates.length} pinned row(s)`);

    const confirmed = [];
    const disagreed = [];
    for (const row of candidates) {
      const gate = canonicalKeyFor(row.citation_text);
      if (gate.refused && gate.why === 'registry despatch stamp, not a citation') {
        confirmed.push(row);
      } else {
        disagreed.push({ ...row, verdict: gate.refused ? gate.why : `ACCEPTED as key ${gate.key}` });
      }
    }

    if (disagreed.length) {
      // Reported loudly. The prefilter and the real predicate disagreeing is a
      // finding about the predicate, not a row to quietly skip.
      console.log('');
      console.log(
        `PREFILTER AND canonicalKeyFor DISAGREE on ${disagreed.length} row(s) — NOT unpinning these:`,
      );
      for (const d of disagreed.slice(0, 20)) {
        console.log(`  "${d.citation_text}" -> ${d.verdict}`);
      }
    }

    console.log('');
    console.log(`confirmed despatch stamps carrying a pin: ${confirmed.length}`);
    const byRelationship = new Map();
    for (const r of confirmed) {
      byRelationship.set(r.relationship, (byRelationship.get(r.relationship) ?? 0) + 1);
    }
    for (const [rel, n] of byRelationship) console.log(`  relationship=${rel}  ${n}`);
    console.log(`  distinct stamps  ${new Set(confirmed.map((r) => r.citation_text)).size}`);
    console.log(`  distinct targets ${new Set(confirmed.map((r) => r.cited)).size}`);

    /**
     * The blast-radius check, run every time rather than trusted from the last
     * run. A stamp pinned by a TREATMENT relationship, or pointing at a judgment
     * that carries a LAW MOVED badge, would mean unpinning changes what an
     * advocate is told about the currentness of the law — and that is a decision,
     * not a cleanup. Measured 25 Aug: 61 rows, all `cites`, zero such targets.
     */
    const treatmentPins = confirmed.filter((r) =>
      ['overruled', 'overruled_in_part', 'doubted'].includes(r.relationship),
    );
    const targets = [...new Set(confirmed.map((r) => r.cited))];
    const moved = targets.length
      ? await sql`SELECT id::text AS id, overruled_status FROM judgments
                   WHERE id = ANY(${targets}::uuid[]) AND overruled_status <> 'none'`
      : [];

    console.log('');
    console.log(`BLAST RADIUS  treatment-relationship pins: ${treatmentPins.length}`);
    console.log(`              targets carrying LAW MOVED : ${moved.length}`);
    if (treatmentPins.length || moved.length) {
      console.log('');
      console.log(
        'REFUSING TO APPLY: unpinning would change what an advocate is told about\n' +
          'the currentness of the law. That is a decision to take deliberately with\n' +
          'NEW2, not a cleanup to run from a script.',
      );
      return;
    }

    if (!confirmed.length) {
      console.log('\nnothing to unpin.');
      return;
    }
    if (!APPLY) {
      console.log('\nDRY RUN. Nothing written. Re-run with --apply.');
      return;
    }

    const ids = confirmed.map((r) => r.id);
    const updated = await sql`
      UPDATE judgment_citations
         SET cited_judgment_id = NULL
       WHERE id = ANY(${ids}::uuid[])
         AND cited_judgment_id IS NOT NULL
      RETURNING id::text AS id`;

    const [after] = await sql`
      SELECT count(*)::int AS n FROM judgment_citations
       WHERE cited_judgment_id IS NOT NULL
         AND upper(regexp_replace(citation_text, '[^A-Za-z0-9]', '', 'g')) ~ ${PREFILTER}`;
    const [text] = await sql`
      SELECT count(*)::int AS n FROM judgment_citations
       WHERE upper(regexp_replace(citation_text, '[^A-Za-z0-9]', '', 'g')) ~ ${PREFILTER}`;

    console.log('');
    console.log(`unpinned ${updated.length} row(s)`);
    console.log(`  still pinned after     ${after.n}   (must be 0)`);
    console.log(`  rows still PRESENT     ${text.n}   (citation_text untouched — no silent drop)`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
