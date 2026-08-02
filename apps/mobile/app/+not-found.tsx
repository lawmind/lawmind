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
          { label: 'Open the screen inventory', onPress: () => router.replace('/directory') },
          { label: 'Back to Today', onPress: () => router.replace('/today'), variant: 'tertiary' },
        ]}
        body="No screen answers to that address. Every screen in this app is listed in the inventory."
        icon={Compass}
        title="That route does not exist"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  host: { justifyContent: 'center', padding: space.sm },
});
