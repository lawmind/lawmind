import { execFileSync } from 'node:child_process';

/**
 * Railway injects the deployed commit **only for a git-triggered auto-deploy**.
 * Auto-deploy has been dead on this project since 8 Aug 2026, so every real
 * deploy has gone through `railway up` (a CLI upload), which sets none of
 * `RAILWAY_GIT_COMMIT_SHA` or `GITHUB_SHA`. `GIT_SHA` is therefore the value
 * that actually matters in practice — and it is a plain variable nothing
 * platform-side keeps honest.
 *
 * **`GIT_SHA` is set as part of `scripts/deploy-api.mjs`, not by hand.**
 * Found stale 11 Aug 2026: it read the 8 Aug commit through several real,
 * successful CLI deploys, because nothing was re-setting it. A manually-set
 * variable that nothing re-sets will drift; deploying only through the script
 * makes setting it part of the same atomic action as deploying, so it cannot
 * be forgotten the way it was the first time.
 */
function resolveSha(): string {
  const fromPlatform =
    process.env['RAILWAY_GIT_COMMIT_SHA'] ?? process.env['GITHUB_SHA'] ?? process.env['GIT_SHA'];
  if (fromPlatform) return fromPlatform;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export const buildSha = resolveSha();

/**
 * When `scripts/deploy-api.mjs` last set `GIT_SHA` — i.e. when the running
 * container was actually deployed, not when the process happened to start
 * (a Railway restart re-execs the same image without redeploying). Absent
 * locally and on any deploy that did not go through the script — `null`,
 * never a guessed or current timestamp standing in for an unknown one.
 */
export const deployedAt: string | null = process.env['DEPLOYED_AT'] ?? null;
