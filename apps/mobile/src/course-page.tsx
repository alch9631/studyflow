import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Action, AppText, ErrorMessage, IconButton, useTheme } from "./ui";
import DemoNotice from "./demo-notice";

/** The sheet keeps navigation visible; each section owns its virtualized scroll. */
export function CoursePage({ title, subtitle, navigation, query, children }: {
  title: string; subtitle?: string; navigation: React.ReactNode; children: React.ReactNode;
  query: { loading: boolean; error: string | null; reload: () => Promise<void> };
}) {
  const theme = useTheme();
  return <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: theme.background }}>
    <View style={{ padding: 20, paddingBottom: 8, gap: 14 }}>
      <View style={{ gap: 4 }}>
        <View style={{ alignItems: "flex-end" }}><IconButton glass label="Close course" icon="close-outline" onPress={() => router.canGoBack() ? router.back() : router.replace("/")} /></View>
        <AppText size={22} weight="700">{title}</AppText>
        {subtitle ? <AppText size={14} muted>{subtitle}</AppText> : null}
      </View>
      <DemoNotice />
      {query.error ? <><ErrorMessage message={query.error} /><Action secondary onPress={() => { void query.reload(); }}>Try again</Action></> : null}
      {query.loading ? <ActivityIndicator color={theme.brand} /> : null}
      {navigation}
    </View>
    {children}
  </SafeAreaView>;
}
