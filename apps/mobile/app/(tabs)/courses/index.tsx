import { useCallback, useState } from "react";
import { View, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import type { CourseSummary } from "../../../../../shared/mobileWorkspace";
import { AppText, useTheme } from "../../../src/ui";
import { ActionMenu } from "../../../src/action-menu";
import { dateLabel, edit, Page, useMobileData, usePrefetchMobileData } from "../../../src/workspace";
import { useSession } from "../../../src/session";
import { ContentRow } from "../../../src/content-row";

export default function Courses() {
  const { isDemo } = useSession();
  const theme = useTheme();
  const query = useMobileData<CourseSummary[]>("courses");
  const prefetch = usePrefetchMobileData();
  const [search, setSearch] = useState("");
  const activeCourses = query.data?.filter(course => !course.isPassed) ?? [];
  const needle = search.trim().toLocaleLowerCase();
  const list = activeCourses.filter(course => course.name.toLocaleLowerCase().includes(needle));
  const visibleCourseIds = list.slice(0, 4).map(course => course.id).join(",");
  useFocusEffect(useCallback(() => {
    // Warm only the first visible courses; tapping any other row starts its read
    // before the sheet opens, without fetching the entire course archive.
    for (const courseId of visibleCourseIds.split(",").filter(Boolean)) prefetch(`courses/${encodeURIComponent(courseId)}`);
  }, [visibleCourseIds, prefetch]));
  return <Page tabPage title="Courses" query={query} actions={<ActionMenu glass label="Add course" icon="add-outline" items={[
    { id: "create", title: "New course", image: "plus", onPress: () => edit("createCourse") },
    { id: "catalog", title: isDemo ? "Sample modules" : "University catalog", image: "books.vertical", onPress: () => router.push("/catalog") },
    ...(!isDemo ? [{ id: "syllabus", title: "Import syllabus", image: "doc.text" as const, onPress: () => edit("importSyllabus") }] : []),
  ]} />}>
    <ContentRow title="Exams" icon="school-outline" onPress={() => router.push("/courses/exams")} />
    {activeCourses.length > 0 && <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, backgroundColor: theme.surface, borderRadius: 12, borderCurve: "continuous" }}>
      <Ionicons name="search-outline" size={18} color={theme.muted} /><TextInput accessibilityLabel="Search courses" placeholder="Search" placeholderTextColor={theme.muted} value={search} onChangeText={setSearch} autoCorrect={false} returnKeyType="search" style={{ flex: 1, minHeight: 44, color: theme.text, fontSize: 16 }} />
    </View>}
    {list.length > 0 && <View>{list.map(course => <ContentRow key={course.id} title={course.name} titleLines={2} icon="book-outline"
      subtitle={`Exam ${dateLabel(course.examDate)}`} onPressIn={() => prefetch(`courses/${encodeURIComponent(course.id)}`)}
      onPress={() => router.navigate({ pathname: "/course/[id]", params: { id: course.id } })} />)}</View>}
    {query.data && !query.error && !list.length && <AppText muted>{activeCourses.length ? "No matching courses." : "No active courses."}</AppText>}
  </Page>;
}
