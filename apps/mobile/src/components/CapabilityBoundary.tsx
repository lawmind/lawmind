import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';

import { useSurfaceEnabled, type SurfaceName } from '../state/capabilities';

/**
 * Keeps a held route absent even when a stale deep link still names it.
 * Children are not mounted while closed, so their API effects never run.
 */
export function CapabilityBoundary({
  children,
  surface,
}: {
  children: ReactNode;
  surface: SurfaceName;
}) {
  const enabled = useSurfaceEnabled(surface);
  return enabled ? children : <Redirect href="/today" />;
}
