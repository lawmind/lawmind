/**
 * Produce a reproducible manifest of embedding-eligible judgments for NEW1.
 *
 *   pnpm --filter @lawmind/embed run tier-manifest -- \
 *     [--tier A|A_CORE] [--limit N] [--page 1000] [--out DIR] [--count-only]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT A MANIFEST IS FOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW1 owns the GPU. LCC owns which documents are worth its time. A manifest is
 * the interface: a list of judgment ids, plus enough identity for the list to be
 * checked rather than trusted — the contract version, a hash of the DEPLOYED
 * view definition, the page size, the row count, and a hash of the ids
 * themselves.
 *
 * Two runs against an unchanged corpus and an unchanged definition produce the
 * same `idsHash`. That is the entire point: a measured precision figure is about
 * a specific population, and a population you cannot re-identify makes the
 * figure unfalsifiable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT ASKS THE RESOURCE GATE FIRST, AND IT TAKES NO FOR AN ANSWER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A full-tier manifest walks millions of rows. That is `DB_SCAN` class, and
 * NEW2 measured retrieval at p50 43s while work of this shape was running. So
 * the walk asks `scripts/resource-gate.mjs` and stops if the answer is DEFER —
 * unless `--force`, which exists because a human deciding to accept the cost is
 * legitimate and pretending the flag does not exist would just get the gate
 * bypassed some less visible way.
 *
 * A BOUNDED run (`--limit`) is LIGHT and is not gated: sampling a few thousand
 * rows to check the shape of the selector is not the thing that hurts.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import postgres from 'postgres';

import type { JobClass } from '../../../scripts/resource-gate.d.mts';
import { sslFor } from './db-ssl.ts';
import {
  checkView,
  CONTRACT_VERSION,
  type EligibleRow,
  page,
  pagePending,
  TIERS,
  type Tier,
} from './eligibility.ts';

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
function num(name: string, fallback: number): number {
  const v = flag(name);
  return v === undefined ? fallback : Number(v);
}
function has(name: string): boolean {
  return process.argv.includes(name);
}

/** DEFER is a normal answer here, so it is reported rather than thrown. */
async function gate(jobClass: JobClass): Promise<{ allow: boolean; reasons: string[] }> {
  try {
    const mod = await import('../../../scripts/resource-gate.mjs');
    const v = await mod.check(jobClass);
    return { allow: v.allow, reasons: v.reasons };
  } catch (error) {
    // A missing gate must not silently authorise the scan it was meant to hold
    // back, and must not block work either. Say which it is and let the operator
    // decide.
    return {
      allow: false,
      reasons: ['resource gate unavailable: ' + String((error as Error).message)],
    };
  }
}

async function main(): Promise<number> {
  const tier = (flag('--tier') ?? 'A') as Tier;
  if (!TIERS.includes(tier)) {
    console.error('--tier must be one of ' + TIERS.join(', '));
    return 2;
  }
  const limit = num('--limit', 0); // 0 = the whole tier
  const pageSize = num('--page', 1000);
  const outDir = flag('--out') ?? join('docs', 'ai', 'embedding-manifests');
  const pendingOnly = has('--pending-only');
  const countOnly = has('--count-only');

  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL unset');
    return 2;
  }

  const bounded = limit > 0;
  const need = bounded ? 'LIGHT' : 'DB_SCAN';
  const verdict = await gate(need);
  if (!verdict.allow && !has('--force')) {
    console.error('DEFER ' + need + ' — not running.');
    for (const r of verdict.reasons) console.error('  - ' + r);
    console.error(
      'Re-run when the box is quieter, or pass --force to accept the cost deliberately.',
    );
    return 3;
  }

  const sql = postgres(url, { ssl: sslFor(url), max: 2, onnotice: () => {} });
  try {
    const view = await checkView(sql);
    if (!view.present) {
      console.error('REFUSED: ' + view.why);
      return 4;
    }

    const startedAt = new Date().toISOString();
    const ids: string[] = [];
    const byCourt = new Map<string, number>();
    const byBand = new Map<string, number>();
    const byClass = new Map<string, number>();
    const contentHashes = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;

    for (;;) {
      const want = bounded ? Math.min(pageSize, limit - ids.length) : pageSize;
      if (want <= 0) break;
      const rows: EligibleRow[] = pendingOnly
        ? await pagePending(sql, tier, cursor, want)
        : await page(sql, tier, cursor, want);
      if (rows.length === 0) break;
      pages += 1;
      for (const r of rows) {
        ids.push(r.id);
        byCourt.set(r.court, (byCourt.get(r.court) ?? 0) + 1);
        byBand.set(r.valueBand, (byBand.get(r.valueBand) ?? 0) + 1);
        const cls = r.hcDocumentClass ?? '(unclassified)';
        byClass.set(cls, (byClass.get(cls) ?? 0) + 1);
        contentHashes.add(r.contentHash);
      }
      cursor = rows[rows.length - 1]!.id;
      if (pages % 50 === 0)
        console.log('  ' + ids.length.toLocaleString() + ' rows, cursor ' + cursor);
    }

    // Ids are already in `id` order from the keyset walk, so the hash is stable
    // without a sort — and re-sorting would hide a walk that lost its ordering.
    const idsHash = createHash('sha256').update(ids.join('\n')).digest('hex');

    const summary = {
      contractVersion: CONTRACT_VERSION,
      definitionHash: view.definitionHash,
      tier,
      pendingOnly,
      bounded,
      limit: bounded ? limit : null,
      pageSize,
      startedAt,
      finishedAt: new Date().toISOString(),
      rows: ids.length,
      idsHash,
      // Distinct `content_hash` against row count is the duplicate-collapse
      // figure FOR THIS MANIFEST. It is a true count over the rows walked — not
      // a sample — but it is NOT the corpus-wide figure unless the whole tier
      // was walked, and `bounded` says which this is.
      distinctContentHashes: contentHashes.size,
      duplicateCollapse: ids.length > 0 ? 1 - contentHashes.size / ids.length : 0,
      byCourt: Object.fromEntries([...byCourt].sort((a, b) => b[1] - a[1])),
      byValueBand: Object.fromEntries([...byBand].sort((a, b) => b[1] - a[1])),
      byDocumentClass: Object.fromEntries([...byClass].sort((a, b) => b[1] - a[1])),
    };

    console.log(JSON.stringify(summary, null, 2));

    if (!countOnly) {
      mkdirSync(outDir, { recursive: true });
      const stem =
        'tier-' + tier.toLowerCase() + (pendingOnly ? '-pending' : '') + (bounded ? '-sample' : '');
      writeFileSync(join(outDir, stem + '.summary.json'), JSON.stringify(summary, null, 2) + '\n');
      // One id per line. Not JSON: NEW1 streams this into a batch loop, and a
      // 8.5M-element JSON array has to be fully parsed before the first id is
      // available.
      writeFileSync(join(outDir, stem + '.ids.txt'), ids.join('\n') + '\n');
      console.log(
        'wrote ' + join(outDir, stem + '.ids.txt') + ' (' + ids.length.toLocaleString() + ' ids)',
      );
    }
    return 0;
  } finally {
    await sql.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error.stack ?? error.message);
    process.exit(1);
  });
