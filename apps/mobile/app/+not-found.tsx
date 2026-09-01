import { StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Compass } from 'lucide-react-native';

import { EmptyState } from '../src/components/EmptyState';
import { Screen } from '../src/components/Screen';
import { space } from '../src/theme/tokens';

/**
 * There is no catch-all route in this app. A slug that is not in the inventory
 * lands here rather than rendering an empty shell — a blank screen that looks
 * like a real one is how a dead route survives a review.
 */
export default function NotFound() {
  const router = useRouter();
  return (
    <Screen style={styles.host}>
      <Stack.Screen options={{ title: 'Not found' }} />
      <EmptyState
        actions={[
          /*
            THE INVENTORY IS A DEVELOPMENT AFFORDANCE AND IT SAYS SO NOW.
            `/directory` had no `__DEV__` guard and this row was how anybody
            reached it: a store build shipped a browsable list of every designed
            and undesigned screen, one wrong link away. Both ends are guarded —
            the route refuses in production, and the offer is not made.
          */
          ...(__DEV__
            ? [
                {
                  label: 'Open the screen inventory',
                  onPress: () => router.replace('/directory'),
                },
              ]
            : []),
          { label: 'Back to Today', onPress: () => router.replace('/today'), variant: 'tertiary' as const },
        ]}
        body={
          __DEV__
            ? 'No screen answers to that address. Every screen in this app is listed in the inventory.'
            : 'No screen answers to that address.'
        }
        icon={Compass}
        title="That route does not exist"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  host: { justifyContent: 'center', padding: space.sm },
});
