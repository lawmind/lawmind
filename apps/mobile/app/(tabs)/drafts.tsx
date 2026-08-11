import { DraftWorkspace } from '../../src/screens/draft/DraftWorkspace';

/**
 * Drafts — R4. The advocate's saved documents, newest first.
 * `DraftWorkspace` renders `DraftsListScreen` alone below the desktop
 * breakpoint, wired exactly as this route always wired it.
 */
export default function Route() {
  return <DraftWorkspace />;
}
