import { Alert } from "react-native";
import type { CalendarData } from "../../../shared/mobileWorkspace";
import { Action, AppText, Card } from "../src/ui";
import { edit, LinkButton, Page, timeLabel, useMobileData } from "../src/workspace";

export default function Timetable() {
  const query = useMobileData<CalendarData>("calendar");
  return <Page back title="Class timetable" subtitle="Recurring classes are kept free when arranging study sessions." query={query}>
    <Action onPress={() => edit("addLecture")}>Add a class</Action>
    {query.data?.lectures.map(l => <Card key={l.id}><AppText size={18} weight="700">{l.title}</AppText><AppText muted>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][l.weekday]} · {timeLabel(l.startMin)}–{timeLabel(l.endMin)}</AppText>{!!l.location && <AppText muted>{l.location}</AppText>}<LinkButton label="Remove class" danger onPress={() => Alert.alert("Remove recurring class?", l.title, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => { void query.action("deleteLecture", { lectureId: l.id }).then(query.reload).catch(e => query.setError(e.message)); } }])} /></Card>)}
    {!query.loading && !query.data?.lectures.length && <AppText muted>No recurring classes added yet.</AppText>}
  </Page>;
}
