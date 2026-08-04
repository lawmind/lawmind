import { useLocalSearchParams, useRouter } from 'expo-router';

import { ActReaderScreen } from '../../src/screens/statutes/ActReaderScreen';

// 106 · Bare acts — reading an Act
export default function Route() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ActReaderScreen onBack={() => router.back()} statuteId={id} />;
}
