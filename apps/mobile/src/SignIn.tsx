import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Action, AppText, Card, ErrorMessage, styles, useTheme } from "./ui";
import { useSession } from "./session";

export default function SignIn() {
  const { connect, defaultServer } = useSession();
  const [server, setServer] = useState(defaultServer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();
  async function signIn(development: boolean) {
    setBusy(true); setError(null);
    try { await connect(server, development); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't sign in. Please try again."); }
    finally { setBusy(false); }
  }
  return <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { flexGrow: 1, justifyContent: "center", gap: 32 }]} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 24 }}>
          <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: theme.tint, alignItems: "center", justifyContent: "center" }}><Ionicons name="leaf-outline" size={36} color={theme.brand} /></View>
          <View style={{ gap: 12 }}><AppText size={14} weight="700" muted>STUDYFLOW</AppText><AppText size={38} weight="800">Make room for{"\n"}what matters.</AppText><AppText size={18} muted>A clear plan. One focused session. A little progress, every day.</AppText></View>
        </View>
        <Card><View style={styles.row}><Ionicons name="checkmark-circle-outline" color={theme.brand} size={24} /><AppText>Your plan adapts when life happens.</AppText></View><View style={styles.row}><Ionicons name="time-outline" color={theme.brand} size={24} /><AppText>Pick up right where you left off.</AppText></View></Card>
        {__DEV__ && <View style={{ gap: 8 }}><AppText size={14} weight="600">Development server</AppText><TextInput accessibilityLabel="Studyflow development server" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={[styles.input, { color: theme.text, borderColor: theme.line, backgroundColor: theme.surface }]} /><AppText size={13} muted>On an iPhone, use your Mac’s local network address instead of localhost.</AppText></View>}
        <View style={{ gap: 12 }}><ErrorMessage message={error} /><Action busy={busy} onPress={() => { void signIn(false); }}>Sign in to Studyflow</Action>{__DEV__ && <Action secondary disabled={busy} onPress={() => { void signIn(true); }}>Connect local development account</Action>}<AppText size={13} muted style={{ textAlign: "center" }}>Sign-in opens securely in your browser.</AppText></View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
