import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import { useSession } from "../../src/session";
import { useTheme } from "../../src/ui";
import SignIn from "../../src/SignIn";
import ThemeTabBar from "../../src/theme-tab-bar";

export default function TabLayout() {
  const { session, loading } = useSession();
  const theme = useTheme();
  if (loading) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator color={theme.brand} /></View>;
  if (!session) return <SignIn />;
  if (Platform.OS === "ios") return <NativeTabs tintColor={theme.brand} minimizeBehavior="never"
    iconColor={{ default: theme.muted, selected: theme.brand }}
    labelStyle={{ default: { color: theme.muted }, selected: { color: theme.brand } }}>
    {/* Stable tab identity retains scroll, filters and selection. */}
    <NativeTabs.Trigger name="index" disableScrollToTop disablePopToTop disableAutomaticContentInsets contentStyle={{ backgroundColor: theme.background }}>
      <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf={{ default: "sun.max", selected: "sun.max.fill" }} />
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="calendar" disableScrollToTop disablePopToTop disableAutomaticContentInsets contentStyle={{ backgroundColor: theme.background }}>
      <NativeTabs.Trigger.Label>Calendar</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf="calendar" />
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="courses" disableScrollToTop disablePopToTop disableAutomaticContentInsets contentStyle={{ backgroundColor: theme.background }}>
      <NativeTabs.Trigger.Label>Courses</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf={{ default: "book.closed", selected: "book.closed.fill" }} />
    </NativeTabs.Trigger>
  </NativeTabs>;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: theme.brand, tabBarInactiveTintColor: theme.muted, tabBarBackground: () => <ThemeTabBar />, tabBarStyle: { backgroundColor: "transparent", borderTopColor: theme.line, borderTopWidth: theme.dark ? 0 : StyleSheet.hairlineWidth, shadowOpacity: 0, elevation: 0 } }}>
    <Tabs.Screen name="index" options={{ title: "Today", tabBarIcon: ({ color, size }) => <Ionicons name="sunny-outline" size={size} color={typeof color === "string" ? color : theme.brand} /> }} />
    <Tabs.Screen name="calendar" options={{ title: "Calendar", tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={typeof color === "string" ? color : theme.brand} /> }} />
    <Tabs.Screen name="courses" options={{ title: "Courses", tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={typeof color === "string" ? color : theme.brand} /> }} />
  </Tabs>;
}
