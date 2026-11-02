import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useAppearance, useTheme } from "./theme";

const nativeGlass = Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

/** Shared material; callers retain their existing layout and corner radius. */
export function GlassSurface({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const { reduceTransparency } = useAppearance();
  const glass = theme.dark && !reduceTransparency && nativeGlass;
  const corners = { borderRadius: StyleSheet.flatten(style)?.borderRadius ?? 16, borderCurve: "continuous" as const };
  return <View style={[
    corners,
    { backgroundColor: glass ? "transparent" : theme.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.line },
    style,
  ]}>
    {glass ? <GlassView pointerEvents="none" colorScheme="dark" tintColor="#08080B" glassEffectStyle="regular"
      style={[StyleSheet.absoluteFill, corners]} /> : null}
    {children}
  </View>;
}
