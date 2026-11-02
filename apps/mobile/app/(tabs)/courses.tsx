import { useState } from "react";
import { Alert, View, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { CourseSummary } from "../../../../shared/mobileWorkspace";
import { AppText, useTheme } from "../../src/ui";
import { ActionMenu } from "../../src/action-menu";
import { Chips, dateLabel, edit, minutesLabel, Page, useMobileData } from "../../src/workspace";
import { useSession } from "../../src/session";

export default function Courses() {
  const { isDemo } = useSession();
  const theme = useTheme();
  const query = useMobileData<CourseSummary[]>("courses");
  const [tab, setTab] = useState("active");
  const [search, setSearch] = useState("");
  const all = query.data ?? [];
  const list = all.filter(c => c.isPassed === (tab === "passed") && c.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  function open(id: string, section = "progress") { router.push({ pathname: "/course/[id]", params: { id, section } }); }
  return <Page title="Courses" query={query} actions={<ActionMenu label="Add course" icon="add-outline" items={[
    { id: "create", title: "New course", image: "plus", onPress: () => edit("createCourse") },
    { id: "catalog", title: isDemo ? "Sample modules" : "University catalog", image: "books.vertical", onPress: () => router.push("/catalog") },
    ...(!isDemo ? [{ id: "syllabus", title: "Import syllabus", image: "doc.text" as const, onPress: () => edit("importSyllabus") }] : []),
  ]} />}>
    <Chips options={[{ label: `Active · ${all.filter(c => !c.isPassed).length}`, value: "active" }, { label: `Passed · ${all.filter(c => c.isPassed).length}`, value: "passed" }]} value={tab} onChange={setTab} />
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, backgroundColor: theme.surface, borderRadius: 12, borderCurve: "continuous" }}>
      <Ionicons name="search-outline" size={18} color={theme.muted} /><TextInput accessibilityLabel="Search courses" placeholder="Search" placeholderTextColor={theme.muted} value={search} onChangeText={setSearch} autoCorrect={false} returnKeyType="search" style={{ flex: 1, minHeight: 44, color: theme.text, fontSize: 16 }} />
    </View>
    <View>{list.map(c => <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.line }}>
      <View style={{ flex: 1, gap: 4 }}><AppText weight="600">{c.name}</AppText><AppText size={13} muted>{c.isPassed ? c.grade !== null ? `Passed · ${c.grade.toFixed(1)}` : "Passed" : `Exam ${dateLabel(c.examDate)}`}</AppText></View>
      <ActionMenu label={`Open course: ${c.name}`} text="Open" icon="chevron-down" items={[
        { id: "topics", title: `Topics · ${c.topicsDone}/${c.topicsTotal}`, image: "checklist", onPress: () => open(c.id) },
        { id: "materials", title: "Materials", image: "doc.on.doc", onPress: () => open(c.id, "materials") },
        { id: "deadlines", title: "Deadlines", image: "flag", onPress: () => open(c.id, "deadlines") },
        { id: "practice", title: "Practice recall", image: "brain.head.profile", onPress: () => router.push({ pathname: "/practice", params: { courseId: c.id } }) },
        { id: "stats", title: "Progress & time", image: "chart.bar", onPress: () => Alert.alert(c.name, `${c.topicsDone}/${c.topicsTotal} topics covered · ${minutesLabel(c.loggedMinutes)} studied · ${minutesLabel(c.remainingMinutes)} remaining${c.ects ? ` · ${c.ects} ECTS` : ""}`) },
        { id: "manage", title: "Course settings", image: "gearshape", onPress: () => open(c.id, "manage") },
      ]} />
    </View>)}</View>
    {!query.loading && !query.error && !list.length ? <AppText muted>{search.trim() ? "No matching courses." : tab === "passed" ? "No passed courses yet." : "Add a course with +."}</AppText> : null}
  </Page>;
}
