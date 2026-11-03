import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { Platform, StyleSheet, View } from "react-native";
import { useAppearance } from "./theme";

export const TAB_BAR_HEIGHT = 48;
export const tabBarBottom = (inset: number) => Math.max(8, inset);
const nativeGlass = Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
const shape = [StyleSheet.absoluteFill, { borderRadius: TAB_BAR_HEIGHT / 2, borderCurve: "continuous" as const }];

export default function ThemeTabBar() {
  const { reduceTransparency } = useAppearance();
  if (nativeGlass && !reduceTransparency) {
    return <GlassView colorScheme="dark" glassEffectStyle="clear" tintColor="rgba(18,18,23,0.72)" style={shape} />;
  }
  return <View style={[shape, { backgroundColor: reduceTransparency ? "#222226" : "rgba(28,28,32,0.84)" }]} />;
}
