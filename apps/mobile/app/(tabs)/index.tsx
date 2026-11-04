import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { nextStudyBlock, type MobileToday } from "../../../../shared/mobile";
import { Action, AppText, useTheme } from "../../src/ui";
import { chooseSession, Page, useMobileData } from "../../src/workspace";
import { compactSessionLabel } from "../../src/session-label";

export default function Home() {
  const theme = useTheme();
  const query = useMobileData<MobileToday>("today");
  const today = query.data;
  const next = today && nextStudyBlock(today);
  const remaining = today ? Math.max(0, today.summary.totalCount - today.summary.completedCount) : 0;
  const label = next ? compactSessionLabel(next.title, next.kind) : null;
  const date = today ? new Date(`${today.date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }) : undefined;
  let summary = "A clear day. Choose a course when you’re ready.";
  if (next?.progress) summary = "Your place is saved. Pick up where you left off.";
  else if (next) summary = remaining > 0 ? `${remaining === 1 ? "One session" : `${remaining} sessions`} left today. Start with this one.` : "Your next session is ready when you are.";
  else if (today?.summary.totalCount) summary = "You’ve finished today’s sessions.";

  return <Page tabPage title="Home" subtitle={date} query={query} contentStyle={homeStyles.page}>
    <View style={homeStyles.body}>
      <View style={homeStyles.intro}>
        <AppText size={34} weight="600" style={homeStyles.headline}>One small step is enough.</AppText>
        {today ? <AppText muted>{summary}</AppText> : null}
      </View>
      {next && label ? <View style={[homeStyles.session, { backgroundColor: theme.surface, borderColor: theme.line }]}>
        <View style={homeStyles.sessionHeading}>
          <AppText size={13} weight="600" style={{ color: theme.brand }}>{next.progress ? "READY TO CONTINUE" : "UP NEXT"}</AppText>
          <View style={homeStyles.sessionTitle}>
            <AppText size={14} muted>{next.course.name}</AppText>
            <AppText size={22} weight="600">{label.title}</AppText>
          </View>
        </View>
        <Action onPress={() => chooseSession(next)}>{next.progress ? "Resume focus" : "Start work"}</Action>
      </View> : today ? <Action secondary onPress={() => router.navigate("/courses")}>Choose a course</Action> : null}
    </View>
  </Page>;
}

const homeStyles = StyleSheet.create({
  page: { flexGrow: 1 },
  body: { alignSelf: "center", width: "100%", maxWidth: 480, paddingVertical: 32, gap: 32 },
  intro: { gap: 14 },
  headline: { lineHeight: 42, letterSpacing: -0.7, maxWidth: 340 },
  session: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 24, borderCurve: "continuous", padding: 20, gap: 24 },
  sessionHeading: { gap: 16 },
  sessionTitle: { gap: 6 },
});
