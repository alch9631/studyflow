import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { MobileBlock, MobileToday } from "../../../../shared/mobile";
import type { FormFields } from "../../../../shared/mobileWorkspace";
import { ApiError, getToday } from "../../src/api";
import { useSession } from "../../src/session";
import { Action, AppText, Card, ErrorMessage, styles, useTheme } from "../../src/ui";
import { api } from "../../src/api";
import { chooseSession, dateLabel, edit, LinkButton, timeLabel } from "../../src/workspace";

export default function Today() {
  const { session, signOut } = useSession();
  const router = useRouter();
  const theme = useTheme();
  const [data, setData] = useState<MobileToday | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);
  const [changing, setChanging] = useState<string | null>(null);
  async function changeBlock(block: MobileBlock, name: string, fields: FormFields = {}) {
    if (!session || changing) return;
    setChanging(block.id); setError(null);
    try { await api(session.server, session.token, `actions/${name}`, { method: "POST", body: { fields: { blockId: block.id, ...fields } } }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't update this session."); }
    finally { setChanging(null); }
  }
  async function adjust(name: string) {
    if (!session || adjusting) return; setAdjusting(true); setError(null);
    try { await api(session.server, session.token, `actions/${name}`, { method: "POST", body: { fields: {} }, timeout: 120_000 }); setNotice(name === "undoRecovery" ? "The last plan adjustment was undone." : "Your plan has been updated. Completed work was kept."); await load(); }
    catch (e) { setError((e as Error).message); } finally { setAdjusting(false); }
  }
  const load = useCallback(async () => {
    if (!session) return;
    const current = ++generation.current;
    setRefreshing(true); setError(null);
    try { const value = await getToday(session.server, session.token); if (current === generation.current) setData(value); }
    catch (e) {
      if (current !== generation.current) return;
      if (e instanceof ApiError && e.status === 401) { await signOut(); return; }
      setError(e instanceof Error ? e.message : "Couldn't load your plan.");
    } finally { if (current === generation.current) setRefreshing(false); }
  }, [session, signOut]);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));
  const next = data?.resumeBlock ?? data?.blocks.find(block => block.id === data.nextBlockId && !block.completed) ?? data?.blocks.find(block => !block.completed);
  function focus(block: MobileBlock) { chooseSession(block); }
  const left = data ? Math.max(0, data.summary.plannedMinutes - data.summary.completedMinutes) : 0;
  const date = data ? new Date(`${data.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }) : "YOUR DAY, AT YOUR PACE";

  return <SafeAreaView edges={["top"]} style={[styles.screen, { backgroundColor: theme.background }]}>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(); }} tintColor={theme.brand} />}>
      <View style={{ gap: 6 }}><AppText size={13} weight="600" muted>{date}</AppText><AppText size={34} weight="800">A little progress.</AppText><AppText muted>{data?.user.name ? `Welcome back, ${data.user.name.split(" ")[0]}.` : "Let's make today feel manageable."}</AppText></View>
      <ErrorMessage message={error} />
      {notice && <AppText>{notice}</AppText>}
      {error && <Action secondary onPress={() => { void load(); }}>Try again</Action>}
      {!data && !error && <ActivityIndicator color={theme.brand} style={{ margin: 40 }} />}
      {data && <>
        <Card style={{ backgroundColor: theme.tint }}><View style={[styles.row, { justifyContent: "space-between" }]}><AppText weight="700">TODAY’S PLAN</AppText><Ionicons name="sunny-outline" color={theme.brand} size={24} /></View>
          <View style={[styles.row, { alignItems: "baseline" }]}><AppText size={40} weight="800">{left}</AppText><AppText muted>minutes left</AppText></View>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: data.summary.totalCount, now: data.summary.completedCount }} style={{ height: 6, backgroundColor: theme.line, borderRadius: 3, overflow: "hidden" }}><View style={{ width: `${data.summary.totalCount ? data.summary.completedCount / data.summary.totalCount * 100 : 0}%`, height: 6, backgroundColor: theme.brand }} /></View>
          <AppText size={14} muted>{data.summary.completedCount} of {data.summary.totalCount} sessions complete</AppText>
        </Card>
        {next ? <View style={{ gap: 12 }}><AppText size={13} weight="700" muted>YOUR NEXT SMALL STEP</AppText><Card>
          <AppText size={14} weight="600" muted>{next.course.name}</AppText><AppText size={24} weight="700">{next.title}</AppText>
          <AppText muted>{next.task?.instruction ?? "Give this topic your full attention, one step at a time."}</AppText>
          <View style={styles.row}><Ionicons name="time-outline" size={17} color={theme.muted} /><AppText size={14} muted>{next.minutes} min · {next.progress ? "Ready to resume" : next.kind === "review" ? "Review" : "Focused study"}</AppText></View>
          <Action onPress={() => focus(next)}>{next.progress ? "Resume session" : "Start focusing"}</Action>
        </Card></View> : <Card><Ionicons name={data.blocks.length ? "checkmark-circle-outline" : "leaf-outline"} size={36} color={theme.brand} /><AppText size={23} weight="700">{data.planHealth?.overdueSessions || data.planHealth?.overloaded ? "Your plan needs an update." : data.blocks.length ? "You’ve done enough today." : "Some room to breathe."}</AppText><AppText muted>{data.planHealth?.overdueSessions || data.planHealth?.overloaded ? "Review the missed work and adjustment options below to make your plan fit." : data.blocks.length ? "Your planned sessions are finished. Take the rest of the day with you." : "There are no sessions planned for today. Your next study day will appear here."}</AppText></Card>}
        {data.blocks.length > 0 && <View style={{ gap: 12 }}><AppText size={20} weight="700">Your sessions</AppText>{data.blocks.map(block => <Card key={block.id}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${block.title}, ${block.minutes} minutes${block.completed ? ", complete" : ""}`} disabled={block.completed} onPress={() => focus(block)} style={[styles.row, { minHeight: 48 }]}>
            <Ionicons name={block.completed ? "checkmark-circle" : "ellipse-outline"} size={25} color={block.completed ? theme.brand : theme.muted} /><View style={{ flex: 1, gap: 4 }}><AppText weight="600" style={{ opacity: block.completed ? 0.6 : 1 }}>{block.title}</AppText><AppText size={13} muted>{block.course.name} · {block.minutes} min</AppText></View>
          </Pressable>
          <LinkButton label={block.completed ? "Mark as not done" : "Mark session done"} onPress={() => { void changeBlock(block, "toggleBlock", { done: block.completed ? "false" : "true" }); }} />
          {!block.completed && <LinkButton label="Move to tomorrow" onPress={() => { void changeBlock(block, "moveBlock"); }} />}
          <LinkButton label="Edit topic notes" onPress={() => edit("saveBlockNote", { blockId: block.id, body: block.note ?? "" })} />
          {changing === block.id && <ActivityIndicator color={theme.brand} />}
        </Card>)}</View>}
        {data.nextExam && <Pressable accessibilityRole="button" onPress={() => router.push("/(tabs)/exams")} style={[styles.row, { padding: 4, minHeight: 48 }]}><Ionicons name="calendar-outline" size={21} color={theme.muted} /><View style={{ flex: 1 }}><AppText size={14} weight="600">Next exam · {data.nextExam.name}</AppText><AppText size={13} muted>{dateLabel(data.nextExam.date)}</AppText></View></Pressable>}
        {!!data.assignments?.length && <Card><AppText size={19} weight="700">Upcoming deadlines</AppText>{data.assignments.map(a => <View key={a.id}><AppText weight="600">{a.title}</AppText><AppText size={13} muted>{a.course.name} · {dateLabel(a.dueDate)}</AppText><LinkButton label="Open course deadlines" onPress={() => router.push(`/course/${a.course.id}`)} /></View>)}</Card>}
        {!!data.lectures?.length && <Card><AppText size={19} weight="700">Classes today</AppText>{data.lectures.map(l => <View key={l.id}><AppText weight="600">{l.title}</AppText><AppText size={13} muted>{timeLabel(l.startMin)}–{timeLabel(l.endMin)}{l.location ? ` · ${l.location}` : ""}</AppText></View>)}</Card>}
        <Card><AppText size={19} weight="700">Make the plan fit today</AppText>
          {data.planHealth && <>
            <AppText muted>{data.planHealth.availableMinutes} focus minutes fit your remaining study window and daily budget.</AppText>
            {data.planHealth.overdueSessions > 0 && <AppText>{data.planHealth.overdueSessions} missed sessions · {data.planHealth.overdueMinutes} minutes to recover.</AppText>}
            {data.planHealth.overloaded && <AppText>The remaining work does not fit before every exam. Adjust the scope or study time.</AppText>}
          </>}
          {([{ name: "protectToday", key: "protect", label: "Defer optional reviews" }, { name: "moveOptional", key: "move", label: "Move today’s unfinished work" }, { name: "recoverPlan", key: "lighter", label: "Rebalance remaining work" }] as const).map(option => {
            const preview = data.planHealth?.previews[option.key];
            const detail = preview ? `${preview.beforeCount} → ${preview.afterCount} sessions today · ${preview.afterPaceMin} minutes after adjustment.${option.name === "recoverPlan" ? `\n\nNext three days:\n${data.planHealth!.nextDays.map(day => `${dateLabel(day.date)}: ${day.count} sessions · ${day.minutes} min`).join("\n")}` : ""}` : "Completed sessions are kept.";
            return <Action key={option.name} secondary busy={adjusting} onPress={() => Alert.alert(option.label, detail, [{ text: "Cancel", style: "cancel" }, { text: "Adjust plan", onPress: () => { void adjust(option.name); } }])}>{option.label}</Action>;
          })}
          {data.planHealth?.undoAvailable && <LinkButton label="Undo last plan adjustment" onPress={() => { void adjust("undoRecovery"); }} />}
        </Card>
        {!data.blocks.length && <Action secondary onPress={() => edit("createCourse")}>Add a course</Action>}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
