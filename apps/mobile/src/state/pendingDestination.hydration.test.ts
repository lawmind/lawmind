import AsyncStorage from '@react-native-async-storage/async-storage';

import { usePendingDestination, type HeldDestination } from './pendingDestination';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HYDRATION RACE — the half of the Android auth-resume P0 that no rendered
 * test could reach, because it is decided entirely by which promise settles
 * first.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `app/_layout.tsx` dispatches `hydrate()` on mount and does not wait for it.
 * A cold start from an external link therefore has TWO writers racing for the
 * same field: the AsyncStorage read that began at launch, and the live capture
 * of the link the advocate actually followed. On a physical Galaxy S24 the
 * read is the slower of the two often enough to matter, and when it lands last
 * it wins — because `hydrate` used to `set({ held })` unconditionally.
 *
 * The failure is silent and it is total: the advocate signs in, verifies, and
 * lands on Today, with the link they followed already spent. Nothing logs, and
 * nothing on the screen says a destination was discarded.
 *
 * THE INVARIANT THESE ASSERT is not "null does not overwrite". A null-only
 * guard is not sufficient — a STALE persisted destination overwriting a newer
 * live one is the same defect with a worse ending, because it resumes to
 * somewhere the advocate has actually been rather than to Today, which reads
 * like the feature working. The invariant is MONOTONIC:
 *
 *   async hydration may populate this store only if NO in-memory mutation
 *   happened after that hydration began.
 *
 * Expressed as a mutation generation, so it holds for every shape of write —
 * capture, consume and clear alike — rather than for the one shape somebody
 * remembered to special-case.
 */

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.restoreAllMocks();
  usePendingDestination.setState({ held: null, hydrated: false, generation: 0 });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const store = () => usePendingDestination.getState();

/** A read the test settles by hand, so the interleaving is stated, not hoped for. */
function deferredRead(): { begin: () => void; settle: (raw: string | null) => void } {
  let settle!: (raw: string | null) => void;
  const read = new Promise<string | null>((resolve) => {
    settle = resolve;
  });
  return {
    begin: () => {
      jest.spyOn(AsyncStorage, 'getItem').mockReturnValue(read as Promise<string | null>);
    },
    settle: (raw) => settle(raw),
  };
}

function persisted(href: string, ageMs: number): string {
  return JSON.stringify({ href, capturedAt: Date.now() - ageMs } satisfies HeldDestination);
}

describe('hydration never overwrites a newer in-memory destination', () => {
  /**
   * TEST 1, THE PROMPT'S FIRST FALSIFIER, EMPTY-STORAGE FORM.
   *
   * First ever launch: storage holds nothing, so the read resolves NULL. The
   * link arrived while that read was still in flight. This is the exact
   * ordering of "cold install, first protected deep link".
   */
  it('a live capture survives a read that resolves empty', async () => {
    const read = deferredRead();
    read.begin();

    const hydrating = store().hydrate(); // the read begins
    store().capture('/matter/m1'); // the advocate's link lands mid-read
    read.settle(null); // storage answers: nothing held
    await hydrating;

    expect(store().held?.href).toBe('/matter/m1');
    expect(store().hydrated).toBe(true);
  });

  /**
   * TEST 1, STALE FORM — and the reason a `held === null` patch is not enough.
   *
   * Storage holds yesterday's destination. A null-only guard lets it through,
   * and the advocate resumes to a matter they abandoned instead of the one they
   * were just sent.
   */
  it('a live capture survives a read that resolves a stale destination', async () => {
    const read = deferredRead();
    read.begin();

    const hydrating = store().hydrate();
    store().capture('/matter/m1');
    read.settle(persisted('/matter/older', 20 * 60 * 1000));
    await hydrating;

    expect(store().held?.href).toBe('/matter/m1');
  });

  /**
   * A CONSUMED DESTINATION MUST NOT COME BACK. `consume` is destructive by
   * design — one that survived being resumed would fire again on the next
   * sign-in — and a late read is a way for it to survive.
   */
  it('a consumed destination is not resurrected by a late read', async () => {
    const read = deferredRead();
    read.begin();

    const hydrating = store().hydrate();
    store().capture('/matter/m1');
    expect(store().consume()).toBe('/matter/m1');
    read.settle(persisted('/matter/m1', 1_000));
    await hydrating;

    expect(store().held).toBeNull();
  });

  /**
   * AND THE ORDINARY CASE STILL WORKS. The guard must not cost the feature it
   * protects: with no live mutation, a persisted destination is what the store
   * holds. This is "process killed during the mail round trip" — the only path
   * on which the destination exists nowhere but on disk.
   */
  it('populates from storage when nothing mutated it in the meantime', async () => {
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockResolvedValue(persisted('/judgment/abc?paragraph=23', 1_000));

    await store().hydrate();

    expect(store().held?.href).toBe('/judgment/abc?paragraph=23');
    expect(store().hydrated).toBe(true);
  });

  /**
   * A FAILED READ IS STILL A FINISHED READ. `auth/verify.tsx` waits for
   * `hydrated` before it decides where to send the advocate, so a throwing
   * keychain must not leave that decision waiting forever.
   */
  it('marks itself hydrated even when the read throws, and keeps a live capture', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('storage unavailable'));

    const hydrating = store().hydrate();
    store().capture('/matter/m1');
    await hydrating;

    expect(store().hydrated).toBe(true);
    expect(store().held?.href).toBe('/matter/m1');
  });
});
