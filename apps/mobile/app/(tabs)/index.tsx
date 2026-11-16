import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { nextStudyBlock, type MobileToday } from "../../../../shared/mobile";
import { Action, AppText, Card, useTheme } from "../../src/ui";
import { chooseSession, Page, ProgressBar, useMobileData } from "../../src/workspace";
import { compactSessionLabel } from "../../src/session-label";

export default function Home() {
  const theme = useTheme();
  const query = useMobileData<MobileToday>("today");
  const today = query.data;
  const next = today && nextStudyBlock(today);
  const { completedCount, totalCount } = today?.summary ?? { completedCount: 0, totalCount: 0 };
  const date = today ? new Date(`${today.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }) : undefined;

  return <Page tabPage title="Home" subtitle={date} query={query} contentStyle={homeStyles.page}>
    {today && <View style={homeStyles.body}>
      <View style={homeStyles.hero}>
        <AppText size={42} weight="600" style={homeStyles.headline}>One small step is enough.</AppText>
        <Card style={homeStyles.session}>
          {next ? <>
            <View style={homeStyles.sessionHeading}>
              <AppText size={14} weight="600" style={{ color: theme.brand }}>{next.progress ? "Paused session" : "Up next"}</AppText>
              <View style={homeStyles.sessionTitle}>
                <AppText size={26} weight="600" style={homeStyles.topic}>{compactSessionLabel(next.title, next.kind).title}</AppText>
                <AppText size={15} muted>{next.course.name}</AppText>
              </View>
            </View>
            <Action onPress={() => chooseSession(next)}>{next.progress ? "Resume focus" : "Start work"}</Action>
          </> : <>
            <AppText size={26} weight="600" style={homeStyles.topic}>{totalCount ? "Today’s sessions are complete." : "Nothing scheduled today."}</AppText>
            <Action secondary onPress={() => router.navigate("/courses")}>Choose a course</Action>
          </>}
        </Card>
      </View>
      {totalCount > 0 && <Pressable accessibilityRole="button"
        accessibilityLabel={`Open Today, ${completedCount} of ${totalCount} sessions complete`}
        onPress={() => router.navigate("/today")}
        style={({ pressed }) => [homeStyles.progress, { borderTopColor: theme.line, opacity: pressed ? 0.65 : 1 }]}>
        <View style={homeStyles.progressHeading}>
          <View style={homeStyles.progressTitle}>
            <AppText selectable={false} weight="600">Today’s progress</AppText>
            <AppText selectable={false} size={14} muted>{completedCount} of {totalCount} sessions complete</AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.muted} />
        </View>
        <ProgressBar value={completedCount / totalCount * 100} />
      </Pressable>}
    </View>}
  </Page>;
}

const homeStyles = StyleSheet.create({
  page: { flexGrow: 1 },
  body: { alignSelf: "center", width: "100%", maxWidth: 500, paddingTop: 18, paddingBottom: 8, gap: 36 },
  hero: { gap: 28 },
  headline: { lineHeight: 48, letterSpacing: -1.6, maxWidth: 375 },
  session: { minHeight: 214, borderRadius: 26, padding: 22, gap: 24, justifyContent: "space-between" },
  sessionHeading: { gap: 18 },
  sessionTitle: { gap: 5 },
  topic: { lineHeight: 33, letterSpacing: -0.4 },
  progress: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 12 },
  progressHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  progressTitle: { flex: 1, gap: 2 },
});
