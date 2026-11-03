import { Pressable, View } from "react-native";
import { AppText, useTheme } from "./ui";
import { GlassSurface } from "./glass-surface";

/** Equal sections stay on one row at iPhone widths. */
export function SectionTabs({ options, value, onChange }: {
  options: { label: string; value: string }[]; value: string; onChange: (value: string) => void;
}) {
  const theme = useTheme();
  return <GlassSurface style={{ borderRadius: 18, padding: 4 }}>
    <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 4 }}>
      {options.map(option => {
        const selected = value === option.value;
        return <Pressable key={option.value} accessibilityRole="tab" accessibilityLabel={option.label} accessibilityState={{ selected }} onPress={() => onChange(option.value)}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 4, paddingVertical: 10, alignItems: "center", justifyContent: "center", borderRadius: 14, backgroundColor: selected ? theme.accent : "transparent", opacity: pressed ? 0.65 : 1 })}>
          <AppText selectable={false} size={13} weight="600" style={{ color: selected ? theme.onAccent : theme.brand, textAlign: "center" }}>{option.label}</AppText>
        </Pressable>;
      })}
    </View>
  </GlassSurface>;
}
