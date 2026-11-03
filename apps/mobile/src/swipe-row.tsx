import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { AppText, useTheme } from "./ui";
import { fullSwipeSide } from "./swipe-action";

type Side = "leading" | "trailing";
type SwipeAction = { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void; destructive?: boolean };
type SwipeHandle = { close: () => void };
type SwipeCoordinator = { close: () => void; reveal: (row: SwipeHandle) => void; release: (row: SwipeHandle) => void };
const SwipeContext = createContext<SwipeCoordinator>({ close: () => {}, reveal: () => {}, release: () => {} });
const ACTION_WIDTH = 96;

export function SwipeRowsProvider({ children }: { children: React.ReactNode }) {
  const active = useRef<SwipeHandle | null>(null);
  const path = usePathname();
  const close = useCallback(() => { active.current?.close(); active.current = null; }, []);
  const reveal = useCallback((row: SwipeHandle) => {
    if (active.current !== row) active.current?.close();
    active.current = row;
  }, []);
  const release = useCallback((row: SwipeHandle) => { if (active.current === row) active.current = null; }, []);
  useEffect(close, [path, close]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => { if (state !== "active") close(); });
    return () => subscription.remove();
  }, [close]);
  const value = useMemo(() => ({ close, reveal, release }), [close, reveal, release]);
  return <SwipeContext value={value}>{children}</SwipeContext>;
}

export function useCloseSwipeRow() { return use(SwipeContext).close; }

/** One horizontal recognizer owns the drag; revealed buttons are outside it. */
export function SwipeRow({ children, leading, trailing, disabled = false }: {
  children: React.ReactNode; leading?: SwipeAction; trailing?: SwipeAction; disabled?: boolean;
}) {
  const theme = useTheme();
  const coordinator = use(SwipeContext);
  const translation = useSharedValue(0);
  const start = useSharedValue(0);
  const width = useSharedValue(0);
  const triggered = useRef(false);
  const [openSide, setOpenSide] = useState<Side | null>(null);
  const close = useCallback(() => {
    translation.value = withTiming(0, { duration: 180 });
    setOpenSide(null);
  }, [translation]);
  const handle = useMemo(() => ({ close }), [close]);
  const { release } = coordinator;
  useEffect(() => () => release(handle), [handle, release]);
  useEffect(() => { if (disabled) close(); }, [disabled, close]);
  function begin() {
    triggered.current = false;
    setOpenSide(null);
    coordinator.reveal(handle);
  }
  function perform(side: Side) {
    const action = side === "leading" ? leading : trailing;
    if (disabled || triggered.current || !action) return;
    triggered.current = true;
    coordinator.close();
    action.onPress();
  }
  const canLead = !!leading;
  const canTrail = !!trailing;
  const pan = usePanGesture({
    enabled: !disabled, activeOffsetX: [-18, 18], failOffsetY: [-12, 12], maxPointers: 1,
    onActivate: () => {
      "worklet";
      cancelAnimation(translation);
      start.value = translation.value;
      scheduleOnRN(begin);
    },
    onUpdate: event => {
      "worklet";
      const next = start.value + event.translationX;
      translation.value = Math.max(canTrail ? -width.value : 0, Math.min(canLead ? width.value : 0, next));
    },
    onDeactivate: event => {
      "worklet";
      const full = event.canceled ? null : fullSwipeSide(event.translationX, width.value, canLead, canTrail);
      const side = event.canceled ? null : translation.value >= 44 && canLead ? "leading" : translation.value <= -44 && canTrail ? "trailing" : null;
      translation.value = withTiming(full || !side ? 0 : side === "leading" ? ACTION_WIDTH : -ACTION_WIDTH, { duration: 180 });
      scheduleOnRN(setOpenSide, full ? null : side);
      if (full) scheduleOnRN(perform, full);
    },
  });
  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translation.value }] }));
  const leadingStyle = useAnimatedStyle(() => ({ opacity: translation.value > 0 ? 1 : 0 }));
  const trailingStyle = useAnimatedStyle(() => ({ opacity: translation.value < 0 ? 1 : 0 }));
  function actionButton(action: SwipeAction, side: Side) {
    const open = openSide === side && !disabled;
    return <Animated.View key={side} pointerEvents={open ? "auto" : "none"} aria-hidden={!open} accessibilityElementsHidden={!open} importantForAccessibility={open ? "auto" : "no-hide-descendants"}
      style={[StyleSheet.absoluteFill, { alignItems: side === "leading" ? "flex-start" : "flex-end", backgroundColor: action.destructive ? theme.danger : theme.accent }, side === "leading" ? leadingStyle : trailingStyle]}>
      <Pressable accessibilityRole="button" accessibilityLabel={action.label} disabled={!open} onPress={() => perform(side)}
        style={({ pressed }) => ({ width: ACTION_WIDTH, minHeight: 52, flex: 1, paddingHorizontal: 8, paddingVertical: 10, gap: 4, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.7 : 1 })}>
        <Ionicons name={action.icon} size={22} color={action.destructive ? "#fff" : theme.onAccent} />
        <AppText selectable={false} size={13} weight="600" style={{ color: action.destructive ? "#fff" : theme.onAccent, textAlign: "center" }}>{action.label}</AppText>
      </Pressable>
    </Animated.View>;
  }
  return <View onLayout={event => { width.value = event.nativeEvent.layout.width; }} style={{ overflow: "hidden" }}>
    {leading && actionButton(leading, "leading")}{trailing && actionButton(trailing, "trailing")}
    <GestureDetector gesture={pan}><Animated.View style={[{ backgroundColor: theme.background }, contentStyle]}>
      {children}
      {openSide && <Pressable accessibilityRole="button" accessibilityLabel="Close swipe actions" onPress={coordinator.close} style={StyleSheet.absoluteFill} />}
    </Animated.View></GestureDetector>
  </View>;
}
