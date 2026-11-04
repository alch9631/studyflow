import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { AppText, useTheme } from "./ui";
import { GlassSurface } from "./glass-surface";
import { useSectionMotion, type SectionMotion } from "./section-motion";

/** Equal sections stay on one row at iPhone widths. */
export function SectionTabs({ options, value, onChange, motion }: {
  options: { label: string; value: string }[]; value: string; onChange: (value: string) => void;
  motion?: SectionMotion;
}) {
  const theme = useTheme();
  const selectedIndex = options.findIndex(option => option.value === value);
  const ownMotion = useSectionMotion(selectedIndex);
  const { position } = motion ?? ownMotion;
  const [width, setWidth] = useState(0);
  const itemWidth = Math.max(0, (width - 4 * (options.length - 1)) / options.length);
  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: position.value * (itemWidth + 4) }] }));
  // Glass paints behind the controls so its native content view cannot intercept taps.
  return <View style={styles.surface}>
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
      <GlassSurface style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
    </View>
    <View accessibilityRole="tablist" onLayout={event => setWidth(event.nativeEvent.layout.width)} style={styles.tabs}>
      <Animated.View pointerEvents="none" accessible={false} style={[styles.indicator, { width: itemWidth, backgroundColor: theme.accent, opacity: selectedIndex < 0 || !width ? 0 : 1 }, indicatorStyle]} />
      {options.map(option => {
        const selected = value === option.value;
        return <Pressable key={option.value} accessibilityRole="tab" accessibilityLabel={option.label} accessibilityState={{ selected }} onPress={() => onChange(option.value)}
          style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.65 : 1 }]}>
          <AppText selectable={false} size={13} weight="600" style={{ color: selected ? theme.onAccent : theme.brand, textAlign: "center" }}>{option.label}</AppText>
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  surface: { borderRadius: 18, padding: 4, overflow: "hidden" },
  tabs: { flexDirection: "row", gap: 4 },
  indicator: { position: "absolute", top: 0, bottom: 0, left: 0, borderRadius: 14 },
  tab: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 4, paddingVertical: 10, alignItems: "center", justifyContent: "center", borderRadius: 14 },
});
