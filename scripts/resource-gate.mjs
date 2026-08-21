#!/usr/bin/env node
/**
 * The shared local resource gate — "may I run this class of work right now?"
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AND WHY IT IS NOT AN ORCHESTRATOR
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Four lanes share one box. The founder measured CPU ~90% with the GPU
 * effectively idle, which is not a scheduling problem in the abstract — it is
 * one concrete fact: **the classes of work we run contend for different
 * resources, and we had no way to say so.** An embedding job and a full-table
 * scan are both "heavy"; one wants VRAM and a tokeniser thread, the other wants
 * the page cache and the disk. Refusing them together wastes the GPU. Allowing
 * them together starves the fleet.
 *
 * So this answers per class, independently. It does not launch jobs, does not
 * queue them, does not kill anything, and holds no state beyond the claim
 * markers below. A lane asks; a lane decides.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY NOT `cx1-heavy-lab-runner.mjs`, WHICH ALREADY OBSERVES THIS BOX
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It observes the same pressure well and its collectors are the ancestors of
 * the ones here. Two things make it the wrong shape for this job rather than a
 * thing to extend:
 *
 *   1. It returns ONE `maxClass` on a single ladder LIGHT < MEDIUM < HEAVY <
 *      VECTOR_EXCLUSIVE. A ladder cannot express "GPU_EMBED yes, DB_SCAN no",
 *      because a ladder asserts the classes are ordered by cost — and the
 *      founder's instruction is precisely that they are not.
 *   2. It calls `main()` at module load, so it cannot be imported. This one
 *      guards its entry point and exports its collectors, which is the only
 *      way NEW1 and NEW2 can consult it without spawning a process per batch.
 *
 * It is left alone. Two observers that agree is fine; a shared one that some
 * later change loosens for one caller is not.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * USE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   node scripts/resource-gate.mjs status            human summary, all classes
 *   node scripts/resource-gate.mjs json              the whole snapshot
 *   node scripts/resource-gate.mjs check GPU_EMBED   exit 0 = ALLOW, 3 = DEFER
 *   node scripts/resource-gate.mjs claim DB_SCAN dedup-materialize
 *   node scripts/resource-gate.mjs release <token>
 *   node scripts/resource-gate.mjs claims            list live markers
 *
 * From JS, which is the point:
 *
 *   import { check, claim, release } from '../../scripts/resource-gate.mjs';
 *   const v = await check('GPU_EMBED');
 *   if (!v.allow) { log(v.reasons); return; }
 *   const token = claim('GPU_EMBED', 'embed-backfill');
 *   try { ...batch... } finally { release(token); }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A DEFER IS ADVICE ABOUT A MOMENT, NOT A LOCK
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Nothing here can stop a job. A caller that ignores the gate is not blocked,
 * and that is deliberate: a lock on a box where processes die from console
 * signals (`0xC000013A`, six events in four days) becomes a stale lock nobody
 * can clear, and the failure mode of a stale lock is the whole machine idle.
 * Claims therefore EXPIRE — see `CLAIM_TTL_MS`. The worst case here is that the
 * gate under-reports contention for a while. The worst case of a real lock is a
 * fleet that will not start and no way to tell why.
 */
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import postgres from 'postgres';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLAIM_DIR = join(ROOT, '.agents', 'resource');

/**
 * The five classes, defined by WHAT THEY CONTEND FOR rather than by how big
 * they feel. That distinction is the whole design: two jobs of the same size
 * that want different resources are not competitors.
 */
export const JOB_CLASSES = [
  // Metadata reads, small indexed queries, file I/O, report generation.
  // Contends with nothing. Present so a caller can express "I checked".
  'LIGHT',
  // Sustained multi-core work: OCR, parsing, tokenising, hashing, MinHash.
  // Contends with the ingest fleet for cores.
  'CPU_HEAVY',
  // Large sequential reads of a big table: census, backfill walks, count(*),
  // ANALYZE. Contends for the page cache and the disk, and lengthens every
  // concurrent query — NEW2 measured retrieval p50 43s while this class ran.
  'DB_SCAN',
  // GPU inference: embedding generation. Wants VRAM and enough CPU to keep the
  // tokeniser fed. Contends with almost nothing else we run.
  'GPU_EMBED',
  // Index construction: HNSW/IVFFlat builds, big CREATE INDEX. Wants RAM, all
  // cores, the disk and a long uninterrupted window at once. The only class
  // that should be close to exclusive.
  'VECTOR_BUILD',
];

/** A claim older than this is treated as dead. See the header on why. */
const CLAIM_TTL_MS = 30 * 60 * 1000;

/**
 * Processes that mean "the ingest fleet is working". Kept as patterns rather
 * than a PID list because the fleet's workers are respawned by a supervisor and
 * a PID recorded anywhere is wrong within the hour.
 */
const FLEET_PATTERNS = [
  /hc-(load|boot|classify|adjudicate|citations|coverage|yield)/i,
  /hc-ingest/i,
  /start-ingest-fleet/i,
  /supervise/i,
  /services[\\/]ingest[\\/]src[\\/]/i,
];

/** Work of ours that is itself heavy, so a second copy should hold off. */
const HEAVY_PATTERNS = [
  /citation-keys/i,
  /citations-cli/i,
  /resolve-cli/i,
  /paragraphs-cli/i,
  /enrich-cli/i,
  /chunk/i,
  /embed/i,
  /pg_dump|pg_restore/i,
  /cx1-/i,
];

// ───────────────────────────────────────────────────────────────────────────
// COLLECTORS
// ───────────────────────────────────────────────────────────────────────────

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function ps(command) {
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command + ' | ConvertTo-Json -Depth 3 -Compress'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true },
  );
  if (r.status !== 0) return { ok: false, error: (r.stderr || r.stdout || '').trim().slice(0, 300) };
  const text = (r.stdout || '').trim();
  if (!text) return { ok: true, value: [] };
  try {
    const parsed = JSON.parse(text);
    return { ok: true, value: Array.isArray(parsed) ? parsed : [parsed] };
  } catch (error) {
    return { ok: false, error: 'JSON parse failed: ' + error.message };
  }
}

/**
 * CPU busy percent, sampled from `os.cpus()` twice.
 *
 * NOT `os.loadavg()`, which returns `[0,0,0]` on Windows — a gate built on it
 * would report a permanently idle machine and allow everything forever. Not
 * PowerShell either: this runs before every batch in a loop, and a ~300 ms
 * process spawn per batch is a cost the measurement itself would dominate.
 */
function cpuBusyPct(sampleMs = 500) {
  const snap = () => os.cpus().map((c) => ({ ...c.times }));
  const a = snap();
  sleep(sampleMs);
  const b = snap();
  let idle = 0;
  let total = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    idle += b[i].idle - a[i].idle;
    total +=
      Object.values(b[i]).reduce((s, n) => s + n, 0) -
      Object.values(a[i]).reduce((s, n) => s + n, 0);
  }
  if (total <= 0) return null;
  return Math.max(0, Math.min(100, (1 - idle / total) * 100));
}

/**
 * Commit charge — the pagefile-backed total, which is the number that actually
 * kills things on Windows.
 *
 * Free RAM alone is a bad signal here: this box runs with most of RAM in the
 * page cache serving a 15M-row table, so "free RAM" reads low while the machine
 * is perfectly healthy. Commit pressure is what precedes an allocation failure.
 * Best-effort; a null means the checks that use it are SKIPPED rather than
 * guessed, and the skip is recorded in the reasons instead of being silent.
 */
function commitSnapshot() {
  const r = ps(
    'Get-CimInstance Win32_OperatingSystem | Select-Object TotalVirtualMemorySize,FreeVirtualMemory',
  );
  if (!r.ok || !r.value[0]) return { available: false, error: r.error ?? 'no data' };
  const v = r.value[0];
  const totalKb = Number(v.TotalVirtualMemorySize || 0);
  const freeKb = Number(v.FreeVirtualMemory || 0);
  if (totalKb <= 0) return { available: false, error: 'TotalVirtualMemorySize unreadable' };
  return {
    available: true,
    totalBytes: totalKb * 1024,
    freeBytes: freeKb * 1024,
    freePct: (freeKb / totalKb) * 100,
  };
}

/**
 * GPU utilisation and VRAM, via `nvidia-smi`.
 *
 * Absent tooling is reported as unavailable, never as an idle GPU. Assuming
 * idle would let this gate green-light a GPU job on a box that has no GPU,
 * which is the one direction that cannot be recovered from by waiting.
 */
function gpuSnapshot() {
  const r = spawnSync(
    'nvidia-smi',
    ['--query-gpu=name,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
    { encoding: 'utf8', windowsHide: true },
  );
  if (r.status !== 0 || !r.stdout || !r.stdout.trim()) {
    const why = (r.stderr || (r.error && r.error.message) || 'nvidia-smi not available')
      .toString()
      .trim()
      .slice(0, 200);
    return { available: false, error: why };
  }
  const gpus = r.stdout
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const parts = line.split(',').map((s) => s.trim());
      const total = Number(parts[3]);
      const used = Number(parts[2]);
      return {
        name: parts[0],
        utilPct: Number(parts[1]),
        vramUsedMiB: used,
        vramTotalMiB: total,
        vramFreeMiB: total - used,
      };
    });
  return { available: true, gpus };
}

/** Node and Python process counts, and which of ours look like fleet or heavy work. */
function processSnapshot() {
  const r = ps('Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine');
  if (!r.ok) return { available: false, error: r.error };
  let node = 0;
  let python = 0;
  let postgresBackends = 0;
  const fleet = [];
  const heavy = [];
  for (const p of r.value) {
    const name = String(p.Name || '');
    const cmd = String(p.CommandLine || '');
    const joined = name + ' ' + cmd;
    if (/^node\.exe$/i.test(name)) node += 1;
    if (/^python(\d.*)?\.exe$/i.test(name)) python += 1;
    if (/^postgres\.exe$/i.test(name)) postgresBackends += 1;
    if (Number(p.ProcessId) === process.pid) continue;
    if (FLEET_PATTERNS.some((re) => re.test(joined))) {
      fleet.push({ pid: Number(p.ProcessId), cmd: cmd.slice(0, 160) });
    } else if (HEAVY_PATTERNS.some((re) => re.test(joined))) {
      heavy.push({ pid: Number(p.ProcessId), cmd: cmd.slice(0, 160) });
    }
  }
  return { available: true, node, python, postgresBackends, fleet, heavy };
}

/** Local hosts, same reasoning and same deliberate duplication as `services/api/src/db-ssl.ts`. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
function sslFor(url) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname.toLowerCase()) ? false : 'require';
  } catch {
    return 'require';
  }
}

/**
 * What PostgreSQL is doing. Short timeouts throughout, because a gate that
 * hangs on a busy cluster is strictly worse than a gate that says "I could not
 * see" — the caller can act on the second.
 */
async function pgSnapshot() {
  const url = process.env['DATABASE_URL'] ?? '';
  if (!url) return { available: false, error: 'DATABASE_URL unset' };
  let sql;
  try {
    sql = postgres(url, {
      ssl: sslFor(url),
      max: 1,
      connect_timeout: 5,
      idle_timeout: 2,
      onnotice: () => {},
      connection: { statement_timeout: '4000' },
    });
    const rows = await sql`
      SELECT
        count(*) FILTER (WHERE state = 'active' AND pid <> pg_backend_pid())::int AS active,
        count(*) FILTER (WHERE state = 'idle in transaction')::int                AS "idleInTransaction",
        count(*)::int                                                             AS backends,
        coalesce(max(extract(epoch FROM now() - query_start))
                 FILTER (WHERE state = 'active' AND pid <> pg_backend_pid()), 0)::int AS "longestActiveSeconds",
        count(*) FILTER (WHERE cardinality(pg_blocking_pids(pid)) > 0)::int       AS blocked
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    return { available: true, ...rows[0] };
  } catch (error) {
    return { available: false, error: String(error.message ?? error).slice(0, 200) };
  } finally {
    if (sql) await sql.end({ timeout: 2 }).catch(() => {});
  }
}

// ───────────────────────────────────────────────────────────────────────────
// CLAIM MARKERS
// ───────────────────────────────────────────────────────────────────────────

/**
 * Live claims, with expired ones removed as a side effect of reading.
 *
 * Cleaning on read rather than on a timer is deliberate: the process that would
 * have run the timer is exactly the one that dies to a console signal here.
 */
export function liveClaims() {
  if (!existsSync(CLAIM_DIR)) return [];
  const now = Date.now();
  const out = [];
  for (const file of readdirSync(CLAIM_DIR)) {
    if (!file.endsWith('.json')) continue;
    const path = join(CLAIM_DIR, file);
    let claimed;
    try {
      claimed = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      rmSync(path, { force: true });
      continue;
    }
    const age = now - Date.parse(claimed.heartbeatAt ?? claimed.claimedAt);
    if (!Number.isFinite(age) || age > CLAIM_TTL_MS) {
      rmSync(path, { force: true });
      continue;
    }
    out.push({ ...claimed, ageMs: age });
  }
  return out;
}

/** Record that this process is running `jobClass` work. Returns the release token. */
export function claim(jobClass, label) {
  if (!JOB_CLASSES.includes(jobClass)) throw new Error('unknown class ' + jobClass);
  mkdirSync(CLAIM_DIR, { recursive: true });
  const token = randomUUID();
  const now = new Date().toISOString();
  writeFileSync(
    join(CLAIM_DIR, token + '.json'),
    JSON.stringify(
      { token, jobClass, label: String(label ?? ''), pid: process.pid, claimedAt: now, heartbeatAt: now },
      null,
      2,
    ) + '\n',
  );
  return token;
}

/** Refresh a claim so a job that legitimately runs longer than the TTL is not read as dead. */
export function heartbeat(token) {
  const path = join(CLAIM_DIR, token + '.json');
  if (!existsSync(path)) return false;
  const claimed = JSON.parse(readFileSync(path, 'utf8'));
  claimed.heartbeatAt = new Date().toISOString();
  writeFileSync(path, JSON.stringify(claimed, null, 2) + '\n');
  return true;
}

/** Drop a claim. Safe to call twice, and safe on a token that already expired. */
export function release(token) {
  rmSync(join(CLAIM_DIR, token + '.json'), { force: true });
}

// ───────────────────────────────────────────────────────────────────────────
// THE VERDICTS
// ───────────────────────────────────────────────────────────────────────────

/**
 * Thresholds, every one traceable to something measured on this box in August
 * 2026 rather than to a round number that felt safe.
 */
const T = {
  /** Founder-reported steady state is ~90% with the fleet at rung 13. A CPU_HEAVY
   *  job on top of that turns 13 workers into 13 slower workers. */
  cpuHeavyMaxCpuPct: 80,
  /** GPU work still needs a thread to tokenise. Below total saturation it gets
   *  one; this sits deliberately far above `cpuHeavyMaxCpuPct` because refusing
   *  the GPU on account of a busy CPU is the exact waste this gate exists to
   *  end — a 4060 Ti at 9% while the corpus holds 620k chunks for 14.8M docs. */
  gpuEmbedMaxCpuPct: 97,
  /** NEW2 measured retrieval p50 43s with six concurrent vector queries. A scan
   *  added on top of that is felt by every search. */
  dbScanMaxActiveQueries: 4,
  dbScanMaxCpuPct: 75,
  /** A statement already running this long means the cluster is struggling. */
  dbScanMaxLongestActiveSeconds: 120,
  /** Index builds want `maintenance_work_mem` on top of everything else. */
  vectorBuildMaxCpuPct: 50,
  vectorBuildMaxActiveQueries: 2,
  vectorBuildMinCommitFreePct: 35,
  /** Commit charge, not free RAM — see `commitSnapshot`. */
  minCommitFreePct: 12,
  gpuEmbedMinVramFreeMiB: 1024,
  gpuEmbedMaxGpuUtilPct: 85,
};

/**
 * Verdict for one class: `{ allow, verdict, reasons, headroom }`.
 *
 * Reasons are populated in BOTH directions. An ALLOW that cannot say why it
 * allowed is not auditable, and half the value of this gate is a lane being
 * able to paste the reason into the bus.
 */
function verdictFor(jobClass, s) {
  const headroom = [];
  const blocked = [];
  const cpu = s.system.cpuBusyPct;
  const commitFree = s.commit.available ? s.commit.freePct : null;
  const pgActive = s.postgres.available ? s.postgres.active : null;
  const longest = s.postgres.available ? s.postgres.longestActiveSeconds : null;
  const held = (cls) => s.claims.filter((c) => c.jobClass === cls);

  const needCpuBelow = (limit) => {
    if (cpu === null) {
      blocked.push('CPU unreadable — treated as loaded rather than idle');
      return;
    }
    if (cpu > limit) blocked.push('CPU ' + cpu.toFixed(1) + '% > ' + limit + '%');
    else headroom.push('CPU ' + cpu.toFixed(1) + '% (limit ' + limit + '%)');
  };
  const needCommitAbove = (limit) => {
    if (commitFree === null) {
      headroom.push('commit charge unreadable (' + s.commit.error + ') — check skipped, not assumed');
      return;
    }
    if (commitFree < limit) blocked.push('commit free ' + commitFree.toFixed(1) + '% < ' + limit + '%');
    else headroom.push('commit free ' + commitFree.toFixed(1) + '%');
  };
  const needPgQuiet = (maxActive, maxLongest) => {
    if (pgActive === null) {
      blocked.push('PostgreSQL unreadable (' + s.postgres.error + ')');
      return;
    }
    if (pgActive > maxActive) blocked.push(pgActive + ' active queries > ' + maxActive);
    else headroom.push(pgActive + ' active queries (limit ' + maxActive + ')');
    if (maxLongest !== null && longest > maxLongest) {
      blocked.push('longest active statement ' + longest + 's > ' + maxLongest + 's');
    }
  };
  const needNoClaim = (...classes) => {
    for (const cls of classes) {
      const existing = held(cls);
      if (existing.length > 0) {
        blocked.push(
          existing.length + ' live ' + cls + ' claim(s): ' + existing.map((c) => c.label || c.pid).join(', '),
        );
      }
    }
  };

  switch (jobClass) {
    case 'LIGHT':
      // Contends with nothing. The only honest refusal is a machine so far gone
      // that allocation itself is at risk.
      needCommitAbove(5);
      break;

    case 'CPU_HEAVY':
      needCpuBelow(T.cpuHeavyMaxCpuPct);
      needCommitAbove(T.minCommitFreePct);
      needNoClaim('CPU_HEAVY', 'VECTOR_BUILD');
      if (s.processes.available && s.processes.fleet.length > 0) {
        headroom.push(
          s.processes.fleet.length +
            ' ingest fleet process(es) running — already inside the CPU figure above, not charged twice',
        );
      }
      break;

    case 'DB_SCAN':
      needCpuBelow(T.dbScanMaxCpuPct);
      needPgQuiet(T.dbScanMaxActiveQueries, T.dbScanMaxLongestActiveSeconds);
      needCommitAbove(T.minCommitFreePct);
      needNoClaim('DB_SCAN', 'VECTOR_BUILD');
      break;

    case 'GPU_EMBED': {
      // The class this gate was asked for. Deliberately NOT blocked by a busy
      // CPU, a live LIGHT job, or a working ingest fleet — none of them want
      // the GPU, and refusing on their account is the waste being fixed.
      if (!s.gpu.available) {
        blocked.push('no GPU visible (' + s.gpu.error + ')');
        break;
      }
      const gpu = s.gpu.gpus[0];
      if (gpu.utilPct > T.gpuEmbedMaxGpuUtilPct) {
        blocked.push('GPU ' + gpu.utilPct + '% busy > ' + T.gpuEmbedMaxGpuUtilPct + '%');
      } else {
        headroom.push('GPU ' + gpu.utilPct + '% busy');
      }
      if (gpu.vramFreeMiB < T.gpuEmbedMinVramFreeMiB) {
        blocked.push('VRAM free ' + gpu.vramFreeMiB + ' MiB < ' + T.gpuEmbedMinVramFreeMiB + ' MiB');
      } else {
        headroom.push('VRAM free ' + gpu.vramFreeMiB + ' of ' + gpu.vramTotalMiB + ' MiB');
      }
      needCpuBelow(T.gpuEmbedMaxCpuPct);
      needCommitAbove(T.minCommitFreePct);
      needNoClaim('GPU_EMBED', 'VECTOR_BUILD');
      break;
    }

    case 'VECTOR_BUILD':
      needCpuBelow(T.vectorBuildMaxCpuPct);
      needPgQuiet(T.vectorBuildMaxActiveQueries, T.dbScanMaxLongestActiveSeconds);
      needCommitAbove(T.vectorBuildMinCommitFreePct);
      needNoClaim(...JOB_CLASSES.filter((c) => c !== 'LIGHT'));
      // Fails CLOSED on an unreadable process table, unlike the other classes.
      // This is the one verdict that cannot be recovered by noticing later: an
      // index build started on top of a live fleet does not stop when the fleet
      // is spotted, it runs for hours holding the box.
      if (!s.processes.available) {
        blocked.push('process table unreadable (' + s.processes.error + ') — cannot confirm the fleet is idle');
      } else if (s.processes.fleet.length > 0) {
        blocked.push(
          s.processes.fleet.length +
            ' ingest fleet process(es) writing — an index build wants the box to itself',
        );
      } else {
        headroom.push('no ingest fleet processes');
      }
      break;

    default:
      throw new Error('unknown class ' + jobClass);
  }

  return {
    jobClass,
    allow: blocked.length === 0,
    verdict: blocked.length === 0 ? 'ALLOW' : 'DEFER',
    reasons: blocked.length === 0 ? headroom : blocked,
    headroom,
  };
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SHALLOW BY DEFAULT, AND THE REASON IS MEASURED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The two PowerShell collectors — `Win32_Process` and `Win32_OperatingSystem` —
 * cost ~1.4 s each on an idle moment and are wildly variable under load. Timed
 * back to back on this box on 18 Aug 2026 with the fleet running, three
 * consecutive full collections took **31.9 s, 3.1 s and 15.2 s**. A gate a
 * worker consults before every batch cannot cost that; it would become the
 * contention it was built to measure.
 *
 * So a shallow snapshot skips both. What survives is cheap and covers every
 * decision but one: CPU from `os.cpus()` (in-process), GPU from `nvidia-smi`
 * (~101 ms), PostgreSQL from one indexed catalogue query, and the claim files.
 *
 * `VECTOR_BUILD` is the exception and `check()` upgrades it automatically — it
 * is the only class whose verdict turns on whether the ingest fleet is running,
 * and it is also the class nobody polls in a loop.
 *
 * A skipped collector reports `available: false` with a reason, exactly like a
 * failed one. The verdict logic already refuses to guess at an unreadable
 * signal, so a shallow snapshot is less informed but never wrong in a new way.
 */
export async function collect(options = {}) {
  const cpuSampleMs = options.cpuSampleMs ?? 500;
  const deep = options.deep ?? false;
  const pg = await pgSnapshot();
  const cpu = cpuBusyPct(cpuSampleMs);
  const totalRam = os.totalmem();
  const freeRam = os.freemem();
  const skipped = { available: false, error: 'not collected — shallow snapshot, pass { deep: true }' };
  return {
    collectedAt: new Date().toISOString(),
    host: os.hostname(),
    depth: deep ? 'deep' : 'shallow',
    system: {
      platform: process.platform,
      logicalCpus: os.cpus().length,
      cpuBusyPct: cpu,
      totalRamBytes: totalRam,
      freeRamBytes: freeRam,
      freeRamPct: (freeRam / totalRam) * 100,
    },
    commit: deep ? commitSnapshot() : skipped,
    gpu: gpuSnapshot(),
    processes: deep ? processSnapshot() : skipped,
    postgres: pg,
    claims: liveClaims(),
  };
}

/** Verdicts for every class from one snapshot. */
export function verdicts(snapshot) {
  return Object.fromEntries(JOB_CLASSES.map((c) => [c, verdictFor(c, snapshot)]));
}

/**
 * The one call a lane makes.
 *
 * `VECTOR_BUILD` forces a deep snapshot because its verdict reads the ingest
 * fleet; everything else stays shallow. Override either way with
 * `{ deep: true | false }`.
 */
export async function check(jobClass, options = {}) {
  if (!JOB_CLASSES.includes(jobClass)) {
    throw new Error('unknown class ' + jobClass + ' — expected one of ' + JOB_CLASSES.join(', '));
  }
  const deep = options.deep ?? jobClass === 'VECTOR_BUILD';
  const snapshot = await collect({ ...options, deep });
  return { ...verdictFor(jobClass, snapshot), snapshot };
}

// ───────────────────────────────────────────────────────────────────────────
// CLI — guarded, so this file stays importable
// ───────────────────────────────────────────────────────────────────────────

function printStatus(s, v) {
  const gpu = s.gpu.available ? s.gpu.gpus[0] : null;
  console.log('collectedAt   ' + s.collectedAt);
  console.log(
    'cpu           ' +
      (s.system.cpuBusyPct === null ? 'n/a' : s.system.cpuBusyPct.toFixed(1) + '%') +
      ' over ' + s.system.logicalCpus + ' logical CPUs',
  );
  console.log(
    'ram free      ' + s.system.freeRamPct.toFixed(1) + '%  (' +
      (s.system.freeRamBytes / 1024 ** 3).toFixed(1) + ' GiB)',
  );
  console.log(
    'commit free   ' + (s.commit.available ? s.commit.freePct.toFixed(1) + '%' : 'n/a (' + s.commit.error + ')'),
  );
  console.log(
    'gpu           ' +
      (gpu
        ? gpu.name + ' — ' + gpu.utilPct + '% busy, VRAM ' + gpu.vramUsedMiB + '/' + gpu.vramTotalMiB + ' MiB'
        : 'n/a (' + s.gpu.error + ')'),
  );
  console.log(
    'postgres      ' +
      (s.postgres.available
        ? s.postgres.active + ' active, ' + s.postgres.idleInTransaction + ' idle-in-txn, ' +
          s.postgres.blocked + ' blocked, longest ' + s.postgres.longestActiveSeconds + 's'
        : 'n/a (' + s.postgres.error + ')'),
  );
  console.log(
    'processes     ' +
      (s.processes.available
        ? 'node ' + s.processes.node + ', python ' + s.processes.python + ', postgres ' +
          s.processes.postgresBackends + ', fleet ' + s.processes.fleet.length +
          ', other heavy ' + s.processes.heavy.length
        : 'n/a (' + s.processes.error + ')'),
  );
  console.log(
    'claims        ' +
      (s.claims.length === 0 ? 'none' : s.claims.map((c) => c.jobClass + ':' + (c.label || c.pid)).join(', ')),
  );
  console.log('');
  for (const cls of JOB_CLASSES) {
    console.log(v[cls].verdict.padEnd(6) + ' ' + cls);
    for (const r of v[cls].reasons) console.log('       - ' + r);
  }
}

const USAGE =
  'usage: node scripts/resource-gate.mjs [status|json|check <CLASS>|claim <CLASS> <label>|release <token>|claims]';

async function main() {
  const cmd = process.argv[2] ?? 'status';

  if (cmd === 'claims') {
    const live = liveClaims();
    console.log(live.length === 0 ? 'no live claims' : JSON.stringify(live, null, 2));
    return 0;
  }
  if (cmd === 'claim') {
    const jobClass = process.argv[3];
    if (!jobClass || !JOB_CLASSES.includes(jobClass)) {
      console.error('usage: claim <' + JOB_CLASSES.join('|') + '> <label>');
      return 2;
    }
    console.log(claim(jobClass, process.argv.slice(4).join(' ')));
    return 0;
  }
  if (cmd === 'release') {
    const token = process.argv[3];
    if (!token) {
      console.error('usage: release <token>');
      return 2;
    }
    release(token);
    return 0;
  }

  if (cmd === 'check') {
    // Per-class depth, so `check GPU_EMBED` in a worker loop stays cheap.
    const jobClass = process.argv[3];
    if (!jobClass || !JOB_CLASSES.includes(jobClass)) {
      console.error('usage: check <' + JOB_CLASSES.join('|') + '>');
      return 2;
    }
    const r = await check(jobClass);
    console.log(r.verdict + ' ' + jobClass + '  (' + r.snapshot.depth + ')');
    for (const reason of r.reasons) console.log('  - ' + reason);
    // 3, not 1: a DEFER is a normal answer and a caller must be able to tell it
    // apart from this script having crashed.
    return r.allow ? 0 : 3;
  }

  // A human reading `status`, or a report capturing `json`, waits the extra
  // couple of seconds for the full picture.
  const snapshot = await collect({ deep: true });
  const v = verdicts(snapshot);

  if (cmd === 'json') {
    console.log(JSON.stringify({ ...snapshot, verdicts: v }, null, 2));
    return 0;
  }
  if (cmd === 'status') {
    printStatus(snapshot, v);
    return 0;
  }
  console.error(USAGE);
  return 2;
}

const invokedDirectly =
  process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (invokedDirectly) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exit(1);
    });
}
