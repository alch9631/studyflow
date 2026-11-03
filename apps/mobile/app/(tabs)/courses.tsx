import { useCallback, useState } from "react";
import { View, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import type { CourseSummary } from "../../../../shared/mobileWorkspace";
import { AppText, useTheme } from "../../src/ui";
import { ActionMenu } from "../../src/action-menu";
import { Chips, dateLabel, edit, Page, useMobileData, usePrefetchMobileData } from "../../src/workspace";
import { useSession } from "../../src/session";
import { ContentRow } from "../../src/content-row";

export default function Courses() {
  const { isDemo } = useSession();
  const theme = useTheme();
  const query = useMobileData<CourseSummary[]>("courses");
  const prefetch = usePrefetchMobileData();
  const [tab, setTab] = useState("active");
  const [search, setSearch] = useState("");
  const all = query.data ?? [];
  const list = all.filter(c => c.isPassed === (tab === "passed") && c.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const visibleCourseIds = list.slice(0, 4).map(course => course.id).join(",");
  useFocusEffect(useCallback(() => {
    // Warm only the first visible courses; tapping any other row starts its read
    // before the sheet opens, without fetching the entire course archive.
    for (const courseId of visibleCourseIds.split(",").filter(Boolean)) prefetch(`courses/${encodeURIComponent(courseId)}`);
  }, [visibleCourseIds, prefetch]));
  function open(id: string, section = "progress") { router.push({ pathname: "/course/[id]", params: { id, section } }); }
  return <Page tabPage title="Courses" query={query} actions={<ActionMenu glass label="Add course" icon="add-outline" items={[
    { id: "create", title: "New course", image: "plus", onPress: () => edit("createCourse") },
    { id: "catalog", title: isDemo ? "Sample modules" : "University catalog", image: "books.vertical", onPress: () => router.push("/catalog") },
    ...(!isDemo ? [{ id: "syllabus", title: "Import syllabus", image: "doc.text" as const, onPress: () => edit("importSyllabus") }] : []),
  ]} />}>
    <Chips options={[{ label: `Active · ${all.filter(c => !c.isPassed).length}`, value: "active" }, { label: `Passed · ${all.filter(c => c.isPassed).length}`, value: "passed" }]} value={tab} onChange={setTab} />
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, backgroundColor: theme.surface, borderRadius: 12, borderCurve: "continuous" }}>
      <Ionicons name="search-outline" size={18} color={theme.muted} /><TextInput accessibilityLabel="Search courses" placeholder="Search" placeholderTextColor={theme.muted} value={search} onChangeText={setSearch} autoCorrect={false} returnKeyType="search" style={{ flex: 1, minHeight: 44, color: theme.text, fontSize: 16 }} />
    </View>
    <View>{list.map(c => <ContentRow key={c.id} title={c.name} icon={c.isPassed ? "checkmark-circle-outline" : "book-outline"}
      subtitle={c.isPassed ? c.grade !== null ? `Passed · ${c.grade.toFixed(1)}` : "Passed" : `Exam ${dateLabel(c.examDate)}`} onPressIn={() => prefetch(`courses/${encodeURIComponent(c.id)}`)} onPress={() => open(c.id)} />)}</View>
    {!query.loading && !query.error && !list.length ? <AppText muted>{search.trim() ? "No matching courses." : tab === "passed" ? "No passed courses yet." : "Add a course with +."}</AppText> : null}
  </Page>;
}
