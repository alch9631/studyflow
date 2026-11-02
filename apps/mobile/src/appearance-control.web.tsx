import { Pressable, Text, View } from "react-native";
import { useTheme } from "./theme";
import type { AppearanceControlProps } from "./appearance-control";

// The native adapter's web buttons are only 20 px high. Keep the same choices
// keyboard accessible and comfortably tappable in the browser preview.
export default function AppearanceControl({ mode, disabled, onChange }: AppearanceControlProps) {
  const theme = useTheme();
  return <View role="group" aria-label="Appearance" testID="appearance-mode"
    style={{ flexDirection: "row", flexGrow: 1, flexBasis: 160, gap: 2, padding: 2, borderRadius: 12, backgroundColor: theme.tint }}>
    {(["light", "dark"] as const).map(value => <Pressable key={value} accessibilityRole="button" aria-pressed={mode === value}
      accessibilityState={{ disabled }} disabled={disabled} onPress={() => onChange(value)}
      style={({ pressed }) => ({ flex: 1, minHeight: 44, paddingHorizontal: 12, justifyContent: "center", alignItems: "center",
        borderRadius: 10, backgroundColor: mode === value ? theme.surface : "transparent", opacity: disabled || pressed ? 0.6 : 1 })}>
      <Text style={{ color: theme.text, fontSize: 15, fontWeight: mode === value ? "600" : "400" }}>{value === "light" ? "Light" : "Dark"}</Text>
    </Pressable>)}
  </View>;
}
