import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { BottomSheet, Host } from "@expo/ui";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { MobileToday } from "../../../shared/mobile";
import { AppText, ErrorMessage, IconButton, useTheme } from "./ui";
import { LinkButton } from "./workspace";

const choices = [
  { name: "protectToday", key: "protect", label: "Defer reviews", icon: "shield-outline" },
  { name: "moveOptional", key: "move", label: "Move unfinished work", icon: "arrow-forward-outline" },
  { name: "recoverPlan", key: "lighter", label: "Rebalance plan", icon: "sync-outline" },
] as const;

export function PlanAdjustments({ health, disabled, busy, error, onAdjust }: {
  health: MobileToday["planHealth"]; disabled: boolean; busy: boolean; error: string | null;
  onAdjust: (name: string) => Promise<boolean>;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  async function adjust(name: string) { if (await onAdjust(name)) setOpen(false); }
  return <>
    <IconButton label="Adjust plan" icon="options-outline" disabled={disabled} onPress={() => setOpen(true)} />
    <Host matchContents>
      <BottomSheet isPresented={open} onDismiss={() => setOpen(false)} snapPoints={["full"]} containerColor={theme.background} contentPadding={0}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><AppText size={24} weight="700" style={{ flex: 1 }}>Adjust plan</AppText><IconButton label="Close plan adjustments" icon="close-outline" onPress={() => setOpen(false)} /></View>
          <AppText size={14} muted>{health?.availableMinutes ?? 0} min available{health?.overdueSessions ? ` · ${health.overdueSessions} missed (${health.overdueMinutes}m)` : ""}{health?.overloaded ? " · Work exceeds study time" : ""}</AppText>
          <ErrorMessage message={error} />
          {busy ? <ActivityIndicator color={theme.brand} /> : null}
          <View>{choices.map(choice => {
            const preview = health?.previews[choice.key];
            return <Pressable key={choice.name} accessibilityRole="button" disabled={busy} onPress={() => { void adjust(choice.name); }}
              style={({ pressed }) => ({ minHeight: 76, paddingVertical: 14, flexDirection: "row", gap: 12, alignItems: "center", borderBottomWidth: 1, borderBottomColor: theme.line, opacity: busy ? 0.5 : pressed ? 0.65 : 1 })}>
              <Ionicons name={choice.icon} size={22} color={theme.brand} />
              <View style={{ flex: 1, gap: 3 }}><AppText weight="600">{choice.label}</AppText>{preview ? <AppText size={13} muted>{preview.afterCount} sessions · {preview.afterPaceMin}m/day · {preview.moved} moved</AppText> : null}</View>
            </Pressable>;
          })}</View>
          {health?.undoAvailable ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void adjust("undoRecovery"); }} style={{ minHeight: 44, justifyContent: "center", opacity: busy ? 0.5 : 1 }}><AppText weight="600" style={{ color: theme.brand }}>Undo adjustment</AppText></Pressable> : null}
          <LinkButton label="Study window & budget" onPress={() => { setOpen(false); router.push("/(tabs)/settings"); }} />
        </ScrollView>
      </BottomSheet>
    </Host>
  </>;
}
