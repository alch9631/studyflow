import { Button, Host, Menu, RNHostView, Section, Toggle } from "@expo/ui/swift-ui";
import { accessibilityHint, accessibilityLabel, disabled as disabledModifier } from "@expo/ui/swift-ui/modifiers";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import type { ActionMenuProps } from "./action-menu";
import { AppText, useTheme } from "./ui";

// An accessible RN child does not label SwiftUI's native menu trigger.
export function ActionMenu({ label, items, icon = "ellipsis-horizontal", text, disabled = false }: ActionMenuProps) {
  const theme = useTheme();
  return <Host ignoreSafeArea="all" style={{ flexShrink: 0 }} testID={label}>
    <Menu modifiers={[accessibilityLabel(label), accessibilityHint("Opens menu"), disabledModifier(disabled)]}
      label={<RNHostView matchContents boundedByHost><View style={{ minWidth: 44, minHeight: 44, paddingHorizontal: text ? 10 : 0, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.5 : 1 }}>
        {text ? <AppText size={14} weight="600" style={{ color: theme.brand }}>{text}</AppText> : null}
        <Ionicons name={icon} size={text ? 16 : 22} color={theme.brand} />
      </View></RNHostView>}>
      <Section title={label}>{items.filter(item => !item.attributes?.hidden).map(item => {
        const blocked = disabled || !!item.attributes?.disabled;
        const systemImage = typeof item.image === "string" ? item.image : undefined;
        const onPress = () => { if (!blocked) item.onPress?.(); };
        return item.state ? <Toggle key={item.id ?? item.title} label={item.title} systemImage={systemImage} isOn={item.state === "on"} onIsOnChange={onPress} modifiers={[disabledModifier(blocked)]} />
          : <Button key={item.id ?? item.title} label={item.title} systemImage={systemImage} role={item.attributes?.destructive ? "destructive" : undefined} onPress={onPress} modifiers={[disabledModifier(blocked)]} />;
      })}</Section>
    </Menu>
  </Host>;
}
