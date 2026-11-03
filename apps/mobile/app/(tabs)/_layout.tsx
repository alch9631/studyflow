import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../src/session";
import { useTheme } from "../../src/ui";
import SignIn from "../../src/SignIn";
import ThemeTabBar, { TAB_BAR_HEIGHT, tabBarBottom } from "../../src/theme-tab-bar";
import { readableAccent } from "../../src/theme-colors";

const tabs = [
  { name: "index", title: "Home", icon: "home-outline", selected: "home" },
  { name: "today", title: "Today", icon: "sunny-outline", selected: "sunny" },
  { name: "calendar", title: "Calendar", icon: "calendar-outline", selected: "calendar" },
  { name: "courses", title: "Courses", icon: "book-outline", selected: "book" },
  { name: "insights", title: "Insights", icon: "stats-chart-outline", selected: "stats-chart" },
] as const;

export default function TabLayout() {
  const { session, loading } = useSession();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  if (loading) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator color={theme.brand} /></View>;
  if (!session) return <SignIn />;
  return <Tabs screenOptions={{
    headerShown: false, tabBarShowLabel: false, tabBarHideOnKeyboard: true,
    tabBarActiveTintColor: readableAccent(theme.accent, "#303034"), tabBarInactiveTintColor: "#E1E1E6",
    tabBarBackground: () => <ThemeTabBar />,
    tabBarStyle: {
      position: "absolute", bottom: tabBarBottom(insets.bottom), marginHorizontal: 16,
      height: TAB_BAR_HEIGHT, paddingBottom: 0, paddingHorizontal: 4,
      backgroundColor: "transparent", borderTopWidth: 0, shadowOpacity: 0, elevation: 0,
    },
  }}>
    {tabs.map(tab => <Tabs.Screen key={tab.name} name={tab.name} options={{
      title: tab.title, tabBarAccessibilityLabel: tab.title, lazy: tab.name === "insights",
      tabBarIcon: ({ focused, color }) => <Ionicons name={focused ? tab.selected : tab.icon} size={22} color={typeof color === "string" ? color : "#E1E1E6"} />,
    }} />)}
  </Tabs>;
}
