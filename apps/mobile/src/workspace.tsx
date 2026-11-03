import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useFocusEffect, router } from "expo-router";
import { ActivityIndicator, AppState, Platform, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError } from "./api";
import { useSession } from "./session";
import { Action, AppText, ErrorMessage, IconButton, styles, useTheme } from "./ui";
import { GlassSurface } from "./glass-surface";
import type { ActionResult, FormFields } from "../../../shared/mobileWorkspace";
import DemoNotice from "./demo-notice";
import NavigationMenu from "./navigation-menu";
import { useCloseSwipeRow } from "./swipe-row";
import { MobileQueryCache, sessionCache } from "./query-cache";

export function useMobileData<T>(path: string) {
  const { session, signOut } = useSession();
  const cache = useMemo(() => session ? sessionCache(session.server, session.token) : new MobileQueryCache(), [session]);
  const snapshot = useCallback(() => cache.snapshot<T>(path), [cache, path]);
  const subscribe = useCallback((listener: () => void) => cache.subscribe(path, listener), [cache, path]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async (force = false) => {
    if (!session) return;
    try { await cache.load(path, () => api<T>(session.server, session.token, path), force); }
    catch (error) { if (error instanceof ApiError && error.status === 401) await signOut(); }
  }, [cache, path, session, signOut]);
  const reload = useCallback(async () => {
    setRefreshing(true);
    try { await load(true); } finally { setRefreshing(false); }
  }, [load]);
  const setError = useCallback((message: string | null) => cache.setError(path, message), [cache, path]);
  // Native tabs mount together. Fetch on mount so the first tab switch has data
  // ready; the focus read below shares the same request and freshness window.
  useEffect(() => { void load(); }, [load]);
  // Focus/foreground refreshes are quiet when cached content is already visible.
  // Requests finish into the cache even when a tab loses focus.
  useFocusEffect(useCallback(() => {
    void load();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void load(); });
    return () => subscription.remove();
  }, [load]));
  const action = useCallback(async <R = ActionResult,>(name: string, fields: FormFields = {}): Promise<R> => {
    if (!session) throw new Error("Sign in to continue.");
    try { return await api<R>(session.server, session.token, `actions/${encodeURIComponent(name)}`, { method: "POST", body: { fields }, timeout: 120_000 }); }
    catch (error) { if (error instanceof ApiError && error.status === 401) await signOut(); throw error; }
  }, [session, signOut]);
  return { data: state.data, error: state.error?.message ?? null, loading: !!session && state.data === null && state.loading, refreshing, reload, action, setError };
}

export function usePrefetchMobileData() {
  const { session } = useSession();
  return useCallback((path: string) => {
    if (!session) return;
    const cache = sessionCache(session.server, session.token);
    // Prefetch is optional. A failed read remains retryable on screen focus.
    void cache.load(path, () => api(session.server, session.token, path)).catch(() => {});
  }, [session]);
}

export function Page({ title, subtitle, children, query, back = false, sheet = false, tabPage = false, actions }: {
  title: string; subtitle?: string; children: React.ReactNode; query?: { loading: boolean; refreshing?: boolean; error: string | null; reload: () => Promise<void> }; back?: boolean; sheet?: boolean; tabPage?: boolean; actions?: React.ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const dockedTabs = tabPage && Platform.OS === "ios";
  const closeSwipeRow = useCloseSwipeRow();
  return <SafeAreaView edges={sheet ? [] : ["top"]} style={[styles.screen, { backgroundColor: theme.background }]}>
    <ScrollView onScrollBeginDrag={closeSwipeRow} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" contentInsetAdjustmentBehavior={dockedTabs ? "never" : "automatic"} contentContainerStyle={styles.content}
      refreshControl={query ? <RefreshControl tintColor={theme.brand} refreshing={query.refreshing ?? false} onRefresh={() => { void query.reload(); }} /> : undefined}>
      <View style={{ gap: 4 }}>
        {sheet ? <>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>{actions}<IconButton glass label="Close course" icon="close-outline" onPress={() => router.canGoBack() ? router.back() : router.replace("/")} /></View>
          <AppText size={22} weight="700" style={{ flexShrink: 1 }}>{title}</AppText>
        </> : <View style={[styles.row, { gap: 8 }]}>{back && <IconButton glass label="Back" icon="arrow-back-outline" onPress={() => router.canGoBack() ? router.back() : router.replace("/")} />}<AppText size={28} weight="700" style={{ flex: 1 }}>{title}</AppText>{actions}{!back && <NavigationMenu />}</View>}
        {subtitle && <AppText size={14} muted>{subtitle}</AppText>}</View>
      <DemoNotice />
      {query?.error && <><ErrorMessage message={query.error} /><Action secondary onPress={() => { void query.reload(); }}>Try again</Action></>}
      {query?.loading && <ActivityIndicator color={theme.brand} />}{children}
    </ScrollView>
    {/* Keep list content above the floating system tab bar, including during scroll. */}
    {dockedTabs && <View pointerEvents="none" style={{ height: Math.max(88, insets.bottom + 56), backgroundColor: theme.background }} />}
  </SafeAreaView>;
}

export function LinkButton({ label, onPress, danger = false }: { label: string; onPress: () => void; danger?: boolean }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ minHeight: 44, paddingVertical: 10, opacity: pressed ? 0.5 : 1, justifyContent: "center" })}>
    <AppText weight="600" style={{ color: danger ? theme.danger : theme.brand }}>{label}</AppText>
  </Pressable>;
}
export function Field({ label, value, onChange, multiline = false, placeholder, numeric = false, disabled = false, maxLength }: { label: string; value: string; onChange: (s: string) => void; multiline?: boolean; placeholder?: string; numeric?: boolean; disabled?: boolean; maxLength?: number }) {
  const theme = useTheme();
  return <View style={{ gap: 7 }}><AppText size={14} weight="600">{label}</AppText><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={theme.muted}
    multiline={multiline} editable={!disabled} maxLength={maxLength} keyboardType={numeric ? "decimal-pad" : "default"} style={[styles.input, { color: theme.text, borderColor: theme.line, backgroundColor: theme.surface, minHeight: multiline ? 110 : 52, textAlignVertical: multiline ? "top" : "center" }]} /></View>;
}
export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const theme = useTheme();
  return <View style={{ gap: 6 }}>{label && <AppText size={13} muted>{label}</AppText>}<View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }} style={{ height: 8, borderRadius: 4, backgroundColor: theme.line, overflow: "hidden" }}>
    <View style={{ height: 8, width: `${Math.max(0, Math.min(100, value))}%`, borderRadius: 4, backgroundColor: theme.brand }} />
  </View></View>;
}
export function Chips({ options, value, onChange, disabled = false, trailing }: { options: { label: string; value: string }[]; value: string; onChange: (value: string) => void; disabled?: boolean; trailing?: React.ReactNode }) {
  const theme = useTheme();
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{options.map(o => <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: o.value === value, disabled }} disabled={disabled} onPress={() => onChange(o.value)} style={{ opacity: disabled ? 0.5 : 1 }}>
    <GlassSurface interactive solid={o.value === value} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, ...(o.value === value ? { backgroundColor: theme.accent } : {}) }}>
      <AppText size={14} weight="600" style={{ color: o.value === value ? theme.onAccent : theme.brand }}>{o.label}</AppText>
    </GlassSurface>
  </Pressable>)}{trailing}</View>;
}
export function edit(action: string, fields: FormFields = {}, returnTo?: string) {
  router.push({ pathname: "/edit/[action]", params: { action, fields: JSON.stringify(fields), ...(returnTo ? { returnTo } : {}) } });
}
export function chooseSession(block: { id: string; topicId: string; kind: string }) {
  router.push({ pathname: "/session/[id]", params: { id: block.id, topicId: block.topicId, kind: block.kind } });
}
export const dateLabel = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const minutesLabel = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m` : `${Math.round(minutes)}m`;
export const timeLabel = (minutes: number) => `${Math.floor(minutes / 60).toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
