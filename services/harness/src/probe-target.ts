/**
 * WHERE A DEPLOYED PROBE IS ALLOWED TO POINT — and the refusal when nothing
 * says.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Both deployed probes used to default to `api-production-1c0b4.up.railway.app`.
 * That was honest while it was production. It stopped being production, and the
 * default stayed — so `pnpm citation-safety-probe` with no configuration went on
 * calling a retired origin and grading LawMind on the answer. A probe that
 * invents its own target does not measure the deployment; it measures whichever
 * host the constant happens to name.
 *
 * As of SHIP S4-T0.2 (18 Sep 2026) the state is:
 *
 *     PRODUCTION       = NONE
 *     PERSISTENT_BETA  = NONE
 *
 * There is no deployment, so there is no correct default and a probe must say
 * so rather than guess. The four ways it could guess are all wrong and all
 * refused here: a historical production origin (grades a dead host), localhost
 * (grades this workstation and calls it the deployment), `AUTH_BASE_URL` or any
 * other neighbouring variable (that is the auth surface, not the API under
 * test), and a hard-coded alpha (grades an environment nobody chose).
 *
 * `PROBE_BASE_URL` is therefore REQUIRED. Absent, the probe is
 * `NOT_RUN_NO_DEPLOYED_TARGET` — which is neither a pass nor a failure, and
 * must never be rendered as either. Once SHIP S4-R1 stands up the persistent
 * beta it configures that one variable and the probe becomes a deployment gate
 * again, with none of its assertions touched.
 */

/** The machine-readable reason. CI and `ci:local` both print this verbatim. */
export const NO_DEPLOYED_TARGET = 'NO_DEPLOYED_TARGET';

/**
 * Hosts a probe may never be pointed at, whether by a default or by a stale
 * shell profile. Same rule and same reason as `RETIRED_API_HOSTS` in
 * `apps/mobile/src/api/client.ts`: naming the dead origin here means a copied
 * environment fails LOUDLY instead of producing a verdict about a host nobody
 * deployed to. Not a deploy decision — nothing here asks for that service back.
 */
export const RETIRED_PROBE_ORIGINS = ['api-production-1c0b4.up.railway.app'] as const;

export type ProbeTargetResolution =
  { ok: true; baseUrl: string } | { ok: false; code: typeof NO_DEPLOYED_TARGET; message: string };

const ABSENT =
  `${NO_DEPLOYED_TARGET}: PROBE_BASE_URL is not set.\n\n` +
  'This probe grades a DEPLOYED service over HTTP. LawMind currently has\n' +
  'PRODUCTION = NONE and PERSISTENT_BETA = NONE (docs/CURRENT_STATE.md §11), so\n' +
  'there is no target to default to — and a probe that guesses one reports on a\n' +
  'host nobody deployed. Set PROBE_BASE_URL to the service under test.\n\n' +
  'Repository CI does not need this: a missing target is NOT_RUN_NO_DEPLOYED_TARGET,\n' +
  'never a pass and never a failure.\n';

/**
 * `env` is passed in rather than read from `process.env` so the refusal is
 * testable without mutating the process.
 */
export function resolveProbeBaseUrl(
  env: Record<string, string | undefined>,
): ProbeTargetResolution {
  const raw = env['PROBE_BASE_URL']?.trim();
  if (!raw) return { ok: false, code: NO_DEPLOYED_TARGET, message: ABSENT };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      ok: false,
      code: NO_DEPLOYED_TARGET,
      message:
        `${NO_DEPLOYED_TARGET}: PROBE_BASE_URL is not an absolute URL (${raw}).\n` +
        'Give it an origin the probe can call, e.g. https://api.example.com.\n',
    };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      code: NO_DEPLOYED_TARGET,
      message: `${NO_DEPLOYED_TARGET}: PROBE_BASE_URL must be http or https (${raw}).\n`,
    };
  }
  if ((RETIRED_PROBE_ORIGINS as readonly string[]).includes(parsed.hostname)) {
    return {
      ok: false,
      code: NO_DEPLOYED_TARGET,
      message:
        `${NO_DEPLOYED_TARGET}: PROBE_BASE_URL points at ${parsed.hostname}, a RETIRED\n` +
        'deployment origin. Whatever it answers is not a fact about LawMind.\n',
    };
  }
  return { ok: true, baseUrl: raw.replace(/\/+$/, '') };
}
