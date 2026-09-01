import { Redirect } from 'expo-router';

import { useSession } from '../src/state/session';

/**
 * THE ENTRY, AND IT BRANCHES ON THE SESSION NOW.
 *
 * This used to redirect unconditionally to `/today` behind a comment saying
 * "there is no auth state to branch on yet" — true when it was written, and
 * stale from S5 onwards, when `useSession` acquired
 * `signed_out | identity_only | signed_in`. The result was that a signed-out
 * launch landed on Today, which then had to offer a "Sign in" action of its
 * own, and every route that had no such affordance simply 401'd.
 *
 * `components/AuthBoundary.tsx` is what actually holds the line on every route.
 * This branch exists so the FIRST paint after a cold start goes to the right
 * place rather than to Today-then-sign-in, which is a visible bounce on a slow
 * device.
 *
 * `unknown` RENDERS NOTHING. It is the state between launch and the keychain
 * answering; redirecting on it would send a signed-in advocate to sign-in every
 * single launch and then bounce them back.
 */
export default function Index() {
  const status = useSession((s) => s.status);

  if (status === 'unknown') return null;
  if (status === 'signed_out') return <Redirect href="/sign-in" />;
  if (status === 'identity_only') return <Redirect href="/onboarding" />;
  return <Redirect href="/today" />;
}
