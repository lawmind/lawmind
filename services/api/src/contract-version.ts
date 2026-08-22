/**
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW MANY VERSIONS OF THE MOBILE APP THIS SERVER PROMISES TO SERVE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A store app is not a web page. An advocate who has automatic updates off, or
 * who is in court on a train with no signal, is running whatever they installed
 * in June — and Apple review alone puts days between a fix and its availability.
 * A server that can only serve today's client bricks those phones.
 *
 * The rule, deliberately the smallest one that works:
 *
 *   **Within a contract version, every change is ADDITIVE.** New fields on
 *   responses, new optional fields on requests, new endpoints. A client that
 *   ignores them behaves exactly as it did. Everything this round added —
 *   `bodyTextSafe`, `degraded`, `precedentialEffect`, `page` — is additive, and
 *   that is not a coincidence: it is the constraint.
 *
 *   **A breaking change bumps {@link CONTRACT_VERSION}**, and the previous
 *   version keeps working until {@link MIN_SUPPORTED_CONTRACT} moves — which is
 *   a separate, deliberate act, taken when the telemetry says nobody is on it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It is not `/v1/` in the path, not a `Accept: application/vnd...` header, and
 * not two copies of every handler. Those are the machinery for serving several
 * incompatible contracts at once, and we do not have several — we have one, and
 * a promise about how it may change. The version is REPORTED so a client can
 * tell the advocate "this app is too old, update it", which is the only thing a
 * client can usefully do about it, and so an operator can tell from `/version`
 * which contract a deployment speaks.
 *
 * The day a genuinely breaking change is unavoidable, the honest move is a
 * bump here plus branch-on-version inside the two or three handlers that
 * differ — not a parallel router. That decision is made when it arrives, with
 * the shape of the actual break in view.
 */

/** Bumped ONLY by a change a current client cannot ignore. */
export const CONTRACT_VERSION = 1;

/**
 * The oldest contract this server still answers. N-1 by policy; equal to
 * CONTRACT_VERSION while there has never been a break.
 */
export const MIN_SUPPORTED_CONTRACT = 1;

/**
 * What a client sends so the server can tell it it is too old. Optional, and a
 * client that sends nothing is assumed current — an old client that does not
 * know to send the header cannot be helped by requiring it.
 */
export const CLIENT_CONTRACT_HEADER = 'x-lawmind-contract';
