import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { AppText, useTheme } from "./ui";

export type ActionMenuItem = MenuAction & { onPress?: () => void };
export type ActionMenuProps = {
  label: string;
  items: ActionMenuItem[];
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  text?: string;
  disabled?: boolean;
  glass?: boolean;
};

export function selectMenuItem(items: ActionMenuItem[], id: string) {
  items.find(item => (item.id ?? item.title) === id && !item.attributes?.disabled)?.onPress?.();
}

/** The Expo UI adapter supplies its own native Host and opens on a single tap. */
export function ActionMenu({ label, items, icon = "ellipsis-horizontal", text, disabled = false }: ActionMenuProps) {
  const theme = useTheme();
  return <MenuView title={label} testID={label} style={{ flexShrink: 0 }}
    actions={items.map(({ onPress: _onPress, ...item }) => ({ ...item, attributes: { ...item.attributes, disabled: disabled || item.attributes?.disabled } }))}
    onPressAction={({ nativeEvent }) => { if (!disabled) selectMenuItem(items, nativeEvent.event); }}>
    <View accessible accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Opens menu" accessibilityState={{ disabled }}
      style={{ minWidth: 44, minHeight: 44, paddingHorizontal: text ? 10 : 0, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.5 : 1 }}>
      {text ? <AppText size={14} weight="600" style={{ color: theme.brand }}>{text}</AppText> : null}
      <Ionicons name={icon} size={text ? 16 : 22} color={theme.brand} />
    </View>
  </MenuView>;
}
