import { View } from "react-native";
import { router } from "expo-router";
import type { InsightsData } from "../../../shared/mobileWorkspace";
import { AppText, Card, useTheme } from "../src/ui";
import { dateLabel, LinkButton, minutesLabel, Page, ProgressBar, useMobileData } from "../src/workspace";

export default function Insights() {
  const query = useMobileData<InsightsData>("insights"); const theme = useTheme(); const d = query.data;
  const max = Math.max(1, ...(d?.dailyLoad.map(v => v.min) ?? []));
  return <Page back title="Progress" subtitle="The same study history, grades and learning evidence as your web planner." query={query}>
    {d && <>
      <View style={{ flexDirection: "row", gap: 12 }}><Card style={{ flex: 1 }}><AppText size={28} weight="800">{minutesLabel(d.loggedMinutes)}</AppText><AppText size={13} muted>Focus time logged</AppText></Card><Card style={{ flex: 1 }}><AppText size={28} weight="800">{d.grades.gpa?.toFixed(2) ?? "—"}</AppText><AppText size={13} muted>Weighted grade average</AppText></Card></View>
      <Card><AppText size={19} weight="700">This week</AppText><ProgressBar value={d.weekPct} label={`${minutesLabel(d.weekDone)} of ${minutesLabel(d.weekPlanned)} completed`} />
        <View style={{ flexDirection: "row", alignItems: "flex-end", height: 145, gap: 10 }}>{d.dailyLoad.map(v => <View key={v.key} style={{ flex: 1, gap: 5, alignItems: "center" }}><AppText size={10} muted>{v.min ? `${v.min}m` : ""}</AppText><View accessibilityLabel={`${dateLabel(v.key)}: ${v.min} minutes`} style={{ width: "85%", height: Math.max(4, v.min / max * 100), borderRadius: 5, backgroundColor: v.min ? theme.brand : theme.line }} /><AppText size={11} muted>{v.label}</AppText></View>)}</View>
      </Card>
      <Card><AppText size={19} weight="700">Study history</AppText><AppText muted>{d.currentStreak} active days in a row · {d.activeDays} active days over the last 14</AppText>
        <View style={{ flexDirection: "row", gap: 4 }}>{Array.from({ length: 12 }, (_, week) => <View key={week} style={{ flex: 1, gap: 4 }}>{d.heatmap.slice(week * 7, week * 7 + 7).map(day => <View key={day.date} accessibilityLabel={`${dateLabel(day.date)}: ${day.min} minutes${day.examWeek ? ", exam week" : ""}`} style={{ height: 15, borderRadius: 3, backgroundColor: day.min ? theme.brand : theme.line, opacity: day.future ? 0.25 : day.min ? Math.min(1, 0.3 + day.min / 180) : 0.6 }} />)}</View>)}</View>
      </Card>
      <Card><AppText size={19} weight="700">Learning evidence</AppText><AppText>{d.evidence.goalsMet} goals met · {d.evidence.practiceNeeded} need practice</AppText><AppText muted>{d.evidence.attempts} checked attempts · {d.evidence.laterRecall} recalled successfully on a later day</AppText><AppText size={12} muted>Session completion and topic coverage do not imply an exam grade.</AppText></Card>
      <Card><AppText size={19} weight="700">Modules & credits</AppText><AppText>{d.courses.filter(c => c.passed || c.grade !== null && c.grade <= 4).length} modules passed · {d.grades.lpEarned} ECTS earned</AppText><AppText muted>{minutesLabel(d.upcomingWorkload)} planned over the next seven days</AppText></Card>
      {d.courses.map(c => <Card key={c.id}><AppText size={18} weight="700">{c.name}</AppText><ProgressBar value={c.progressPct} label={`${c.topicsDone} of ${c.topicsTotal} topics covered`} /><AppText size={14} muted>{minutesLabel(c.actualMinutes)} logged · {minutesLabel(c.remainingStudyMinutes)} study remaining</AppText><AppText size={14} muted>{c.grade !== null ? `Grade ${c.grade.toFixed(1)} · ` : ""}Exam {dateLabel(c.examDate)}</AppText><LinkButton label="Open course progress" onPress={() => router.push(`/course/${c.id}`)} /></Card>)}
      {!d.hasData && <AppText muted>Add a course to start building your study history.</AppText>}
    </>}
  </Page>;
}
