import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { nextStudyBlock, type MobileToday } from "../../../../shared/mobile";
import { Action, AppText, useTheme } from "../../src/ui";
import { chooseSession, Page, useMobileData } from "../../src/workspace";

export default function Home() {
  const theme = useTheme();
  const query = useMobileData<MobileToday>("today");
  const today = query.data;
  const next = today && nextStudyBlock(today);
  const remaining = today ? today.summary.totalCount - today.summary.completedCount : 0;
  let summary = "Nothing scheduled for today.";
  if (next?.progress) summary = `Your session in ${next.course.name} is ready to resume.`;
  else if (next) summary = `${remaining === 1 ? "One session" : `${remaining} sessions`} left today. Up next is ${next.course.name}.`;
  else if (today?.summary.totalCount) summary = "You’ve finished today’s sessions.";

  return <Page tabPage title="Home" query={query}>
    <View style={{ flex: 1, justifyContent: "center", alignSelf: "center", width: "100%", maxWidth: 420, paddingVertical: 28, gap: 22 }}>
      <View style={{ gap: 12 }}>
        <View aria-hidden style={{ alignSelf: "flex-start", padding: 12, borderRadius: 18, backgroundColor: theme.tint }}>
          <Ionicons name="home-outline" size={28} color={theme.brand} />
        </View>
        <AppText size={32} weight="600">One small step is enough.</AppText>
        {today && <AppText muted>{summary}</AppText>}
      </View>
      {next ? <Action onPress={() => chooseSession(next)}>{next.progress ? "Resume focus" : "Start work"}</Action>
        : today ? <Action secondary onPress={() => router.navigate("/courses")}>Choose a course</Action> : null}
    </View>
  </Page>;
}
