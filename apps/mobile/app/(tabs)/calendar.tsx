import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { CalendarData } from "../../../../shared/mobileWorkspace";
import { Action, AppText, Card, IconButton, useTheme } from "../../src/ui";
import { chooseSession, dateLabel, edit, LinkButton, Page, timeLabel, useMobileData } from "../../src/workspace";
import { ContentRow } from "../../src/content-row";
import { SwipeRow, useCloseSwipeRow } from "../../src/swipe-row";
import { compactSessionLabel } from "../../src/session-label";
import { useSession } from "../../src/session";
import { clearDraft, draftKey } from "../../src/drafts";

type StudyBlock = CalendarData["blocks"][number];
type Arrangement = { day: string; placed: number; unplaced: number };
const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
const agendaDate = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

export default function Calendar() {
  const theme = useTheme();
  const { session } = useSession();
  const closeSwipeRow = useCloseSwipeRow();
  const [week, setWeek] = useState("");
  const [selected, setSelected] = useState("");
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [busy, setBusy] = useState<"arrange" | "update" | null>(null);
  const [arrangement, setArrangement] = useState<Arrangement | null>(null);
  const query = useMobileData<CalendarData>(`calendar${week ? `?week=${week}` : ""}`);
  const data = query.data;
  const days = data?.days.map(iso => {
    const date = new Date(`${iso}T12:00:00Z`);
    return {
      iso, date,
      blocks: data.blocks.filter(block => block.date === iso),
      lectures: data.lectures.filter(lecture => lecture.weekday === date.getUTCDay()),
      exams: data.exams.filter(exam => exam.date === iso),
    };
  }) ?? [];
  const day = days.find(item => item.iso === (selected || data?.today)) ?? days[0];
  const unscheduled = day?.blocks.filter(block => !block.completed && block.start === null) ?? [];
  const timedEvents = [
    ...(day?.lectures ?? []).map(lecture => ({ kind: "class" as const, start: lecture.startMin, lecture })),
    ...(day?.blocks ?? []).flatMap(block => block.start === null ? [] : [{ kind: "study" as const, start: block.start, block }]),
  ].sort((first, second) => first.start - second.start);
  const result = arrangement?.day === day?.iso ? arrangement : null;

  function selectDate(iso: string) {
    closeSwipeRow();
    setSelected(iso);
    setShowUnscheduled(false);
    setArrangement(null);
  }

  function shiftWeek(delta: number) {
    if (!data) return;
    selectDate("");
    setWeek(new Date(Date.parse(data.days[0]) + delta * 7 * 86400_000).toISOString().slice(0, 10));
  }

  function jumpToToday() {
    selectDate("");
    setWeek("");
  }

  function changeTime(block: StudyBlock) {
    closeSwipeRow();
    const start = block.start ?? 540;
    edit("updateBlockTime", {
      blockId: block.id,
      date: block.date,
      startHHmm: timeLabel(start),
      endHHmm: timeLabel(block.end ?? Math.min(1439, start + block.minutes)),
    });
  }

  async function clearTime(blockId: string) {
    if (busy) return;
    setBusy("update");
    query.setError(null);
    try {
      await query.action("updateBlockTime", { blockId, clear: "1" });
      await query.reload();
    } catch (error) {
      query.setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleBlock(block: StudyBlock) {
    if (busy) return;
    setBusy("update");
    query.setError(null);
    try {
      await query.action("toggleBlock", { blockId: block.id, done: block.completed ? "false" : "true" });
      if (!block.completed && block.kind === "study" && session) await clearDraft(draftKey(session.server, session.userId, block.topicId));
      await query.reload();
    } catch (error) {
      query.setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function arrange() {
    if (!data || !day || busy || !unscheduled.length) return;
    closeSwipeRow();
    setBusy("arrange");
    setArrangement(null);
    query.setError(null);
    try {
      const { placed, unplaced, rateLimited } = await query.action<{ placed: number; unplaced: number; rateLimited?: boolean }>(
        "autoSchedule", { weekStart: data.days[0], day: day.iso },
      );
      if (rateLimited) throw new Error("Too many changes. Wait a moment, then try again.");
      setArrangement({ day: day.iso, placed, unplaced });
      await query.reload();
    } catch (error) {
      query.setError((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const awayFromToday = !!week || (day && day.iso !== data?.today);
  return <Page tabPage title="Calendar" query={query}
    actions={awayFromToday ? <IconButton glass label="Jump to today" icon="today-outline" onPress={jumpToToday} /> : undefined}>
    {data && day && <>
      <View style={calendarStyles.week}>
        <View style={calendarStyles.weekHeader}>
          <IconButton glass label="Previous week" icon="chevron-back-outline" onPress={() => shiftWeek(-1)} />
          <AppText size={15} weight="600" style={calendarStyles.weekRange}>
            {shortDate.format(days[0].date)} – {shortDate.format(days[days.length - 1].date)}
          </AppText>
          <IconButton glass label="Next week" icon="chevron-forward-outline" onPress={() => shiftWeek(1)} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={calendarStyles.strip} contentContainerStyle={calendarStyles.stripContent}>
          {days.map(({ iso, date, lectures, exams, blocks }) => {
            const active = iso === day.iso;
            const isToday = iso === data.today;
            const hasEvents = lectures.length > 0 || exams.length > 0 || blocks.some(block => block.start !== null);
            return <Pressable key={iso} accessibilityRole="button" accessibilityState={{ selected: active }}
              accessibilityLabel={`${dateLabel(iso)}${isToday ? ", today" : ""}${hasEvents ? ", events scheduled" : ""}`}
              onPress={() => selectDate(iso)}
              style={({ pressed }) => [calendarStyles.day, {
                backgroundColor: active ? theme.accent : pressed ? theme.tint : "transparent",
                borderColor: isToday && !active ? theme.brand : "transparent",
              }]}>
              <AppText selectable={false} size={12} style={{ color: active ? theme.onAccent : theme.muted }}>{weekday.format(date)}</AppText>
              <AppText selectable={false} size={18} weight="700" style={{ color: active ? theme.onAccent : theme.text }}>{date.getUTCDate()}</AppText>
              <View style={[calendarStyles.eventDot, { backgroundColor: hasEvents ? active ? theme.onAccent : theme.brand : "transparent" }]} />
            </Pressable>;
          })}
        </ScrollView>
      </View>

      <View style={calendarStyles.agenda}>
        <AppText size={22} weight="700">{day.iso === data.today ? `Today, ${shortDate.format(day.date)}` : agendaDate.format(day.date)}</AppText>
        <View>
          {day.exams.map(exam => <ContentRow key={exam.id} title={exam.name} subtitle="Exam" icon="school-outline" onPress={() => router.navigate("/courses/exams")} />)}
          {timedEvents.map(event => {
            if (event.kind === "study") {
              return <ScheduledStudy key={`study:${event.block.id}`} block={event.block} start={event.start} busy={!!busy}
                onToggle={() => { void toggleBlock(event.block); }} onEditTime={() => changeTime(event.block)}
                onClearTime={() => { void clearTime(event.block.id); }} />;
            }
            const { lecture, start } = event;
            const subtitle = lecture.location ? `Class · ${lecture.location}` : "Class";
            return <View key={`class:${lecture.id}`} accessible
              accessibilityLabel={`${timeLabel(start)} to ${timeLabel(lecture.endMin)}, ${lecture.title}, ${subtitle}`}
              style={[calendarStyles.event, { borderBottomColor: theme.line }]}>
              <View style={calendarStyles.time}><EventTime start={start} end={lecture.endMin} /></View>
              <View style={[calendarStyles.eventMarker, { backgroundColor: theme.muted }]} />
              <View style={calendarStyles.eventContent}>
                <AppText weight="600">{lecture.title}</AppText>
                <AppText size={13} muted>{subtitle}</AppText>
              </View>
            </View>;
          })}
          {!day.exams.length && !timedEvents.length && <AppText muted>No events scheduled.</AppText>}
        </View>
      </View>

      {unscheduled.length > 0 && <Card style={calendarStyles.planning}>
        <View style={calendarStyles.planningHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Unscheduled study, ${unscheduled.length} ${unscheduled.length === 1 ? "session" : "sessions"}`}
            accessibilityState={{ expanded: showUnscheduled }} onPress={() => setShowUnscheduled(value => !value)}
            style={({ pressed }) => [calendarStyles.planningToggle, { opacity: pressed ? 0.65 : 1 }]}>
            <View style={calendarStyles.planningTitle}>
              <AppText selectable={false} weight="600">Unscheduled study</AppText>
              <AppText selectable={false} size={13} muted>{unscheduled.length} {unscheduled.length === 1 ? "session" : "sessions"}</AppText>
            </View>
            <Ionicons name={showUnscheduled ? "chevron-up" : "chevron-down"} size={17} color={theme.muted} />
          </Pressable>
          <Action secondary disabled={busy === "update"} busy={busy === "arrange"} onPress={() => { void arrange(); }}>Arrange</Action>
        </View>
        {showUnscheduled && unscheduled.map(block => <ContentRow key={block.id}
          title={compactSessionLabel(block.topicTitle, block.kind).title} subtitle={block.course.name}
          icon="time-outline" disabled={!!busy} onPress={() => changeTime(block)} />)}
      </Card>}
      {result && <View>
        <AppText size={14} muted>{result.placed} scheduled{result.unplaced ? ` · ${result.unplaced} need more time` : ""}</AppText>
        {result.unplaced > 0 && <LinkButton label="Change study window" onPress={() => router.push("/settings")} />}
      </View>}
    </>}
  </Page>;
}

function EventTime({ start, end }: { start: number; end: number | null }) {
  return <>
    <AppText selectable={false} weight="600" size={14} style={calendarStyles.timeText}>{timeLabel(start)}</AppText>
    {end !== null && <AppText selectable={false} size={12} muted style={calendarStyles.timeText}>{timeLabel(end)}</AppText>}
  </>;
}

function ScheduledStudy({ block, start, busy, onToggle, onEditTime, onClearTime }: {
  block: StudyBlock; start: number; busy: boolean; onToggle: () => void; onEditTime: () => void; onClearTime: () => void;
}) {
  const theme = useTheme();
  const { title, activity } = compactSessionLabel(block.topicTitle, block.kind);
  const status = block.completed ? "Mark undone" : "Mark done";
  const time = `${timeLabel(start)}${block.end !== null ? ` to ${timeLabel(block.end)}` : ""}`;
  return <SwipeRow disabled={busy}
    leading={{ label: status, icon: block.completed ? "arrow-undo-outline" : "checkmark-outline", onPress: onToggle }}
    trailing={block.completed ? undefined : { label: "Remove time", icon: "time-outline", onPress: onClearTime }}>
    <View style={[calendarStyles.event, { borderBottomColor: theme.line }]}>
      {block.completed ? <View style={calendarStyles.time}><EventTime start={start} end={block.end} /></View> :
        <Pressable accessibilityRole="button" accessibilityLabel={`Change time for ${title}, ${time}`}
          accessibilityActions={[{ name: "removeTime", label: "Remove time" }]}
          onAccessibilityAction={({ nativeEvent }) => { if (nativeEvent.actionName === "removeTime") onClearTime(); }}
          disabled={busy} onPress={onEditTime} style={calendarStyles.time}>
          <EventTime start={start} end={block.end} />
        </Pressable>}
      <View style={[calendarStyles.eventMarker, { backgroundColor: block.completed ? theme.line : theme.brand }]} />
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${block.course.name}, ${time}${block.completed ? ", complete" : ""}`}
        accessibilityHint={block.completed ? undefined : "Opens session length. Hold to edit the time."}
        disabled={busy || block.completed} onPress={() => chooseSession(block)} onLongPress={onEditTime}
        style={({ pressed }) => [calendarStyles.eventContent, { opacity: pressed ? 0.65 : 1 }]}>
        <AppText selectable={false} weight="600" muted={block.completed}>{title}</AppText>
        <AppText selectable={false} size={13} muted>{activity || "Study"} · {block.course.name}</AppText>
      </Pressable>
      <View style={calendarStyles.eventAction}>
        <IconButton label={`${status}: ${title}`} icon={block.completed ? "checkmark-circle" : "ellipse-outline"} disabled={busy} onPress={onToggle} />
      </View>
    </View>
  </SwipeRow>;
}

const calendarStyles = StyleSheet.create({
  week: { gap: 12 },
  weekHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  weekRange: { flex: 1, textAlign: "center" },
  strip: { flexGrow: 0 },
  stripContent: { flexGrow: 1, gap: 4 },
  day: { flexGrow: 1, minWidth: 44, minHeight: 70, paddingHorizontal: 3, paddingVertical: 6, alignItems: "center", justifyContent: "center", gap: 2, borderWidth: StyleSheet.hairlineWidth, borderRadius: 15, borderCurve: "continuous" },
  eventDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  agenda: { gap: 10 },
  event: { flexDirection: "row", alignItems: "stretch", gap: 10, minHeight: 68, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  time: { minWidth: 46, minHeight: 44, justifyContent: "center", alignItems: "flex-start" },
  timeText: { fontVariant: ["tabular-nums"] },
  eventMarker: { width: 2, borderRadius: 1, marginVertical: 5 },
  eventContent: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: "center", gap: 2 },
  eventAction: { justifyContent: "center" },
  planning: { padding: 14 },
  planningHeader: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 14 },
  planningToggle: { flex: 1, flexDirection: "row", alignItems: "center", minHeight: 48, minWidth: 120, gap: 6 },
  planningTitle: { flex: 1 },
});
