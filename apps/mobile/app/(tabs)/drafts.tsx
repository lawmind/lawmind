import { useRouter } from 'expo-router';

import { DraftsListScreen } from '../../src/screens/draft/DraftsListScreen';

/** Drafts — R4. The advocate's saved documents, newest first. */
export default function Route() {
  const router = useRouter();

  return (
    <DraftsListScreen
      onOpenDocument={(documentId) =>
        // `as never` — the same cast `/coverage` and `/training-consent`
        // needed: expo-router's typed-routes union is generated from the
        // file tree at dev-server start and has not seen this route yet.
        router.push({ pathname: '/document/[id]', params: { id: documentId } } as never)
      }
    />
  );
}
