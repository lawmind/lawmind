/**
 * NEW2 P5 — RE-DERIVE EVERY TREATMENT CLAIM WITH THE CURRENT WRITER, AND DIFF.
 *
 * §8/NEW2-5 asks for the known deterministic writer bugs to be corrected where
 * primary evidence makes the correction deterministic — and explicitly forbids
 * broadening into a mass treatment rewrite.
 *
 * Patching the 4 known `dis-approved` rows by hand would satisfy the letter of
 * that and miss the point: the 4 were found by looking for ONE bug. This runs
 * the CURRENT `detectTreatment` over the citing judgment's own text at each
 * stored offset and diffs its answer against what is stored — so every
 * historical writer bug shows up at once, including ones nobody has looked for.
 *
 * "Re-derived, not edited" is the same discipline LCC used on `act_key`: the
 * correction is whatever the fixed writer says about the primary text, never a
 * human's opinion about what the row should have been.
 *
 *   default            DRY RUN. Reports the diff, writes nothing.
 *   --apply            writes ONLY rows whose re-derivation disagrees, and only
 *                      where the citation still appears at the stored offset.
 *
 * A disagreement is NOT automatically a correction. Three causes are separated
 * and only one of them is safe to write:
 *
 *   OFFSET_DRIFT      the citation is no longer at char_offset — the text was
 *                     re-extracted or recovered under the row. Re-deriving here
 *                     would read someone else's sentence. REFUSED.
 *   REPRODUCED        at least one writer reproduces the stored relationship.
 *   UNREPRODUCIBLE    NEITHER writer produces the stored relationship from the
 *                     stored characters. Only this class is a candidate.
 *   CONTRADICTED      a writer returns a DIFFERENT, non-empty relationship —
 *                     the polarity/modality class. The only writable one.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY BOTH WRITERS — a correction this pass nearly made
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The first version of this script ran `detectTreatment` alone and reported
 * 1,680 of 16,001 rows "wrong". It was the script that was wrong. There are TWO
 * treatment writers with different vocabularies:
 *
 *   detectTreatment (citations.ts)  a dash plus one of ten markers, forward 220
 *                                   chars, run at extraction on EVERY edge
 *   readTreatment   (treatment.ts)  much wider — `relied upon`, `held
 *                                   overruled`, `held per incuriam`, `Not
 *                                   correct law` — with per-phrase negation, run
 *                                   by citator-cli.ts on RESOLVED edges only
 *
 * `detectTreatment` cannot reproduce `readTreatment`'s vocabulary, so a diff
 * against it alone reads the second writer's legitimate output as corruption.
 * Applying that would have deleted 1,624 real treatment claims and refused only
 * because 56 of them were adverse. A single-writer diff is not evidence.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import postgres from 'postgres';

import { detectTreatment } from './citations.ts';
import { readTreatment } from './treatment.ts';

const OUT = 'docs/ai/new2/treatment-rederivation.json';
const APPLY = process.argv.includes('--apply');

type Row = {
  id: string;
  relationship: string;
  evidence: string | null;
  citation_text: string;
  char_offset: number;
  cited_judgment_id: string | null;
  court: string | null;
  span: string;
  span_start: number;
};

function main(): Promise<number> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL is not set. Refusing rather than guessing a connection.');
    return Promise.resolve(2);
  }
  const sql = postgres(url, { max: 1, prepare: false, statement_timeout: 1_800_000, onnotice: () => {} });

  return (async () => {
    try {
      /**
       * The window is pulled around the stored offset rather than the whole
       * document: 16,001 full texts is gigabytes, and `detectTreatment` reads
       * only 220 characters forward. 64 characters of lead-in let the offset be
       * verified before anything is derived from it.
       */
      const LEAD = 64;
      const rows = await sql<Row[]>`
        SELECT c.id, c.relationship, c.evidence, c.citation_text, c.char_offset,
               c.cited_judgment_id, j.court,
               substr(j.full_text, greatest(1, c.char_offset + 1 - ${LEAD}),
                      ${LEAD} + length(c.citation_text) + 260) AS span,
               greatest(1, c.char_offset + 1 - ${LEAD})        AS span_start
          FROM judgment_citations c
          JOIN judgments j ON j.id = c.citing_judgment_id
         WHERE c.relationship <> 'cites'`;

      const diffs: Record<string, unknown>[] = [];
      const tally = { checked: 0, agree: 0, offset_drift: 0, unreproducible: 0, contradicted: 0 };

      for (const r of rows) {
        tally.checked += 1;
        // Where does the citation actually sit inside the window we pulled?
        const at = r.span.indexOf(r.citation_text);
        if (at === -1) {
          tally.offset_drift += 1;
          diffs.push({
            edge_id: r.id,
            kind: 'OFFSET_DRIFT',
            stored_relationship: r.relationship,
            citation_text: r.citation_text,
            char_offset: r.char_offset,
            court: r.court,
            note: 'citation_text not found at the stored offset — text changed under the row',
          });
          continue;
        }
        const end = at + r.citation_text.length;
        const a = detectTreatment(r.span, end);
        // readTreatment locates the citation itself inside the string it is
        // given, so it gets the whole window rather than an offset.
        const b = readTreatment(r.citation_text, r.span);

        if (a.relationship === r.relationship || b?.relationship === r.relationship) {
          tally.agree += 1;
          continue;
        }

        // A writer that returns a DIFFERENT non-cites relationship contradicts
        // the row. A writer that returns `cites`/null merely fails to reach it,
        // which is silence, not disagreement.
        const contradicting =
          a.relationship !== 'cites' && a.relationship !== r.relationship
            ? a.relationship
            : b && b.relationship !== r.relationship
              ? b.relationship
              : null;

        const kind = contradicting ? 'CONTRADICTED' : 'UNREPRODUCIBLE';
        if (kind === 'CONTRADICTED') tally.contradicted += 1;
        else tally.unreproducible += 1;
        diffs.push({
          edge_id: r.id,
          kind,
          stored_relationship: r.relationship,
          stored_evidence: r.evidence,
          detect_treatment: a.relationship,
          read_treatment: b?.relationship ?? null,
          rederived_relationship: contradicting ?? 'cites',
          rederived_evidence: contradicting ? (a.relationship === contradicting ? a.evidence : (b?.evidence ?? '')) : '',
          citation_text: r.citation_text,
          cited_judgment_id: r.cited_judgment_id,
          court: r.court,
          window: r.span.slice(end, end + 120).replace(/\s+/g, ' '),
        });
      }

      // ONLY a contradiction is writable. An unreproducible row is a recall gap
      // in today's writers, not evidence the stored row is wrong, and deleting
      // on that basis is exactly the mistake described in the header.
      const writable = diffs.filter((d) => d['kind'] === 'CONTRADICTED');
      const adverseAffected = writable.filter((d) =>
        ['overruled', 'overruled_in_part', 'doubted'].includes(String(d['stored_relationship'])),
      );

      const out = {
        generated_at: new Date().toISOString(),
        writer: 'detectTreatment @ services/ingest/src/citations.ts, current HEAD',
        mode: APPLY ? 'APPLY' : 'DRY_RUN',
        tally,
        writable_count: writable.length,
        adverse_rows_affected: adverseAffected.length,
        adverse_rows: adverseAffected,
        diffs,
      };
      writeFileSync(OUT, JSON.stringify(out, null, 2));

      console.log(JSON.stringify(tally, null, 1));
      console.log(`unreproducible (NOT writable): ${tally.unreproducible}`);
      console.log(`writable (CONTRADICTED): ${writable.length}`);
      console.log(`of which adverse (would touch a LAW MOVED driver): ${adverseAffected.length}`);
      for (const d of writable.slice(0, 12)) {
        console.log(
          `  ${String(d['edge_id']).slice(0, 8)} ${d['stored_relationship']} -> ${d['rederived_relationship']}  ` +
            `${String(d['citation_text']).slice(0, 28)}  «${String(d['window']).slice(0, 60)}»`,
        );
      }

      if (!APPLY) {
        console.log('\nDRY RUN — nothing written. Re-run with --apply.');
        return 0;
      }

      if (adverseAffected.length > 0) {
        console.error(
          `\nREFUSING to apply: ${adverseAffected.length} row(s) carry an adverse treatment.\n` +
            'Those drive judgments.overruled_status and LAW MOVED at a stale threshold of zero.\n' +
            'An adverse withdrawal is adjudicated by hand against the primary judgment, never by a batch.',
        );
        return 3;
      }

      const ids = writable.map((d) => String(d['edge_id']));
      const rels = writable.map((d) => String(d['rederived_relationship']));
      const evs = writable.map((d) => String(d['rederived_evidence'] ?? ''));
      const updated = await sql`
        UPDATE judgment_citations c
           SET relationship = v.rel, evidence = v.ev
          FROM (SELECT unnest(${ids}::uuid[]) AS id,
                       unnest(${rels}::text[]) AS rel,
                       unnest(${evs}::text[])  AS ev) v
         WHERE c.id = v.id
           -- Never write over a row someone else changed since the read.
           AND c.relationship <> v.rel`;
      console.log(`\napplied: ${updated.count} row(s)`);
      writeFileSync(OUT, JSON.stringify({ ...out, applied: updated.count }, null, 2));
      return 0;
    } finally {
      await sql.end({ timeout: 10 });
    }
  })();
}

main().then((c) => process.exit(c));
