import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../src/session";
import { useTheme } from "../src/ui";

export default function RootLayout() {
  const theme = useTheme();
  return <SessionProvider><StatusBar style={theme.dark ? "light" : "dark"} /><Stack screenOptions={{ headerStyle: { backgroundColor: theme.background }, headerTintColor: theme.text, contentStyle: { backgroundColor: theme.background }, headerShadowVisible: false }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="focus/[id]" options={{ title: "Focus", presentation: "modal" }} />
    <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
  </Stack></SessionProvider>;
}
