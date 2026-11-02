import { useEffect, useState } from "react";
import { Alert, Linking } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import type { PreferencesData } from "../../../shared/mobileWorkspace";
import { useSession } from "../src/session";
import { Action, AppText, Card, ErrorMessage } from "../src/ui";
import { edit, LinkButton, Page, timeLabel, useMobileData } from "../src/workspace";
import { reminderEnabled, setReminder } from "../src/reminders";
import AppearanceSetting from "../src/appearance-setting";

export default function Settings() {
  const { session, signOut, isDemo, startDemo } = useSession();
  const query = useMobileData<PreferencesData>("preferences");
  const [reminder, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (session && !isDemo) void reminderEnabled(session.userId).then(setEnabled).catch(() => setError("Couldn't read reminder settings. Try again.")); }, [session, isDemo]);
  async function disconnect() {
    setBusy(true); setError(null);
    try { if (session && !isDemo) await setReminder(session.userId, false, 0).catch(() => {}); await signOut(); if (isDemo) router.replace("/"); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't sign out. Please try again."); }
    finally { setBusy(false); }
  }
  return <Page back title="Settings" subtitle={query.data?.user.email ?? "Your Studyflow account"} query={query}>
    {isDemo && <Card><AppText weight="700">Explore at your own pace</AppText><AppText muted>These are sample courses and study sessions. Your changes stay in this demo and are never sent to an account.</AppText>
      <Action secondary disabled={busy} onPress={() => { startDemo(); router.replace("/"); }}>Restart demo</Action>
      <Action busy={busy} onPress={() => { void disconnect(); }}>Exit demo</Action>
    </Card>}
    {query.data && <Card><AppText size={18} weight="700">Study preferences</AppText><AppText muted>{timeLabel(query.data.preferences.dayStartMin)}–{timeLabel(query.data.preferences.dayEndMin)} · {query.data.preferences.dailyBudgetMin} minutes per day</AppText><LinkButton label="Edit study window & daily budget" onPress={() => { const p = query.data!.preferences; edit("savePreferences", { dayStart: timeLabel(p.dayStartMin), dayEnd: timeLabel(p.dayEndMin), dailyBudgetMin: String(p.dailyBudgetMin), energy: p.energy }); }} />
      {isDemo ? <AppText size={13} muted>Sign in to enable reminders and subscribe in Apple Calendar.</AppText> : <>
      <LinkButton label={reminder ? "Turn off daily reminder" : `Enable daily reminder at ${timeLabel(query.data.preferences.dayStartMin)}`} onPress={() => { if (!session || busy) return; setBusy(true); void setReminder(session.userId, !reminder, query.data!.preferences.dayStartMin).then(() => setEnabled(!reminder)).catch(e => setError(e.message)).finally(() => setBusy(false)); }} />
      {reminder && <AppText size={12} muted>Daily reminders use this iPhone’s local time.</AppText>}
      <LinkButton label="Subscribe in Apple Calendar" onPress={() => { if (session) void Linking.openURL(`${session.server.replace(/^https:/, "webcal:")}/api/calendar/${query.data!.calendarToken}`).catch(() => setError("Couldn't open Calendar.")); }} />
      </>}
    </Card>}
    <Card><AppearanceSetting /><AppText weight="700">On this iPhone</AppText><AppText muted>{isDemo ? "Demo data resets when you leave. Sign in to save and sync your own study plan." : "Focus drafts are saved on this device. Keep a connection to sync progress with your account."}</AppText></Card>
    {__DEV__ && !isDemo && <Card><AppText weight="600">Development server</AppText><AppText size={13} muted>{session?.server}</AppText></Card>}
    <ErrorMessage message={error} />
    {!isDemo && <Action secondary busy={busy} onPress={() => Alert.alert("Sign out of Studyflow?", "Your synced study progress will stay in your account.", [{ text: "Cancel", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: () => { void disconnect(); } }])}>Sign out</Action>}
    <AppText size={12} muted style={{ textAlign: "center" }}>Studyflow for iPhone · {Constants.expoConfig?.version}</AppText>
  </Page>;
}
