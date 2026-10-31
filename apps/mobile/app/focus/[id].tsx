import { useCallback, useEffect, useRef, useState } from "react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { elapsedAt, formatTimer, type MobileBlock } from "../../../../shared/mobile";
import { ApiError, finishSession, getFocus, saveProgress } from "../../src/api";
import { clearDraft, draftKey, readDraft, writeDraft } from "../../src/drafts";
import { useSession } from "../../src/session";
import { Action, AppText, Card, ErrorMessage, styles, useTheme } from "../../src/ui";
import { openMaterial } from "../../src/materials";

export default function Focus() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, signOut } = useSession();
  const router = useRouter();
  const theme = useTheme();
  const [block, setBlock] = useState<MobileBlock | null>(null);
  const [response, setResponse] = useState("");
  const [checked, setChecked] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const finished = useRef(false);
  const latest = useRef({ block, response, checked, seconds, startedAt });
  latest.current = { block, response, checked, seconds, startedAt };

  useEffect(() => {
    if (!session || typeof id !== "string") return;
    let active = true;
    async function load() {
      try {
        const data = await getFocus(session!.server, session!.token, id);
        const local = await readDraft(draftKey(session!.server, session!.userId, data.topicId));
        const progress = local && (!data.progress || local.updatedAt > data.progress.updatedAt) ? local : data.progress;
        if (!active) return;
        setBlock(data); setResponse(progress?.response ?? ""); setSeconds(progress?.elapsedSeconds ?? 0);
        setChecked(progress === local && local?.checked === true);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { await signOut(); return; }
        if (active) setError(e instanceof Error ? e.message : "Couldn't open this session.");
      }
    }
    void load();
    return () => { active = false; };
  }, [id, session, signOut]);

  const persist = useCallback(async (remote = true) => {
    const current = latest.current;
    if (!session || !current.block || current.block.completed || finished.current) return;
    const draft = { response: current.response, checked: current.checked,
      elapsedSeconds: elapsedAt(current.seconds, current.startedAt, Date.now()), updatedAt: new Date().toISOString() };
    await writeDraft(draftKey(session.server, session.userId, current.block.topicId), draft);
    if (remote) {
      try {
        await saveProgress(session.server, session.token, current.block.id, { topicId: current.block.topicId, ...draft });
        setSaved("Progress saved");
      } catch (e) {
        setSaved("Draft saved on this iPhone");
        throw e;
      }
    }
  }, [session]);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const autosave = setInterval(() => { void persist().catch((e: unknown) => setError(e instanceof Error ? e.message : "Your draft is saved on this iPhone.")); }, 15000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setNow(Date.now());
      else void persist().catch(() => {});
    });
    return () => { clearInterval(tick); clearInterval(autosave); subscription.remove(); void persist(false).catch(() => {}); };
  }, [persist]);

  // A short debounce also retains an answer if the app closes between autosaves.
  useEffect(() => {
    const timeout = setTimeout(() => { void persist(false).catch(() => setError("Couldn't save the draft on this iPhone.")); }, 500);
    return () => clearTimeout(timeout);
  }, [response, checked, persist]);

  function toggleTimer() {
    if (startedAt === null) setStartedAt(Date.now());
    else { setSeconds(elapsedAt(seconds, startedAt, Date.now())); setStartedAt(null); }
    setNow(Date.now());
    void Haptics.selectionAsync().catch(() => {});
  }

  async function leave() {
    setBusy(true); setError(null);
    try { await persist(); router.replace("/"); }
    catch (e) {
      if (e instanceof ApiError) Alert.alert("Draft saved on this iPhone", "Your progress couldn't sync yet. Reopen this session when you're connected to try again.", [{ text: "Keep studying", style: "cancel" }, { text: "Close", onPress: () => router.replace("/") }]);
      else setError("Couldn't save the draft. Please try again before closing.");
    } finally { setBusy(false); }
  }

  async function finish(outcome: "complete" | "practice") {
    if (!session || !block) return;
    setBusy(true); setError(null);
    try {
      await persist(false);
      await finishSession(session.server, session.token, block.id, { topicId: block.topicId, response, checked, outcome,
        actualMinutes: Math.min(600, Math.ceil(elapsedAt(seconds, startedAt, Date.now()) / 60)) });
      finished.current = true;
      // A local storage failure after a successful result must not report a failed submission.
      await clearDraft(draftKey(session.server, session.userId, block.topicId)).catch(() => {});
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save your result. Your draft is still here."); }
    finally { setBusy(false); }
  }

  if (!session) return <Redirect href="/" />;
  if (!block) return <View style={[styles.content, { flex: 1, justifyContent: "center" }]}>{error ? <><ErrorMessage message={error} /><Action secondary onPress={() => router.replace("/")}>Back to Today</Action></> : <ActivityIndicator color={theme.brand} />}</View>;
  if (block.completed) return <View style={styles.content}><AppText size={28} weight="700">This session is complete.</AppText><Action onPress={() => router.replace("/")}>Back to Today</Action></View>;
  const elapsed = elapsedAt(seconds, startedAt, now);
  const canFinish = checked && (!block.task?.checkQuestion || response.trim().length > 0);

  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
      <View style={{ gap: 6 }}><AppText size={14} weight="600" muted>{block.course.name}</AppText><AppText size={28} weight="800">{block.title}</AppText></View>
      <Card style={{ alignItems: "center", backgroundColor: theme.tint, gap: 16 }}><AppText size={13} weight="600" muted>A LITTLE TIME, JUST FOR THIS</AppText><AppText size={60} weight="500" style={{ fontVariant: ["tabular-nums"] }}>{formatTimer(elapsed)}</AppText><AppText size={14} muted>{block.minutes} min planned · timer is optional</AppText><View style={{ alignSelf: "stretch" }}><Action secondary onPress={toggleTimer}>{startedAt === null ? elapsed > 0 ? "Resume timer" : "Start timer" : "Pause timer"}</Action></View></Card>
      <View style={{ gap: 10 }}><AppText size={19} weight="700">Your focus</AppText><AppText>{block.task?.instruction ?? `Work through ${block.title}. Make a note of what you understand and what needs another look.`}</AppText></View>
      {block.task && <Card><AppText size={14} weight="700" muted>{block.task.sourceRef || "YOUR MATERIAL"}</AppText>{block.task.sourceExcerpt ? <AppText size={15}>{block.task.sourceExcerpt}</AppText> : <AppText size={14} muted>Keep your course material nearby while you work.</AppText>}{(block.task.sourceFileId || block.task.sourceUrl) && <Action secondary onPress={() => {
        if (block.task?.sourceFileId) void openMaterial(session, block.task.sourceFileId, block.task.sourceRef || "source.pdf").catch(() => setError("Couldn't open this source."));
        else if (block.task?.sourceUrl && /^https?:\/\//.test(block.task.sourceUrl)) void Linking.openURL(block.task.sourceUrl).catch(() => setError("Couldn't open this source."));
      }}>Open source</Action>}</Card>}
      <View style={{ gap: 10 }}><AppText size={19} weight="700">{block.task?.checkQuestion ? "Recall check" : "Your working notes"}</AppText>{block.task?.checkQuestion && <AppText>{block.task.checkQuestion}</AppText>}<TextInput accessibilityLabel={block.task?.checkQuestion ? "Your answer" : "Your working notes"} multiline maxLength={4000} value={response} onChangeText={(value) => { setResponse(value); setSaved(null); }} placeholder="Think on the page. What did you learn?" placeholderTextColor={theme.muted} textAlignVertical="top" style={[styles.input, { minHeight: 160, color: theme.text, borderColor: theme.line, backgroundColor: theme.surface, lineHeight: 24 }]} />
        {block.task?.answerKey && <><Action secondary onPress={() => setShowAnswer(!showAnswer)}>{showAnswer ? "Hide answer key" : "Compare with the source"}</Action>{showAnswer && <Card><AppText>{block.task.answerKey}</AppText></Card>}</>}
      </View>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel="I checked my result against the goal" onPress={() => setChecked(!checked)} style={[styles.row, { alignItems: "flex-start", paddingVertical: 12, minHeight: 48 }]}><Ionicons name={checked ? "checkbox" : "square-outline"} size={27} color={checked ? theme.brand : theme.muted} /><View style={{ flex: 1, gap: 6 }}><AppText weight="600">I checked my result.</AppText><AppText size={14} muted>{block.task?.successCriteria ?? "I finished the work planned for this session."}</AppText></View></Pressable>
      <ErrorMessage message={error} />
      {saved && <AppText size={13} muted>{saved}</AppText>}
      <View style={{ gap: 12 }}><Action busy={busy} disabled={!canFinish} onPress={() => { void finish("complete"); }}>Finish session</Action>{block.task && <Action secondary disabled={busy} onPress={() => { void finish("practice"); }}>I need more practice</Action>}<Action secondary disabled={busy} onPress={() => { void leave(); }}>Save and close</Action></View>
      <AppText size={12} muted style={{ textAlign: "center" }}>Your checked result updates the plan. Timer minutes alone don’t finish the task.</AppText>
    </ScrollView>
  </KeyboardAvoidingView>;
}
