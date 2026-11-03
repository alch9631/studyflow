import { useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { MobileBlock, MobileToday } from "../../../../shared/mobile";
import type { FormFields } from "../../../../shared/mobileWorkspace";
import { Action, AppText, styles, useTheme } from "../../src/ui";
import { chooseSession, dateLabel, edit, Page, timeLabel, useMobileData } from "../../src/workspace";
import { ActionMenu } from "../../src/action-menu";
import { SwipeRow } from "../../src/swipe-row";
import { PlanAdjustments } from "../../src/plan-adjustments";

export default function Today() {
  const router = useRouter();
  const theme = useTheme();
  const query = useMobileData<MobileToday>("today");
  const { data, error, setError, reload: load } = query;
  const [adjusting, setAdjusting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  async function changeBlock(block: MobileBlock, name: string, fields: FormFields = {}) {
    if (changing) return;
    setChanging(block.id); setError(null);
    try { await query.action(name, { blockId: block.id, ...fields }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't update this session."); }
    finally { setChanging(null); }
  }
  async function adjust(name: string) {
    if (adjusting) return false; setAdjusting(true); setError(null);
    try { await query.action(name); setNotice(name === "undoRecovery" ? "Adjustment undone." : "Plan updated."); await load(); return true; }
    catch (e) { setError((e as Error).message); return false; } finally { setAdjusting(false); }
  }
  const next = data?.resumeBlock ?? data?.blocks.find(block => block.id === data.nextBlockId && !block.completed) ?? data?.blocks.find(block => !block.completed);
  function focus(block: MobileBlock) { chooseSession(block); }
  const left = data ? Math.max(0, data.summary.plannedMinutes - data.summary.completedMinutes) : 0;
  const blocks = data?.resumeBlock && !data.blocks.some(block => block.id === data.resumeBlock!.id) ? [data.resumeBlock, ...data.blocks] : data?.blocks ?? [];
  const date = data ? new Date(`${data.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "";

  return <Page title="Today" subtitle={date} query={query}
    actions={<PlanAdjustments health={data?.planHealth} disabled={!data || adjusting || changing !== null} busy={adjusting} error={error} onAdjust={adjust} />}>
      {notice ? <AppText size={13} muted>{notice}</AppText> : null}
      {data && <>
        <View style={{ gap: 8 }}>
          <View style={[styles.row, { justifyContent: "space-between", flexWrap: "wrap", gap: 4 }]}>
            <AppText size={14} weight="600">{left} min left</AppText><AppText size={13} muted>{data.summary.completedCount}/{data.summary.totalCount} done</AppText>
          </View>
          <View accessibilityRole="progressbar" accessibilityLabel="Today's sessions" accessibilityValue={{ min: 0, max: Math.max(1, data.summary.totalCount), now: data.summary.completedCount }} style={{ height: 4, backgroundColor: theme.line, borderRadius: 2, overflow: "hidden" }}>
            <View style={{ width: `${data.summary.totalCount ? data.summary.completedCount / data.summary.totalCount * 100 : 0}%`, height: 4, backgroundColor: theme.brand }} />
          </View>
        </View>
        <View>{blocks.map(block => <SwipeRow key={block.id} disabled={changing !== null || adjusting}
          leading={{ label: block.completed ? "Reopen" : "Complete", icon: block.completed ? "arrow-undo-outline" : "checkmark-outline", onPress: () => { void changeBlock(block, "toggleBlock", { done: block.completed ? "false" : "true" }); } }}
          trailing={!block.completed ? { label: "Tomorrow", icon: "arrow-forward-outline", onPress: () => { void changeBlock(block, "moveBlock"); } } : undefined}>
          <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: theme.line, gap: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${block.title}, ${block.course.name}, ${block.minutes} minutes${block.completed ? ", complete" : block.progress ? ", resume" : ""}`} disabled={block.completed || changing !== null || adjusting} onPress={() => focus(block)}
            style={({ pressed }) => ({ flex: 1, minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
            <Ionicons name={block.completed ? "checkmark-circle" : block.progress ? "pause-circle-outline" : "ellipse-outline"} size={22} color={block.completed || block.id === next?.id ? theme.brand : theme.muted} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText weight="600" style={{ opacity: block.completed ? 0.55 : 1 }}>{block.title}</AppText>
              <AppText size={13} muted>{block.course.name} · {block.minutes}m{block.progress && !block.completed ? " · Resume" : block.kind === "review" ? " · Review" : ""}</AppText>
            </View>
          </Pressable>
          {changing === block.id ? <ActivityIndicator color={theme.brand} style={{ width: 44 }} /> : <ActionMenu label={`Session actions: ${block.title}`} disabled={changing !== null || adjusting} items={[
            { id: "toggle", title: block.completed ? "Mark unfinished" : "Mark done", image: "checkmark.circle", onPress: () => { void changeBlock(block, "toggleBlock", { done: block.completed ? "false" : "true" }); } },
            ...(!block.completed ? [{ id: "move", title: "Move to tomorrow", image: "arrow.right" as const, onPress: () => { void changeBlock(block, "moveBlock"); } }] : []),
            { id: "notes", title: "Edit notes", image: "square.and.pencil", onPress: () => edit("saveBlockNote", { blockId: block.id, body: block.note ?? "" }) },
          ]} />}
        </View></SwipeRow>)}</View>
        {!next ? <View style={[styles.row, { paddingVertical: 8 }]}>
          <Ionicons name={data.planHealth?.overdueSessions || data.planHealth?.overloaded ? "alert-circle-outline" : "checkmark-circle-outline"} size={24} color={theme.brand} />
          <AppText size={14} muted style={{ flex: 1 }}>{data.planHealth?.overdueSessions || data.planHealth?.overloaded ? "Missed work? Adjust your plan above." : data.blocks.length ? "All done for today." : "No sessions today."}</AppText>
        </View> : null}
        {data.nextExam ? <Pressable accessibilityRole="button" accessibilityLabel={`Next exam: ${data.nextExam.name}, ${dateLabel(data.nextExam.date)}`} onPress={() => router.push("/exams")} style={[styles.row, { minHeight: 48 }]}>
          <Ionicons name="school-outline" size={20} color={theme.muted} /><View style={{ flex: 1 }}><AppText size={14} weight="600">{data.nextExam.name}</AppText><AppText size={13} muted>{dateLabel(data.nextExam.date)}</AppText></View><Ionicons name="chevron-forward" size={16} color={theme.muted} />
        </Pressable> : null}
        {data.assignments?.length ? <View style={{ gap: 4 }}><AppText size={14} weight="700">Deadlines</AppText>{data.assignments.map(a => <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`Deadline: ${a.title}, ${dateLabel(a.dueDate)}`} onPress={() => router.push({ pathname: "/course/[id]", params: { id: a.course.id, section: "deadlines" } })} style={[styles.row, { minHeight: 52, paddingVertical: 8 }]}>
          <Ionicons name="flag-outline" size={19} color={theme.muted} /><View style={{ flex: 1 }}><AppText size={14} weight="600">{a.title}</AppText><AppText size={13} muted>{a.course.name} · {dateLabel(a.dueDate)}</AppText></View><Ionicons name="chevron-forward" size={16} color={theme.muted} />
        </Pressable>)}</View> : null}
        {data.lectures?.length ? <View style={{ gap: 4 }}><AppText size={14} weight="700">Classes</AppText>{data.lectures.map(l => <View key={l.id} style={[styles.row, { minHeight: 52, paddingVertical: 8 }]}>
          <Ionicons name="location-outline" size={19} color={theme.muted} /><View style={{ flex: 1 }}><AppText size={14} weight="600">{l.title}</AppText><AppText size={13} muted>{timeLabel(l.startMin)}–{timeLabel(l.endMin)}{l.location ? ` · ${l.location}` : ""}</AppText></View>
        </View>)}</View> : null}
        {!data.blocks.length ? <Action secondary onPress={() => edit("createCourse")}>Add course</Action> : null}
      </>}
  </Page>;
}
