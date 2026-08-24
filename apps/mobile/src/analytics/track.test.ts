import { fire, flush, peekBuffer, track } from './track';

/**
 * THE RULE UNDER TEST: no network call exists yet (deliberately — see
 * `track.ts`'s module note), and a property that fails the scrubber never
 * reaches the buffer, only the event's contract-controlled fields do.
 */

describe('track/fire/flush', () => {
  beforeEach(() => {
    flush(); // drain any state left by a prior test
  });

  it('buffers a well-formed event unchanged', () => {
    track({ name: 'matter_created', at: '2026-08-23T00:00:00.000Z', matterId: 'mat_1', ordinal: 1 });

    expect(peekBuffer()).toEqual([
      { name: 'matter_created', at: '2026-08-23T00:00:00.000Z', experiment: undefined, matterId: 'mat_1', ordinal: 1 },
    ]);
  });

  it('fire() stamps `at` itself so call sites never have to', () => {
    const before = Date.now();
    fire({ name: 'first_successful_search' } as never);
    const [event] = peekBuffer();

    expect(event).toBeDefined();
    expect(new Date(event!.at as string).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('flush() returns everything buffered and empties the buffer', () => {
    track({ name: 'onboarding_completed', at: '2026-08-23T00:00:00.000Z' });
    track({ name: 'first_successful_search', at: '2026-08-23T00:00:01.000Z' });

    const flushed = flush();

    expect(flushed).toHaveLength(2);
    expect(peekBuffer()).toEqual([]);
  });

  it('drops a property that fails the scrubber, keeping only the contract-controlled fields', () => {
    track({
      name: 'winback_eligible',
      at: '2026-08-23T00:00:00.000Z',
      // @ts-expect-error deliberately off-contract, exactly the shape the scrubber exists to catch
      debugContext: { clientName: 'Ramesh Kumar' },
    });

    expect(peekBuffer()).toEqual([
      { name: 'winback_eligible', at: '2026-08-23T00:00:00.000Z', experiment: undefined },
    ]);
  });

  it('caps the buffer rather than growing without bound', () => {
    for (let i = 0; i < 550; i++) {
      track({ name: 'onboarding_completed', at: `2026-08-23T00:00:${String(i % 60).padStart(2, '0')}.000Z` });
    }

    expect(peekBuffer().length).toBe(500);
  });
});
