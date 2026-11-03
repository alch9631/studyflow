import { useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { nextStudyBlock, type MobileBlock, type MobileToday } from "../../../../shared/mobile";
import type { FormFields } from "../../../../shared/mobileWorkspace";
import { Action, AppText, IconButton, styles, useTheme } from "../../src/ui";
import { chooseSession, dateLabel, edit, Page, timeLabel, useMobileData } from "../../src/workspace";
import { compactSessionLabel } from "../../src/session-label";
import { SwipeRow } from "../../src/swipe-row";
import { PlanAdjustments } from "../../src/plan-adjustments";
import { useSession } from "../../src/session";
import { clearDraft, draftKey } from "../../src/drafts";

export default function Today() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useSession();
  const query = useMobileData<MobileToday>("today");
  const { data, error, setError, reload: load } = query;
  const [adjusting, setAdjusting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  async function changeBlock(block: MobileBlock, name: string, fields: FormFields = {}) {
    if (changing) return;
    setChanging(block.id); setError(null);
    try {
      await query.action(name, { blockId: block.id, ...fields });
      if (name === "toggleBlock" && fields.done === "true" && block.kind === "study" && session) await clearDraft(draftKey(session.server, session.userId, block.topicId));
      await load();
    }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't update this session."); }
    finally { setChanging(null); }
  }
  async function adjust(name: string) {
    if (adjusting) return false; setAdjusting(true); setError(null);
    try { await query.action(name); setNotice(name === "undoRecovery" ? "Adjustment undone." : "Plan updated."); await load(); return true; }
    catch (e) { setError((e as Error).message); return false; } finally { setAdjusting(false); }
  }
  const next = data && nextStudyBlock(data);
  const left = data ? Math.max(0, data.summary.plannedMinutes - data.summary.completedMinutes) : 0;
  const blocks = data?.resumeBlock && !data.blocks.some(block => block.id === data.resumeBlock!.id) ? [data.resumeBlock, ...data.blocks] : data?.blocks ?? [];
  const date = data ? new Date(`${data.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "";

  return <Page tabPage title="Today" subtitle={date} query={query}
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
        <View>{blocks.map(block => {
          const label = compactSessionLabel(block.title, block.kind);
          const noteLabel = block.note ? "Edit notes" : "Add notes";
          const openNotes = () => edit("saveBlockNote", { blockId: block.id, body: block.note ?? "" });
          const options = () => Alert.alert(label.title, undefined, [
            { text: noteLabel, onPress: openNotes },
            ...(!block.completed ? [{ text: "Move to tomorrow", onPress: () => { void changeBlock(block, "moveBlock"); } }] : []),
            { text: "Cancel", style: "cancel" },
          ]);
          return <SwipeRow key={block.id} disabled={changing !== null || adjusting}
          leading={{ label: block.completed ? "Reopen" : "Complete", icon: block.completed ? "arrow-undo-outline" : "checkmark-outline", onPress: () => { void changeBlock(block, "toggleBlock", { done: block.completed ? "false" : "true" }); } }}
          trailing={{ label: noteLabel, icon: "document-text-outline", onPress: openNotes }}>
          <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: theme.line, gap: 4 }}>
          <IconButton label={`${block.completed ? "Mark unfinished" : "Mark done"}: ${label.title}`} icon={block.completed ? "checkmark-circle" : block.progress ? "pause-circle-outline" : "ellipse-outline"} disabled={changing !== null || adjusting} onPress={() => { void changeBlock(block, "toggleBlock", { done: block.completed ? "false" : "true" }); }} />
          <Pressable accessibilityRole="button" accessibilityLabel={`${block.title}, ${block.course.name}, ${block.minutes} minutes${block.completed ? ", complete" : block.progress ? ", resume" : ""}`}
            accessibilityHint={block.completed ? "Opens notes" : "Opens session length. Hold for more options."}
            accessibilityActions={[{ name: "notes", label: noteLabel }, { name: "options", label: "Session options" }]}
            onAccessibilityAction={({ nativeEvent }) => { if (nativeEvent.actionName === "notes") openNotes(); else if (nativeEvent.actionName === "options") options(); }}
            disabled={changing !== null || adjusting} onPress={block.completed ? openNotes : () => chooseSession(block)} onLongPress={options}
            style={({ pressed }) => ({ flex: 1, minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <AppText selectable={false} numberOfLines={2} weight="600" style={{ opacity: block.completed ? 0.55 : 1 }}>{label.title}</AppText>
              {!block.completed && <AppText selectable={false} numberOfLines={1} size={12} muted>{[label.activity, block.course.name].filter(Boolean).join(" · ")}</AppText>}
            </View>
            {!block.completed && <AppText selectable={false} size={12} muted>{block.minutes}m</AppText>}
          </Pressable>
          {changing === block.id && <ActivityIndicator color={theme.brand} />}
        </View></SwipeRow>;
        })}</View>
        {!next ? <View style={[styles.row, { paddingVertical: 8 }]}>
          <Ionicons name={data.planHealth?.overdueSessions || data.planHealth?.overloaded ? "alert-circle-outline" : "checkmark-circle-outline"} size={24} color={theme.brand} />
          <AppText size={14} muted style={{ flex: 1 }}>{data.planHealth?.overdueSessions || data.planHealth?.overloaded ? "Missed work? Adjust your plan above." : data.blocks.length ? "All done for today." : "No sessions today."}</AppText>
        </View> : null}
        {data.nextExam ? <Pressable accessibilityRole="button" accessibilityLabel={`Next exam: ${data.nextExam.name}, ${dateLabel(data.nextExam.date)}`} onPress={() => router.navigate("/courses/exams")} style={[styles.row, { minHeight: 48 }]}>
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
