import { resumeAction } from './resumeGate';

/**
 * THE COLD-START MAIL ROUND TRIP, AS A TABLE.
 *
 * The case that matters is the third row: signed in, but the destination store
 * has not answered yet. Deciding there spends the link on Today and marks it
 * consumed, so the read that lands a moment later is correctly discarded — a
 * total loss in which every component behaved as designed.
 */
describe('resumeAction', () => {
  it('waits while the session is unknown', () => {
    expect(resumeAction('unknown', false, true)).toBe('wait');
    expect(resumeAction('unknown', true, true)).toBe('wait');
  });

  it('does not resume for a signed-out session', () => {
    expect(resumeAction('signed_out', true, true)).toBe('wait');
  });

  it('sends an identity with no profile to onboarding, holding the link', () => {
    // NOT 'resume'. The destination survives to onboarding, which consumes it
    // after the profile exists — spending it here would lose it on a screen
    // that cannot use it.
    expect(resumeAction('identity_only', true, true)).toBe('onboarding');
    expect(resumeAction('identity_only', false, true)).toBe('onboarding');
  });

  it('waits for the destination store before resuming a signed-in advocate', () => {
    expect(resumeAction('signed_in', false, true)).toBe('wait');
    expect(resumeAction('signed_in', true, true)).toBe('resume');
  });

  it('decides nothing until this link has answered, whatever the old session was', () => {
    // A link into an app already signed in as someone: `status` is that
    // session's, not this link's. Found on the S24, 16 Sep 2026.
    for (const status of ['unknown', 'signed_out', 'identity_only', 'signed_in'] as const) {
      expect(resumeAction(status, true, false)).toBe('wait');
    }
  });
});
