import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "../../src/session";
import { useTheme } from "../../src/ui";
import SignIn from "../../src/SignIn";

export default function TabLayout() {
  const { session, loading } = useSession();
  const theme = useTheme();
  if (loading) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator color={theme.brand} /></View>;
  if (!session) return <SignIn />;
  return <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: theme.brand, tabBarInactiveTintColor: theme.muted, tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.line } }}>
    <Tabs.Screen name="index" options={{ title: "Today", tabBarIcon: ({ color, size }) => <Ionicons name="sunny-outline" size={size} color={typeof color === "string" ? color : theme.brand} /> }} />
    <Tabs.Screen name="calendar" options={{ title: "Calendar", tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={typeof color === "string" ? color : theme.brand} /> }} />
    <Tabs.Screen name="courses" options={{ title: "Courses", tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={typeof color === "string" ? color : theme.brand} /> }} />
    <Tabs.Screen name="exams" options={{ title: "Exams", tabBarIcon: ({ color, size }) => <Ionicons name="school-outline" size={size} color={typeof color === "string" ? color : theme.brand} /> }} />
    <Tabs.Screen name="settings" options={{ title: "More", tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal" size={size} color={typeof color === "string" ? color : theme.brand} /> }} />
  </Tabs>;
}
