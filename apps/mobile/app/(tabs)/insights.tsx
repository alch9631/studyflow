import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { InsightsData } from "../../../../shared/mobileWorkspace";
import { AppText, Card, useTheme } from "../../src/ui";
import { dateLabel, minutesLabel, Page, ProgressBar, useMobileData } from "../../src/workspace";
import { Disclosure } from "../../src/disclosure";
import { SectionTabs } from "../../src/section-tabs";

const ranges = [{ label: "Last 7 days", value: "days" }, { label: "Last 4 weeks", value: "weeks" }];
const shortDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });

export default function Insights() {
  const query = useMobileData<InsightsData>("insights");
  const theme = useTheme();
  const data = query.data;
  return <Page tabPage title="Insights" query={query}>
    {data && <>
      <StudyActivity data={data} />
      <Card style={insightStyles.plan}>
        <AppText size={18} weight="700">This week’s plan</AppText>
        {data.weekPlanned > 0
          ? <ProgressBar value={data.weekPct} label={`${minutesLabel(data.weekDone)} of ${minutesLabel(data.weekPlanned)} completed`} />
          : <AppText size={14} muted>No study scheduled this week.</AppText>}
      </Card>
      <View>
        <Disclosure label="Study history">
          <AppText muted>{data.currentStreak} {data.currentStreak === 1 ? "day" : "days"} in a row · {data.activeDays} of the last 14 days active</AppText>
          <View style={insightStyles.heatmap}>
            {Array.from({ length: Math.ceil(data.heatmap.length / 7) }, (_, week) =>
              <View key={week} style={insightStyles.heatmapWeek}>
                {data.heatmap.slice(week * 7, week * 7 + 7).map(day => <View key={day.date} accessible
                  accessibilityLabel={`${dateLabel(day.date)}: ${day.min} minutes${day.examWeek ? ", exam week" : ""}`}
                  style={[insightStyles.heatmapDay, {
                    backgroundColor: day.min ? theme.brand : theme.line,
                    opacity: day.future ? 0.25 : day.min ? Math.min(1, 0.3 + day.min / 180) : 0.6,
                  }]} />)}
              </View>,
            )}
          </View>
        </Disclosure>
        <Disclosure label="Learning evidence">
          {data.evidence.attempts > 0 ? <>
            <AppText>{data.evidence.goalsMet} goals met · {data.evidence.practiceNeeded} need practice</AppText>
            <AppText muted>{data.evidence.attempts} checked attempts · {data.evidence.laterRecall} recalled successfully on a later day</AppText>
          </> : <AppText muted>No checked attempts yet.</AppText>}
        </Disclosure>
        <Disclosure label="Study totals">
          <AppText>{minutesLabel(data.loggedMinutes)} focus time logged · {minutesLabel(data.upcomingWorkload)} planned over the next seven days</AppText>
          <AppText muted>{data.courses.filter(course => course.passed || (course.grade !== null && course.grade <= 4)).length} modules passed · {data.grades.lpEarned} ECTS earned</AppText>
          {data.grades.gpa !== null && <AppText muted>Weighted grade average {data.grades.gpa.toFixed(2)}</AppText>}
        </Disclosure>
      </View>
    </>}
  </Page>;
}

function StudyActivity({ data }: { data: InsightsData }) {
  const theme = useTheme();
  const [range, setRange] = useState("days");
  const [selected, setSelected] = useState<string | null>(null);
  const weekly = range === "weeks";
  const bucketSize = weekly ? 7 : 1;
  const days = data.heatmap.filter(day => !day.future).slice(weekly ? -28 : -7);
  const buckets = [];
  for (let offset = 0; offset < days.length; offset += bucketSize) {
    const group = days.slice(offset, offset + bucketSize);
    const first = group[0].date;
    const last = group[group.length - 1].date;
    const date = new Date(`${first}T12:00:00Z`);
    const end = new Date(`${last}T12:00:00Z`);
    buckets.push({
      id: first,
      label: weekly ? shortDate.format(date) : weekday.format(date),
      dateRange: first === last ? dateLabel(first) : `${shortDate.format(date)} – ${shortDate.format(end)}`,
      minutes: group.reduce((sum, day) => sum + day.min, 0),
    });
  }
  const minutes = buckets.reduce((sum, bucket) => sum + bucket.minutes, 0);
  const peak = Math.max(1, ...buckets.map(bucket => bucket.minutes));
  const detail = buckets.find(bucket => bucket.id === selected);
  const firstDate = days[0]?.date;
  const period = firstDate
    ? `${shortDate.format(new Date(`${firstDate}T12:00:00Z`))} – ${shortDate.format(new Date(`${days[days.length - 1].date}T12:00:00Z`))}`
    : "";

  return <Card style={insightStyles.activity}>
    <SectionTabs options={ranges} value={range} onChange={value => { setRange(value); setSelected(null); }} />
    <View>
      <AppText size={14} muted>Planned study completed</AppText>
      <AppText size={36} weight="700" style={insightStyles.activityTotal}>{minutesLabel(minutes)}</AppText>
    </View>
    {buckets.length > 0 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={insightStyles.chart} contentContainerStyle={insightStyles.columns}>
      {buckets.map(bucket => {
        const active = detail?.id === bucket.id;
        return <Pressable key={bucket.id} accessibilityRole="button" accessibilityState={{ selected: active }}
          accessibilityLabel={`${bucket.dateRange}, ${bucket.minutes} minutes completed`}
          onPress={() => setSelected(bucket.id)}
          style={({ pressed }) => [insightStyles.column, { backgroundColor: active || pressed ? theme.tint : "transparent" }]}>
          <View style={insightStyles.barTrack}>
            <View style={[insightStyles.bar, {
              width: weekly ? 40 : 24,
              height: bucket.minutes > 0 ? Math.max(4, bucket.minutes / peak * 100) : 3,
              backgroundColor: bucket.minutes > 0 ? theme.brand : theme.line,
              opacity: detail && !active && bucket.minutes > 0 ? 0.5 : 1,
            }]} />
          </View>
          <AppText selectable={false} size={12} weight={active ? "700" : "400"} muted={!active} style={insightStyles.columnLabel}>{bucket.label}</AppText>
        </Pressable>;
      })}
    </ScrollView>}
    <View style={[insightStyles.chartCaption, { borderTopColor: theme.line }]}>
      <AppText size={13} muted style={insightStyles.captionDate}>{detail?.dateRange ?? (minutes ? period : "No completed study in this period.")}</AppText>
      {detail && <AppText size={13} weight="600">{minutesLabel(detail.minutes)}</AppText>}
    </View>
  </Card>;
}

const insightStyles = StyleSheet.create({
  activity: { padding: 16, gap: 16, borderRadius: 22 },
  activityTotal: { lineHeight: 44, letterSpacing: -1, fontVariant: ["tabular-nums"] },
  chart: { flexGrow: 0 },
  columns: { flexGrow: 1, gap: 2 },
  column: { flex: 1, minWidth: 44, alignItems: "center", gap: 6, paddingHorizontal: 2, paddingVertical: 4, borderRadius: 9 },
  barTrack: { height: 100, justifyContent: "flex-end" },
  bar: { borderRadius: 4 },
  columnLabel: { textAlign: "center" },
  chartCaption: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  captionDate: { flex: 1 },
  plan: { gap: 10 },
  heatmap: { flexDirection: "row", gap: 4 },
  heatmapWeek: { flex: 1, gap: 4 },
  heatmapDay: { height: 15, borderRadius: 3 },
});
