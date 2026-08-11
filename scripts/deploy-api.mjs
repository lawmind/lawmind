#!/usr/bin/env node
/**
 * Deploy the api service to Railway, and — the whole reason this file
 * exists rather than a bare `railway up` — keep `GIT_SHA` from lying.
 *
 *   node scripts/deploy-api.mjs [-m "message"]
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BUG THIS REPLACES
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `build-info.ts` resolves the deployed sha as
 * `RAILWAY_GIT_COMMIT_SHA ?? GITHUB_SHA ?? GIT_SHA`. Railway only populates
 * `RAILWAY_GIT_COMMIT_SHA` for a git-triggered auto-deploy — dead on this
 * project since 8 Aug 2026 — so every `railway up` (a CLI upload, not a git
 * trigger) has fallen through to `GIT_SHA`, a variable someone set by hand
 * once and never touched again. **Found 11 Aug 2026, still reading `721c99a`
 * from 8 Aug**, after several successful CLI deploys landed real fixes:
 * `/health` and the new `/version` endpoint were both lying about what code
 * was actually running, on every deploy this session, silently.
 *
 * A manually-set variable that nothing re-sets WILL drift; the fix is to make
 * setting it part of the deploy action itself, atomically, so it cannot be
 * forgotten the way it was the first time. REB §1.4 — "deploy-integrity
 * verification so the running artifact can be proven to correspond to the
 * intended commit."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES NOT SOLVE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * This trusts the machine running it to have the right commit checked out —
 * it stamps `git rev-parse HEAD` from the local working tree, not a
 * server-verified build provenance chain (an image digest, a signed
 * attestation). That is a real gap against REB §1.5 ("immutable/container
 * deployment provenance") and is not claimed to be closed here. What this
 * closes is the narrower, currently-live lie: the sha `/version` reports
 * should at least match the commit that was actually pushed to deploy it.
 */
import { execFileSync, spawnSync } from 'node:child_process';

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
}

/**
 * `spawnSync` with `shell:true` and an args ARRAY does not escape each
 * element — it concatenates them, so an argument containing a space (a `-m`
 * message, in particular) gets re-split by the shell into several arguments.
 * `railway` is a `.cmd` shim on Windows, which is the whole reason `shell:true`
 * is needed at all, so the fix is the one already established in
 * `scripts/ci-local.mjs`: build ONE quoted command string ourselves. Args
 * here are always literals this file constructs, never raw user input, so
 * this is not the injection risk it would be for untrusted strings.
 */
function railway(args) {
  return spawnSync(['railway', ...args.map((a) => `"${a}"`)].join(' '), {
    stdio: 'inherit',
    shell: true,
  });
}

const gitSha = sh('git', ['rev-parse', 'HEAD']);

/**
 * Only the paths that actually reach the deployed image. LCC and RCC share
 * one working tree (`docs/FOUNDER_QUEUE.md` — worktree separation is a
 * pending, coordinated decision, not done yet), so `apps/**` and `docs/**`
 * are routinely dirty with the OTHER lane's or this lane's own in-progress,
 * deliberately-uncommitted work at any given moment — that is normal, not a
 * reason to block. What must be clean is exactly what `railway.json`'s build
 * command installs: `services/**`, `packages/**`, and the root workspace
 * files. A dirty file outside that set cannot make the deployed sha lie.
 */
const dirty = sh('git', [
  'status',
  '--porcelain',
  '--untracked-files=no',
  '--',
  'services',
  'packages',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'railway.json',
]);
if (dirty) {
  console.error(
    'Uncommitted changes in a path that reaches the deployed image. Deploying ' +
      'a sha that does not match what is actually running would recreate the ' +
      'exact lie this script exists to prevent. Commit or stash first.\n\n' +
      dirty,
  );
  process.exit(1);
}

const deployedAt = new Date().toISOString();

console.log(`Setting GIT_SHA=${gitSha}`);
const setSha = railway([
  'variable',
  'set',
  `GIT_SHA=${gitSha}`,
  '--service',
  'api',
  '--environment',
  'production',
  '--skip-deploys',
  '--json',
]);
if (setSha.status !== 0) {
  console.error('Failed to set GIT_SHA — aborting before deploying a sha that would not match it.');
  process.exit(setSha.status ?? 1);
}

console.log(`Setting DEPLOYED_AT=${deployedAt}`);
const setDeployedAt = railway([
  'variable',
  'set',
  `DEPLOYED_AT=${deployedAt}`,
  '--service',
  'api',
  '--environment',
  'production',
  '--skip-deploys',
  '--json',
]);
if (setDeployedAt.status !== 0) {
  console.error('Failed to set DEPLOYED_AT — aborting.');
  process.exit(setDeployedAt.status ?? 1);
}

const extraArgs = process.argv.slice(2);
console.log(`Deploying ${gitSha.slice(0, 12)}...`);
const up = railway([
  'up',
  '--detach',
  '--json',
  '--service',
  'api',
  '--environment',
  'production',
  ...extraArgs,
]);
process.exit(up.status ?? 1);
