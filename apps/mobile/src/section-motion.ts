import { useLayoutEffect, useMemo, useRef } from "react";
import { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

const timing = { duration: 240, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System };

export type SectionMotion = {
  position: SharedValue<number>;
  progress: SharedValue<number>;
  direction: SharedValue<number>;
};

/** One UI-thread clock moves the section indicator and reveals its content. */
export function useSectionMotion(index: number): SectionMotion {
  const previous = useRef(index);
  const position = useSharedValue(index);
  const progress = useSharedValue(1);
  const direction = useSharedValue(1);
  useLayoutEffect(() => {
    if (previous.current === index) return;
    direction.value = index > previous.current ? 1 : -1;
    previous.current = index;
    position.value = withTiming(index, timing);
    progress.value = 0;
    progress.value = withTiming(1, timing);
  }, [index, direction, position, progress]);
  return useMemo(() => ({ position, progress, direction }), [position, progress, direction]);
}

export function useSectionContentStyle({ progress, direction }: SectionMotion, active = true) {
  return useAnimatedStyle(() => ({
    opacity: active ? 1 : 0,
    transform: [{ translateX: active ? direction.value * (1 - progress.value) * 12 : 0 }],
  }));
}
