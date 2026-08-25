import { scrubEventProps } from './scrub';
import type { AnalyticsEvent } from './events';

/**
 * `track()` — scrubber-first, no network send, per this round's own
 * instruction (P12: "must be built scrubber-first ... before any network
 * send"). There is no `POST /analytics/events` on `services/api` yet
 * (checked, not assumed — grepped `services/api/src` for a route matching
 * it, none exists) and inventing one from this side would violate
 * `CLAUDE.md` §7 ("never invent APIs ... from memory"). So this module ends
 * at an in-memory buffer, not a wire call — the contract (`events.ts`) and
 * the scrubbing discipline are ready for whichever lane builds the
 * ingestion endpoint; `flush()` is the seam that call plugs into.
 *
 * IN-MEMORY, NOT PERSISTED. Unlike `state/outbox.ts` (citation-copy
 * warnings, where losing a record is a safety gap), losing buffered
 * analytics on an app kill is an acceptable, ordinary loss — persisting it
 * would be doing real work for a sink that does not exist yet.
 */

const MAX_BUFFER = 500;
let buffer: AnalyticsEvent[] = [];

/**
 * Records one event. Every property except the contract's own `name`/`at`/
 * `experiment` passes through `scrubEventProps` before it is kept — belt AND
 * braces with `events.ts`'s closed types, per this module's own header note.
 * Silently drops the oldest entry past `MAX_BUFFER` rather than growing
 * without bound; analytics must never be the reason the app runs out of
 * memory on a Redmi-class device.
 */
export function track(event: AnalyticsEvent): void {
  const { name, at, experiment, ...rest } = event as AnalyticsEvent & Record<string, unknown>;
  const { safe } = scrubEventProps(rest);

  buffer.push({ name, at, experiment, ...safe } as AnalyticsEvent);
  if (buffer.length > MAX_BUFFER) buffer.shift();
}

/** Distribute `Omit` across the event union so each name keeps its own props. */
type EventAtFireTime = AnalyticsEvent extends infer E
  ? E extends AnalyticsEvent
    ? Omit<E, 'at'>
    : never
  : never;

/** `at` is set here, once, so every call site fires `track({ name: '...', ...props })` without threading a timestamp through every screen. */
export function fire(event: EventAtFireTime): void {
  track({ ...event, at: new Date().toISOString() } as AnalyticsEvent);
}

/** Everything buffered since the last `flush()`. The seam a real sink plugs into — deliberately not implemented here (see module header). */
export function flush(): AnalyticsEvent[] {
  const events = buffer;
  buffer = [];
  return events;
}

/** Test/debug only — never call from product code. */
export function peekBuffer(): readonly AnalyticsEvent[] {
  return buffer;
}
