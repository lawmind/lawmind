import { execFileSync } from 'node:child_process';

/**
 * Railway injects the deployed commit. Locally there is no such variable, so fall
 * back to git ONCE at module load — `/health` has to report a real SHA, not a
 * placeholder, or it cannot be used to tell two deploys apart.
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
