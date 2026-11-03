import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, View } from "react-native";
import { usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import ReanimatedSwipeable, { SwipeDirection, type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import { AppText, useTheme } from "./ui";
import { fullSwipeSide } from "./swipe-action";

type SwipeAction = { label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void; destructive?: boolean };
type SwipeCoordinator = { close: () => void; reveal: (row: SwipeableMethods) => void; release: (row: SwipeableMethods) => void };
const SwipeContext = createContext<SwipeCoordinator>({ close: () => {}, reveal: () => {}, release: () => {} });

export function SwipeRowsProvider({ children }: { children: React.ReactNode }) {
  const active = useRef<SwipeableMethods | null>(null);
  const path = usePathname();
  const close = useCallback(() => { active.current?.close(); active.current = null; }, []);
  const reveal = useCallback((row: SwipeableMethods) => {
    if (active.current !== row) active.current?.close();
    active.current = row;
  }, []);
  const release = useCallback((row: SwipeableMethods) => { if (active.current === row) active.current = null; row.reset(); }, []);
  useEffect(close, [path, close]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", state => { if (state !== "active") close(); });
    return () => subscription.remove();
  }, [close]);
  const value = useMemo(() => ({ close, reveal, release }), [close, reveal, release]);
  return <SwipeContext value={value}>{children}</SwipeContext>;
}

export function useCloseSwipeRow() { return use(SwipeContext).close; }

/** Short swipes reveal buttons; full swipes invoke the same action on release. */
export function SwipeRow({ children, leading, trailing, disabled = false }: {
  children: React.ReactNode; leading?: SwipeAction; trailing?: SwipeAction; disabled?: boolean;
}) {
  const theme = useTheme();
  const coordinator = use(SwipeContext);
  const row = useRef<SwipeableMethods>(null);
  const width = useRef(0);
  const triggered = useRef(false);
  const [openSide, setOpenSide] = useState<"leading" | "trailing" | null>(null);
  useEffect(() => { if (disabled) { row.current?.reset(); setOpenSide(null); } }, [disabled]);
  const { release } = coordinator;
  useEffect(() => { const instance = row.current; return () => { if (instance) release(instance); }; }, [release]);
  function reveal() { if (row.current) coordinator.reveal(row.current); }
  function perform(action: SwipeAction) {
    if (disabled || triggered.current) return;
    triggered.current = true;
    coordinator.close();
    action.onPress();
  }
  const fullSwipe = usePanGesture({
    enabled: !disabled, runOnJS: true, activeOffsetX: [-20, 20], failOffsetY: [-14, 14],
    onActivate: () => { triggered.current = false; },
    onDeactivate: event => {
      if (event.canceled) return;
      const side = fullSwipeSide(event.translationX, width.current, !!leading, !!trailing);
      const action = side === "leading" ? leading : side === "trailing" ? trailing : undefined;
      if (action) perform(action);
    },
  });
  function actionButton(action: SwipeAction, side: "leading" | "trailing") {
    const open = openSide === side && !disabled;
    return <View aria-hidden={!open} accessibilityElementsHidden={!open} importantForAccessibility={open ? "auto" : "no-hide-descendants"} style={{ justifyContent: "center" }}>
      <Pressable accessibilityRole="button" accessibilityLabel={action.label} disabled={disabled || !open}
        onPress={() => perform(action)}
        style={({ pressed }) => ({ minWidth: 88, maxWidth: 140, minHeight: 52, flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 4, alignItems: "center", justifyContent: "center", backgroundColor: action.destructive ? theme.danger : theme.brand, opacity: pressed ? 0.7 : 1 })}>
        <Ionicons name={action.icon} size={22} color={theme.background} />
        <AppText size={13} weight="600" style={{ color: theme.background, textAlign: "center" }}>{action.label}</AppText>
      </Pressable>
    </View>;
  }
  return <GestureDetector gesture={fullSwipe}><View onLayout={event => { width.current = event.nativeEvent.layout.width; }}>
    <ReanimatedSwipeable ref={row} enabled={!disabled} friction={1} leftThreshold={44} rightThreshold={44}
    simultaneousWith={fullSwipe} dragOffsetFromLeft={20} dragOffsetFromRight={-20} overshootLeft={!!leading} overshootRight={!!trailing} overshootFriction={2}
    onSwipeableOpenStartDrag={reveal} onSwipeableWillOpen={direction => { reveal(); setOpenSide(direction === SwipeDirection.RIGHT ? "leading" : "trailing"); }} onSwipeableWillClose={() => setOpenSide(null)}
    renderLeftActions={leading ? () => actionButton(leading, "leading") : undefined} renderRightActions={trailing ? () => actionButton(trailing, "trailing") : undefined}>
    <View style={{ backgroundColor: theme.background }}>{children}</View>
  </ReanimatedSwipeable></View></GestureDetector>;
}
