/**
 * The half of the capability registry that makes it a gate rather than a
 * document.
 *
 * R8.3 §6: *"Server routes must enforce it. A disabled capability cannot become
 * usable because a client screen exists or a feature flag is stale."*
 *
 * Two shapes, because there are two ways a capability is reached:
 *
 *   `requireCapability`  a whole ROUTE is the capability. Counterarguments,
 *                        premium jobs, eCourts live. The route refuses, 409,
 *                        with the registry's own reason on the wire.
 *   `arm guards`         a capability is one ARM of a route that must otherwise
 *                        keep working. `/search` still answers an exact citation
 *                        with broad semantic off; what changes is that the dense
 *                        arm does not run and the response says so.
 *
 * The second is the one that matters for a LIMITED V1. Refusing `/search`
 * because semantic is off would take exact identity — the capability the whole
 * limited freeze rests on — away with it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 409, NOT 404 AND NOT AN EMPTY 200
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A 404 says the route does not exist, which is false and which a client will
 * cache as a bad build. An empty 200 says we looked and found nothing, which is
 * the exact defect `retrievalOutcome` exists to prevent — an empty 200 renders
 * as "there is no law on this" on a phone. 409 CONFLICT says: this server, in
 * this release, will not do this, and here is the machine-readable reason.
 */
import type { Context } from 'hono';

import { fail } from '../envelope.ts';
import {
  capabilityRefusal,
  isUserReachable,
  type CapabilityName,
} from './capabilities.ts';

/**
 * Guard a whole route.
 *
 * Returns a Response when the capability is not user-reachable, `null` when the
 * route may proceed. Deliberately not middleware: a `null` the caller must
 * handle is visible at the call site, and a route that forgets it is visible in
 * review. Middleware registered elsewhere is how a route quietly stops being
 * guarded when someone reorders the file.
 */
export function refuseIfDisabled(c: Context, name: CapabilityName): Response | null {
  if (isUserReachable(name)) return null;
  const detail = capabilityRefusal(name);
  return fail(
    c,
    'CAPABILITY_DISABLED',
    // Copy is licence protection, not an audit. This says what the server will
    // not do; it never says the law does not exist.
    'This capability is not available in the current release.',
    409,
    detail,
  );
}

/**
 * May a semantic-dependent ARM run inside a route that is otherwise enabled?
 *
 * Read by `/search`, `/saved-searches/:id/feed` and `/arguments/counter` before
 * they embed a query. When false, no vector is computed, no ANN scan runs, and
 * `retrievalOutcome` reports `semanticAvailable: false` — which it already
 * reports honestly for a cold embedder, so the downstream shape is one the
 * response contract has always been able to express.
 *
 * The distinction that matters: `semanticAvailable: false` means "the semantic
 * arm did not contribute", and `coverage_unknown` / `degraded` follow from it.
 * Nothing is silently truncated and no lexical result is promoted to a
 * confidence it did not earn.
 */
export function semanticArmPermitted(): boolean {
  return isUserReachable('search.semantic.broad');
}
