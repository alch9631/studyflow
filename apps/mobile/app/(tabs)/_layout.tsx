import { NativeTabs } from "expo-router/native-tabs";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "../../src/session";
import { useTheme } from "../../src/ui";
import SignIn from "../../src/SignIn";

const tabs = [
  { name: "index", title: "Home", icon: "house", selected: "house.fill", android: "home" },
  { name: "today", title: "Today", icon: "checkmark.circle", selected: "checkmark.circle.fill", android: "check_circle" },
  { name: "calendar", title: "Calendar", icon: "calendar", selected: "calendar", android: "calendar_today" },
  { name: "courses", title: "Courses", icon: "book.closed", selected: "book.closed.fill", android: "menu_book" },
  { name: "insights", title: "Insights", icon: "chart.bar", selected: "chart.bar.fill", android: "bar_chart" },
] as const;

export default function TabLayout() {
  const { session, loading } = useSession();
  const theme = useTheme();
  if (loading) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator color={theme.brand} /></View>;
  if (!session) return <SignIn />;
  return <NativeTabs
    tintColor={theme.brand}
    iconColor={{ default: theme.muted, selected: theme.brand }}
    labelVisibilityMode="unlabeled"
    minimizeBehavior="onScrollDown"
    blurEffect="systemUltraThinMaterialDark"
  >
    {tabs.map(tab => <NativeTabs.Trigger key={tab.name} name={tab.name}
      accessibilityLabel={tab.title} disablePopToTop
      contentStyle={{ backgroundColor: theme.background }}>
      <NativeTabs.Trigger.Label hidden>{tab.title}</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf={{ default: tab.icon, selected: tab.selected }} md={tab.android} />
    </NativeTabs.Trigger>)}
  </NativeTabs>;
}
