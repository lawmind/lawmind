#!/usr/bin/env node
/**
 * LCC R32A — GATE-C SIZING AND COST, COMPUTED FROM THE MEASURED EVIDENCE.
 *
 * Inputs are the three measurement files this round wrote plus the Hetzner
 * Singapore prices read on the day (docs.hetzner.com price-adjustment page,
 * effective 15 June 2026, net of VAT). Nothing is provisioned.
 *
 *   node scripts/lcc-r32a-cost-model.mjs --dir docs/ai/lcc-r32a
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[process.argv.indexOf('--dir') + 1] ?? 'docs/ai/lcc-r32a';
const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const fp = read('footprint.json');
const ex = read('export-sample.json');
const io = read('io-delta-load.json');
const idle = read('io-delta-idle.json');
const ub = read('user-backup-size.json');

const GB_TO_GIB = 1e9 / 1024 ** 3;
const r2 = (n) => Math.round(n * 100) / 100;
const r1 = (n) => Math.round(n * 10) / 10;

/** Hetzner SIN, USD, net. Disk is the plan's advertised decimal GB. */
const PLANS = {
  CPX22: { vcpu: 2, ramGB: 4, diskGB: 80, usdHour: 0.0497, usdMonthCap: 30.99, trafficTB: 1 },
  CPX32: { vcpu: 4, ramGB: 8, diskGB: 160, usdHour: 0.0929, usdMonthCap: 57.99, trafficTB: 2 },
  CPX42: { vcpu: 8, ramGB: 16, diskGB: 320, usdHour: 0.1763, usdMonthCap: 109.99, trafficTB: 3 },
  CPX52: { vcpu: 12, ramGB: 24, diskGB: 480, usdHour: 0.254, usdMonthCap: 158.49, trafficTB: 4 },
  CPX62: { vcpu: 16, ramGB: 32, diskGB: 640, usdHour: 0.3253, usdMonthCap: 202.99, trafficTB: 5 },
};
const PRIMARY_IPV4_USD_MONTH = 0.6; // docs.hetzner.com/general/others/ipv4-pricing
// UNVERIFIED: no Hetzner page reachable today states it. Third-party figure
// (costgoat, updated 5 Sep 2026) is EUR 0.0572/GB-month; converted at Hetzner's
// own SIN USD/EUR list ratio (30.99 / 26.49). Doubled in the authorisation cap.
const VOLUME_EUR_GB_MONTH = 0.0572;
const USD_PER_EUR = 30.99 / 26.49;
const VOLUME_USD_GB_MONTH = VOLUME_EUR_GB_MONTH * USD_PER_EUR;
// Billing hours in a month are not published; 672 (28 days) is the
// conservative divisor — it makes every hourly volume figure LARGER.
const HOURS_FOR_VOLUME_RATE = 672;
const R2_USD_GB_MONTH = 0.015; // developers.cloudflare.com/r2/pricing, 10 GB free

/* ── corpus disk ──────────────────────────────────────────────────────────── */
const restoredGiB = fp.planes.gateCRequired.totalGiB; // measured on source, bloat included
const exportPlainGiB = ex.projectedPlainGiB;
const exportGzipGiB = ex.projectedGzipGiB;
const largestGzipGiB = Math.max(...ex.tables.map((t) => t.projectedGzipGiB));
const largestBtreeGiB = Math.max(
  ...fp.topIndexes.filter((i) => i.method === 'btree').map((i) => i.gib),
);
const WAL_GIB = 4; // max_wal_size set to 4GB for the load (runbook)
const tempGiB = r1(Math.max(16, largestBtreeGiB * 3)); // sort spill for a rebuild, GIN pending-list flush
const OS_PG_GIB = 10;
const HEADROOM = 1.15;
const corpusLocalNeedGiB = r1((restoredGiB + WAL_GIB + tempGiB + OS_PG_GIB) * HEADROOM);
// Staging: download one .copy.gz, decompress, delete the .gz, next table.
const stagingPeakGiB = r1(exportPlainGiB + largestGzipGiB);
const stagingNeedGiB = r1(stagingPeakGiB * 1.1);

/* ── RAM ──────────────────────────────────────────────────────────────────── */
// Upper bound on distinct blocks: OS reads (each at least once) + everything
// shared_buffers could have served without a read.
const sharedBuffersGiB = 2;
const workingSetUpperGiB = r1(io.readsFromOsMiB / 1024 + sharedBuffersGiB);

/* ── plan fit ─────────────────────────────────────────────────────────────── */
const fit = Object.entries(PLANS).map(([name, p]) => {
  const diskGiB = r1(p.diskGB * GB_TO_GIB);
  const ramGiB = r1(p.ramGB * GB_TO_GIB);
  const dbFits = diskGiB >= corpusLocalNeedGiB;
  const dbAndStagingFit = diskGiB >= corpusLocalNeedGiB + stagingNeedGiB;
  // PG shared_buffers ~25% + OS ~1 GiB must leave page cache >= the working set.
  const cacheGiB = r1(ramGiB - 1 - ramGiB * 0.25);
  const ramOk =
    ramGiB * 0.25 + cacheGiB >= workingSetUpperGiB && cacheGiB >= workingSetUpperGiB * 0.75;
  return {
    plan: name,
    ...p,
    diskGiB,
    ramGiB,
    dbFits,
    dbAndStagingFit,
    pageCacheGiB: cacheGiB,
    ramOk,
  };
});

const volumeGB = Math.ceil(stagingNeedGiB / GB_TO_GIB / 50) * 50;
const volumeUsdHour = (volumeGB * VOLUME_USD_GB_MONTH) / HOURS_FOR_VOLUME_RATE;
const volumeUsdMonth = volumeGB * VOLUME_USD_GB_MONTH;

function windowCost(hours, corpusPlan, withVolume) {
  const c = PLANS[corpusPlan];
  const u = PLANS.CPX22;
  const compute =
    Math.min(c.usdHour * hours, c.usdMonthCap) + Math.min(u.usdHour * hours, u.usdMonthCap);
  const storageVol = withVolume ? Math.min(volumeUsdHour * hours, volumeUsdMonth) : 0;
  const r2Staging = Math.max(0, exportGzipGiB - 10) * R2_USD_GB_MONTH; // flat: a full month, conservative
  const ipv4 = 2 * PRIMARY_IPV4_USD_MONTH; // flat: a full month each, conservative
  const network = 0; // egress << included traffic; private network carries corpus traffic
  return {
    hours,
    compute: r2(compute),
    storage: r2(storageVol + r2Staging),
    storageVolume: r2(storageVol),
    storageR2: r2(r2Staging),
    network,
    ipv4: r2(ipv4),
    total: r2(compute + storageVol + r2Staging + ipv4 + network),
    tax: 'VAT/GST UNKNOWN — all prices are net; at 18% reverse-charge GST multiply by 1.18',
  };
}
const windows = (plan, vol) => ({
  h24: windowCost(24, plan, vol),
  h72: windowCost(72, plan, vol),
  d7: windowCost(168, plan, vol),
  month: windowCost(730, plan, vol),
});

const cand52 = windows('CPX52', true);
const cand62 = windows('CPX62', false);
const chosen = cand52.h72.total <= cand62.h72.total ? 'CPX52+volume' : 'CPX62';
const chosenWindows = chosen === 'CPX52+volume' ? cand52 : cand62;
const worst72 = r2(
  (chosenWindows.h72.total + (chosen === 'CPX52+volume' ? chosenWindows.h72.storageVolume : 0)) *
    1.18,
);

/* ── USER/API host ────────────────────────────────────────────────────────── */
const userDbGiB = fp.planes.user.totalGiB;
const userBackupGiB = ub.totalBytes / 1024 ** 3;
const userNeedGiB = r1((userDbGiB + userBackupGiB * 10 + OS_PG_GIB + 3 + 2) * HEADROOM);
const apiPeakMiB = 308;
const userRamBudgetMiB = { os: 450, postgres: 512 + 12 * 16, api: 1024, backupTooling: 150 };
const userRamTotalMiB = Object.values(userRamBudgetMiB).reduce((a, b) => a + b, 0);

const report = {
  kind: 'lcc-r32a-gate-c-sizing',
  computedAt: new Date().toISOString(),
  paidResourceCreated: 'NO',
  pricing: {
    asOf: '2026-09-16 (Hetzner SIN list effective 2026-06-15 08:00 CEST, net of VAT)',
    plans: PLANS,
    primaryIpv4UsdMonth: PRIMARY_IPV4_USD_MONTH,
    volumeUsdGbMonth: Math.round(VOLUME_USD_GB_MONTH * 1e4) / 1e4,
    volumePriceStatus: 'UNVERIFIED (third-party EUR 0.0572; doubled in the cap)',
    r2UsdGbMonth: R2_USD_GB_MONTH,
  },
  corpus: {
    restoredGiB,
    exportPlainGiB,
    exportGzipGiB,
    largestGzipGiB,
    largestBtreeGiB,
    walGiB: WAL_GIB,
    tempGiB,
    osPgGiB: OS_PG_GIB,
    headroom: HEADROOM,
    corpusMinLocalDiskGiB: corpusLocalNeedGiB,
    stagingPeakGiB,
    stagingNeedGiB,
    corpusMinDiskGiBIncludingStaging: r1(corpusLocalNeedGiB + stagingNeedGiB),
    workingSetUpperGiB,
    ioLoadWindow: {
      touchedMiBUpperBound: io.touchedMiBUpperBound,
      readsFromOsMiB: io.readsFromOsMiB,
    },
    ioIdleWindow: {
      touchedMiBUpperBound: idle.touchedMiBUpperBound,
      readsFromOsMiB: idle.readsFromOsMiB,
    },
  },
  planFit: fit,
  stagingVolumeGB: volumeGB,
  compare72h: { 'CPX52+volume': cand52.h72.total, CPX62: cand62.h72.total },
  chosenCorpus: chosen,
  costs: chosenWindows,
  worstCase72hWithVolumePriceDoubledAndGst18: worst72,
  authorisationCapUsd: 40,
  user: {
    dbGiB: userDbGiB,
    backupBytes: ub.totalBytes,
    backupGiB: Math.round(userBackupGiB * 1e6) / 1e6,
    restoreRehearsalSeconds: ub.elapsedSeconds,
    userMinDiskGiB: userNeedGiB,
    cpx22DiskGiB: fit.find((f) => f.plan === 'CPX22').diskGiB,
    apiPeakResidentMiB: apiPeakMiB,
    ramBudgetMiB: userRamBudgetMiB,
    ramBudgetTotalMiB: userRamTotalMiB,
    cpx22RamMiB: Math.round(4 * GB_TO_GIB * 1024),
  },
};
writeFileSync(join(dir, 'gate-c-sizing.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      corpus: report.corpus,
      fit: fit.map((f) => [f.plan, f.diskGiB, f.ramGiB, f.dbFits, f.dbAndStagingFit, f.ramOk]),
      volumeGB,
      compare: report.compare72h,
      chosen,
      costs: Object.fromEntries(Object.entries(chosenWindows).map(([k, v]) => [k, v.total])),
      worst72,
      user: report.user,
    },
    null,
    1,
  ),
);
