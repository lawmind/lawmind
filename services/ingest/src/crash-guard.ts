/**
 * A process-level safety net for long-running ingest workers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS — three of my own runs died with no error at all
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NEW3 grepped `services/ingest/src/` and found **zero**
 * `unhandledRejection` or `uncaughtException` handlers anywhere (bus 0292).
 * That is the direct reason today's failures were so expensive to diagnose:
 *
 * - a concordance harvest died at its first query,
 * - a classifier dry run died at 322,000 documents,
 * - a classifier write run died at 10,000,
 *
 * every one of them ending **mid-line with no stack and no exit code**. Each
 * looked like a hang. Diagnosing them meant CPU-sampling processes and reading
 * heap sizes, when a single logged stack would have answered it.
 *
 * NEW2 hit the same class six times in one day across the ingest fleet
 * (Uttarakhand, Gauhati, Chhattisgarh, Karnataka, Telangana, Kerala) and added
 * handlers to `hc-load-cli.ts`. This is the same idea, shared, so every worker
 * in this directory inherits it instead of six copies drifting apart.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES **NOT** FIX, AND THIS MATTERS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **It does not cure "Detected unsettled top-level await."** That is Node's own
 * diagnostic for a promise that never settles — nothing was thrown, so no
 * handler can catch it. NEW3 checked the two matching upstream issues
 * (nodejs/node#55468, nodejs/undici#4242) and neither is a fix.
 *
 * What it does is turn *every other* silent death into a readable line. A crash
 * whose cause is printed is a bug you fix once; a crash that vanishes is a bug
 * you re-diagnose every time it happens.
 *
 * It deliberately does **not** swallow anything and keep running. An ingest
 * worker that continues after an unhandled rejection has undefined state, and
 * these workers are all resumable — dying loudly and being restarted is
 * strictly better than continuing quietly and writing something wrong.
 */

/** Depth-limited so a self-referential `cause` chain cannot spin. */
export function describeError(err: unknown, depth = 0): string {
  if (depth > 4 || err === null || err === undefined) return String(err);
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    const head = `${err.name}: ${err.message}${typeof code === 'string' ? ` [${code}]` : ''}`;
    const stack = err.stack ? `\n${err.stack}` : '';
    const cause = (err as { cause?: unknown }).cause;
    return cause === undefined
      ? head + stack
      : `${head}${stack}\n  caused by → ${describeError(cause, depth + 1)}`;
  }
  try {
    return typeof err === 'object' ? JSON.stringify(err) : String(err);
  } catch {
    return String(err);
  }
}

let installed = false;

/**
 * Installs the guard. Safe to call more than once; only the first call binds.
 *
 * `name` is whatever should appear in the log — normally the worker's own name,
 * because these logs are read days later against a fleet of a dozen processes
 * and "which one was this" is the first question.
 */
export function installCrashGuard(name: string): void {
  if (installed) return;
  installed = true;

  const die = (kind: string, err: unknown): never => {
    // stderr, not stdout: a worker's stdout is its progress stream and is often
    // being tailed or parsed. A crash belongs where errors are looked for.
    process.stderr.write(
      `\n[${new Date().toISOString()}] ${name} — ${kind}\n${describeError(err)}\n`,
    );
    process.exit(1);
  };

  process.on('uncaughtException', (err) => die('uncaughtException', err));
  process.on('unhandledRejection', (reason) => die('unhandledRejection', reason));

  /**
   * Node's "unsettled top-level await" exits **13** and prints its own warning,
   * which says nothing about WHERE. Recording the worker name and that this is
   * the known unfixable class saves the next person the search NEW3 already did.
   */
  process.on('exit', (code) => {
    if (code === 13) {
      process.stderr.write(
        `\n[${new Date().toISOString()}] ${name} — exit 13: a top-level await never settled.\n` +
          `  Nothing was thrown, so no handler could catch it. Usually a network call\n` +
          `  whose promise neither resolved nor rejected. Restart is the only cure;\n` +
          `  see docs/LANE_PROTOCOL.md §3b.\n`,
      );
    }
  });
}
