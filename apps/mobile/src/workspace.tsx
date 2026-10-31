import { useCallback, useRef, useState } from "react";
import { useFocusEffect, router } from "expo-router";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, ApiError } from "./api";
import { useSession } from "./session";
import { Action, AppText, ErrorMessage, styles, useTheme } from "./ui";
import type { ActionResult, FormFields } from "../../../shared/mobileWorkspace";

export function useMobileData<T>(path: string) {
  const { session, signOut } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    if (!session) { setLoading(false); return; }
    setLoading(true); setError(null);
    try { const value = await api<T>(session.server, session.token, path); if (current === generation.current) setData(value); }
    catch (e) { if (current === generation.current) { if (e instanceof ApiError && e.status === 401) await signOut(); else setError(e instanceof Error ? e.message : "Couldn't load your data."); } }
    finally { if (current === generation.current) setLoading(false); }
  }, [path, session, signOut]);
  useFocusEffect(useCallback(() => { void reload(); return () => { generation.current++; }; }, [reload]));
  const action = useCallback(async <R = ActionResult,>(name: string, fields: FormFields = {}): Promise<R> => {
    if (!session) throw new Error("Sign in to continue.");
    return api<R>(session.server, session.token, `actions/${encodeURIComponent(name)}`, { method: "POST", body: { fields }, timeout: 120_000 });
  }, [session]);
  return { data, error, loading, reload, action, setError };
}

export function Page({ title, subtitle, children, query, back = false }: {
  title: string; subtitle?: string; children: React.ReactNode; query?: { loading: boolean; error: string | null; reload: () => Promise<void> }; back?: boolean;
}) {
  const theme = useTheme();
  return <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: theme.background }]}>
    <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" contentContainerStyle={styles.content}
      refreshControl={query ? <RefreshControl tintColor={theme.brand} refreshing={query.loading} onRefresh={() => { void query.reload(); }} /> : undefined}>
      <View style={{ gap: 6 }}>{back && <LinkButton label="Back" onPress={() => router.canGoBack() ? router.back() : router.replace("/")} />}
        <AppText size={32} weight="800">{title}</AppText>{subtitle && <AppText muted>{subtitle}</AppText>}</View>
      {query?.error && <><ErrorMessage message={query.error} /><Action secondary onPress={() => { void query.reload(); }}>Try again</Action></>}
      {query?.loading && <ActivityIndicator color={theme.brand} />}{children}
    </ScrollView>
  </SafeAreaView>;
}

export function LinkButton({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ minHeight: 44, paddingVertical: 10, opacity: pressed ? 0.5 : 1, justifyContent: "center" })}>
    <AppText weight="600" style={{ color: danger ? theme.danger : theme.brand }}>{label}</AppText>
  </Pressable>;
}
export function Field({ label, value, onChange, multiline = false, placeholder, numeric = false }: { label: string; value: string; onChange: (s: string) => void; multiline?: boolean; placeholder?: string; numeric?: boolean }) {
  const theme = useTheme();
  return <View style={{ gap: 7 }}><AppText size={14} weight="600">{label}</AppText><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.muted}
    multiline={multiline} keyboardType={numeric ? "decimal-pad" : "default"} style={[styles.input, { color: theme.text, borderColor: theme.line, backgroundColor: theme.surface, minHeight: multiline ? 110 : 52, textAlignVertical: multiline ? "top" : "center" }]} /></View>;
}
export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const theme = useTheme();
  return <View style={{ gap: 6 }}>{label && <AppText size={13} muted>{label}</AppText>}<View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }} style={{ height: 8, borderRadius: 4, backgroundColor: theme.line, overflow: "hidden" }}>
    <View style={{ height: 8, width: `${Math.max(0, Math.min(100, value))}%`, borderRadius: 4, backgroundColor: theme.brand }} />
  </View></View>;
}
export function Chips({ options, value, onChange }: { options: { label: string; value: string }[]; value: string; onChange: (value: string) => void }) {
  const theme = useTheme();
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{options.map(o => <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: o.value === value }} onPress={() => onChange(o.value)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: o.value === value ? theme.brand : theme.tint }}>
    <AppText size={14} weight="600" style={{ color: o.value === value ? theme.dark ? "#10241F" : "white" : theme.brand }}>{o.label}</AppText>
  </Pressable>)}</View>;
}
export function edit(action: string, fields: FormFields = {}, returnTo?: string) {
  router.push({ pathname: "/edit/[action]", params: { action, fields: JSON.stringify(fields), ...(returnTo ? { returnTo } : {}) } });
}
export const dateLabel = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const minutesLabel = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m` : `${Math.round(minutes)}m`;
export const timeLabel = (minutes: number) => `${Math.floor(minutes / 60).toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
