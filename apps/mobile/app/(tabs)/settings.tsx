import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { useSession } from "../../src/session";
import { Action, AppText, Card, ErrorMessage, styles, useTheme } from "../../src/ui";

export default function Settings() {
  const { session, signOut } = useSession();
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function disconnect() {
    setBusy(true); setError(null);
    try { await signOut(); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't sign out. Please try again."); }
    finally { setBusy(false); }
  }
  return <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: theme.background }]}><ScrollView contentContainerStyle={styles.content}>
    <View style={{ gap: 6 }}><AppText size={34} weight="800">Make it yours.</AppText><AppText muted>Your study plan goes where you go.</AppText></View>
    <Card><AppText size={18} weight="700">Your Studyflow account</AppText><AppText muted>Your iPhone and web planner use the same courses and study progress.</AppText><Action secondary onPress={() => { if (session) void WebBrowser.openBrowserAsync(`${session.server}/courses`).catch(() => setError("Couldn't open your planner.")); }}>Open course planner</Action></Card>
    <Card><AppText weight="700">On this iPhone</AppText><AppText muted>Focus drafts are saved on this device. Keep a connection to sync progress with your account.</AppText><AppText size={13} muted>Appearance follows your iPhone’s light or dark setting.</AppText></Card>
    {__DEV__ && <Card><AppText weight="600">Development server</AppText><AppText size={13} muted>{session?.server}</AppText></Card>}
    <ErrorMessage message={error} />
    <Action secondary busy={busy} onPress={() => Alert.alert("Sign out of Studyflow?", "Your synced study progress will stay in your account.", [{ text: "Cancel", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: () => { void disconnect(); } }])}>Sign out</Action>
    <AppText size={12} muted style={{ textAlign: "center" }}>Studyflow for iPhone · 0.1.0</AppText>
  </ScrollView></SafeAreaView>;
}
