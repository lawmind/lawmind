import { useRouter } from 'expo-router';

import { BareActsScreen } from '../../src/screens/statutes/BareActsScreen';

// 105 · Bare acts — index
export default function Route() {
  const router = useRouter();
  return (
    <BareActsScreen
      onOpenAct={(statuteId) => router.push({ pathname: '/acts/[id]', params: { id: statuteId } })}
    />
  );
}
