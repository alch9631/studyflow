import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useAppearance, useTheme } from "./theme";

const nativeGlass = Platform.OS === "ios" && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

/** Shared material; callers retain their existing layout and corner radius. */
export function GlassSurface({ children, style, interactive = false, solid = false }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; interactive?: boolean; solid?: boolean }) {
  const theme = useTheme();
  const { reduceTransparency } = useAppearance();
  const glass = !solid && !reduceTransparency && nativeGlass;
  const corners = { borderRadius: StyleSheet.flatten(style)?.borderRadius ?? 16, borderCurve: "continuous" as const };
  const surface = [
    corners,
    { backgroundColor: glass ? "transparent" : theme.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.line },
    style,
  ];
  return glass ? <GlassView colorScheme={theme.dark ? "dark" : "light"} glassEffectStyle="regular" isInteractive={interactive} style={surface}>{children}</GlassView>
    : <View style={surface}>{children}</View>;
}
