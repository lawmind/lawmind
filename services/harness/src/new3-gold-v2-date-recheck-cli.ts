/**
 * `pnpm --filter @lawmind/harness exec tsx --env-file=../../.env src/new3-gold-v2-date-recheck-cli.ts`
 *
 * NEW2 (bus 0954) measured the mechanism behind the 22 DATE_PLAUSIBILITY_FAIL
 * quarantines in `new3-semantic-expansion-gold-v2-rejected.json`: `judgment_date`
 * disagrees with an independent witness (the PDF filename, or the date the
 * document itself prints) on 4.45% of documents, and when it disagrees, the
 * document/filename is right 33 times out of 34. Their explicit suggestion for
 * my gold set: "before discarding any of them, the filename date on both
 * endpoints is worth reading -- if flipping the suspect endpoint to its
 * filename date makes the edge chronologically possible, the edge is real and
 * our date was wrong."
 *
 * This re-checks all 22 using NEW2's own `dateQuality()` from
 * `services/ingest/src/date-quality.ts` (imported, not reimplemented -- same
 * discipline this lane's other gold scripts already follow). For each
 * quarantined authority:
 *
 *   1. Fetch both endpoints' judgment_date, source_url, full_text live.
 *   2. Run dateQuality() on each -- DATE_VERIFIED (document itself confirms
 *      the stored date -- the chronological conflict is then LIKELY REAL, a
 *      citation-extraction defect, and stays quarantined with stronger
 *      evidence) vs DATE_SUSPECT/UNKNOWN (an independent witness disagrees or
 *      is silent).
 *   3. Where a witness date exists for the suspect endpoint, recompute the
 *      chronology using that witness date instead of the stored one.
 *   4. RECOVER (promote back into the v2 gold set) only when: at least one
 *      endpoint is DATE_SUSPECT or DATE_UNKNOWN (not DATE_VERIFIED -- an
 *      edge where BOTH ends are document-verified and still impossible is
 *      not a date defect, it is a real problem) AND the witness-corrected
 *      chronology becomes possible.
 *   5. Everything else stays quarantined, now with the dateQuality() verdict
 *      recorded as evidence rather than left as a bare date comparison.
 *
 * Nothing is silently reused: recovered rows carry a `recovery` provenance
 * block naming the exact witness and verdict that justified promotion.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import postgres, { type Sql } from 'postgres';
import { sslFor } from './db-url.ts';
import { dateQuality, DATE_QUALITY_VERSION } from '../../ingest/src/date-quality.ts';

async function main() {
  const url = process.env['CORPUS_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) {
    console.error('CORPUS_DATABASE_URL is not set.');
    process.exit(2);
  }

  const v2Path = new URL('../../../docs/ai/new3-semantic-expansion-gold-v2.json', import.meta.url);
  const rejPath = new URL('../../../docs/ai/new3-semantic-expansion-gold-v2-rejected.json', import.meta.url);
  const v1Path = new URL('../../../docs/ai/new3-semantic-expansion-gold.json', import.meta.url);
  const v2 = JSON.parse(readFileSync(v2Path, 'utf8'));
  const rejected = JSON.parse(readFileSync(rejPath, 'utf8'));
  const v1 = JSON.parse(readFileSync(v1Path, 'utf8'));

  type RejEntry = { goldJudgmentId: string; citingJudgmentId: string; reasons: string[]; rowIds: string[] };
  const dateFails: RejEntry[] = rejected.entries.filter((e: RejEntry) => e.reasons.some((r) => r.startsWith('DATE_PLAUSIBILITY_FAIL')));
  console.log(`re-checking ${dateFails.length} date-quarantined authorities`);

  const sql = postgres(url, { ssl: sslFor(url), max: 3 });
  try {
    const allIds = [...new Set(dateFails.flatMap((e) => [e.goldJudgmentId, e.citingJudgmentId]))];
    const rows = await sql<{ id: string; judgment_date: string | null; source_url: string | null; full_text: string | null }[]>`
      SELECT id::text, judgment_date::text, source_url, full_text
      FROM judgments
      WHERE id = ANY(${allIds}::uuid[])
    `;
    const byId = new Map(rows.map((r) => [r.id, r]));
    console.log(`fetched ${rows.length} of ${allIds.length} documents (incl. full_text)`);

    const recovered: RejEntry[] = [];
    const stillRejected: Array<RejEntry & { dateQualityEvidence: unknown }> = [];

    for (const e of dateFails) {
      const gold = byId.get(e.goldJudgmentId);
      const citing = byId.get(e.citingJudgmentId);
      if (!gold || !citing) {
        stillRejected.push({ ...e, dateQualityEvidence: { error: 'endpoint missing at recheck time' } });
        continue;
      }

      const goldQ = dateQuality({ judgmentDate: gold.judgment_date, sourceUrl: gold.source_url, text: gold.full_text });
      const citingQ = dateQuality({ judgmentDate: citing.judgment_date, sourceUrl: citing.source_url, text: citing.full_text });

      // Witness date to use in place of the stored one, if any: prefer document-printed (already the stored date when VERIFIED),
      // otherwise the filename witness recorded by dateQuality().
      const witnessDate = (q: typeof goldQ, stored: string | null) => {
        if (q.state === 'DATE_VERIFIED') return stored; // stored date IS the witness-confirmed date
        const fileWitness = q.witnesses.find((w) => w.kind === 'source_filename');
        return fileWitness ? fileWitness.date : null;
      };

      const goldWitness = witnessDate(goldQ, gold.judgment_date);
      const citingWitness = witnessDate(citingQ, citing.judgment_date);

      const bothVerified = goldQ.state === 'DATE_VERIFIED' && citingQ.state === 'DATE_VERIFIED';
      const correctedPossible = goldWitness !== null && citingWitness !== null ? goldWitness <= citingWitness : null;

      const evidence = {
        goldDateQuality: { state: goldQ.state, method: goldQ.method, witnesses: goldQ.witnesses },
        citingDateQuality: { state: citingQ.state, method: citingQ.method, witnesses: citingQ.witnesses },
        goldWitnessDate: goldWitness,
        citingWitnessDate: citingWitness,
        correctedChronologyPossible: correctedPossible,
        recoveryDenied: bothVerified ? 'both endpoints DATE_VERIFIED by their own document text -- not a date defect' : null,
      };

      if (!bothVerified && correctedPossible === true) {
        recovered.push(e);
        console.log(`RECOVERED ${e.goldJudgmentId.slice(0, 8)}: gold=${goldQ.state}(${goldWitness}) citing=${citingQ.state}(${citingWitness})`);
        // Record the recovery in the v1 source rows so promotion below has the corrected evidence
        (e as unknown as { evidence: unknown }).evidence = evidence;
      } else {
        stillRejected.push({ ...e, dateQualityEvidence: evidence });
      }
    }

    console.log(`\n${recovered.length} of ${dateFails.length} recovered, ${stillRejected.length} remain quarantined`);

    // Promote recovered authorities' rows from v1 back into v2, with recovery provenance.
    const v1Rows = v1.rows as Array<{ id: string; queryType: string; query: string; goldJudgmentId: string; relationship: string; provenance: Record<string, unknown> }>;
    let promotedRows = 0;
    for (const e of recovered) {
      const rows = v1Rows.filter((r) => r.goldJudgmentId === e.goldJudgmentId);
      for (const r of rows) {
        v2.rows.push({
          ...r,
          provenance: {
            ...r.provenance,
            queryClass: r.queryType,
            caseFamily: r.goldJudgmentId,
            allowedFeatureFamilies: ['lexical_similarity', 'dense_semantic_similarity', 'court_match', 'date_proximity'],
            prohibitedFeatureFamilies: ['inbound_citation_count', 'citation_graph_authority_score', 'pagerank_style_score'],
            ...(r.queryType !== 'proposition' ? { redacted: [], redactedReason: "not applicable: the query IS the target judgment's own citation string or case title by construction" } : {}),
            recovery: {
              recoveredAt: new Date().toISOString(),
              recoveredBy: 'NEW3',
              reason: 'bus 0954 (NEW2): judgment_date disagrees with an independent witness (filename/document text) on the suspect endpoint; the witness-corrected chronology is possible',
              evidence: (e as unknown as { evidence: unknown }).evidence,
              dateQualityModuleVersion: DATE_QUALITY_VERSION,
            },
          },
        });
        promotedRows++;
      }
    }
    v2.distinctGoldAuthorities = new Set(v2.rows.map((r: { goldJudgmentId: string }) => r.goldJudgmentId)).size;
    v2.totalRows = v2.rows.length;
    v2.quarantinedAuthorities = stillRejected.length + (rejected.entries.length - dateFails.length);
    v2.quarantinedRows = v2.quarantinedAuthorities > 0 ? rejected.entries.filter((e: RejEntry) => !recovered.some((r) => r.goldJudgmentId === e.goldJudgmentId)).reduce((n: number, e: RejEntry) => n + e.rowIds.length, 0) : 0;
    v2.recoveryPass = {
      appliedAt: new Date().toISOString(),
      method: "NEW2's date-quality.ts dateQuality(), re-verified live per authority; recovered only where an independent witness (not the stored date itself) makes the chronology possible AND at least one endpoint is not DATE_VERIFIED",
      candidatesChecked: dateFails.length,
      recovered: recovered.length,
      stillQuarantined: stillRejected.length,
    };

    const otherRejected = rejected.entries.filter((e: RejEntry) => !e.reasons.some((r) => r.startsWith('DATE_PLAUSIBILITY_FAIL')));
    rejected.entries = [...otherRejected, ...stillRejected];
    rejected.count = rejected.entries.length;
    rejected.recoveryPass = v2.recoveryPass;

    writeFileSync(v2Path, `${JSON.stringify(v2, null, 2)}\n`);
    writeFileSync(rejPath, `${JSON.stringify(rejected, null, 2)}\n`);

    console.log(`\npromoted ${promotedRows} rows across ${recovered.length} authorities`);
    console.log(`v2 now: ${v2.distinctGoldAuthorities} authorities / ${v2.totalRows} rows`);
    console.log(`wrote docs/ai/new3-semantic-expansion-gold-v2.json`);
    console.log(`wrote docs/ai/new3-semantic-expansion-gold-v2-rejected.json`);
  } finally {
    await sql.end();
  }
}

await main();
