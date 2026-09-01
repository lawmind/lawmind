import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { ManageMatterScreen } from '../../src/screens/matter/ManageMatterScreen';

/**
 * MANAGE A MATTER — founder design D-2, NEW3 R16 `R16-RCC-02`.
 *
 * `/matter/manage?id=…` RATHER THAN `/matter/[id]/manage`. `app/matter/[id].tsx`
 * already exists as a leaf, and adding a directory of the same name beside it
 * is the one file-tree shape expo-router resolves ambiguously. A query
 * parameter costs nothing here: this screen is reached from the matter it edits
 * and is not a link anybody sends.
 */
export default function Route() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Manage matter' }} />
      <ManageMatterScreen
        matterId={id}
        onBack={() => router.back()}
        /*
          BACK, NOT A PUSH. A successful save returns the advocate to the matter
          they came from with the store already reconciled — pushing a fresh
          `/matter/[id]` would leave the manage screen in the stack, so the
          system back gesture would take them into a form for a matter they have
          finished editing.
        */
        onDone={() => router.back()}
      />
    </>
  );
}
