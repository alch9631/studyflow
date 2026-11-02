import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../src/session";
import { useTheme } from "../src/ui";
import { AppThemeProvider } from "../src/theme";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SwipeRowsProvider } from "../src/swipe-row";

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><AppThemeProvider><SwipeRowsProvider><ThemedNavigation /></SwipeRowsProvider></AppThemeProvider></GestureHandlerRootView>;
}

function ThemedNavigation() {
  const theme = useTheme();
  return <SessionProvider><StatusBar style={theme.dark ? "light" : "dark"} /><Stack screenOptions={{ headerStyle: { backgroundColor: theme.background }, headerTintColor: theme.text, contentStyle: { backgroundColor: theme.background }, headerShadowVisible: false }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="focus/[id]" options={{ title: "Focus", presentation: "modal" }} />
    <Stack.Screen name="session/[id]" options={{ title: "Session length", presentation: "formSheet", sheetGrabberVisible: true, sheetAllowedDetents: [0.75, 1] }} />
    <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
    <Stack.Screen name="course/[id]" options={{ headerShown: false }} />
    <Stack.Screen name="edit/[action]" options={{ headerShown: false }} />
    <Stack.Screen name="insights" options={{ headerShown: false }} />
    <Stack.Screen name="catalog" options={{ headerShown: false }} />
    <Stack.Screen name="practice" options={{ headerShown: false }} />
    <Stack.Screen name="timetable" options={{ headerShown: false }} />
  </Stack></SessionProvider>;
}
