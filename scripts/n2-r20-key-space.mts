/**
 * NEW2 — R20 §10. WHAT THE CORRECTED PARSER DOES TO **FUTURE** INPUT WHEN IT
 * MEETS THE **EXISTING** KEY SPACE.
 *
 * Nothing here writes. The question is narrower than "should the corpus be
 * corrected", which is R19's quarantine to dispose of, not this round's: given
 * that a future extraction of a glued document will now emit `X-DB` where it
 * used to emit `X`, does that token find a judgment, and is it the same one?
 *
 * The outcomes are separated because they are different risks, and the two that
 * look alike are the two that must not be reported as one:
 *
 *   STILL_RESOLVES_SAME_JUDGMENT   both keys name one judgment. Invisible.
 *   NARROWS_TO_A_SUBSET_OF_THE_OLD_CANDIDATES
 *                                  the new key names judgments the old key
 *                                  already named, and fewer of them. A rival
 *                                  candidate is dropped; the target is not.
 *   RESOLVES_TO_A_DIFFERENT_JUDGMENT
 *                                  the new key names a judgment the old key
 *                                  never named. The edge MOVES. Correct under
 *                                  the grammar, and the reason a bulk re-apply
 *                                  is a separate authorised act rather than a
 *                                  consequence of this commit.
 *   NEWLY_RESOLVES                 the corpus holds the suffixed form only, so
 *                                  the correction recovers a resolution the
 *                                  glue had been losing.
 *   NO_LONGER_RESOLVES             the corpus holds the unsuffixed form only.
 *                                  A future edge becomes unresolved rather than
 *                                  wrong — the direction `CITATION_HARNESS.md`
 *                                  requires, but a recall cost worth naming,
 *                                  and in these rows the stored value is itself
 *                                  what NEW2 R19 quarantined.
 *
 * Also re-verifies the alias claim, which is a CONSTRAINT and not a sample:
 * `judgment_citation_aliases.alias_reporter` is checked into ('AIR','SCC'), so
 * a neutral citation can never become an alias row.
 *
 * Read-only. No writes, no migration, no network.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTDIR = join(ROOT, 'docs/ai/new2-r20');

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}

/** The key the resolver builds: upper-case, every non-alphanumeric stripped. */
const key = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

const sql = postgres(databaseUrl(), { max: 2, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  const hits = readFileSync(join(OUTDIR, 'affected-hits.jsonl'), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { id: string; court: string; old: string; new: string });

  const pairs = [...new Map(hits.map((h) => [`${h.old}|${h.new}`, h])).values()];
  const counts: Record<string, number> = {};
  const bump = (k: string): void => {
    counts[k] = (counts[k] ?? 0) + 1;
  };
  const rows: unknown[] = [];

  for (const p of pairs) {
    const [oldHeld, newHeld] = await Promise.all([
      sql`select judgment_id::text as jid from judgment_citation_keys where citation_key = ${key(p.old)}`,
      sql`select judgment_id::text as jid from judgment_citation_keys where citation_key = ${key(p.new)}`,
    ]);
    const oldIds = new Set((oldHeld as { jid: string }[]).map((r) => r.jid));
    const newIds = new Set((newHeld as { jid: string }[]).map((r) => r.jid));
    const overlap = [...newIds].filter((v) => oldIds.has(v)).length;
    const same = oldIds.size > 0 && newIds.size > 0 && overlap === newIds.size && oldIds.size === newIds.size;
    /* A narrowing keeps the target and drops rival candidates; a MOVE points the
     * edge at a judgment the old key never named. They are not the same risk. */
    const narrowing = oldIds.size > newIds.size && newIds.size > 0 && overlap === newIds.size;
    const klass =
      newIds.size === 0
        ? oldIds.size === 0
          ? 'NEITHER_FORM_RESOLVES'
          : 'NO_LONGER_RESOLVES'
        : oldIds.size === 0
          ? 'NEWLY_RESOLVES'
          : same
            ? 'STILL_RESOLVES_SAME_JUDGMENT'
            : narrowing
              ? 'NARROWS_TO_A_SUBSET_OF_THE_OLD_CANDIDATES'
              : 'RESOLVES_TO_A_DIFFERENT_JUDGMENT';
    bump(klass);
    rows.push({
      old: p.old,
      new: p.new,
      oldHolders: oldIds.size,
      newHolders: newIds.size,
      newHoldersAlsoInOld: overlap,
      klass,
    });
  }

  const [alias] = (await sql`
    select count(*)::int as total,
           count(*) filter (where alias_reporter = 'AIR')::int as air,
           count(*) filter (where alias_reporter = 'SCC')::int as scc,
           count(*) filter (where alias_key ~ '^[0-9]{4}[A-Z]{2,10}[0-9]{1,6}(DB|FB)?$')::int as neutral_shaped
    from judgment_citation_aliases`) as unknown as [
    { total: number; air: number; scc: number; neutral_shaped: number },
  ];

  const [constraint] = (await sql`
    select pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid = 'judgment_citation_aliases'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%alias_reporter%'`) as unknown as [{ def: string } | undefined];

  const out = {
    artifact: 'NEW2_R20_KEY_SPACE',
    takenAt: new Date().toISOString(),
    scope: 'FUTURE input against EXISTING keys. Nothing is rewritten by this round.',
    distinctTokenPairs: pairs.length,
    counts,
    rows,
    aliases: {
      ALIASES_SCANNED: alias?.total ?? null,
      AIR: alias?.air ?? null,
      SCC: alias?.scc ?? null,
      NEUTRAL_SHAPED_ALIAS_KEYS: alias?.neutral_shaped ?? null,
      constraint: constraint?.def ?? null,
      ALIASES_CHANGED: 0,
    },
  };
  writeFileSync(join(OUTDIR, 'key-space.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ counts, aliases: out.aliases }, null, 1));
} finally {
  await sql.end();
}
