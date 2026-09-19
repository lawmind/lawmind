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

/**
 * The artifact this process was built from, as the deployer recorded it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * N-2 — WHY THIS WAS `null` AND WHY IT IS NOT A GUESS NOW
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Gate C found `/version` answering `deployedAt: null`, `imageDigest: null` and a
 * **self-reported** `gitSha` — "fine for staging, not for production, and a
 * passing gate does not make it fine". `imageDigest` was not merely unset: it was
 * the literal `null` in the route, so no deployer could populate it however
 * carefully it built.
 *
 * The mechanism now exists and nothing fabricates a value for it. A digest is
 * whatever the deploy path can actually prove about its own artifact — a
 * container image digest, a tarball sha256, a package hash. Absent, this is
 * `null`, exactly as `deployedAt` is, because "we do not know which artifact this
 * is" and "this artifact is called nothing" are the same sentence and both must
 * read as an absence rather than as a value.
 *
 * **Not populated locally, and that is correct.** A local `pnpm dev` has no
 * artifact. Roadmap Stage A asks for the mechanism to be ready, and explicitly
 * not for production values to be invented on a workstation.
 *
 * **Set it in the same action that deploys.** `GIT_SHA` was found stale on
 * 11 Aug 2026 through several real successful deploys because it was set by hand
 * once and nothing re-set it. A digest written by hand will drift the same way
 * and will drift *silently*, since a wrong digest looks exactly as trustworthy as
 * a right one. Whatever replaces `scripts/deploy-api.mjs` for the chosen provider
 * must set this as part of deploying, never as a separate step.
 *
 * **No `releaseId` field is added here.** `gitSha` + `deployedAt` + `imageDigest`
 * already identify a deployment uniquely, a fourth label would carry no
 * information the first three lack, and adding a field to `/version` is an
 * additive API contract amendment requiring a CCR under roadmap §3.7. If a
 * human-readable release label is ever wanted, it is a CCR and not a quiet extra
 * key.
 */
export const artifactDigest: string | null =
  process.env['ARTIFACT_DIGEST'] ?? process.env['IMAGE_DIGEST'] ?? null;
