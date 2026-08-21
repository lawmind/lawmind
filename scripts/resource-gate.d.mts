/**
 * Types for `resource-gate.mjs`.
 *
 * The gate is plain `.mjs` on purpose — the four lanes call it from JavaScript
 * scripts, PowerShell and the shell, and a build step between a worker and its
 * "may I run" check is a step that will be skipped. This file gives the
 * TypeScript callers (`services/embed/*`) real types without making the gate
 * itself a compiled artefact.
 *
 * It is hand-written, so it can drift from the implementation. What stops that
 * mattering is that everything here is exercised by `resource-gate.test.mjs`
 * against the real module; a rename that breaks a caller breaks that suite too.
 */

export type JobClass = 'LIGHT' | 'CPU_HEAVY' | 'DB_SCAN' | 'GPU_EMBED' | 'VECTOR_BUILD';

export const JOB_CLASSES: JobClass[];

export type Unavailable = { available: false; error: string };

export type Snapshot = {
  collectedAt: string;
  host: string;
  /** `shallow` skips the PowerShell collectors — see `collect` in the gate. */
  depth: 'shallow' | 'deep';
  system: {
    platform: string;
    logicalCpus: number;
    /** `null` when unreadable, which every verdict treats as LOADED, not idle. */
    cpuBusyPct: number | null;
    totalRamBytes: number;
    freeRamBytes: number;
    freeRamPct: number;
  };
  commit: Unavailable | { available: true; totalBytes: number; freeBytes: number; freePct: number };
  gpu:
    | Unavailable
    | {
        available: true;
        gpus: {
          name: string;
          utilPct: number;
          vramUsedMiB: number;
          vramTotalMiB: number;
          vramFreeMiB: number;
        }[];
      };
  processes:
    | Unavailable
    | {
        available: true;
        node: number;
        python: number;
        postgresBackends: number;
        fleet: { pid: number; cmd: string }[];
        heavy: { pid: number; cmd: string }[];
      };
  postgres:
    | Unavailable
    | {
        available: true;
        active: number;
        idleInTransaction: number;
        backends: number;
        longestActiveSeconds: number;
        blocked: number;
      };
  claims: { token: string; jobClass: JobClass; label: string; pid: number; claimedAt: string; heartbeatAt: string; ageMs: number }[];
};

export type Verdict = {
  jobClass: JobClass;
  allow: boolean;
  verdict: 'ALLOW' | 'DEFER';
  /** Blocking reasons when DEFER, headroom when ALLOW. Never empty. */
  reasons: string[];
  headroom: string[];
};

export type CollectOptions = {
  cpuSampleMs?: number;
  /** `VECTOR_BUILD` upgrades itself; everything else stays shallow by default. */
  deep?: boolean;
};

export function collect(options?: CollectOptions): Promise<Snapshot>;
export function verdicts(snapshot: Snapshot): Record<JobClass, Verdict>;
export function check(jobClass: JobClass, options?: CollectOptions): Promise<Verdict & { snapshot: Snapshot }>;

export function claim(jobClass: JobClass, label: string): string;
export function heartbeat(token: string): boolean;
export function release(token: string): void;
export function liveClaims(): Snapshot['claims'];
