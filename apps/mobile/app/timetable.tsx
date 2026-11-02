import { useState } from "react";
import { Alert, View } from "react-native";
import type { CalendarData } from "../../../shared/mobileWorkspace";
import { AppText, IconButton, useTheme } from "../src/ui";
import { edit, Page, timeLabel, useMobileData } from "../src/workspace";
import { SwipeRow } from "../src/swipe-row";

export default function Timetable() {
  const query = useMobileData<CalendarData>("calendar");
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  function remove(lecture: CalendarData["lectures"][number]) {
    if (busy) return;
    Alert.alert("Remove recurring class?", lecture.title, [{ text: "Cancel", style: "cancel" }, { text: "Remove", style: "destructive", onPress: () => {
      setBusy(true); void query.action("deleteLecture", { lectureId: lecture.id }).then(query.reload).catch(e => query.setError(e.message)).finally(() => setBusy(false));
    } }]);
  }
  return <Page back title="Class timetable" query={query} actions={<IconButton label="Add a class" icon="add-outline" onPress={() => edit("addLecture")} />}>
    <View>{query.data?.lectures.map(lecture => <SwipeRow key={lecture.id} disabled={busy} trailing={{ label: "Remove", icon: "trash-outline", destructive: true, onPress: () => remove(lecture) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 72, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.line }}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}><AppText weight="600">{lecture.title}</AppText>
          <AppText size={13} muted>{new Date(Date.UTC(2026, 10, 1 + lecture.weekday)).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" })} · {timeLabel(lecture.startMin)}–{timeLabel(lecture.endMin)}{lecture.location ? ` · ${lecture.location}` : ""}</AppText>
        </View><IconButton label={`Remove class: ${lecture.title}`} icon="trash-outline" disabled={busy} onPress={() => remove(lecture)} />
      </View>
    </SwipeRow>)}</View>
    {!query.loading && !query.error && !query.data?.lectures.length && <AppText muted>No recurring classes added yet.</AppText>}
  </Page>;
}
