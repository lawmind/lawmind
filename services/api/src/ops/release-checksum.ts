/**
 * THE RELEASE CHECKSUM — one implementation, used by export AND restore.
 *
 * Both CLIs used to carry their own copy of
 *
 *     md5(string_agg(md5(row), '' ORDER BY ord))
 *
 * and it cannot run on the full corpus. `string_agg` builds ONE server-side
 * value of 32 bytes per row, and PostgreSQL refuses any string past 1 GB:
 *
 *     ERROR: string buffer exceeds maximum allowed length (1073741823 bytes)
 *
 * measured in LCC R32B at 34,000,000 rows. `judgment_paragraphs` holds 91.8M,
 * so the first full export would have died on its first checksum.
 *
 * The fix streams the per-row digests to this process in order and feeds them
 * into ONE incremental md5. md5 over a sequence of `update()` calls equals md5
 * over their concatenation, so the value is byte-identical to the old SQL
 * aggregate — every manifest already written stays verifiable — and there is no
 * ceiling. An empty table hashes to md5('') on both paths.
 *
 * Why per-row md5 first: hashing each row to 32 characters bounds the transfer
 * by ROW COUNT, not content size (`judgments` carries full text).
 *
 * Why a NAME-ORDERED `concat_ws` projection rather than `row::text`: the live
 * schema's column ordinals have drifted from a migrated-from-empty schema, and
 * composite rendering quotes by an LC_CTYPE-dependent `isspace()`. chr(31)
 * separates fields and chr(30) marks NULL so `(NULL,'a')` and `('a',NULL)`
 * cannot collide. Not cryptographic; the threat is a truncated transfer.
 */
import { createHash } from 'node:crypto';

import type postgres from 'postgres';

export function canonicalRowExpression(columns: readonly string[]): string {
  return `md5(concat_ws('', ${[...columns]
    .sort()
    .map((c) => `coalesce("${c}"::text, chr(30))`)
    .join(', chr(31), ')}))`;
}

export async function releaseChecksum(
  sql: postgres.Sql,
  table: string,
  orderBy: string,
  where: string,
  columns: readonly string[],
  batch = 20_000,
): Promise<{ rows: number; checksum: string }> {
  const hash = createHash('md5');
  let rows = 0;
  const cursor = sql
    .unsafe<{ h: string }[]>(
      `SELECT ${canonicalRowExpression(columns)} AS h FROM ${table} ${where} ORDER BY ${orderBy}`,
    )
    .cursor(batch);
  for await (const chunk of cursor) {
    for (const r of chunk) hash.update(r.h);
    rows += chunk.length;
  }
  return { rows, checksum: hash.digest('hex') };
}
