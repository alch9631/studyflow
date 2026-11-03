import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import type { CalendarData } from "../../../../shared/mobileWorkspace";
import { AppText, IconButton, useTheme } from "../../src/ui";
import { GlassSurface } from "../../src/glass-surface";
import { chooseSession, dateLabel, edit, LinkButton, Page, timeLabel, useMobileData } from "../../src/workspace";
import { ContentRow } from "../../src/content-row";
import { SwipeRow } from "../../src/swipe-row";
import { compactSessionLabel } from "../../src/session-label";
import { useSession } from "../../src/session";
import { clearDraft, draftKey } from "../../src/drafts";

export default function Calendar() {
  const theme = useTheme();
  const { session } = useSession();
  const [week, setWeek] = useState("");
  const [selected, setSelected] = useState("");
  const query = useMobileData<CalendarData>(`calendar${week ? `?week=${week}` : ""}`);
  const d = query.data;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [unplaced, setUnplaced] = useState(0);
  const day = selected && d?.days.includes(selected) ? selected : d?.days.includes(d.today) ? d.today : d?.days[0];
  const sessions = d?.blocks.filter(block => block.date === day) ?? [];
  const unscheduled = sessions.filter(block => !block.completed && block.start === null).length;
  const lectures = d?.lectures.filter(lecture => lecture.weekday === new Date(`${day}T12:00:00Z`).getUTCDay()) ?? [];
  const exams = d?.exams.filter(exam => exam.date === day) ?? [];
  function resetNotice() { setNotice(""); setUnplaced(0); }
  function shift(delta: number) {
    if (!d) return;
    resetNotice(); setSelected("");
    setWeek(new Date(Date.parse(d.days[0]) + delta * 7 * 86400_000).toISOString().slice(0, 10));
  }
  function changeTime(block: CalendarData["blocks"][number]) {
    edit("updateBlockTime", { blockId: block.id, date: block.date, startHHmm: timeLabel(block.start ?? 540), endHHmm: timeLabel(block.end ?? Math.min(1439, (block.start ?? 540) + block.minutes)) });
  }
  async function clearTime(blockId: string) {
    if (busy) return;
    setBusy(true); query.setError(null);
    try { await query.action("updateBlockTime", { blockId, clear: "1" }); await query.reload(); }
    catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  async function toggleBlock(block: CalendarData["blocks"][number]) {
    if (busy) return;
    setBusy(true); query.setError(null);
    try {
      await query.action("toggleBlock", { blockId: block.id, done: block.completed ? "false" : "true" });
      if (!block.completed && block.kind === "study" && session) await clearDraft(draftKey(session.server, session.userId, block.topicId));
      await query.reload();
    } catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  async function arrange() {
    if (!d || !day || busy || !unscheduled) return;
    setBusy(true); query.setError(null); resetNotice();
    try {
      const result = await query.action<{ placed: number; unplaced: number; rateLimited?: boolean }>("autoSchedule", { weekStart: d.days[0], day });
      if (result.rateLimited) throw new Error("Too many changes. Wait a moment, then try again.");
      setUnplaced(result.unplaced);
      setNotice(result.unplaced ? `${result.placed} scheduled · ${result.unplaced} need more time` : `${result.placed} scheduled`);
      await query.reload();
    } catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Page tabPage title="Calendar" query={query} actions={<IconButton glass label="Class timetable" icon="calendar-outline" onPress={() => router.push("/timetable")} />}>
    {d ? <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconButton glass label="Previous week" icon="chevron-back-outline" onPress={() => shift(-1)} />
        <View style={{ flex: 1, alignItems: "center" }}><AppText size={14} weight="600">{dateLabel(d.days[0])} – {dateLabel(d.days[6])}</AppText></View>
        <IconButton glass label="Next week" icon="chevron-forward-outline" onPress={() => shift(1)} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {d.days.map(iso => {
          const date = new Date(`${iso}T12:00:00Z`);
          const active = iso === day;
          return <Pressable key={iso} accessibilityRole="button" accessibilityLabel={dateLabel(iso)} accessibilityState={{ selected: active }}
            onPress={() => { setSelected(iso); resetNotice(); }}>
            <GlassSurface interactive solid={active} style={{ minWidth: 48, minHeight: 64, alignItems: "center", justifyContent: "center", gap: 3, padding: 8, borderRadius: 12, ...(active ? { backgroundColor: theme.accent } : {}) }}>
              <AppText size={12} style={{ color: active ? theme.onAccent : theme.muted }}>{date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })}</AppText>
              <AppText size={17} weight="700" style={{ color: active ? theme.onAccent : theme.text }}>{date.getUTCDate()}</AppText>
            </GlassSurface>
          </Pressable>;
        })}
      </ScrollView>
      {week ? <LinkButton label="Today" onPress={() => { setWeek(""); setSelected(""); resetNotice(); }} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}><AppText size={18} weight="700">{day ? dateLabel(day) : "Agenda"}</AppText>{unscheduled ? <AppText size={13} muted>{unscheduled} to schedule</AppText> : null}</View>
        <IconButton label="Arrange selected day" icon="sparkles-outline" busy={busy} disabled={!unscheduled} onPress={() => { void arrange(); }} />
      </View>
      {notice ? <AppText size={14} muted>{notice}</AppText> : null}
      {unplaced ? <LinkButton label="Change study window" onPress={() => router.push("/settings")} /> : null}
      <View>
        {exams.map(exam => <ContentRow key={exam.id} title={exam.name} subtitle="Exam" icon="school-outline" onPress={() => router.push("/exams")} />)}
        {lectures.map(lecture => <View key={lecture.id} style={{ paddingVertical: 14, gap: 3, borderBottomWidth: 1, borderBottomColor: theme.line }}>
          <AppText weight="600">{lecture.title}</AppText><AppText size={13} muted>{timeLabel(lecture.startMin)}–{timeLabel(lecture.endMin)}{lecture.location ? ` · ${lecture.location}` : ""}</AppText>
        </View>)}
        {sessions.map(block => {
          const label = compactSessionLabel(block.topicTitle, block.kind);
          const time = block.start !== null ? timeLabel(block.start) : `${block.minutes}m`;
          return <SwipeRow key={block.id} disabled={busy}
            leading={{ label: block.completed ? "Mark undone" : "Mark done", icon: block.completed ? "arrow-undo-outline" : "checkmark-outline", onPress: () => { void toggleBlock(block); } }}
            trailing={!block.completed ? block.start !== null
              ? { label: "Remove time", icon: "time-outline", onPress: () => { void clearTime(block.id); } }
              : { label: "Schedule", icon: "calendar-outline", onPress: () => changeTime(block) } : undefined}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, borderBottomWidth: 1, borderBottomColor: theme.line }}>
              <IconButton label={`${block.completed ? "Mark undone" : "Mark done"}: ${label.title}`} icon={block.completed ? "checkmark-circle" : "ellipse-outline"} disabled={busy} onPress={() => { void toggleBlock(block); }} />
              <Pressable accessibilityRole="button" accessibilityLabel={`${block.topicTitle}, ${block.course.name}, ${block.minutes} minutes${block.start !== null ? `, ${time}` : ""}${block.completed ? ", complete" : ""}`} disabled={busy || block.completed} onPress={() => chooseSession(block)}
                style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 72, justifyContent: "center", gap: 3, paddingVertical: 12, opacity: block.completed ? 0.55 : pressed ? 0.6 : 1 })}>
                <AppText selectable={false} numberOfLines={2} weight="600">{label.title}</AppText>
                {!block.completed && <AppText selectable={false} numberOfLines={1} size={12} muted>{[label.activity, block.course.name].filter(Boolean).join(" · ")}</AppText>}
              </Pressable>
              {!block.completed && <><AppText selectable={false} size={12} muted>{time}</AppText><IconButton label={`Change time: ${label.title}`} icon="calendar-outline" disabled={busy} onPress={() => changeTime(block)} /></>}
            </View>
          </SwipeRow>;
        })}
      </View>
      {!sessions.length && !exams.length && !lectures.length ? <AppText muted>Nothing planned.</AppText> : null}
    </> : null}
  </Page>;
}
