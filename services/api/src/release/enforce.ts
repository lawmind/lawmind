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
  isUserReachableOnPlatform,
  parsePlatform,
  type CapabilityName,
  type Platform,
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

/**
 * Which platform made this request.
 *
 * `X-Lawmind-Platform: ios | android | web`. ADDITIVE and PROVISIONAL: a client
 * that sends nothing resolves to `unknown`, which gets the release-wide
 * capability set — exactly the behaviour every existing client has today.
 *
 * A header rather than a token claim because it is not a security boundary and
 * must not be mistaken for one. §9.5's switch protects an App Review outcome, so
 * what it has to be right about is what the iOS BINARY does; a caller that lies
 * about its platform gains a capability it could already reach from a browser.
 * Anything that must not be reachable at all is DISABLED release-wide, where no
 * header can touch it.
 */
export function platformFromRequest(c: Context): Platform {
  return parsePlatform(c.req.header('x-lawmind-platform'));
}

/**
 * May the party-name arm run for this request?
 *
 * Roadmap v7.1 §9.5. Read by `/search` before ranking. When false the arm does
 * not run, `degraded` carries `party_name_disabled`, and exact case number, CNR
 * and citation lookup are untouched — the visible degradation §9.5 requires,
 * rather than a capability that silently vanishes.
 */
export function partyNameArmPermitted(platform: Platform): boolean {
  return isUserReachableOnPlatform('search.party_name', platform);
}
