import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ActionMenuProps } from "./action-menu";
import { AppText, useTheme } from "./ui";

// Expo UI's native MenuView has no web implementation.
export function ActionMenu({ label, items, icon = "ellipsis-horizontal", text, disabled = false }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, expanded: open }} disabled={disabled} onPress={() => setOpen(true)}
      style={{ minWidth: 44, minHeight: 44, paddingHorizontal: text ? 10 : 0, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.5 : 1 }}>
      {text ? <AppText size={14} weight="600" style={{ color: theme.brand }}>{text}</AppText> : null}
      <Ionicons name={icon} size={text ? 16 : 22} color={theme.brand} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss menu" onPress={() => setOpen(false)} style={{ position: "absolute", inset: 0, backgroundColor: "#00000040" }} />
        <View accessibilityViewIsModal style={{ width: "100%", maxWidth: 360, maxHeight: "80%", backgroundColor: theme.surface, borderRadius: 16, padding: 12 }}>
          <AppText weight="700" style={{ padding: 12 }}>{label}</AppText>
          <ScrollView>{items.filter(item => !item.attributes?.hidden).map(item => <Pressable key={item.id ?? item.title} accessibilityRole="button" disabled={disabled || item.attributes?.disabled}
            onPress={() => { setOpen(false); item.onPress?.(); }} style={{ minHeight: 44, padding: 12, opacity: item.attributes?.disabled ? 0.5 : 1 }}>
            <AppText size={15} style={{ color: item.attributes?.destructive ? theme.danger : theme.text }}>{item.title}</AppText>
          </Pressable>)}</ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}
