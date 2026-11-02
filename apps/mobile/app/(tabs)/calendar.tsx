import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import type { CalendarData } from "../../../../shared/mobileWorkspace";
import { AppText, IconButton, useTheme } from "../../src/ui";
import { chooseSession, dateLabel, edit, LinkButton, minutesLabel, Page, timeLabel, useMobileData } from "../../src/workspace";
import { ActionMenu } from "../../src/action-menu";
import { ContentRow } from "../../src/content-row";
import { SwipeRow } from "../../src/swipe-row";

export default function Calendar() {
  const theme = useTheme();
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
  async function arrange() {
    if (!d || !day || busy || !unscheduled) return;
    setBusy(true); query.setError(null); resetNotice();
    try {
      const result = await query.action<{ placed: number; unplaced: number; rateLimited?: boolean }>("autoSchedule", { weekStart: d.days[0], day });
      if (result.rateLimited) throw new Error("Too many changes. Wait a moment, then try again.");
      setUnplaced(result.unplaced);
      setNotice(result.unplaced ? `${result.placed} placed · ${result.unplaced} need a longer study window or another day.` : `${result.placed} sessions placed.`);
      await query.reload();
    } catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Page title="Calendar" query={query} actions={<ActionMenu label="Calendar options" items={[
    { id: "timetable", title: "Class timetable", image: "calendar", onPress: () => router.push("/timetable") },
    { id: "window", title: "Study window & budget", image: "clock", onPress: () => router.push("/settings") },
  ]} />}>
    {d ? <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconButton label="Previous week" icon="chevron-back-outline" onPress={() => shift(-1)} />
        <View style={{ flex: 1, alignItems: "center" }}><AppText size={14} weight="600">{dateLabel(d.days[0])} – {dateLabel(d.days[6])}</AppText></View>
        <IconButton label="Next week" icon="chevron-forward-outline" onPress={() => shift(1)} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {d.days.map(iso => {
          const date = new Date(`${iso}T12:00:00Z`);
          const active = iso === day;
          return <Pressable key={iso} accessibilityRole="button" accessibilityLabel={dateLabel(iso)} accessibilityState={{ selected: active }}
            onPress={() => { setSelected(iso); resetNotice(); }} style={{ minWidth: 48, minHeight: 64, alignItems: "center", justifyContent: "center", gap: 3, padding: 8, borderRadius: 12, backgroundColor: active ? theme.brand : theme.tint }}>
            <AppText size={12} style={{ color: active ? theme.background : theme.muted }}>{date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })}</AppText>
            <AppText size={17} weight="700" style={{ color: active ? theme.background : theme.text }}>{date.getUTCDate()}</AppText>
          </Pressable>;
        })}
      </ScrollView>
      {week ? <LinkButton label="Back to today" onPress={() => { setWeek(""); setSelected(""); resetNotice(); }} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}><AppText size={18} weight="700">{day ? dateLabel(day) : "Agenda"}</AppText>{unscheduled ? <AppText size={13} muted>{unscheduled} without a time</AppText> : null}</View>
        <IconButton label="Arrange selected day" icon="sparkles-outline" busy={busy} disabled={!unscheduled} onPress={() => { void arrange(); }} />
      </View>
      {notice ? <AppText size={14} muted>{notice}</AppText> : null}
      {unplaced ? <LinkButton label="Change study window" onPress={() => router.push("/settings")} /> : null}
      <View>
        {exams.map(exam => <ContentRow key={exam.id} title={exam.name} subtitle="Exam" icon="school-outline" onPress={() => router.push("/exams")} />)}
        {lectures.map(lecture => <View key={lecture.id} style={{ paddingVertical: 14, gap: 3, borderBottomWidth: 1, borderBottomColor: theme.line }}>
          <AppText weight="600">{lecture.title}</AppText><AppText size={13} muted>{timeLabel(lecture.startMin)}–{timeLabel(lecture.endMin)}{lecture.location ? ` · ${lecture.location}` : ""}</AppText>
        </View>)}
        {sessions.map(block => <SwipeRow key={block.id} disabled={busy || block.completed} trailing={!block.completed ? { label: "Reschedule", icon: "calendar-outline", onPress: () => changeTime(block) } : undefined}>
          <ContentRow title={block.topicTitle} subtitle={`${block.course.name} · ${minutesLabel(block.minutes)} · ${block.start !== null && block.end !== null ? `${timeLabel(block.start)}–${timeLabel(block.end)}` : "No time assigned"}`}
            icon={block.completed ? "checkmark-circle" : "ellipse-outline"} dimmed={block.completed} disabled={busy}
            onPress={() => block.completed ? router.push({ pathname: "/focus/[id]", params: { id: block.id, topicId: block.topicId, kind: block.kind } }) : chooseSession(block)}
            trailing={!block.completed ? <ActionMenu label={`Session actions: ${block.topicTitle}`} disabled={busy} items={[
              { id: "reschedule", title: "Change day or time", image: "calendar", onPress: () => changeTime(block) },
              ...(block.start !== null ? [{ id: "clear", title: "Remove assigned time", image: "clock" as const, onPress: () => { void clearTime(block.id); } }] : []),
            ]} /> : undefined} />
        </SwipeRow>)}
      </View>
      {!sessions.length && !exams.length && !lectures.length ? <AppText muted>Nothing planned for this day.</AppText> : null}
    </> : null}
  </Page>;
}
