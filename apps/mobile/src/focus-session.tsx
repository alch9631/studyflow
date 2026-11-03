import { useCallback, useEffect, useRef, useState } from "react";
import { Redirect, useFocusEffect, usePreventRemove, useRouter } from "expo-router";
import { ActivityIndicator, Alert, AppState, Linking, Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { formatTimer, preferredProgress, type MobileBlock } from "../../../shared/mobile";
import { advanceFocusClock, type FocusClock } from "../../../shared/focus-clock";
import { ApiError, finishFocus, finishSession, getFocus, saveProgress } from "./api";
import { clearDraft, draftKey, readDraft, writeDraft } from "./drafts";
import { useSession } from "./session";
import { Action, AppText, Card, ErrorMessage, styles, useTheme } from "./ui";
import { openMaterial } from "./materials";
import FocusNotes from "./focus-notes";
import DemoNotice from "./demo-notice";

export default function FocusSession({ id, topicId, kind, minutes }: { id: string; topicId?: string; kind?: string; minutes?: string }) {
  const { session, signOut } = useSession();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [block, setBlock] = useState<MobileBlock | null>(null);
  const [response, setResponse] = useState("");
  const [checked, setChecked] = useState(false);
  const [clock, setClock] = useState<FocusClock | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [notesBusy, setNotesBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => { if (block?.completed) router.dismissTo("/"); }, [block?.completed, router]);
  const finished = useRef(false);
  const saving = useRef<Promise<void> | null>(null);
  const latest = useRef({ block, response, checked, clock });
  latest.current = { block, response, checked, clock };
  usePreventRemove(notesBusy, () => {
    Alert.alert("Finish editing your note", "Save or cancel the note edit before closing this session.");
  });

  useEffect(() => {
    if (!session) return;
    let active = true;
    setError(null);
    void (async () => {
      try {
        const data = await getFocus(session.server, session.token, id, { topicId, kind });
        const local = await readDraft(draftKey(session.server, session.userId, data.topicId));
        const progress = preferredProgress(local, data.progress);
        if (!active) return;
        const requested = Number(minutes);
        const target = Number.isInteger(requested) && requested >= 1 && requested <= 600 ? requested : undefined;
        const restored = progress === local ? local?.clock : undefined;
        setBlock(data); setResponse(progress?.response ?? "");
        setChecked(progress === local && local?.checked === true);
        setClock({ elapsed: Math.max(progress?.elapsedSeconds ?? 0, restored?.elapsed ?? 0),
          minutes: target ?? progress?.sessionMinutes ?? data.minutes, running: target ? true : restored?.running ?? true, at: Date.now() });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) { await signOut(); return; }
        if (active) setError(e instanceof Error ? e.message : "Couldn't open this session.");
      }
    })();
    return () => { active = false; };
  }, [id, topicId, kind, minutes, session, signOut, loadAttempt]);

  const persist = useCallback(async (remote = true) => {
    const current = latest.current;
    if (!session || !current.block || !current.clock || current.block.completed || finished.current) return;
    const snapshot = advanceFocusClock(current.clock, Date.now());
    const draft = { response: current.response, checked: current.checked, elapsedSeconds: snapshot.elapsed,
      sessionMinutes: snapshot.minutes, clock: snapshot, updatedAt: new Date().toISOString() };
    await writeDraft(draftKey(session.server, session.userId, current.block.topicId), draft);
    if (!remote) return;
    const previous = saving.current;
    const request = (async () => {
      await previous?.catch(() => {});
      if (finished.current) return;
      try {
        await saveProgress(session.server, session.token, current.block!.id, { topicId: current.block!.topicId, ...draft });
        setSaved("Progress saved");
      } catch (e) { setSaved("Draft saved on this iPhone"); throw e; }
    })();
    saving.current = request;
    try { await request; } finally { if (saving.current === request) saving.current = null; }
  }, [session]);

  function pauseClock() {
    const current = latest.current.clock;
    if (!current) return;
    const paused = { ...advanceFocusClock(current, Date.now()), running: false };
    latest.current.clock = paused; setClock(paused);
  }
  function changeResponse(value: string) { latest.current.response = value; setResponse(value); setSaved(null); }

  useEffect(() => {
    const tick = setInterval(() => {
      const current = latest.current.clock;
      const time = Date.now();
      setNow(time);
      if (current?.running) {
        const advanced = advanceFocusClock(current, time);
        if (!advanced.running) setClock(advanced);
      }
    }, 1000);
    const autosave = setInterval(() => { void persist().catch((e: unknown) => setError(e instanceof Error ? e.message : "Your draft is saved on this iPhone.")); }, 15000);
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") setNow(Date.now());
      else void persist().catch(() => {});
    });
    return () => { clearInterval(tick); clearInterval(autosave); subscription.remove(); };
  }, [persist]);
  useEffect(() => {
    const timeout = setTimeout(() => { void persist(false).catch(() => setError("Couldn't save the draft on this iPhone.")); }, 500);
    return () => clearTimeout(timeout);
  }, [response, checked, clock?.running, block, persist]);
  useFocusEffect(useCallback(() => () => {
    const current = latest.current.clock;
    if (current) latest.current.clock = { ...advanceFocusClock(current, Date.now()), running: false };
    void persist().catch(() => {});
  }, [persist]));

  async function leave() {
    if (busy || notesBusy) return;
    pauseClock(); setBusy(true); setError(null);
    try { await persist(); router.dismissTo("/"); }
    catch (e) {
      if (e instanceof ApiError) Alert.alert("Draft saved on this iPhone", "Your progress couldn't sync yet. Reopen this session when you're connected to try again.", [{ text: "Keep studying", style: "cancel" }, { text: "Close", onPress: () => router.dismissTo("/") }]);
      else setError("Couldn't save the draft. Please try again before closing.");
    } finally { setBusy(false); }
  }
  async function finish(outcome: "session" | "complete" | "practice") {
    if (!session || !block || !latest.current.clock || busy || notesBusy) return;
    pauseClock(); setBusy(true); setError(null);
    try {
      await persist(false);
      await saving.current?.catch(() => {});
      const elapsed = latest.current.clock.elapsed;
      finished.current = true;
      if (outcome === "session") await finishFocus(session.server, session.token, block.id, { topicId: block.topicId, kind: block.kind, response: latest.current.response, elapsedSeconds: elapsed });
      else await finishSession(session.server, session.token, block.id, { topicId: block.topicId, response: latest.current.response, checked, outcome, actualMinutes: Math.floor(elapsed / 60) });
      await clearDraft(draftKey(session.server, session.userId, block.topicId)).catch(() => {});
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.dismissTo("/");
    } catch (e) { finished.current = false; setError(e instanceof Error ? e.message : "Couldn't save your result. Your draft is still here."); }
    finally { setBusy(false); }
  }

  if (!session) return <Redirect href="/" />;
  if (!block || !clock) return <View style={[styles.content, { flex: 1, justifyContent: "center" }]}>{error ? <><ErrorMessage message={error} /><Action secondary onPress={() => setLoadAttempt(value => value + 1)}>Try again</Action><Action secondary onPress={() => router.dismissTo("/")}>Back to Today</Action></> : <ActivityIndicator color={theme.brand} />}</View>;
  if (block.completed) return null;
  const displayClock = advanceFocusClock(clock, now);
  const remaining = Math.max(0, displayClock.minutes * 60 - displayClock.elapsed);
  const canFinishTask = checked && (!block.task?.checkQuestion || response.trim().length > 0);
  const disabled = busy || notesBusy;
  function toggleTimer() {
    const current = latest.current.clock;
    if (!current || disabled || remaining === 0) return;
    if (current.running) { pauseClock(); void persist().catch(() => {}); }
    else { const next = { ...current, running: true, at: Date.now() }; latest.current.clock = next; setClock(next); }
  }
  return <View style={styles.screen}>
    <ScrollView contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets contentContainerStyle={[styles.content, { paddingBottom: Math.max(40, insets.bottom) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
      <DemoNotice />
      <View style={{ gap: 6 }}><AppText size={14} weight="600" muted>{block.course.name}</AppText><AppText size={28} weight="800">{block.title}</AppText></View>
      <Card style={{ alignItems: "center", backgroundColor: theme.tint, gap: 16 }}>
        <AppText size={60} weight="500" style={{ fontVariant: ["tabular-nums"] }}>{formatTimer(remaining)}</AppText>
        <AppText size={14} muted>{remaining === 0 ? "Time is up. Save your progress when you're ready." : displayClock.running ? "Focus time" : "Paused"}</AppText>
        <AppText size={13} muted>{Math.floor(displayClock.elapsed / 60)} minutes studied · {clock.minutes} minute session</AppText>
        <Action disabled={disabled || remaining === 0} onPress={toggleTimer}>{displayClock.running ? "Pause" : "Resume"}</Action>
      </Card>
      {block.task && <Card><AppText>{block.task.instruction}</AppText><AppText size={14} muted>{block.task.sourceRef || "Your material"}</AppText>
        {!!block.task.sourceExcerpt && <AppText size={15}>{block.task.sourceExcerpt}</AppText>}
        {(block.fileAvailable || block.task.sourceUrl) && <Action secondary onPress={() => {
          if (block.task?.sourceFileId && block.fileAvailable) void openMaterial(session, block.task.sourceFileId, block.task.sourceRef || "source.pdf").catch(() => setError("Couldn't open this source."));
          else if (block.task?.sourceUrl && /^https?:\/\//.test(block.task.sourceUrl)) void Linking.openURL(block.task.sourceUrl).catch(() => setError("Couldn't open this source."));
        }}>Open source</Action>}
      </Card>}
      <FocusNotes key={block.topicId} topicId={block.topicId} entries={block.notes ?? []} draft={response} onDraftChange={changeResponse} disabled={busy} onBusyChange={setNotesBusy} onReload={async () => {
        const fresh = await getFocus(session.server, session.token, id, { topicId: block.topicId, kind: block.kind });
        setBlock(current => current ? { ...current, notes: fresh.notes } : fresh);
      }} />
      {block.task && <>
        <Action secondary disabled={disabled} onPress={() => { pauseClock(); setCheckOpen(value => !value); }}>{checkOpen ? "Close goal check" : "Check learning goal"}</Action>
        {checkOpen && <Card>
          <AppText size={19} weight="700">Optional learning check</AppText>
          <AppText>{block.task.successCriteria}</AppText>
          {!!block.task.checkQuestion && <AppText>{block.task.checkQuestion}</AppText>}
          <AppText size={14} muted>Write your answer in the working notes above before checking it.</AppText>
          {!!block.task.answerKey && <><Action secondary onPress={() => setShowAnswer(value => !value)}>{showAnswer ? "Hide answer key" : "Compare with the source"}</Action>{showAnswer && <AppText>{block.task.answerKey}</AppText>}</>}
          <Pressable disabled={disabled} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel="I checked my result against the goal" onPress={() => setChecked(value => !value)} style={[styles.row, { minHeight: 48 }]}>
            <Ionicons name={checked ? "checkbox" : "square-outline"} size={27} color={theme.brand} /><AppText>I checked my result.</AppText>
          </Pressable>
          <Action busy={busy} disabled={!canFinishTask || disabled} onPress={() => { void finish("complete"); }}>Goal achieved</Action>
          <Action secondary disabled={disabled} onPress={() => { void finish("practice"); }}>I need more practice</Action>
        </Card>}
      </>}
      <ErrorMessage message={error} />{saved && <AppText size={13} muted>{saved}</AppText>}
      <Action secondary disabled={disabled} onPress={() => { void leave(); }}>Save and close</Action>
      <Action secondary busy={busy} disabled={disabled} onPress={() => { void finish("session"); }}>Finish session</Action>
    </ScrollView>
  </View>;
}
