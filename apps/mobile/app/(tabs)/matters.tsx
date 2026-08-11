import { MatterWorkspace } from '../../src/screens/matter/MatterWorkspace';

/**
 * 24 · tab route. The matter workspace list — the retention moat.
 * `MatterWorkspace` renders `MattersScreen` alone below the desktop
 * breakpoint — phone behaviour is unchanged.
 */
export default function Route() {
  return <MatterWorkspace />;
}
