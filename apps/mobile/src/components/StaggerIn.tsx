import { useEffect, useRef } from 'react';
import { Animated, type ViewProps } from 'react-native';

import { duration, motion } from '../theme/tokens';

/**
 * List entry — fade up, staggered `index × 55ms`, CAPPED AT INDEX 7.
 *
 * The cap is the whole point. Uncapped, the twentieth card waits 1.1 seconds
 * and the list reads as slow rather than considered; past the seventh row
 * nobody is watching the choreography anyway.
 *
 * Reduce Motion: drop the transform, keep the opacity. `design/DESIGN_SYSTEM.md`
 * §Motion.
 */
export function StaggerIn({
  index = 0,
  children,
  ...rest
}: ViewProps & { index?: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: duration.push,
      delay: Math.min(index, motion.staggerCap) * motion.staggerStep,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [index, progress]);

  return (
    <Animated.View
      {...rest}
      style={[
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [motion.listRise, 0],
              }),
            },
          ],
        },
        rest.style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
