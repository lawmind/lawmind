/**
 * NEW2 — the measurement the local scale-up decision is made from.
 *
 * Samples the host, the fleet and (after cutover) the local database over a
 * window, and appends one row to a JSONL ledger. The scale-up is 3 canaries ->
 * 8 -> 16 -> 24/32/38, and each step is only taken if this tool says the step
 * before it actually increased throughput. 38 workers is a HISTORICAL number,
 * not a measured optimum: it was reached on Railway, where the bottleneck was a
 * shared TCP proxy, and nothing about it transfers to local NVMe.
 *
 * ---------------------------------------------------------------------------
 * THE OBJECTIVE FUNCTION IS DOCUMENTS WRITTEN PER HOUR, NOT WORKER COUNT
 * ---------------------------------------------------------------------------
 * Worker count is an input that is easy to see; throughput is the output that
 * matters and is easy not to look at. Every previous fleet incident in this lane
 * had the same shape — the fleet LOOKED alive and was writing nothing — so the
 * headline number here is derived from rows landing, and process count is
 * reported next to it as context rather than as evidence.
 *
 * Stop increasing workers when any of these turn over:
 *   documents/hour stops rising     the only reason to add workers at all
 *   NVMe queue length climbs        disk is saturated; more workers just queue
 *   Postgres waits rise materially  contention, not capacity
 *   available RAM falls             thrashing is silent and ruins the signal
 *   error/retry rate rises          throughput bought with failures is not
 *                                   throughput
 *
 * ---------------------------------------------------------------------------
 * IT CANNOT TOUCH RAILWAY, BY CONSTRUCTION
 * ---------------------------------------------------------------------------
 * It reads `LOCAL_DATABASE_URL` ONLY, and refuses if that is not loopback. It
 * deliberately does NOT use `DATABASE_URL` the way `scripts/fleet-rowcount.mjs`
 * does — that script follows whatever the fleet is pointed at, which is correct
 * for it and would be a live Railway connection here, during a hold whose whole
 * content is that nothing of mine connects to Railway.
 *
 * With no local database up it still produces the two numbers that need no
 * database at all — host counters, and documents advanced per second read
 * straight from the checkpoint offsets — and marks the database section
 * `unavailable` rather than reporting zeros. A zero and a missing measurement
 * are different facts and the ledger has to be able to tell them apart.
 *
 *   node scripts/migration/new2-fleet-metrics.mjs                 60s window
 *   node scripts/migration/new2-fleet-metrics.mjs --window 300    5min window
 *   node scripts/migration/new2-fleet-metrics.mjs --label 8w      tag the row
 */
import { Buffer } from 'node:buffer';
import { readFileSync, existsSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { setTimeout } from 'node:timers';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CKPT_DIR = join(ROOT, 'services', 'ingest', '.checkpoints');
const LEDGER = join(ROOT, 'docs', 'ops', 'migration', 'new2-fleet-metrics.jsonl');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const WINDOW_S = Number(arg('window', '60'));
const LABEL = arg('label', null);

// ---------------------------------------------------------------------------
// host counters
// ---------------------------------------------------------------------------
/**
 * One PowerShell invocation for all of them. Spawning a process per counter
 * costs more than the thing being measured on a machine that is, by the time
 * this matters, running 16+ node processes.
 */
function hostCounters() {
  const ps = `
$paths = @(
  '\\processor(_total)\\% processor time',
  '\\memory\\available mbytes',
  '\\physicaldisk(_total)\\disk read bytes/sec',
  '\\physicaldisk(_total)\\disk write bytes/sec',
  '\\physicaldisk(_total)\\current disk queue length'
)
$s = (Get-Counter -Counter $paths -ErrorAction Stop).CounterSamples
$net = (Get-Counter -Counter '\\network interface(*)\\bytes received/sec' -ErrorAction SilentlyContinue).CounterSamples |
       Where-Object { $_.InstanceName -notmatch 'loopback|isatap|teredo' } |
       Measure-Object -Property CookedValue -Sum
[pscustomobject]@{
  cpuPct        = [math]::Round(($s | Where-Object { $_.Path -like '*processor time' }).CookedValue, 2)
  ramFreeMb     = [math]::Round(($s | Where-Object { $_.Path -like '*available mbytes' }).CookedValue, 0)
  diskReadMbs   = [math]::Round(($s | Where-Object { $_.Path -like '*disk read bytes/sec' }).CookedValue / 1MB, 2)
  diskWriteMbs  = [math]::Round(($s | Where-Object { $_.Path -like '*disk write bytes/sec' }).CookedValue / 1MB, 2)
  diskQueue     = [math]::Round(($s | Where-Object { $_.Path -like '*current disk queue length' }).CookedValue, 2)
  netRecvMbs    = [math]::Round($net.Sum / 1MB, 2)
} | ConvertTo-Json -Compress`;
  try {
    return JSON.parse(execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 60_000 }));
  } catch (err) {
    return { error: String(err.message).slice(0, 200) };
  }
}

/**
 * Worker processes by kind, from the command line rather than the image name —
 * every one of them is `node.exe`, so counting images counts this script too.
 */
function workerProcesses() {
  const ps = `
$procs = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'hc-load-cli|hc-classify-cli|enrich-cli|citations-cli|paragraphs-cli|supervise\\.mjs' } |
  ForEach-Object {
    $k = switch -Regex ($_.CommandLine) {
      'hc-load-cli'     { 'harvest';    break }
      'hc-classify-cli' { 'classify';   break }
      'enrich-cli'      { 'enrich';     break }
      'citations-cli'   { 'citations';  break }
      'paragraphs-cli'  { 'paragraphs'; break }
      default           { 'supervisor' }
    }
    [pscustomobject]@{ kind = $k; ws = $_.WorkingSetSize }
  })
$g = @($procs | Group-Object kind | ForEach-Object {
    [pscustomobject]@{ kind = $_.Name; count = $_.Count; rssMb = [math]::Round((($_.Group | Measure-Object ws -Sum).Sum)/1MB, 0) }
  })
ConvertTo-Json -InputObject $g -Compress -Depth 3`;
  try {
    const raw = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 60_000 }).trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    /**
     * Windows PowerShell 5.1 has no `-AsArray`, and unwraps a single-element
     * array to a bare object on the way out. A one-worker fleet is exactly the
     * canary case this tool exists to measure, so the shape is normalised here
     * rather than assumed.
     */
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    return [{ error: String(err.message).slice(0, 200) }];
  }
}

// ---------------------------------------------------------------------------
// checkpoints — throughput WITHOUT a database
// ---------------------------------------------------------------------------
/**
 * Every checkpoint records a per-source-file row offset. Summed across all 49
 * scopes and sampled twice, the delta is source documents READ per second, and
 * it needs no database at all. That matters twice over: it is the only
 * throughput signal available during the hold, and after cutover it is the half
 * of the pipeline that a database problem cannot flatter — reads advancing
 * while writes do not is precisely the "alive but writing nothing" failure.
 */
function checkpointOffsetSum() {
  let sum = 0;
  let files = 0;
  for (const name of readdirSync(CKPT_DIR)) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(CKPT_DIR, name), 'utf8'));
      for (const v of Object.values(parsed)) sum += Number(v?.offset ?? 0);
      files++;
    } catch {
      /* an unparseable checkpoint is the inventory tool's finding, not this one's */
    }
  }
  return { offsetSum: sum, checkpointFiles: files };
}

// ---------------------------------------------------------------------------
// logs — the workers' own docs/s, and the error rate
// ---------------------------------------------------------------------------
/**
 * Workers print `[407] mapped=405 written=405 1.8 docs/s · 10_8/2024` per batch.
 * Only lines written DURING the window are counted: a log tail is cumulative
 * history and averaging over all of it would smooth away the very change each
 * scale-up step is trying to detect.
 */
const BATCH_LINE = /mapped=(\d+)\s+written=(\d+)\s+([\d.]+)\s+docs\/s/g;

function readTail(path, fromByte) {
  const size = statSync(path).size;
  if (size <= fromByte) return { text: '', size };
  const fd = readFileSync(path);
  return { text: fd.subarray(fromByte, size).toString('utf8'), size };
}

function logSizes() {
  const out = new Map();
  for (const f of readdirSync(ROOT)) {
    if (!/^(hc-boot|hc-classify|enrich|citations|paragraphs).*\.log(\.err)?$/.test(f)) continue;
    try {
      out.set(f, statSync(join(ROOT, f)).size);
    } catch {
      /* rotated mid-sample */
    }
  }
  return out;
}

function logDelta(before) {
  let batches = 0;
  let mapped = 0;
  let written = 0;
  let errorLines = 0;
  let errBytes = 0;
  const scopes = new Set();
  for (const [f, startSize] of before) {
    const path = join(ROOT, f);
    if (!existsSync(path)) continue;
    let text;
    try {
      ({ text } = readTail(path, startSize));
    } catch {
      continue;
    }
    if (!text) continue;
    if (f.endsWith('.err')) {
      errBytes += Buffer.byteLength(text);
      errorLines += text.split(/\r?\n/).filter((l) => l.trim()).length;
      continue;
    }
    scopes.add(f.replace(/\.log$/, ''));
    for (const m of text.matchAll(BATCH_LINE)) {
      batches++;
      mapped += Number(m[1]);
      written += Number(m[2]);
    }
    /** Retries and timeouts are counted separately from stderr: the workers use
     *  continue-not-break semantics, so a recoverable failure prints to stdout
     *  and never reaches `.log.err` at all. */
    errorLines += (text.match(/\b(ETIMEDOUT|ENOTFOUND|ECONNRESET|CONNECT_TIMEOUT|retry|failed)\b/gi) ?? []).length;
  }
  return { batches, mapped, written, errorLines, errBytes, activeScopes: [...scopes].sort() };
}

// ---------------------------------------------------------------------------
// local Postgres — loopback only, absent rather than zero
// ---------------------------------------------------------------------------
function localUrl() {
  const envPath = join(ROOT, '.env');
  if (!existsSync(envPath)) return null;
  const m = readFileSync(envPath, 'utf8').match(/^LOCAL_DATABASE_URL=(.*)$/m);
  const url = m?.[1]?.trim();
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    if (!/^(127\.0\.0\.1|localhost|::1)$/.test(host)) return null;
  } catch {
    return null;
  }
  return url;
}

async function postgresSample(sql) {
  /**
   * `n_tup_ins` rather than `count(*)`: at 7.3M rows a count takes ~12s, which
   * is a fifth of the default window and perturbs the very disk it is measuring.
   * The delta of the insert counter is exactly "documents written", cheaply.
   */
  const [stat] = await sql`
    select coalesce(sum(n_tup_ins), 0)::bigint as judgment_inserts
    from pg_stat_user_tables where relname = 'judgments'`;
  const [db] = await sql`
    select xact_commit::bigint, xact_rollback::bigint, blks_read::bigint, blks_hit::bigint,
           tup_inserted::bigint
    from pg_stat_database where datname = current_database()`;
  const waits = await sql`
    select coalesce(wait_event_type, 'running') as kind, count(*)::int as n
    from pg_stat_activity
    where datname = current_database() and pid <> pg_backend_pid()
    group by 1 order by 2 desc`;
  return { judgmentInserts: Number(stat.judgment_inserts), db, waits };
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
const startedAt = new Date();
const url = localUrl();
let sql = null;
let dbState = 'unavailable — LOCAL_DATABASE_URL absent or not loopback';

if (url) {
  try {
    const { default: postgres } = await import('../../services/ingest/node_modules/postgres/src/index.js');
    sql = postgres(url, { ssl: false, max: 1, idle_timeout: 5, connect_timeout: 10 });
    await sql`select 1`;
    dbState = 'ok';
  } catch (err) {
    sql = null;
    dbState = `unavailable — ${String(err.message).slice(0, 120)}`;
  }
}

const ckptBefore = checkpointOffsetSum();
const logsBefore = logSizes();
const pgBefore = sql ? await postgresSample(sql) : null;
const hostA = hostCounters();

await new Promise((r) => setTimeout(r, WINDOW_S * 1000));

const hostB = hostCounters();
const ckptAfter = checkpointOffsetSum();
const logs = logDelta(logsBefore);
const pgAfter = sql ? await postgresSample(sql) : null;
const procs = workerProcesses();
if (sql) await sql.end({ timeout: 5 });

const elapsedS = (Date.now() - startedAt.getTime()) / 1000 - 0; // includes both counter reads
const per = (n) => Number((n / elapsedS).toFixed(3));
const avg = (a, b, k) => (a?.[k] == null || b?.[k] == null ? null : Number(((a[k] + b[k]) / 2).toFixed(2)));

const documentsWrittenPerS = pgBefore && pgAfter ? per(pgAfter.judgmentInserts - pgBefore.judgmentInserts) : null;
const documentsReadPerS = per(ckptAfter.offsetSum - ckptBefore.offsetSum);

const row = {
  takenAt: startedAt.toISOString(),
  label: LABEL,
  windowSeconds: Number(elapsedS.toFixed(1)),
  tool: 'scripts/migration/new2-fleet-metrics.mjs',
  /** The number the scale-up decision is made from. */
  objective: {
    documentsWrittenPerHour: documentsWrittenPerS == null ? null : Math.round(documentsWrittenPerS * 3600),
    documentsWrittenPerSecond: documentsWrittenPerS,
    documentsReadPerSecond: documentsReadPerS,
    workersAlive: procs.reduce((n, p) => n + (p.count ?? 0), 0),
    note: 'documentsWrittenPerHour is null when the local database is unavailable. Null is not zero.',
  },
  host: {
    cpuPct: avg(hostA, hostB, 'cpuPct'),
    ramFreeMb: avg(hostA, hostB, 'ramFreeMb'),
    diskReadMbs: avg(hostA, hostB, 'diskReadMbs'),
    diskWriteMbs: avg(hostA, hostB, 'diskWriteMbs'),
    diskQueue: avg(hostA, hostB, 'diskQueue'),
    netRecvMbs: avg(hostA, hostB, 'netRecvMbs'),
    error: hostA.error ?? hostB.error ?? null,
  },
  fleet: {
    processes: procs,
    stopFilePresent: existsSync(join(CKPT_DIR, 'STOP')),
    checkpointFiles: ckptAfter.checkpointFiles,
    checkpointOffsetSum: ckptAfter.offsetSum,
    activeScopes: logs.activeScopes,
    batchesCompleted: logs.batches,
    mapped: logs.mapped,
    writtenReportedByWorkers: logs.written,
  },
  errors: {
    lines: logs.errorLines,
    stderrBytes: logs.errBytes,
    /** Errors per completed batch — a rate that survives comparison across
     *  fleet sizes, unlike a raw count which grows with throughput alone. */
    perBatch: logs.batches > 0 ? Number((logs.errorLines / logs.batches).toFixed(3)) : null,
  },
  database: {
    state: dbState,
    waits: pgAfter?.waits ?? null,
    xactCommitPerS: pgBefore && pgAfter ? per(Number(pgAfter.db.xact_commit) - Number(pgBefore.db.xact_commit)) : null,
    xactRollbackPerS: pgBefore && pgAfter ? per(Number(pgAfter.db.xact_rollback) - Number(pgBefore.db.xact_rollback)) : null,
    blksReadPerS: pgBefore && pgAfter ? per(Number(pgAfter.db.blks_read) - Number(pgBefore.db.blks_read)) : null,
    cacheHitRatio:
      pgBefore && pgAfter
        ? (() => {
            const r = Number(pgAfter.db.blks_read) - Number(pgBefore.db.blks_read);
            const h = Number(pgAfter.db.blks_hit) - Number(pgBefore.db.blks_hit);
            return r + h > 0 ? Number((h / (r + h)).toFixed(4)) : null;
          })()
        : null,
  },
};

appendFileSync(LEDGER, `${JSON.stringify(row)}\n`, 'utf8');

const f = (v, unit = '') => (v == null ? 'n/a'.padStart(10) : `${String(v)}${unit}`.padStart(10));
console.log(`NEW2 FLEET METRICS — ${row.takenAt}  window ${row.windowSeconds}s${LABEL ? `  [${LABEL}]` : ''}`);
console.log(`  OBJECTIVE  documents written/hour ${f(row.objective.documentsWrittenPerHour)}   workers alive ${row.objective.workersAlive}`);
console.log(`             documents read/s (checkpoints) ${f(documentsReadPerS)}`);
console.log('');
console.log(`  host       cpu ${f(row.host.cpuPct, '%')}   ram free ${f(row.host.ramFreeMb, 'MB')}   nvme r ${f(row.host.diskReadMbs, 'MB/s')} w ${f(row.host.diskWriteMbs, 'MB/s')}   queue ${f(row.host.diskQueue)}`);
console.log(`  network    recv ${f(row.host.netRecvMbs, 'MB/s')}`);
console.log(`  fleet      batches ${row.fleet.batchesCompleted}   mapped ${row.fleet.mapped}   written(worker-reported) ${row.fleet.writtenReportedByWorkers}   STOP ${row.fleet.stopFilePresent}`);
for (const p of procs) if (p.kind) console.log(`             ${String(p.count).padStart(3)} ${p.kind.padEnd(11)} ${p.rssMb} MB rss`);
console.log(`  errors     ${row.errors.lines} lines   ${row.errors.perBatch == null ? 'n/a' : row.errors.perBatch} per batch`);
console.log(`  database   ${row.database.state}`);
if (row.database.waits) {
  console.log(`             waits: ${row.database.waits.map((w) => `${w.kind}=${w.n}`).join(' ')}`);
  console.log(`             commit/s ${f(row.database.xactCommitPerS)}  rollback/s ${f(row.database.xactRollbackPerS)}  cache hit ${f(row.database.cacheHitRatio)}`);
}
console.log(`\nappended: ${LEDGER}`);
