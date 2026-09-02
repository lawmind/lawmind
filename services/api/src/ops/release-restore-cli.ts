/**
 * RELEASE RESTORE + VERIFY — the other half of the rehearsal.
 *
 * Takes a directory written by `release-export-cli.ts` and loads it into a
 * TARGET database, then proves the target can reproduce what the manifest
 * claims. It never touches the source.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **It does not create the schema.** The target must already have been migrated
 * — `pnpm --filter @lawmind/db migrate` against `TARGET_DATABASE_URL`. That is
 * deliberate: the migrations are the path every real deployment uses, and a
 * release that builds its schema any other way is a release whose schema has
 * never been tested. It also means enum types arrive through `CREATE TYPE` in a
 * migration rather than through a dump that would have omitted them.
 *
 * **It does not trust a load that reported no error.** `COPY FROM` is perfectly
 * happy to load a truncated file: it stops at the last complete line and
 * returns success. Row counts and checksums are the only evidence, and they are
 * computed on the target with the SAME expression the export used.
 *
 * **It does not run against the source by accident.** `TARGET_DATABASE_URL` is
 * a separate variable and the tool refuses if it equals `DATABASE_URL`.
 */
import { readFile } from 'node:fs/promises';
import { appendFileSync, createReadStream, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

import postgres from 'postgres';

import { cascadeVictims, type ForeignKeyEdge } from './cascade-guard.ts';
import {
  activationDecision,
  readStatistics,
  runSearchSmoke,
  smokeVerdict,
  statisticsVerdict,
} from '../release/activation.ts';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TRACE, AND WHY IT REPLACED A FOURTH HYPOTHESIS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Three theories about this restore's hang were falsified in R8.3 — the
 * zero-byte `judgment_judges` file, a desynchronised connection, and the
 * "hang" that turned out to be a tool-call timeout killing the client. The
 * fourth guess was refused on the hard bound; this is what replaced it.
 *
 * Every phase writes a line the moment it happens, to stdout AND to
 * `RESTORE_TRACE.jsonl` beside the pack. Appended and flushed per event on
 * purpose: a run that is killed mid-COPY leaves the trace up to the kill, and
 * the whole reason the earlier attempts taught nothing is that their evidence
 * was written at the end.
 *
 * The phases are the ones a restore can stop between, not the ones that are
 * convenient to log: connect · session state · triggers · per table truncate ·
 * COPY open · COPY stream · COPY complete · triggers back · referential
 * validation · ANALYZE · per table verify.
 */
type Trace = (phase: string, detail?: Record<string, unknown>) => void;

function makeTracer(path: string): Trace {
  const started = Date.now();
  writeFileSync(path, '');
  return (phase, detail = {}) => {
    // `...detail` FIRST. Spread last, a detail key named `ms` overwrites the
    // elapsed clock -- the ANALYZE phase reported itself at 894ms of a run that
    // was 9,516ms in, which is a trace lying about its own timeline.
    const line = { ...detail, at: new Date().toISOString(), ms: Date.now() - started, phase };
    // appendFileSync, not a stream: a stream buffers, and a buffered trace of a
    // process that was killed is an empty file.
    appendFileSync(path, JSON.stringify(line) + '\n');
    const extra = Object.entries(detail)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' ');
    process.stdout.write(`  [${String(line.ms).padStart(7)}ms] ${phase.padEnd(22)} ${extra}\n`);
  };
}

/**
 * A SECOND connection, whose only job is to say what the server thinks.
 *
 * "Client alive, backend idle in `ClientRead`" was read off `pg_stat_activity`
 * by hand, after the fact, from a run whose client was already gone. Asking the
 * question from inside the run — on a connection that is not the one doing the
 * work — is the difference between a symptom and an observation, and it is the
 * only way to tell a stalled COPY from a slow one.
 */
async function backendStates(
  observer: postgres.Sql,
  database: string,
): Promise<{ pid: number; state: string | null; wait: string | null; ms: number; query: string }[]> {
  return observer.unsafe(
    `SELECT pid, state, coalesce(wait_event_type || ':' || wait_event, 'running') AS wait,
            (extract(epoch FROM (now() - coalesce(query_start, backend_start))) * 1000)::int AS ms,
            left(regexp_replace(query, '\\s+', ' ', 'g'), 60) AS query
       FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()
      ORDER BY pid`,
    [database],
  ) as Promise<{ pid: number; state: string | null; wait: string | null; ms: number; query: string }[]>;
}

/**
 * Run `work`, and if it has not finished within `everyMs`, ask the server what
 * it is waiting on — repeatedly, and without cancelling anything.
 *
 * A watchdog that KILLS turns a diagnosable stall into a missing one. This one
 * only looks. The COPY that hung in R8.3 would have printed its backend's
 * `ClientRead` state every 15 seconds for as long as anyone let it run, with the
 * table name attached, instead of being reconstructed afterwards from a corpse.
 */
async function watched<T>(
  label: string,
  trace: Trace,
  observer: postgres.Sql | null,
  database: string,
  everyMs: number,
  work: () => Promise<T>,
): Promise<T> {
  /**
   * `setInterval` + `clearInterval`, NOT a sleep loop.
   *
   * The first version awaited a `setTimeout` and then checked a `done` flag, so
   * finishing the work still had to wait for the outstanding timer before the
   * watcher could notice. It charged EVERY phase a flat `everyMs`: the first
   * trace showed seven TRUNCATEs at exactly 15,000 ms each, which is a
   * measurement of the instrument and not of the restore. A watchdog that
   * changes the timing it reports is worse than none.
   */
  let n = 0;
  const timer = setInterval(() => {
    n += 1;
    if (!observer) {
      trace('stall_probe', { of: label, tick: n, backends: 'no observer connection' });
      return;
    }
    void backendStates(observer, database)
      .then((rows) =>
        trace('stall_probe', {
          of: label,
          tick: n,
          backends: rows.map((r) => `${r.pid}:${r.state}:${r.wait}:${r.ms}ms:${r.query}`),
        }),
      )
      .catch((err: unknown) =>
        trace('stall_probe_failed', {
          of: label,
          why: err instanceof Error ? err.message : String(err),
        }),
      );
  }, everyMs);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}

type Manifest = {
  releaseVersion: string;
  source: {
    collation: string;
    ctype: string;
    encoding: string;
    serverVersion: string;
    extensions: { name: string; version: string }[];
  };
  schemaVersion: { highestMigration: string; migrationCount: number };
  tables: {
    table: string;
    rows: number;
    checksum: string;
    bytes: number;
    file: string;
    columns: string[];
  }[];
};

/**
 * Both sides must render the row IDENTICALLY, or the checksum measures the
 * session rather than the data.
 *
 * Two settings, each found by a restore that reported a mismatch on a load
 * where every row had arrived:
 *
 * 1. **`TimeZone`.** `row::text` renders `timestamptz` in the session's zone.
 *    The source session rendered `2026-08-07 09:31:01.666724+00` and the target
 *    `2026-08-07 13:31:01.666724+04` — the same instant, a different string, and
 *    a checksum that says the release is corrupt when it is not.
 * 2. **`DateStyle`.** Same class of problem for dates, and it is one line to
 *    remove the possibility.
 *
 * The COLLATION cannot be pinned this way — a Linux target has no
 * `English_United States.1252` — so the ordering is fixed at the query instead,
 * with `COLLATE "C"` on any text sort key. `C` is byte order and is the one
 * collation both platforms agree on.
 */
async function pinSessionRendering(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`SET TimeZone = 'UTC'`);
  await sql.unsafe(`SET DateStyle = 'ISO, YMD'`);
}

/** The same expression the export used. Two spellings would prove nothing. */
/**
 * The checksum is taken over a NAME-ORDERED projection, never over `row::text`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LIVE SCHEMA'S COLUMN ORDER HAS DRIFTED FROM THE MIGRATIONS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Measured during the first rehearsal, not assumed. `judgments` has the SAME 38
 * columns on both sides — nothing missing, nothing extra — but eight of them sit
 * at different ordinals on the live database than in a database built by running
 * the migrations from empty:
 *
 *     cnr, native_text, petitioner, respondent,
 *     parties_extraction_method, disposal_nature,
 *     source_bench_code, hc_document_class
 *
 * `row::text` renders columns in ORDINAL order, so a perfectly correct restore
 * produced a different string and the checksum called it corrupt.
 *
 * The much more serious consequence is the one this file already avoids: a
 * POSITIONAL `COPY table FROM STDIN` — the spelling without a column list —
 * would have loaded each value into whatever column now sits at that ordinal.
 * That does not error. It silently writes `cnr` into `native_text`.
 *
 * So: columns are named explicitly on both sides for the COPY, and sorted BY
 * NAME for the checksum. Neither depends on an ordinal agreeing across two
 * machines that were built by different routes.   *
   * ─────────────────────────────────────────────────────────────────────────
   * AND THE COMPOSITE RENDERING ITSELF IS PLATFORM-DEPENDENT
   * ─────────────────────────────────────────────────────────────────────────
   *
   * `ROW(...)::text` quotes a field when it "needs" quoting, and the test for
   * needing it includes `isspace()`, which is **LC_CTYPE-dependent**. Measured
   * on one real row, byte-identical data, both sessions pinned to UTC:
   *
   *     source (Windows-1252 ctype)  ("2026-08-17 23:19:21.945366+00",3,"aiàiáªàåzéã",40537)
   *     target (C.UTF-8 ctype)       ("2026-08-17 23:19:21.945366+00",3,aiàiáªàåzéã,40537)
   *
   * Two bytes of difference, no data difference at all. So the digest is taken
   * over `concat_ws` of the columns cast individually — `::text` on a text
   * column is the identity and adds no quoting — with a unit separator that
   * cannot occur in the data, and NULL rendered explicitly so that
   * `(NULL, 'a')` and `('a', NULL)` cannot collide.
 */
async function checksum(
  sql: postgres.Sql,
  table: string,
  orderBy: string,
  columns: readonly string[],
): Promise<{ rows: number; checksum: string }> {
  const canonical = [...columns]
    .sort()
    // chr(31) as the separator and chr(30) for NULL, because they are
    // PostgreSQL FUNCTIONS rather than escape strings: nothing has to survive
    // a JS template literal, a shell, or a file encoding on the way here. The
    // first attempt used E'\x00' and the server rejected it outright -- a NUL
    // byte is not a legal value in a text field.
    .map((c) => `coalesce("${c}"::text, chr(30))`)
    .join(', chr(31), ');
  const [row] = await sql.unsafe<{ n: string; ck: string | null }[]>(
    `SELECT count(*)::text AS n,
            md5(coalesce(string_agg(t.h, '' ORDER BY t.ord), '')) AS ck
       FROM (SELECT row_number() OVER (ORDER BY ${orderBy}) AS ord,
                    md5(concat_ws('', ${canonical})) AS h
               FROM ${table}) t`,
  );
  return { rows: Number(row?.n ?? 0), checksum: row?.ck ?? '' };
}

/**
 * How long a phase may run before the trace asks the SERVER what it is waiting
 * on. Not a timeout: nothing is cancelled, the probe only reports.
 *
 * 15s because the slowest legitimate phase on the bounded pack is a 50 MB COPY
 * of `statute_sections`, which is well under it, and a genuine stall is
 * indefinite -- anything between "slow" and "never" is the thing worth seeing.
 */
const STALL_PROBE_MS = 15_000;

/**
 * How long one table's COPY may run before it is called a failure.
 *
 * Generous on purpose — the largest table in a full release is hours of data,
 * and this is not a performance budget. It exists so that the ONE failure mode
 * postgres.js cannot report (see the COPY loop) ends the process instead of
 * outliving it. Override with `--copy-deadline <seconds>` for a genuinely large
 * pack.
 */
const COPY_DEADLINE_DEFAULT_MS = 10 * 60_000;

const ORDER_BY: Record<string, string> = {
  judgments: 'id',
  judgment_citations: 'id',
  judgment_judges: 'judgment_id, judge_name COLLATE "C"',
  judgment_statute_refs: 'id',
  statutes: 'id',
  statute_sections: 'id',
  lexeme_document_frequency: 'lexeme COLLATE "C"',
};

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (n: string) => {
    const i = argv.indexOf(`--${n}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const dir = arg('from') ?? 'release';
  /** Simulate a transfer that stopped mid-file. See the note where it is used. */
  const truncateTable = arg('truncate-table');

  const target = process.env['TARGET_DATABASE_URL'];
  if (!target) throw new Error('TARGET_DATABASE_URL is required');
  if (target === process.env['DATABASE_URL']) {
    throw new Error('TARGET_DATABASE_URL equals DATABASE_URL — refusing to restore onto the source');
  }

  const manifest = JSON.parse(await readFile(join(dir, 'MANIFEST.json'), 'utf8')) as Manifest;
  const trace = makeTracer(join(dir, 'RESTORE_TRACE.jsonl'));
  trace('start', { dir, release: manifest.releaseVersion, tables: manifest.tables.length });

  /**
   * `max: 1`, and it is a correctness choice rather than a tuning one.
   *
   * A restore is strictly sequential — TRUNCATE, then COPY, then verify — and
   * with a pool of 2 the second COPY can be issued on a different backend from
   * the first while the first is still mid-stream. Nothing in this file ever
   * wanted that concurrency, and it is exactly the shape that makes "which
   * backend is stuck in ClientRead" an ambiguous question. One connection means
   * the trace's phase order IS the server's message order.
   *
   * The stall observer below gets its OWN connection for the same reason: a
   * monitor that queues behind the work it is monitoring reports nothing at the
   * moment it is needed.
   */
  const poolMax = Number(arg('pool') ?? 1);
  const COPY_DEADLINE_MS = arg('copy-deadline')
    ? Number(arg('copy-deadline')) * 1000
    : COPY_DEADLINE_DEFAULT_MS;
  const sql = postgres(target, { max: poolMax, onnotice: () => {} });
  trace('connect_begin', { pool: poolMax });
  await pinSessionRendering(sql);
  const [who] = await sql<{ db: string; usr: string; su: boolean; pid: number }[]>`
    SELECT current_database() AS db, current_user AS usr,
           usesuper AS su, pg_backend_pid() AS pid
      FROM pg_user WHERE usename = current_user`;
  const targetDb = who?.db ?? '';
  trace('session_pinned', {
    database: targetDb,
    user: who?.usr,
    superuser: who?.su,
    backendPid: who?.pid,
    timeZone: 'UTC',
    dateStyle: 'ISO, YMD',
  });

  const observer = await (async () => {
    try {
      const o = postgres(target, { max: 1, onnotice: () => {} });
      await o`SELECT 1`;
      trace('observer_ready');
      return o;
    } catch (err) {
      trace('observer_unavailable', { why: err instanceof Error ? err.message : String(err) });
      return null;
    }
  })();

  console.log(`restoring release ${manifest.releaseVersion}\n`);

  // ── the environment the release lands in ──────────────────────────────────
  const [meta] = await sql<{ ver: string; collate: string; ctype: string; enc: string }[]>`
    SELECT current_setting('server_version') AS ver,
           datcollate AS collate, datctype AS ctype,
           pg_encoding_to_char(encoding) AS enc
      FROM pg_database WHERE datname = current_database()`;
  const extensions = await sql<{ extname: string; extversion: string }[]>`
    SELECT extname, extversion FROM pg_extension ORDER BY extname`;

  const findings: string[] = [];
  const have = new Set(extensions.map((e) => e.extname));
  for (const e of manifest.source.extensions) {
    if (!have.has(e.name)) findings.push(`MISSING EXTENSION: ${e.name}@${e.version}`);
  }

  /**
   * The collation check, and it is a FINDING rather than a failure.
   *
   * A Windows-built corpus carries `English_United States.1252`, which no Linux
   * PostgreSQL can offer. The restore is still correct — every row arrives —
   * but text ORDERING is not the same, which reaches `ORDER BY case_title`,
   * every btree index on a text column, and therefore keyset pagination.
   *
   * Refusing the restore would be wrong (there is no Linux collation that would
   * satisfy it, so nothing could ever ship). Staying quiet would be worse. So it
   * is reported, loudly, with both values.
   */
  if (meta?.collate !== manifest.source.collation) {
    findings.push(
      `COLLATION DIFFERS: source ${manifest.source.collation} -> target ${meta?.collate}. ` +
        'Text ordering is not identical. Indexes must be REBUILT on the target, never copied.',
    );
  }
  if (meta?.enc !== manifest.source.encoding) {
    findings.push(`ENCODING DIFFERS: ${manifest.source.encoding} -> ${meta?.enc}`);
  }

  /**
   * Enum types, checked explicitly. This is the class of failure a `pg_dump -t`
   * release produces — the enum-bearing tables fail to restore and the rest
   * succeed, which reads as a partial success rather than a broken schema.
   * Here the migrations create them, so this asserts the migration path worked.
   */
  const [enums] = await sql<{ n: string }[]>`
    SELECT count(*)::text AS n FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typtype = 'e'`;
  console.log(`  target ${meta?.ver}  collation ${meta?.collate}  encoding ${meta?.enc}`);
  console.log(`  extensions: ${extensions.map((e) => `${e.extname}@${e.extversion}`).join(', ')}`);
  console.log(`  enum types: ${enums?.n}\n`);

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * TRIGGERS OFF FOR THE LOAD — AND THIS FILE NOW ACTUALLY DOES IT
   * ───────────────────────────────────────────────────────────────────────────
   *
   * The comment below the TRUNCATE loop used to say the load "disables triggers"
   * and **no code disabled anything**. FIFTH found it by grep (bus 1386 C): one
   * comment, no `session_replication_role`, no `DISABLE TRIGGER`.
   *
   * It was harmless while `judgments` carried no user triggers. Migrations 0087
   * and 0088 put two on it — the durable dirty-work marks — so a bulk restore
   * now fires a row-level trigger per judgment and writes `citation_key_dirty`
   * rows describing work that a restore, by definition, does not need doing.
   *
   * `session_replication_role = 'replica'` is the mechanism, because it turns off
   * FK triggers as well, which is the assumption the TRUNCATE order above already
   * rests on. It needs superuser. If the role does not have it, the fallback is
   * `ALTER TABLE ... DISABLE TRIGGER USER` per loaded table, which needs only
   * table ownership and does NOT touch FK triggers — a different guarantee, so
   * the trace records which of the two actually ran rather than leaving a reader
   * to assume the stronger one.
   *
   * Whichever ran is VERIFIED by reading the setting back, and put back
   * afterwards, and the referential check below is what makes putting it back
   * mean something.
   */
  /**
   * ───────────────────────────────────────────────────────────────────────────
   * THE FOREIGN KEYS, READ FIRST, BECAUSE THEY DECIDE THE LOAD ORDER
   * ───────────────────────────────────────────────────────────────────────────
   *
   * THIS IS THE HANG. Found 27 Aug 2026 in the PostgreSQL server log, after
   * three hypotheses had been falsified from the client side alone:
   *
   *     ERROR: insert or update on table "judgment_statute_refs" violates
   *            foreign key constraint "judgment_statute_refs_statute_id_fkey"
   *     DETAIL: Key (statute_id)=(0019baad-...) is not present in table "statutes".
   *     STATEMENT: COPY judgment_statute_refs (...) FROM STDIN
   *
   * `judgment_statute_refs` references `statutes`, and the export's table order
   * puts `statutes` AFTER it. Every row of the fourth COPY violated an FK
   * against an empty parent, the server aborted the statement — and the client
   * never found out, because postgres.js resolves a COPY query at
   * `CopyInResponse` and only completes the writable from `CommandComplete`. An
   * ErrorResponse arrives for a query that is already settled, so the stream's
   * `final` callback is never called and `pipeline` waits for a `finish` that
   * cannot come. Server idle in `ClientRead`, client blocked, no error anywhere:
   * exactly the shape that was read as a stall for two rounds.
   *
   * So the restore had TWO defects, and both are fixed here:
   *
   *   1. it loaded children before parents;
   *   2. it could not report a COPY the server had already rejected.
   *
   * The trigger disable below would mask (1) on its own — that is what the
   * comment claiming it always intended, and what its absence cost. It is not
   * enough by itself: the fallback path (`DISABLE TRIGGER USER`) does not touch
   * FK triggers at all, so a target where the role is not superuser would have
   * gone straight back to hanging. Order the load correctly AND disable the
   * triggers, and the restore is right under either mechanism.
   */
  const fks = await sql.unsafe<
    { conname: string; child: string; childcols: string[]; parent: string; parentcols: string[] }[]
  >(
    `SELECT c.conname,
            cl.relname  AS child,
            (SELECT array_agg(a.attname ORDER BY k.ord)
               FROM unnest(c.conkey) WITH ORDINALITY k(att, ord)
               JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.att) AS childcols,
            pl.relname  AS parent,
            (SELECT array_agg(a.attname ORDER BY k.ord)
               FROM unnest(c.confkey) WITH ORDINALITY k(att, ord)
               JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.att) AS parentcols
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_class pl ON pl.oid = c.confrelid
      WHERE c.contype = 'f' AND cl.relname = ANY($1)
      ORDER BY cl.relname, c.conname`,
    [manifest.tables.map((t) => t.table)],
  );

  /**
   * Parents before children. Kahn's algorithm over the FK edges above, with two
   * deliberate exceptions:
   *
   *   * a SELF reference (`judgments.overruled_by_judgment_id -> judgments`) is
   *     not an ordering constraint and no order can satisfy it — only disabling
   *     the trigger can, which is why the disable stays;
   *   * an edge to a table that is NOT in this release is not a constraint on
   *     this load either.
   *
   * A genuine cycle between two exported tables cannot be ordered at all. It is
   * reported as a finding and those tables keep their manifest order, because
   * silently inventing an order for them would be a guess.
   */
  const inRelease = new Set(manifest.tables.map((t) => t.table));
  const parentsOf = new Map<string, Set<string>>(manifest.tables.map((t) => [t.table, new Set()]));
  for (const fk of fks) {
    if (fk.child === fk.parent) continue;
    if (!inRelease.has(fk.parent) || !inRelease.has(fk.child)) continue;
    parentsOf.get(fk.child)?.add(fk.parent);
  }
  const loadOrder: Manifest['tables'] = [];
  const placed = new Set<string>();
  for (let pass = 0; pass < manifest.tables.length && placed.size < manifest.tables.length; pass++) {
    for (const t of manifest.tables) {
      if (placed.has(t.table)) continue;
      const parents = parentsOf.get(t.table) ?? new Set<string>();
      if ([...parents].every((p) => placed.has(p))) {
        loadOrder.push(t);
        placed.add(t.table);
      }
    }
  }
  const unordered = manifest.tables.filter((t) => !placed.has(t.table));
  if (unordered.length > 0) {
    findings.push(
      `FOREIGN KEY CYCLE among ${unordered.map((t) => t.table).join(', ')} — left in manifest order`,
    );
    loadOrder.push(...unordered);
  }
  if (argv.includes('--manifest-order')) {
    loadOrder.length = 0;
    loadOrder.push(...manifest.tables);
    trace('load_order_forced', { why: '--manifest-order, deliberate falsification' });
  }
  trace('load_order', {
    manifest: manifest.tables.map((t) => t.table),
    resolved: loadOrder.map((t) => t.table),
    reordered: loadOrder.map((t) => t.table).join() !== manifest.tables.map((t) => t.table).join(),
    edges: fks.length,
  });

  /**
   * `--keep-triggers` and `--manifest-order` exist to FALSIFY the fix, not to be
   * used. Each turns off one half of it, so "the load order is what mattered"
   * and "the trigger disable is what mattered" are separable claims instead of
   * one change that happened to work. Recorded in the trace either way.
   */
  const keepTriggers = argv.includes('--keep-triggers');
  const triggerMode = await (async (): Promise<'replica' | 'per_table' | 'none'> => {
    if (keepTriggers) {
      trace('triggers_kept', { why: '--keep-triggers, deliberate falsification' });
      return 'none';
    }
    try {
      await sql.unsafe(`SET session_replication_role = 'replica'`);
      const [r] = await sql.unsafe<{ v: string }[]>(
        `SELECT current_setting('session_replication_role') AS v`,
      );
      if (r?.v === 'replica') {
        trace('triggers_disabled', { mechanism: 'session_replication_role', verified: r.v });
        return 'replica';
      }
      trace('triggers_disable_unverified', { readBack: r?.v ?? null });
    } catch (err) {
      trace('triggers_disable_refused', {
        mechanism: 'session_replication_role',
        why: err instanceof Error ? err.message : String(err),
      });
    }
    try {
      for (const t of manifest.tables) await sql.unsafe(`ALTER TABLE ${t.table} DISABLE TRIGGER USER`);
      trace('triggers_disabled', { mechanism: 'ALTER TABLE DISABLE TRIGGER USER', tables: manifest.tables.length });
      return 'per_table';
    } catch (err) {
      trace('triggers_disable_failed', { why: err instanceof Error ? err.message : String(err) });
      return 'none';
    }
  })();

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * WHAT ELSE THE `TRUNCATE ... CASCADE` BELOW WOULD EMPTY
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Gate C requires that a corpus rollback NOT roll back user/matter data.
   * Nothing checked it, and on a single shared database it is false: `CASCADE`
   * truncates every referencing table whatever its `ON DELETE` rule says.
   * `ops/cascade-guard.ts` carries the measurement.
   *
   * The FK read above is deliberately not reused — it asks which tables the
   * RELEASE references, and this asks the opposite question: who references the
   * release from OUTSIDE it. Same catalogue, opposite direction, and conflating
   * them is how this went unnoticed.
   *
   * A correct remote-alpha corpus target holds only the release's own tables and
   * this finds nothing. A shared database refuses here, before the first
   * TRUNCATE — which is the only point at which refusing is still free.
   */
  const inboundFks = await sql.unsafe<ForeignKeyEdge[]>(
    `SELECT DISTINCT cl.relname AS child, pl.relname AS parent
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid
       JOIN pg_class pl ON pl.oid = c.confrelid
      WHERE c.contype = 'f'`,
  );
  const victims = cascadeVictims(
    inboundFks,
    manifest.tables.map((t) => t.table),
  );
  if (victims.length > 0) {
    trace('cascade_guard_refused', { victims });
    if (!argv.includes('--allow-cascade-into')) {
      await sql.end();
      if (observer) await observer.end();
      throw new Error(
        'REFUSING TO RESTORE: `TRUNCATE ... CASCADE` over this release would also empty ' +
          `${victims.length} table(s) that are NOT in it:\n` +
          victims.map((v) => `  - ${v.table} (references ${v.via.join(', ')})`).join('\n') +
          '\n\nOn a shared database that includes an advocate’s saved authorities, alerts ' +
          'and annotations — a corpus rollback would take user data with it, which Gate C ' +
          'forbids. Restore onto a target that holds only the corpus, or pass ' +
          '--allow-cascade-into to proceed deliberately.',
      );
    }
    trace('cascade_guard_overridden', { why: '--allow-cascade-into', victims: victims.length });
    console.log(
      `\nWARNING: --allow-cascade-into — ${victims.length} table(s) outside this release ` +
        `will be emptied:\n` +
        victims.map((v) => `  - ${v.table}`).join('\n'),
    );
  }

  // ── load ──────────────────────────────────────────────────────────────────
  for (const t of manifest.tables) {
    await watched(`truncate ${t.table}`, trace, observer, targetDb, STALL_PROBE_MS, () =>
      sql.unsafe(`TRUNCATE ${t.table} CASCADE`),
    );
    trace('truncate', { table: t.table });
  }

  for (const t of loadOrder) {
    const path = join(dir, t.file);
    /**
     * The columns the export named, in the export's order. Never `COPY table
     * FROM STDIN` bare: that means "every non-generated column in catalogue
     * order", which agrees with the file only by luck and disagrees the moment
     * a migration adds a column on one side.
     */
    const columnList = t.columns.map((c) => `"${c}"`).join(', ');

    trace('copy_open', { table: t.table, file: t.file, bytes: t.bytes, columns: t.columns.length });
    const writable = await watched(`copy_open ${t.table}`, trace, observer, targetDb, STALL_PROBE_MS, () =>
      sql.unsafe(`COPY ${t.table} (${columnList}) FROM STDIN`).writable(),
    );
    trace('copy_stream_begin', { table: t.table });

    /**
     * Bytes counted as they pass, so a stall has a POSITION.
     *
     * "The restore hung" is not a finding. "The restore hung after 2,508,352 of
     * 2,508,352 bytes of `judgments`, with the backend in `ClientRead`" says the
     * data all arrived and the protocol did not close — a different defect from
     * a stall at byte 0 or halfway.
     */
    let sent = 0;
    const source =
      truncateTable === t.table
        ? /**
           * SIMULATED PARTIAL TRANSFER. Half the bytes, then stop.
           *
           * `COPY FROM` will accept this without complaint — it loads every
           * complete line and returns success — which is exactly why "the
           * restore did not error" is not evidence and the checksum below is.
           */
          createReadStream(path, { start: 0, end: Math.floor(t.bytes / 2) })
        : createReadStream(path);
    source.on('data', (c: string | Buffer) => {
      sent += typeof c === 'string' ? Buffer.byteLength(c) : c.length;
    });

    /**
     * A DEADLINE, because a COPY the server has already rejected can never
     * finish and this tool used to wait for it for ever.
     *
     * postgres.js settles a COPY query at `CopyInResponse` and completes the
     * writable only from `CommandComplete`. When the server aborts the statement
     * instead — an FK violation, a bad row, a full disk — the ErrorResponse
     * belongs to a query that is already resolved, nothing calls the stream's
     * `final`, and `pipeline` waits for a `finish` that is never coming. That is
     * not a stall to be waited out; it is a failure with no reporter.
     *
     * So the wait is bounded and the timeout does the reporting the driver
     * cannot: it names the table, the byte position, and what the server itself
     * says it is doing. A restore that exits non-zero at 10 minutes is strictly
     * better than one that hangs until someone kills it and reads the corpse.
     */
    await watched(`copy_stream ${t.table}`, trace, observer, targetDb, STALL_PROBE_MS, async () => {
      let timer: NodeJS.Timeout | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `COPY ${t.table} made no progress for ${Math.round(COPY_DEADLINE_MS / 1000)}s ` +
                `(${sent} of ${t.bytes} bytes sent). The server has almost certainly rejected the ` +
                `statement — check the PostgreSQL log for an ERROR naming this table. postgres.js ` +
                `cannot surface an ErrorResponse for a COPY it already resolved, so this deadline ` +
                `is the only reporter.`,
            ),
          );
        }, COPY_DEADLINE_MS);
      });
      try {
        await Promise.race([pipeline(source, writable), deadline]);
      } catch (err) {
        trace('copy_failed', {
          table: t.table,
          bytesSent: sent,
          bytesExpected: t.bytes,
          why: err instanceof Error ? err.message : String(err),
        });
        throw err;
      } finally {
        clearTimeout(timer);
      }
    });
    /**
     * `pipeline` resolving IS the CommandComplete.
     *
     * postgres.js resolves the query promise at `CopyInResponse` — the moment
     * the server says "send data" — so awaiting the query proves nothing. What
     * closes the writable is its `final` callback, and connection.js fires that
     * from `CommandComplete`. So this line is the server's acknowledgement, and
     * it is the line a stalled COPY never reaches.
     */
    trace('copy_complete', {
      table: t.table,
      bytesSent: sent,
      bytesExpected: t.bytes,
      truncatedOnPurpose: truncateTable === t.table,
    });
    if (truncateTable === t.table) {
      console.log(`  ${t.table.padEnd(28)} DELIBERATELY TRUNCATED at ${sent} of ${t.bytes} bytes`);
    }
  }

  // ── constraints and triggers back ─────────────────────────────────────────
  if (triggerMode === 'replica') {
    await sql.unsafe(`SET session_replication_role = 'origin'`);
    const [r] = await sql.unsafe<{ v: string }[]>(
      `SELECT current_setting('session_replication_role') AS v`,
    );
    trace('triggers_restored', { mechanism: 'session_replication_role', verified: r?.v ?? null });
  } else if (triggerMode === 'per_table') {
    for (const t of manifest.tables) await sql.unsafe(`ALTER TABLE ${t.table} ENABLE TRIGGER USER`);
    trace('triggers_restored', { mechanism: 'ALTER TABLE ENABLE TRIGGER USER' });
  }

  /**
   * REFERENTIAL VALIDATION, because the load skipped the FK triggers.
   *
   * Turning FK enforcement off for a bulk load is standard and turning it back
   * on proves nothing about the rows that arrived while it was off. Postgres has
   * no "re-check this already-valid constraint" command, so the check is written
   * out: for every foreign key on a restored table, count the rows whose
   * referenced key is absent. Cheap on a bounded pack, and it is the assertion
   * the export's "referentially closed" claim actually deserves.
   */
  let danglingTotal = 0;
  for (const fk of fks) {
    const on = fk.childcols.map((c, i) => `p."${fk.parentcols[i]}" = ch."${c}"`).join(' AND ');
    const notNull = fk.childcols.map((c) => `ch."${c}" IS NOT NULL`).join(' AND ');
    const [row] = await sql.unsafe<{ n: string }[]>(
      `SELECT count(*)::text AS n FROM ${fk.child} ch
        WHERE ${notNull}
          AND NOT EXISTS (SELECT 1 FROM ${fk.parent} p WHERE ${on})`,
    );
    const n = Number(row?.n ?? 0);
    danglingTotal += n;
    trace('fk_check', { constraint: fk.conname, child: fk.child, parent: fk.parent, dangling: n });
  }
  trace('fk_validated', { constraints: fks.length, dangling: danglingTotal });

  /**
   * ANALYZE after a bulk load. Without it the target's statistics say every
   * table is empty, and the first real query gets a plan built for no rows —
   * which is the same class of failure as the sparse arm's constant estimate,
   * arriving on day one of a new deployment.
   */
  const analyzeStart = Date.now();
  await watched('analyze', trace, observer, targetDb, STALL_PROBE_MS, () => sql.unsafe('ANALYZE'));
  trace('analyze', { ms: Date.now() - analyzeStart });

  /**
   * INDEXES, asserted rather than assumed.
   *
   * The migrations built them and the COPY maintained them, so this is not a
   * rebuild — it is the check that none of them is `indisvalid = false`, which
   * is the state a failed concurrent build leaves behind and the one shape that
   * makes a restored database answer queries correctly and slowly.
   */
  const [idx] = await sql.unsafe<{ total: string; invalid: string }[]>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE NOT i.indisvalid)::text AS invalid
       FROM pg_index i
       JOIN pg_class c ON c.oid = i.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'`,
  );
  trace('indexes', { total: Number(idx?.total ?? 0), invalid: Number(idx?.invalid ?? 0) });
  if (Number(idx?.invalid ?? 0) > 0) findings.push(`${idx?.invalid} INVALID index(es) on the target`);

  // ── verify ────────────────────────────────────────────────────────────────
  console.log('\nverifying against the manifest:\n');
  let mismatches = 0;
  for (const t of manifest.tables) {
    const orderBy = ORDER_BY[t.table] ?? 'ctid';
    const got = await watched(`checksum ${t.table}`, trace, observer, targetDb, STALL_PROBE_MS, () =>
      checksum(sql, t.table, orderBy, t.columns),
    );
    const rowsOk = got.rows === t.rows;
    const ckOk = got.checksum === t.checksum;
    if (!rowsOk || !ckOk) mismatches += 1;
    trace('verify', {
      table: t.table,
      rows: got.rows,
      expectedRows: t.rows,
      rowsOk,
      checksumOk: ckOk,
    });
    console.log(
      `  ${t.table.padEnd(28)} rows ${String(got.rows).padStart(8)}/${String(t.rows).padEnd(8)} ` +
        `${rowsOk ? 'ok ' : 'MISMATCH'}  checksum ${ckOk ? 'ok' : 'MISMATCH'}`,
    );
  }
  if (danglingTotal > 0) {
    mismatches += 1;
    findings.push(
      `${danglingTotal} DANGLING foreign-key row(s) — the load ran with FK triggers off and the ` +
        'export was not referentially closed after all',
    );
  }

  if (findings.length > 0) {
    console.log('\nFINDINGS:');
    for (const f of findings) console.log(`  ! ${f}`);
  }
  console.log(`\n${mismatches === 0 ? 'RESTORE VERIFIED' : `RESTORE FAILED — ${mismatches} table(s) do not match`}`);

  trace('verdict', {
    mismatches,
    dangling: danglingTotal,
    findings: findings.length,
    verdict: mismatches === 0 ? 'RESTORE_VERIFIED' : 'RESTORE_FAILED',
  });

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * ACTIVATION IS A THIRD VERDICT, AND A VERIFIED RESTORE DOES NOT IMPLY IT
   * ───────────────────────────────────────────────────────────────────────────
   *
   * Everything above answers *did every row arrive intact*. Nothing above
   * answers *can this generation serve a search*, and the two come apart in the
   * ordinary case: the `ANALYZE` a few lines up is the only thing standing
   * between a byte-perfect restore and a planner that costs every table as
   * empty. So the ANALYZE is now PROVED rather than assumed — `pg_statistic` is
   * read back, because the planner reads that and not `last_analyze` — and the
   * real retrieval functions are run against the generation before it may be
   * activated.
   *
   * `release/activation.ts` holds the rule and its reasoning. This file stays the
   * one place a release is landed and verified; a second orchestrator is exactly
   * what would let "restored" and "activated" drift apart.
   *
   * `--skip-activation-gate` does not make a generation activatable. It records
   * `ACTIVATION = REFUSE (gate skipped)`, so skipping is visible in the artifact
   * rather than indistinguishable from passing.
   */
  const gateSkipped = argv.includes('--skip-activation-gate');
  const stats = gateSkipped ? [] : await readStatistics(sql);
  const statistics = statisticsVerdict(stats);
  const probes = gateSkipped ? [] : await runSearchSmoke(sql).catch((err: unknown) => {
    /* A smoke that could not even start is a smoke that did not pass. It must
     * never fall through to an empty probe list that reads as "nothing failed". */
    trace('search_smoke_unavailable', { why: err instanceof Error ? err.message : String(err) });
    return [
      {
        name: 'search smoke',
        query: '',
        ms: 0,
        results: 0,
        degraded: [] as string[],
        outcome: 'threw',
        error: err instanceof Error ? err.message : String(err),
      },
    ];
  });
  const smoke = smokeVerdict(probes);
  const decision = activationDecision({
    restoreVerified: mismatches === 0,
    statistics,
    smoke,
  });

  trace('statistics', {
    tables: stats.map((s) => ({
      t: s.table,
      hasRows: s.hasRows,
      bytes: s.sizeBytes,
      plannerRows: s.plannerRowEstimate,
      pgStatistic: s.statisticRows,
      lastAnalyze: s.lastAnalyze,
      lastAutoanalyze: s.lastAutoanalyze,
    })),
    ready: statistics.ready,
  });
  trace('search_smoke', {
    probes: probes.map((p) => ({ name: p.name, ms: p.ms, n: p.results, outcome: p.outcome, error: p.error })),
    ready: smoke.ready,
    slowestMs: smoke.slowestMs,
  });
  trace('activation', { verdict: decision.verdict, reasons: decision.reasons, gateSkipped });

  console.log('\noptimizer statistics (the planner reads pg_statistic, not last_analyze):\n');
  for (const s of stats) {
    console.log(
      `  ${s.table.padEnd(28)} rows ${(s.hasRows === null ? 'ABSENT' : s.hasRows ? 'yes' : 'empty').padStart(6)}  bytes ${String(s.sizeBytes ?? '-').padStart(14)}  ` +
        `pg_statistic ${String(s.statisticRows).padStart(4)}  ` +
        `analyze ${s.lastAnalyze ?? '—'}  autoanalyze ${s.lastAutoanalyze ?? '—'}`,
    );
  }
  if (probes.length > 0) {
    console.log('\nsearch smoke (the real retrieval path, on this generation):\n');
    for (const p of probes) {
      console.log(
        `  ${p.name.padEnd(28)} ${String(p.ms).padStart(6)}ms  ${String(p.results).padStart(3)} hit(s)  ` +
          `${p.outcome}${p.error ? `  ERROR ${p.error}` : ''}`,
      );
    }
  }

  const activation = gateSkipped
    ? { verdict: 'REFUSE' as const, activate: false, reasons: ['activation gate skipped by flag'] }
    : decision;
  console.log(
    `\nACTIVATION ${activation.verdict}${
      activation.activate ? '' : `\n${activation.reasons.map((r) => `  ! ${r}`).join('\n')}`
    }`,
  );

  writeFileSync(
    join(dir, 'ACTIVATION.json'),
    `${JSON.stringify(
      {
        kind: 'lawmind-corpus-generation-activation',
        releaseVersion: manifest.releaseVersion,
        target: targetDb,
        checkedAt: new Date().toISOString(),
        restoreVerified: mismatches === 0,
        statistics: { verdict: statistics, tables: stats },
        searchSmoke: { verdict: smoke, probes },
        activation,
        /* The two prerequisites, named so a reader does not have to infer them
         * from the shape of the object. */
        requiresStatistics: true,
        requiresSearchSmoke: true,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log(`\ntrace written to ${join(dir, 'RESTORE_TRACE.jsonl')}`);
  console.log(`activation record written to ${join(dir, 'ACTIVATION.json')}`);

  await sql.end();
  if (observer) await observer.end();
  /* Non-zero on either failure. A generation that restored perfectly and cannot
   * serve a search is not a success, and an orchestrator that exits 0 on it is
   * how an unservable generation gets activated. */
  process.exit(mismatches === 0 && activation.activate ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
