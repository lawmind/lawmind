import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { PrecedentScreen } from '../../src/screens/precedent/PrecedentScreen';

/**
 * The citation network for one authority — `FEATURE_PARITY.md` §2.6, rows 01–03.
 *
 * A ROUTE RATHER THAN A SHEET, because "who cited this and what did they do
 * with it" is a place an advocate goes back to, links a junior to, and reopens
 * from a matter. A sheet has no URL and no back stack, so the network would be
 * unreachable except by re-walking the judgment that opened it.
 *
 * Title and citation ride in as params rather than being re-fetched: the caller
 * already has the resolved row, and re-fetching to render a heading the user is
 * looking at is a round trip to display something already on screen.
 */
export default function Route() {
  const router = useRouter();
  const { id, title, citation } = useLocalSearchParams<{
    id: string;
    title?: string;
    citation?: string;
  }>();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PrecedentScreen
        caseTitle={title ?? ''}
        judgmentId={id}
        neutralCitation={citation ?? ''}
        onBack={() => router.back()}
        onOpenJudgment={(next) => router.push({ pathname: '/judgment/[id]', params: { id: next } })}
      />
    </>
  );
}
