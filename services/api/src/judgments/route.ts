/**
 * `GET /judgments/:id` — `docs/API_CONTRACTS.md` §Search.
 *
 * The reading view's only route. Until it shipped, a judgment found by search
 * could not be opened: RCC could exercise the reading view against fixtures only,
 * and a deep link into the real corpus rendered an honest dead end.
 *
 * Every field comes from the `judgments` row. `overruled_status` is selected here
 * on every request, live — never cached, never denormalised, never carried across
 * a request. `docs/CITATION_HARNESS.md` §Overruled status is never cached.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { fail, ok } from '../envelope.ts';

export const judgmentParams = z.object({ id: z.string().uuid() });

type JudgmentRow = {
  id: string;
  case_title: string;
  neutral_citation: string | null;
  reporter_citations: string[];
  court: string;
  bench: string | null;
  judgment_date: string;
  case_number: string | null;
  case_type: string | null;
  language: string;
  source_url: string;
  full_text: string;
  overruled_status: string;
  overruled_by_judgment_id: string | null;
  overruled_paras: number[] | null;
  overruled_note: string | null;
};

export async function getJudgment(c: Context, sql: Sql, id: string): Promise<Response> {
  const [row] = await sql<JudgmentRow[]>`
    SELECT id, case_title, neutral_citation, reporter_citations, court, bench,
           -- ::text keeps this a calendar date. The column is a date; the driver
           -- otherwise hydrates it to a Date and JSON renders a midnight
           -- timestamp, so the client would show a time a judgment never had.
           judgment_date::text AS judgment_date,
           case_number, case_type, language, source_url, full_text,
           overruled_status, overruled_by_judgment_id, overruled_paras, overruled_note
    FROM judgments WHERE id = ${id}
  `;

  if (!row) return fail(c, 'NOT_FOUND', 'no judgment with that id', 404);

  // The server's read time for `overruledStatus`, never the client's receipt
  // time. An offline surface renders the status it last read WITH this date.
  const asOf = new Date().toISOString();

  // One citation_checks row per citation per surface. Written here for the same
  // reason it is written on search: silent-drop and stale-overruled are computed
  // from these rows, and a surface that renders a citation without recording it
  // is invisible to both metrics.
  await sql`
    INSERT INTO citation_checks
      (search_id, citation_claimed, judgment_id_matched, verification_state,
       verified_by_source, shown_to_user, overruled_status_shown, surface)
    VALUES (NULL,
            ${row.neutral_citation ?? row.reporter_citations[0] ?? row.case_title},
            ${row.id}, 'verified', 'corpus', true, ${row.overruled_status}, 'judgment_detail')
  `;

  return ok(c, {
    judgmentId: row.id,
    caseTitle: row.case_title,
    neutralCitation: row.neutral_citation,
    reporterCitations: row.reporter_citations,
    court: row.court,
    bench: row.bench,
    judgmentDate: row.judgment_date,
    caseNumber: row.case_number,
    caseType: row.case_type,
    language: row.language,
    sourceUrl: row.source_url,
    fullText: row.full_text,
    // Tier 1 by construction: this row IS the corpus, so it resolves to itself.
    // Not a placeholder — `verified` / `corpus` is the honest value in S1.
    verificationState: 'verified' as const,
    verifiedBySource: 'corpus' as const,
    overruledStatus: row.overruled_status,
    overruledByJudgmentId: row.overruled_by_judgment_id,
    overruledParas: row.overruled_paras,
    overruledNote: row.overruled_note,
    asOf,
  });
}
