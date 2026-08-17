#!/usr/bin/env node
/**
 * CX1 local heavy-lab scheduler.
 *
 * This is an observer first: it reads OS pressure, disk headroom, PostgreSQL
 * activity, and known lane processes, then recommends the largest CX1 job class
 * that should run right now. It never kills another lane's work and it does not
 * launch heavy jobs unless a later explicit subcommand wires one in.
 */
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { PG, run as pgRun } from './migration/pg-local.mjs';

const JOB_CLASSES = ['LIGHT', 'MEDIUM', 'HEAVY', 'VECTOR_EXCLUSIVE'];

const MAIN_LANE_PATTERNS = [
  /post-migration/i,
  /hc-(load|boot|classify|adjudicate|citations|coverage|yield)/i,
  /citation-keys/i,
  /citations-cli/i,
  /resolve-cli/i,
  /paragraphs-cli/i,
  /enrich/i,
  /pg_restore/i,
  /pg_dump/i,
  /pnpm.*harness/i,
  /arms-cli/i,
  /ann-probe/i,
  /held-not-retrieved/i,
  /reverify-spans/i,
];

const CX1_PATTERNS = [
  /cx1-/i,
  /CX1_/i,
  /cx1-heavy-lab-runner/i,
];

function psJson(command) {
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `${command} | ConvertTo-Json -Depth 4`],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true },
  );
  if (r.status !== 0) {
    return { ok: false, error: (r.stderr || r.stdout || '').trim() };
  }
  const text = (r.stdout || '').trim();
  if (!text) return { ok: true, value: [] };
  try {
    const parsed = JSON.parse(text);
    return { ok: true, value: Array.isArray(parsed) ? parsed : [parsed] };
  } catch (error) {
    return { ok: false, error: `PowerShell JSON parse failed: ${error.message}` };
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function cpuSnapshot() {
  return os.cpus().map((cpu) => ({ ...cpu.times }));
}

function cpuPercentBetween(a, b) {
  let idle = 0;
  let total = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const before = a[i];
    const after = b[i];
    const beforeTotal = Object.values(before).reduce((sum, n) => sum + n, 0);
    const afterTotal = Object.values(after).reduce((sum, n) => sum + n, 0);
    idle += after.idle - before.idle;
    total += afterTotal - beforeTotal;
  }
  if (total <= 0) return null;
  return Math.max(0, Math.min(100, (1 - idle / total) * 100));
}

function processSnapshot() {
  const result = psJson(
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,WorkingSetSize',
  );
  if (!result.ok) return { processes: [], error: result.error };
  const allProcesses = result.value.map((p) => {
    const commandLine = String(p.CommandLine || '');
    const joined = `${p.Name || ''} ${commandLine}`;
    return {
      pid: Number(p.ProcessId),
      ppid: Number(p.ParentProcessId),
      name: String(p.Name || ''),
      commandLine: commandLine.length > 260 ? `${commandLine.slice(0, 257)}...` : commandLine,
      workingSetBytes: Number(p.WorkingSetSize || 0),
      isCx1: CX1_PATTERNS.some((re) => re.test(joined)),
      isMainLaneHeavy: MAIN_LANE_PATTERNS.some((re) => re.test(joined)),
    };
  });
  const known = allProcesses.filter(
    (p) =>
      p.isCx1 ||
      p.isMainLaneHeavy ||
      /postgres|pg_dump|pg_restore|node\.exe|python\.exe|codebase-memory-mcp/i.test(p.name),
  );
  return {
    processes: known,
    processCount: allProcesses.length,
    totalWorkingSetBytes: allProcesses.reduce((sum, p) => sum + p.workingSetBytes, 0),
  };
}

function diskSnapshot() {
  const result = psJson(
    'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,FreeSpace,Size',
  );
  if (!result.ok) return { disks: [], error: result.error };
  return {
    disks: result.value.map((d) => {
      const size = Number(d.Size || 0);
      const free = Number(d.FreeSpace || 0);
      return {
        drive: String(d.DeviceID || ''),
        freeBytes: free,
        sizeBytes: size,
        freePct: size > 0 ? (free / size) * 100 : null,
      };
    }),
  };
}

function redactQuery(query) {
  return String(query || '')
    .replace(/'([^']|'')*'/g, "'...'");
}

function pgActivity() {
  const sql = `
    SELECT jsonb_build_object(
      'backends', count(*),
      'active', count(*) FILTER (WHERE state = 'active'),
      'inTransaction', count(*) FILTER (WHERE state IN ('idle in transaction','active')),
      'blocked', count(*) FILTER (WHERE cardinality(pg_blocking_pids(pid)) > 0),
      'oldestSeconds', coalesce(max(extract(epoch from now() - xact_start))::int, 0),
      'queries', coalesce(jsonb_agg(jsonb_build_object(
        'pid', pid,
        'state', state,
        'seconds', extract(epoch from now() - coalesce(query_start, xact_start, backend_start))::int,
        'waitEventType', wait_event_type,
        'waitEvent', wait_event,
        'query', left(query, 220)
      ) ORDER BY coalesce(query_start, xact_start, backend_start))
      FILTER (WHERE pid <> pg_backend_pid() AND state <> 'idle'), '[]'::jsonb)
    )
    FROM pg_stat_activity
    WHERE datname = current_database();
  `;
  const psql = `${PG.bin}\\psql.exe`;
  const r = pgRun(psql, ['-d', PG.database, '-t', '-A', '-X', '-q', '-c', sql], { quiet: true });
  if (r.status !== 0) return { available: false, error: (r.stderr || r.stdout || '').trim() };
  try {
    const parsed = JSON.parse((r.stdout || '{}').trim());
    parsed.queries = (parsed.queries || []).map((q) => ({ ...q, query: redactQuery(q.query) }));
    return { available: true, ...parsed };
  } catch (error) {
    return { available: false, error: `pg_stat_activity JSON parse failed: ${error.message}` };
  }
}

function classify(snapshot) {
  const reasons = [];
  let maxClass = 'VECTOR_EXCLUSIVE';

  const cpu = snapshot.system.cpuPct;
  const freeRamPct = snapshot.system.freeRamPct;
  const minDiskFreePct = Math.min(
    ...snapshot.disks.filter((d) => d.freePct !== null).map((d) => d.freePct),
  );
  const activePg = snapshot.postgres.available ? Number(snapshot.postgres.active || 0) : 0;
  const oldPg = snapshot.postgres.available ? Number(snapshot.postgres.oldestSeconds || 0) : 0;
  const mainHeavy = snapshot.processes.filter((p) => p.isMainLaneHeavy);
  const cx1 = snapshot.processes.filter((p) => p.isCx1 && p.pid !== process.pid);

  if (mainHeavy.length > 0) {
    maxClass = 'MEDIUM';
    reasons.push(`${mainHeavy.length} known main-lane heavy process(es) detected`);
  }
  if (activePg > 1 || oldPg > 120) {
    maxClass = JOB_CLASSES[Math.min(JOB_CLASSES.indexOf(maxClass), JOB_CLASSES.indexOf('MEDIUM'))];
    reasons.push(`PostgreSQL active=${activePg}, oldest transaction=${oldPg}s`);
  }
  if (cpu !== null && cpu > 70) {
    maxClass = JOB_CLASSES[Math.min(JOB_CLASSES.indexOf(maxClass), JOB_CLASSES.indexOf('MEDIUM'))];
    reasons.push(`CPU ${cpu.toFixed(1)}%`);
  }
  if (freeRamPct < 25) {
    maxClass = JOB_CLASSES[Math.min(JOB_CLASSES.indexOf(maxClass), JOB_CLASSES.indexOf('MEDIUM'))];
    reasons.push(`RAM free ${freeRamPct.toFixed(1)}%`);
  }
  if (minDiskFreePct < 20) {
    maxClass = JOB_CLASSES[Math.min(JOB_CLASSES.indexOf(maxClass), JOB_CLASSES.indexOf('LIGHT'))];
    reasons.push(`disk free floor ${minDiskFreePct.toFixed(1)}%`);
  }
  if (cx1.some((p) => /vector|hnsw|halfvec/i.test(p.commandLine))) {
    maxClass = 'LIGHT';
    reasons.push('existing CX1 vector/HNSW job detected');
  }
  if (!snapshot.postgres.available) {
    maxClass = 'LIGHT';
    reasons.push(`PostgreSQL unavailable to scheduler: ${snapshot.postgres.error}`);
  }

  if (reasons.length === 0) reasons.push('no pressure threshold crossed');

  return { maxClass, reasons };
}

async function collect() {
  const before = cpuSnapshot();
  sleep(750);
  const after = cpuSnapshot();
  const cpuPct = cpuPercentBetween(before, after);
  const totalRam = os.totalmem();
  const freeRam = os.freemem();
  const processState = processSnapshot();
  const diskState = diskSnapshot();
  const snapshot = {
    collectedAt: new Date().toISOString(),
    host: os.hostname(),
    system: {
      platform: process.platform,
      logicalCpus: os.cpus().length,
      cpuPct,
      totalRamBytes: totalRam,
      freeRamBytes: freeRam,
      freeRamPct: (freeRam / totalRam) * 100,
      loadavg: os.loadavg(),
    },
    disks: diskState.disks || [],
    processes: processState.processes || [],
    processSummary: {
      count: processState.processCount || 0,
      totalWorkingSetBytes: processState.totalWorkingSetBytes || 0,
    },
    postgres: pgActivity(),
    errors: [processState.error, diskState.error].filter(Boolean),
  };
  snapshot.recommendation = classify(snapshot);
  return snapshot;
}

function summary(snapshot) {
  const activeQueries = snapshot.postgres.available ? snapshot.postgres.queries.length : 0;
  const mainHeavy = snapshot.processes.filter((p) => p.isMainLaneHeavy).length;
  const cx1 = snapshot.processes.filter((p) => p.isCx1 && p.pid !== process.pid).length;
  const cpu = snapshot.system.cpuPct === null ? 'n/a' : `${snapshot.system.cpuPct.toFixed(1)}%`;
  const ram = `${snapshot.system.freeRamPct.toFixed(1)}%`;
  const disk = snapshot.disks
    .map((d) => `${d.drive} ${(d.freeBytes / 1024 ** 3).toFixed(1)} GiB free (${d.freePct?.toFixed(1)}%)`)
    .join('; ');

  console.log(`collectedAt       ${snapshot.collectedAt}`);
  console.log(`maxClass          ${snapshot.recommendation.maxClass}`);
  console.log(`cpu               ${cpu}`);
  console.log(`ram free          ${ram}`);
  console.log(`disk              ${disk}`);
  console.log(`postgres          ${snapshot.postgres.available ? `active queries ${activeQueries}, active backends ${snapshot.postgres.active}, oldest xact ${snapshot.postgres.oldestSeconds}s` : `unavailable (${snapshot.postgres.error})`}`);
  console.log(`known processes   main-lane heavy ${mainHeavy}, CX1 ${cx1}`);
  console.log('reasons');
  for (const reason of snapshot.recommendation.reasons) console.log(`  - ${reason}`);
}

async function main() {
  const cmd = process.argv[2] || 'recommend';
  const snapshot = await collect();
  if (cmd === 'json') {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  if (cmd === 'recommend' || cmd === 'status') {
    summary(snapshot);
    return;
  }
  console.error('usage: node scripts/cx1-heavy-lab-runner.mjs [recommend|status|json]');
  process.exit(2);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
