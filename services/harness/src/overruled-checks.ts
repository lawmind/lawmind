/**
 * The two overruled metrics, measured by CONSTRUCTING the situation instead of
 * waiting for production to produce it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NOT READ `citation_checks`
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The obvious implementation is to compare `citation_checks.overruled_status_shown`
 * against the judgment's status now, over live rows. `admin/citations.ts` does
 * exactly that and should. But as a GATE it has a defect that only shows up
 * before launch: with no traffic there are no rows, the rate is null, and the
 * gate reports "not measured" forever. Gate S2 would then be blocked on having
 * users — and the entire point of Gate S2 is to be passed BEFORE there are any.
 *
 * `CITATION_HARNESS.md` §blind spots names the deeper version of the same trap:
 * *a corpus that never learned an overruling reads 0.0% stale while advocates
 * see stale badges, because both sides of the comparison agree.* A metric that
 * compares the system against itself cannot fail.
 *
 * So these two checks make the law move, on purpose, and watch what the
 * retrieval path says about it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT WRITES, AND THEN IT DOES NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The staleness check runs inside a transaction that is **always rolled back**,
 * by throwing a sentinel after the observation. There is no code path that
 * commits it: the rollback is the exception's doing, not a call we might forget.
 * The harness normally runs against the real corpus, and a metric that leaves
 * a judgment marked `set_aside` because a run died halfway would be a citation
 * failure caused by the citation gate.
 *
 * A brief row lock is the cost. It is worth it — this is the only way to
 * OBSERVE the never-cached rule rather than to read the code and believe it.
 */
import { hybridSearch } from '@lawmind/api/search/retrieve';
import type { Sql } from 'postgres';

/** Thrown to roll the probe back. Never escapes `measureStaleOverruled`. */
class Rollback extends Error {
  constructor(readonly observed: string | null) {
    super('harness probe rollback');
  }
}

type OverruledRow = {
  id: string;
  case_title: string;
  overruled_status: string;
};

/**
 * A query that should retrieve this judgment: its own case title.
 *
 * Not a clever query. The check is not about ranking — `scoreQuery` measures
 * that — it is about whether the status travels with the result. The title is
 * the strongest possible signal, so a miss here means the judgment is
 * unreachable, which is reported separately rather than folded into leakage.
 */
function titleQuery(title: string): string {
  return title
    .replace(/\bversus\b|\bv\.\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export type OverruledLeakage = {
  tested: number;
  retrieved: number;
  /** Retrieved with a status that disagrees with the row. THE metric. */
  leaked: number;
  detail: { judgmentId: string; caseTitle: string; expected: string; got: string | null }[];
};

/**
 * **Leakage: an overruled judgment retrieved without its overruled status.**
 *
 * Threshold 0, and graded as severely as a hallucination, because the advocate
 * who relies on a set-aside authority is in the same position as the one who
 * cites a case that never existed — worse, arguably, since this one survives a
 * check of whether the case is real.
 *
 * A judgment we could not retrieve at all is NOT counted as a leak. It is a
 * different failure and reported as `tested - retrieved`; calling it leakage
 * would let a retrieval regression improve this number.
 */
export async function measureOverruledLeakage(sql: Sql): Promise<OverruledLeakage> {
  const rows = await sql<OverruledRow[]>`
    SELECT id, case_title, overruled_status::text AS overruled_status
      FROM judgments
     WHERE overruled_status <> 'none'
     ORDER BY id
     LIMIT 50
  `;

  const detail: OverruledLeakage['detail'] = [];
  let retrieved = 0;

  for (const row of rows) {
    // Lexical only. The dense half needs an embedder this check does not
    // require: a case title is exactly what full-text search is good at.
    const results = await hybridSearch(sql, titleQuery(row.case_title), null, {}, 10);
    const hit = results.find((r) => r.judgmentId === row.id);
    if (!hit) continue;
    retrieved++;
    if (hit.overruledStatus !== row.overruled_status) {
      detail.push({
        judgmentId: row.id,
        caseTitle: row.case_title,
        expected: row.overruled_status,
        got: hit.overruledStatus ?? null,
      });
    }
  }

  return { tested: rows.length, retrieved, leaked: detail.length, detail };
}

export type StaleOverruled = {
  tested: number;
  /** Retrieval returned the OLD status after the law moved. THE metric. */
  stale: number;
  detail: { judgmentId: string; setTo: string; observed: string | null }[];
};

/**
 * **Staleness: does a status change reach the next read?**
 *
 * `CITATION_HARNESS.md`: overruledness is never cached — it lives on
 * `judgments`, it changes when a later judgment moves the law, and a permanent
 * cache would go stale silently. "Silently" is the word that makes this
 * untestable by inspection: nothing fails, the badge is simply wrong.
 *
 * So: move the law inside a transaction, read it back through the same
 * retrieval path a request uses, and roll back. If the read returns the old
 * value, something between the column and the caller is holding a copy.
 *
 * `doubted` is the value written, deliberately. It is the one overruled state
 * that shows no banner, so a check that used `set_aside` could pass by way of a
 * banner-specific code path while the underlying field was still cached.
 */
export async function measureStaleOverruled(sql: Sql, sampleSize = 10): Promise<StaleOverruled> {
  const rows = await sql<{ id: string; case_title: string }[]>`
    SELECT id, case_title FROM judgments
     WHERE overruled_status = 'none'
     ORDER BY md5(id::text)
     LIMIT ${sampleSize}
  `;

  const detail: StaleOverruled['detail'] = [];

  for (const row of rows) {
    let observed: string | null = null;
    try {
      await sql.begin(async (tx) => {
        await tx`UPDATE judgments
                    SET overruled_status = 'doubted',
                        overruled_status_changed_at = now()
                  WHERE id = ${row.id}`;

        const results = await hybridSearch(
          tx as unknown as Sql,
          titleQuery(row.case_title),
          null,
          {},
          10,
        );
        const hit = results.find((r) => r.judgmentId === row.id);
        // Unretrievable is not stale — it is reported through `tested` only.
        throw new Rollback(hit ? hit.overruledStatus : null);
      });
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
      observed = error.observed;
    }

    if (observed !== null && observed !== 'doubted') {
      detail.push({ judgmentId: row.id, setTo: 'doubted', observed });
    }
  }

  return { tested: rows.length, stale: detail.length, detail };
}
