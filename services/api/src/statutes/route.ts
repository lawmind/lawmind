/**
 * Bare acts — the statute surface.
 *
 * `sprints/SPRINT_1.md` gives LCC the bare acts library and RCC a bare act
 * reading view, but `docs/API_CONTRACTS.md` carried no endpoint for either. These
 * are ADDITIONS to the frozen contract, not changes to an existing shape, so they
 * cannot break work already built against it.
 *
 * Everything renders from the row. Section text is government-published and is
 * never generated, summarised or reformatted here — `docs/DATASETS.md`.
 */
import type { Context } from 'hono';
import type { Sql } from 'postgres';
import { z } from 'zod';

import { ok } from '../envelope.ts';
import { isoColumn } from '../iso-time.ts';

export const sectionQuery = z.object({
  actId: z.string().uuid().optional(),
  /** Exact section lookup, e.g. `103`. The daily-loop "what does s.103 say" case. */
  sectionNumber: z.string().max(16).optional(),
  /** Free text across headings and section text. */
  q: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(600).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type SectionQuery = z.infer<typeof sectionQuery>;

type StatuteRow = {
  id: string;
  short_title: string;
  hindi_title: string | null;
  act_number: string;
  act_year: number;
  enactment_date: string | null;
  enforcement_date: string | null;
  ministry: string | null;
  source_url: string;
  section_count: number;
};

export async function listStatutes(c: Context, sql: Sql): Promise<Response> {
  const rows = await sql<StatuteRow[]>`
    SELECT s.id, s.short_title, s.hindi_title, s.act_number, s.act_year,
           s.enactment_date::text AS enactment_date,
           s.enforcement_date::text AS enforcement_date,
           s.ministry, s.source_url,
           count(sec.id)::int AS section_count
    FROM statutes s
    LEFT JOIN statute_sections sec ON sec.statute_id = s.id
    GROUP BY s.id
    ORDER BY s.act_year DESC, s.act_number
  `;

  /**
   * How much of the source we actually hold.
   *
   * The client lane caught this rendering the library: `/statutes` returned 207
   * Acts, and 206 on the call before, because the ingest was running live —
   * and nothing in the response said so. **A library rendered as complete when it
   * is not misstates what we hold**, and an advocate searching for an Act we have
   * not reached yet concludes we do not have it.
   *
   * Same argument this codebase already accepted for `truncated` on the precedent
   * graph and `resolvedAuthorities` on the point-in-time endpoint: a count
   * without its denominator invites the reader to assume completeness.
   *
   * `held` is counted here, on every read, never cached — a stale count is the
   * lie this exists to prevent. `sourceTotal` is what the SOURCE reports, and it
   * is null until an enumeration has run: unknown is a state, not zero.
   */
  const [cov] = await sql<
    {
      source_total: number | null;
      enumerated_at: string | null;
      complete: boolean;
      failed: number;
    }[]
  >`
    SELECT source_total, ${sql.unsafe(isoColumn('enumerated_at'))} AS enumerated_at, complete,
           coalesce(array_length(failed_ids, 1), 0) AS failed
    FROM corpus_coverage WHERE source = 'indiacode_central_acts'
  `;

  return ok(c, {
    statutes: rows.map((r) => ({
      statuteId: r.id,
      shortTitle: r.short_title,
      hindiTitle: r.hindi_title,
      actNumber: r.act_number,
      actYear: r.act_year,
      enactmentDate: r.enactment_date,
      // Which regime applies to an offence turns on this date, not enactment.
      enforcementDate: r.enforcement_date,
      ministry: r.ministry,
      sourceUrl: r.source_url,
      sectionCount: r.section_count,
    })),
    coverage: {
      held: rows.length,
      /** Null means we have never enumerated the source, not that it is empty. */
      sourceTotal: cov?.source_total ?? null,
      /**
       * True only when a full pass finished. **The client must not infer
       * completeness from `held === sourceTotal`** — an ingest can reach the
       * count with Acts that failed and were retried into place, and can equal it
       * transiently mid-run.
       */
      complete: cov?.complete ?? false,
      /** Acts the last pass could not fetch. Named in `corpus_coverage`. */
      failedCount: cov?.failed ?? 0,
      enumeratedAt: cov?.enumerated_at ?? null,
      /**
       * True while a pass is in flight, false when one has finished, **null when
       * we have never enumerated and therefore do not know.**
       *
       * Nullable because a boolean cannot say "unknown", and returning `false`
       * for an absent row is a claim we cannot support. Caught in production:
       * `/statutes` reported `ingestInProgress: false` with 548 Acts and an
       * ingest actively running, because the pass predated this table. That is
       * the same shape of error as reporting an unrun verification tier as a
       * miss — an absent check is not a negative result.
       *
       * The client should read null as "we cannot tell you whether this library
       * is complete", which is weaker than either boolean and honest.
       */
      ingestInProgress: cov?.enumerated_at ? !cov.complete : null,
    },
    asOf: new Date().toISOString(),
  });
}

type SectionRow = {
  id: string;
  statute_id: string;
  short_title: string;
  section_number: string;
  heading: string | null;
  section_text: string;
  footnote: string | null;
  order_index: number;
  source_url: string;
};

export async function listSections(c: Context, sql: Sql, query: SectionQuery): Promise<Response> {
  const { actId, sectionNumber, q, limit, offset } = query;

  const rows = await sql<SectionRow[]>`
    SELECT sec.id, sec.statute_id, s.short_title, sec.section_number, sec.heading,
           sec.section_text, sec.footnote, sec.order_index, sec.source_url
    FROM statute_sections sec
    JOIN statutes s ON s.id = sec.statute_id
    WHERE TRUE
      ${actId ? sql`AND sec.statute_id = ${actId}` : sql``}
      ${sectionNumber ? sql`AND sec.section_number = ${sectionNumber}` : sql``}
      ${q ? sql`AND sec.full_text_tsv @@ plainto_tsquery('english', ${q})` : sql``}
    ${
      q
        ? sql`ORDER BY ts_rank(sec.full_text_tsv, plainto_tsquery('english', ${q})) DESC`
        : // The Act's own order. section_number does not sort lexically.
          sql`ORDER BY s.act_year DESC, sec.order_index`
    }
    LIMIT ${limit} OFFSET ${offset}
  `;

  const [counted] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM statute_sections sec
    WHERE TRUE
      ${actId ? sql`AND sec.statute_id = ${actId}` : sql``}
      ${sectionNumber ? sql`AND sec.section_number = ${sectionNumber}` : sql``}
      ${q ? sql`AND sec.full_text_tsv @@ plainto_tsquery('english', ${q})` : sql``}
  `;

  return ok(c, {
    sections: rows.map((r) => ({
      sectionId: r.id,
      statuteId: r.statute_id,
      shortTitle: r.short_title,
      sectionNumber: r.section_number,
      heading: r.heading,
      sectionText: r.section_text,
      footnote: r.footnote,
      orderIndex: r.order_index,
      sourceUrl: r.source_url,
    })),
    total: counted?.n ?? 0,
  });
}
