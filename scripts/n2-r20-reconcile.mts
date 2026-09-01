/**
 * NEW2 — R20 §4. THE RECONCILIATION TABLE.
 *
 * Four rounds have counted this defect and reported four different numbers —
 * 138, 52, 51, 83, 33, 158, 15,290, 4,394 — and none of them contradicts
 * another. They count different UNITS over different POPULATIONS. This assembles
 * every one of them beside its denominator and re-derives the ones that come
 * from the database, so the table is a measurement rather than a transcription.
 *
 * The rule the round works under: never convert one denominator into another.
 * A count is reported with the question it answers attached, or it is not
 * reported.
 *
 * Read-only. No writes, no migration, no network.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from '../services/ingest/node_modules/postgres/src/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/ai/new2-r20/count-reconciliation.json');

function databaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  const env = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  throw new Error('DATABASE_URL not found');
}
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const jsonl = <T>(p: string): T[] => read(p).split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as T);
const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

const NEUTRAL = "^[0-9]{4}:[A-Z]{2,10}(-[A-Z]{1,3})?:[0-9]{1,6}(-(DB|FB))?$";
const SUFFIXED = "-(DB|FB)$";

const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 20, connect_timeout: 60, onnotice: () => {} });

try {
  // ---- The DB-derived half, one pass over judgment_citations. ---------------
  const [edges] = (await sql.unsafe(`
    with c as (
      select cited_judgment_id, citing_judgment_id,
             (normalised_citation ~ '${NEUTRAL}') as is_neutral,
             (normalised_citation ~ '${SUFFIXED}') as has_suffix,
             (normalised_citation = '') as sentinel
      from judgment_citations
    )
    select count(*)::bigint total_rows,
           count(*) filter (where sentinel)::bigint sentinel_rows,
           count(*) filter (where is_neutral)::bigint neutral_rows,
           count(*) filter (where is_neutral and has_suffix)::bigint neutral_with_suffix,
           count(*) filter (where is_neutral and not has_suffix)::bigint neutral_without_suffix,
           count(*) filter (where is_neutral and cited_judgment_id is not null)::bigint neutral_resolved,
           count(*) filter (where is_neutral and not has_suffix and cited_judgment_id is not null)::bigint neutral_unsuffixed_resolved,
           count(distinct citing_judgment_id) filter (where is_neutral and not has_suffix)::bigint distinct_citing_unsuffixed,
           count(distinct citing_judgment_id)::bigint distinct_citing_any
    from c`)) as unknown as [Record<string, string>];

  const [fingerprint] = (await sql.unsafe(`
    with n as (
      select citing_judgment_id as cj,
             regexp_replace(normalised_citation, '${SUFFIXED}', '') as base,
             (normalised_citation ~ '${SUFFIXED}') as sfx
      from judgment_citations where normalised_citation ~ '${NEUTRAL}'
    ),
    pairs as (select cj, base from n group by cj, base having bool_or(sfx) and bool_or(not sfx)),
    corpuswide as (select base from n group by base having bool_or(sfx) and bool_or(not sfx))
    select (select count(*) from pairs)::bigint split_pairs,
           (select count(distinct base) from pairs)::bigint distinct_citations,
           (select count(distinct cj) from pairs)::bigint distinct_citing_judgments,
           (select count(*) from corpuswide)::bigint corpus_wide_split`)) as unknown as [Record<string, string>];

  const [aliases] = (await sql.unsafe(`
    select count(*)::bigint scanned,
           count(*) filter (where alias_reporter='AIR')::bigint air,
           count(*) filter (where alias_reporter='SCC')::bigint scc,
           count(*) filter (where alias_key ~ '^[0-9]{4}[A-Z]{2,10}[0-9]{1,6}(DB|FB)?$')::bigint neutral_shaped
    from judgment_citation_aliases`)) as unknown as [Record<string, string>];

  const [judgments] = (await sql.unsafe(
    `select reltuples::bigint as reltuples from pg_class where relname='judgments'`,
  )) as unknown as [Record<string, string>];

  // ---- The artifact-derived half. -------------------------------------------
  const r18 = JSON.parse(read('docs/ai/new2-r18/db-suffix-defect.json'));
  const r19rows = jsonl<{ judgmentId: string; klass: string }>('docs/ai/new2-r19/db-suffix-rows.jsonl');
  const r19byKlass: Record<string, number> = {};
  for (const r of r19rows) r19byKlass[r.klass] = (r19byKlass[r.klass] ?? 0) + 1;

  const hits = jsonl<{ id: string; storedNeutralCitation: string | null; old: string; new: string }>(
    'docs/ai/new2-r20/affected-hits.jsonl',
  );
  const r20docs = new Set(hits.map((h) => h.id));
  const r20withStored = new Set(hits.filter((h) => h.storedNeutralCitation).map((h) => h.id));
  const r19ids = new Set(r19rows.map((r) => r.judgmentId));
  const overlapKlass: Record<string, number> = {};
  const absentKlass: Record<string, number> = {};
  for (const r of r19rows) {
    const bucket = r20docs.has(r.judgmentId) ? overlapKlass : absentKlass;
    bucket[r.klass] = (bucket[r.klass] ?? 0) + 1;
  }
  const walk = JSON.parse(read('docs/ai/new2-r20/affected-universe-checkpoint.json'));

  const metric = (
    name: string,
    value: number | string,
    table: string,
    unit: string,
    denominator: string,
    dedupKey: string,
    filter: string,
    measures: string,
  ): Record<string, unknown> => ({ METRIC_NAME: name, value, TABLE_OR_SOURCE: table, UNIT_OF_COUNT: unit, DENOMINATOR: denominator, DEDUP_KEY: dedupKey, FILTER: filter, MEASURES: measures });

  const out = {
    artifact: 'NEW2_R20_COUNT_RECONCILIATION',
    lane: 'NEW2',
    takenAt: new Date().toISOString(),
    rule: 'Never convert one denominator into another. Every count carries the question it answers.',
    metrics: [
      metric(
        'R19_DB_SUFFIX_EXISTING_ROWS',
        r19rows.length,
        'docs/ai/new2-r19/db-suffix-rows.jsonl',
        'stored judgment row',
        `${r19rows.length} observed while walking the 1,350,954 High Court rows carrying a stored neutral_citation`,
        'judgments.id',
        'stored value is the PLAIN form while the text prints a suffix',
        'STORED JUDGMENT IDENTITY',
      ),
      metric(
        'R19_DB_SUFFIX_QUARANTINE',
        51,
        'NEW2_R19.md §6, cross-referenced to NEW2-R18-EXISTING-9679cff06d0e6404',
        'stored judgment row INSIDE the R18 frozen correction population',
        '20,556 rows in NEW2-R18-EXISTING-9679cff06d0e6404',
        'judgments.id',
        'the 52 observed rows, minus the 1 that falls outside the frozen population',
        'STORED JUDGMENT IDENTITY, quarantined disposition',
      ),
      metric(
        'R18_MISSING_BOUNDARY_OCCURRENCES',
        r18.classes.MISSING_BOUNDARY,
        'docs/ai/new2-r18/db-suffix-defect.json',
        'TEXT OCCURRENCE of a neutral citation',
        `${r18.scope.occurrencesInspected} occurrences in ${r18.scope.rowsWalked} rows`,
        'none — occurrences, not documents',
        'the suffix is printed and the next character is a word character',
        'TEXT OCCURRENCE',
      ),
      metric(
        'LCC_SPLIT_PAIRS',
        Number(fingerprint.split_pairs),
        'judgment_citations',
        '(citing judgment, citation base) pair emitting BOTH X and X-DB',
        `${edges.neutral_rows} neutral-form edge rows`,
        '(citing_judgment_id, base)',
        'neutral form only',
        'EXTRACTED CITATION ROWS — the one deterministic in-database fingerprint',
      ),
      metric(
        'LCC_DISTINCT_CITATIONS_IN_SPLIT_PAIRS',
        Number(fingerprint.distinct_citations),
        'judgment_citations',
        'distinct citation base appearing in a split pair',
        `${edges.neutral_rows} neutral-form edge rows`,
        'base',
        'neutral form only',
        'EXTRACTED CITATION ROWS',
      ),
      metric(
        'LCC_CORPUS_WIDE_SPLIT_FORM_CITATIONS',
        Number(fingerprint.corpus_wide_split),
        'judgment_citations',
        'distinct citation base for which BOTH forms exist anywhere in the corpus',
        `${edges.neutral_rows} neutral-form edge rows`,
        'base',
        'neutral form only, citing judgment ignored',
        'EXTRACTED CITATION ROWS',
      ),
      metric(
        'LCC_UNSUFFIXED_AND_RESOLVED_EXPOSURE_UPPER_BOUND',
        Number(edges.neutral_unsuffixed_resolved),
        'judgment_citations',
        'resolved edge row',
        `${edges.total_rows} edge rows total, ${edges.neutral_rows} neutral, ${edges.neutral_resolved} neutral and resolved`,
        'judgment_citations.id',
        'neutral, no suffix, cited_judgment_id NOT NULL',
        'RESOLVED EDGE. UPPER BOUND — citation_text stores the old rule match[0] and evidence is NULL on every neutral row, so the glue is not recoverable from the edge row',
      ),
      metric(
        'LCC_ALIASES_SCANNED',
        Number(aliases.scanned),
        'judgment_citation_aliases',
        'alias row',
        `${aliases.scanned} alias rows`,
        'alias_key (UNIQUE)',
        'none',
        'ALIAS. Unaffected BY CONSTRUCTION: CHECK (alias_reporter IN (AIR, SCC)), and neutral-shaped alias keys = ' + aliases.neutral_shaped,
      ),
      metric(
        'R20_AFFECTED_UNIVERSE',
        walk.universeSize,
        'judgment_citations -> judgments',
        'document',
        `${judgments.reltuples} estimated judgments; ${edges.distinct_citing_any} distinct citing judgments carry at least one edge row, ${edges.sentinel_rows} of the ${edges.total_rows} rows being the empty sentinel that proves the edge pass read a document and found nothing`,
        'judgments.id',
        'holds at least one UNSUFFIXED neutral edge row',
        'API/INGEST INPUT EXPOSURE — a corpus-wide superset of what the boundary move can touch',
      ),
      metric(
        'R20_PRECONDITION_MATCHED',
        walk.counts.PRECONDITION_MATCHED,
        'judgments.full_text',
        'document',
        `${walk.universeSize} documents in the frozen universe`,
        'judgments.id',
        "full_text ~ '[0-9]-(DB|FB)[0-9A-Za-z_]'",
        'API/INGEST INPUT EXPOSURE, necessary condition only',
      ),
      metric(
        'R20_DOCS_WITH_A_MOVED_TOKEN',
        walk.counts.DOCS_WITH_A_MOVED_TOKEN,
        'judgments.full_text',
        'document',
        `${walk.universeSize} documents in the frozen universe`,
        'judgments.id',
        'the shared extractor returns a different array under the corrected rule',
        'API/INGEST INPUT EXPOSURE, exhaustive over the universe',
      ),
      metric(
        'R20_CHANGED_TOKEN_OCCURRENCES',
        hits.length,
        'judgments.full_text',
        'moved match position',
        `${walk.counts.PRECONDITION_MATCHED} documents that matched the necessary condition`,
        'none — occurrences, not documents',
        'old token !== new token at the same match index',
        'TEXT OCCURRENCE',
      ),
    ],
    crossRoundOverlap: {
      question: 'Why is R20 74 when R19 is 52 and R18 is 138? Three units, three populations.',
      R19_ROWS: r19rows.length,
      R19_BY_CLASS: r19byKlass,
      R20_DOCS_WITH_A_MOVED_TOKEN: r20docs.size,
      R20_DOCS_CARRYING_A_STORED_NEUTRAL_CITATION: r20withStored.size,
      R20_DOCS_WITHOUT_ONE: r20docs.size - r20withStored.size,
      R19_ROWS_ALSO_IN_R20: [...r19ids].filter((id) => r20docs.has(id)).length,
      R19_ROWS_ALSO_IN_R20_BY_CLASS: overlapKlass,
      R19_ROWS_NOT_IN_R20_BY_CLASS: absentKlass,
      reading: [
        "R19's 43 STORED_PLAIN_SUFFIX_GLUED rows are exactly the 43 documents R20 also finds — the same documents, reached by two independent routes.",
        "R19's 9 STORED_PLAIN_SUFFIX_WITH_BOUNDARY rows are correctly ABSENT from R20: the suffixed form is printed with a proper boundary, so no glue exists and the shared extractor's output does not move. They are a stored-value defect, not a parser defect.",
        'R20 adds 31 documents R19 never asked about — 9 that carry a stored citation unrelated to the glued token, and 22 that carry none at all. R19 asked whose stored identity is wrong; R20 asks whose extracted output moves.',
        'R18 counted 138 OCCURRENCES over a 1,350,954-row own-citation population; R20 counts 160 moved match positions over a 1,148,519-document input population. Neither number converts into the other.',
      ],
    },
    dbDerived: { edges, fingerprint, aliases, judgments },
    inputHashes: {
      affectedUniverse: walk.universeHash,
      affectedHits: sha(read('docs/ai/new2-r20/affected-hits.jsonl')),
      r19DbSuffixRows: sha(read('docs/ai/new2-r19/db-suffix-rows.jsonl')),
    },
  };

  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out.crossRoundOverlap, null, 1));
  console.log('written docs/ai/new2-r20/count-reconciliation.json');
} finally {
  await sql.end();
}
