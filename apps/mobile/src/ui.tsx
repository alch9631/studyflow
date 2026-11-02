import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "./theme";
import { GlassSurface } from "./glass-surface";
export { useTheme } from "./theme";

export function AppText({ children, size = 16, weight = "400", muted = false, style }: {
  children: React.ReactNode; size?: number; weight?: "400" | "500" | "600" | "700" | "800"; muted?: boolean; style?: StyleProp<import("react-native").TextStyle>;
}) {
  const theme = useTheme();
  return <Text selectable style={[{ color: muted ? theme.muted : theme.text, fontSize: size, fontWeight: weight, lineHeight: size * 1.4 }, style]}>{children}</Text>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <GlassSurface style={[styles.card, style]}>{children}</GlassSurface>;
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
  return message ? <Text selectable accessibilityRole="alert" style={{ color: theme.danger, fontSize: 15, lineHeight: 22 }}>{message}</Text> : null;
}

export function IconButton({ label, icon, onPress, disabled = false, busy = false }: {
  label: string; icon: React.ComponentProps<typeof Ionicons>["name"]; onPress: () => void; disabled?: boolean; busy?: boolean;
}) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy} onPress={onPress}
    style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", opacity: disabled || pressed ? 0.5 : 1 })}>
    {busy ? <ActivityIndicator color={theme.brand} /> : <Ionicons name={icon} size={22} color={theme.brand} />}
  </Pressable>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 20, gap: 18, paddingBottom: 32 },
  card: { padding: 16, borderRadius: 16, borderCurve: "continuous", gap: 8 },
  action: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center" },
  input: { borderWidth: 1, borderRadius: 14, padding: 16, fontSize: 16, minHeight: 52 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
