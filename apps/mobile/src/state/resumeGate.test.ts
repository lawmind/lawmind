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
    expect(resumeAction('unknown', false)).toBe('wait');
    expect(resumeAction('unknown', true)).toBe('wait');
  });

  it('does not resume for a signed-out session', () => {
    expect(resumeAction('signed_out', true)).toBe('wait');
  });

  it('sends an identity with no profile to onboarding, holding the link', () => {
    // NOT 'resume'. The destination survives to onboarding, which consumes it
    // after the profile exists — spending it here would lose it on a screen
    // that cannot use it.
    expect(resumeAction('identity_only', true)).toBe('onboarding');
    expect(resumeAction('identity_only', false)).toBe('onboarding');
  });

  it('waits for the destination store before resuming a signed-in advocate', () => {
    expect(resumeAction('signed_in', false)).toBe('wait');
    expect(resumeAction('signed_in', true)).toBe('resume');
  });
});
