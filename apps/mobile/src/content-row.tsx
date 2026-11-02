import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText, useTheme } from "./ui";

/** One destination per row; secondary controls stay outside its tap target. */
export function ContentRow({ title, subtitle, onPress, icon, trailing, dimmed = false, disabled = false }: {
  title: string; subtitle?: string; onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  trailing?: React.ReactNode; dimmed?: boolean; disabled?: boolean;
}) {
  const theme = useTheme();
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 4, borderBottomWidth: 1, borderBottomColor: theme.line }}>
    <Pressable accessibilityRole="button" accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title} disabled={disabled} onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, opacity: dimmed ? 0.55 : 1, backgroundColor: pressed ? theme.tint : "transparent" })}>
      {icon ? <Ionicons name={icon} size={22} color={theme.brand} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}><AppText weight="600">{title}</AppText>{subtitle ? <AppText size={13} muted>{subtitle}</AppText> : null}</View>
      {!trailing ? <Ionicons name="chevron-forward" size={16} color={theme.muted} /> : null}
    </Pressable>
    {trailing}
  </View>;
}
