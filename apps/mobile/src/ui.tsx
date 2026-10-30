import { ActivityIndicator, Pressable, StyleSheet, Text, useColorScheme, View, type StyleProp, type ViewStyle } from "react-native";

export function useTheme() {
  const dark = useColorScheme() === "dark";
  return { dark, background: dark ? "#101A1C" : "#F5F7F7", surface: dark ? "#1B292C" : "#FFFFFF", text: dark ? "#F0F7F7" : "#162E32",
    muted: dark ? "#A4B8BB" : "#60777B", line: dark ? "#314347" : "#DFE8E9", brand: dark ? "#67D7C4" : "#126C60", tint: dark ? "#203D38" : "#E4F3EE", danger: dark ? "#FFB4AB" : "#A6312D" };
}

export function AppText({ children, size = 16, weight = "400", muted = false, style }: {
  children: React.ReactNode; size?: number; weight?: "400" | "500" | "600" | "700" | "800"; muted?: boolean; style?: StyleProp<import("react-native").TextStyle>;
}) {
  const theme = useTheme();
  return <Text style={[{ color: muted ? theme.muted : theme.text, fontSize: size, fontWeight: weight, lineHeight: size * 1.4 }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.surface }, style]}>{children}</View>;
}

export function Action({ children, onPress, secondary = false, busy = false, disabled = false }: {
  children: string; onPress: () => void; secondary?: boolean; busy?: boolean; disabled?: boolean;
}) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => [styles.action, { backgroundColor: secondary ? theme.tint : theme.brand, opacity: disabled || busy ? 0.5 : pressed ? 0.8 : 1 }]}>
    {busy ? <ActivityIndicator color={secondary ? theme.brand : theme.background} /> : <Text style={{ color: secondary ? theme.brand : theme.dark ? "#10241F" : "#FFFFFF", fontWeight: "700", fontSize: 16 }}>{children}</Text>}
  </Pressable>;
}

export function ErrorMessage({ message }: { message: string | null }) {
  const theme = useTheme();
  return message ? <Text accessibilityRole="alert" style={{ color: theme.danger, fontSize: 15, lineHeight: 22 }}>{message}</Text> : null;
}

export const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 24, gap: 24, paddingBottom: 40 },
  card: { padding: 20, borderRadius: 22, gap: 12 },
  action: { minHeight: 54, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  input: { borderWidth: 1, borderRadius: 14, padding: 16, fontSize: 16, minHeight: 52 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
