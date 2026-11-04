import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider, useSession } from "../src/session";
import { ActivityIndicator, View } from "react-native";
import { useTheme } from "../src/ui";
import { AppThemeProvider } from "../src/theme";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SwipeRowsProvider } from "../src/swipe-row";

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><AppThemeProvider><SwipeRowsProvider><ThemedNavigation /></SwipeRowsProvider></AppThemeProvider></GestureHandlerRootView>;
}

function ThemedNavigation() {
  return <SessionProvider><SessionNavigation /></SessionProvider>;
}

function SessionNavigation() {
  const theme = useTheme();
  const { session, loading } = useSession();
  if (loading) return <View style={{ flex: 1, justifyContent: "center", backgroundColor: theme.background }}><ActivityIndicator color={theme.brand} /></View>;
  // A new account also gets fresh navigation and screen state.
  return <><StatusBar style={theme.dark ? "light" : "dark"} /><Stack key={session?.token ?? "signed-out"} screenOptions={{ headerStyle: { backgroundColor: theme.background }, headerTintColor: theme.text, contentStyle: { backgroundColor: theme.background }, headerShadowVisible: false, headerBackButtonDisplayMode: "minimal" }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
    <Stack.Protected guard={!!session}>
    <Stack.Screen name="focus/[id]" options={{ title: "Focus", presentation: "modal" }} />
    <Stack.Screen name="session/[id]" options={{ headerShown: false, presentation: "formSheet", sheetGrabberVisible: true, sheetAllowedDetents: [0.75, 1] }} />
    <Stack.Screen name="course/[id]" options={{ headerShown: false, presentation: "formSheet", sheetGrabberVisible: true, sheetAllowedDetents: [0.75, 1] }} />
    <Stack.Screen name="edit/[action]" options={{ headerShown: false }} />
    <Stack.Screen name="exams" options={{ headerShown: false }} />
    <Stack.Screen name="settings" options={{ headerShown: false }} />
    <Stack.Screen name="catalog" options={{ headerShown: false }} />
    <Stack.Screen name="practice" options={{ headerShown: false }} />
    </Stack.Protected>
  </Stack></>;
}
