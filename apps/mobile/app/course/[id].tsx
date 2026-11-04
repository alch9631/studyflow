import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Keyboard, Modal, Pressable, RefreshControl, ScrollView, TextInput, View, type ListRenderItem } from "react-native";
import { router, useLocalSearchParams, usePreventRemove } from "expo-router";
import Animated from "react-native-reanimated";
import { useSectionContentStyle, useSectionMotion, type SectionMotion } from "../../src/section-motion";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import type { CourseDetail, FormFields } from "../../../../shared/mobileWorkspace";
import { Action, AppText, Card, ErrorMessage, IconButton, useTheme } from "../../src/ui";
import { Chips, chooseSession, dateLabel, edit, LinkButton, ProgressBar, useMobileData } from "../../src/workspace";
import { ActionMenu } from "../../src/action-menu";
import { useCloseSwipeRow } from "../../src/swipe-row";
import { ContentRow } from "../../src/content-row";
import { CoursePage } from "../../src/course-page";
import { DeadlineRow, MaterialRow, TopicRow } from "../../src/course-rows";
import { SectionTabs } from "../../src/section-tabs";
import { useSession } from "../../src/session";
import { openMaterial, pickAndUpload, uploadMaterials, type MaterialUploadFailure } from "../../src/materials";

type Plan = { fileId: string; id: string; outline: boolean; items: { id: string; title: string; reference?: string; instruction?: string }[] };
const courseSections = { progress: "Topics", materials: "Materials", deadlines: "Deadlines", manage: "Settings" };
const sectionKeys = Object.keys(courseSections);
const sectionOptions = Object.entries(courseSections).filter(([key]) => key !== "manage").map(([value, label]) => ({ value, label }));
const materialTypes = [
  { id: "auto", category: "", title: "Auto detect" }, { id: "skript", category: "skript", title: "Script" },
  { id: "uebung", category: "uebung", title: "Exercises" }, { id: "altklausur", category: "altklausur", title: "Past paper" },
  { id: "slides", category: "slides", title: "Slides" }, { id: "sonstiges", category: "sonstiges", title: "Other" },
];
function localDay(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

const rowKey = (item: { id: string }) => item.id;

/** Retain each section's scroll and draft state; mount rows only near its viewport. */
function CourseSection<T extends { id: string }>({ active, children, data = [], renderItem, query, motion }: {
  active: boolean; children: React.ReactNode; data?: T[]; renderItem?: ListRenderItem<T>;
  query: { refreshing: boolean; reload: () => Promise<void> }; motion: SectionMotion;
}) {
  const [visited, setVisited] = useState(active);
  const closeSwipeRow = useCloseSwipeRow();
  const sceneStyle = useSectionContentStyle(motion, active);
  const theme = useTheme();
  useEffect(() => { if (active) setVisited(true); }, [active]);
  if (!active && !visited) return null;
  return <Animated.View aria-hidden={!active} accessibilityElementsHidden={!active} importantForAccessibility={active ? "auto" : "no-hide-descendants"}
    pointerEvents={active ? "auto" : "none"}
    style={[{ position: "absolute", inset: 0 }, sceneStyle]}>
    <FlatList data={data} renderItem={renderItem} keyExtractor={rowKey}
      ListHeaderComponent={<View style={{ gap: 18, marginBottom: 18 }}>{children}</View>}
      initialNumToRender={8} maxToRenderPerBatch={4} windowSize={5}
      onScrollBeginDrag={closeSwipeRow} scrollsToTop={active}
      keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 32 }}
      refreshControl={<RefreshControl tintColor={theme.brand} refreshing={query.refreshing} onRefresh={() => { void query.reload(); }} />} />
  </Animated.View>;
}

export default function Course() {
  const { id, section } = useLocalSearchParams<{ id: string; section?: string }>();
  return <CourseWorkspace key={id} id={id} section={section} />;
}

function CourseWorkspace({ id, section }: { id: string; section?: string }) {
  const query = useMobileData<CourseDetail>(`courses/${encodeURIComponent(id)}`);
  const { session, isDemo } = useSession(); const theme = useTheme(); const course = query.data;
  const closeSwipeRow = useCloseSwipeRow();
  const sections = courseSections;
  const initialTab = section && Object.hasOwn(sections, section) ? section : "progress";
  const [tab, setTab] = useState(initialTab);
  const sectionMotion = useSectionMotion(sectionKeys.indexOf(tab));
  useEffect(() => { setTab(initialTab); setExpanded(""); }, [id, initialTab]);
  const [busy, setBusy] = useState(false); const [expanded, setExpanded] = useState(""); const [search, setSearch] = useState(""); const [searchOpen, setSearchOpen] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null); const [selected, setSelected] = useState<string[]>([]);
  const [failedUploads, setFailedUploads] = useState<MaterialUploadFailure[]>([]);
  const [uploadStatus, setUploadStatus] = useState("");
  const [addingDeadline, setAddingDeadline] = useState(false);
  const [deadlineTitle, setDeadlineTitle] = useState("");
  const [deadlineDate, setDeadlineDate] = useState(() => new Date());
  const [deadlineError, setDeadlineError] = useState<string | null>(null);
  const savingDeadline = useRef(false);
  const [allowLeave, setAllowLeave] = useState(false);
  usePreventRemove(!allowLeave && addingDeadline && (busy || !!deadlineTitle.trim()), ({ repeat }) => {
    if (savingDeadline.current) { Alert.alert("Saving deadline", "Wait for the save to finish."); return; }
    Alert.alert("Discard deadline?", "Your deadline hasn't been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => { setAllowLeave(true); repeat(); } },
    ]);
  });
  useEffect(() => { setSearch(""); }, [id]);
  function selectTab(value: string) { closeSwipeRow(); Keyboard.dismiss(); setTab(value); }
  const run = useCallback(async (name: string, fields: FormFields = {}) => {
    if (busy) return; setBusy(true); query.setError(null);
    try { await query.action(name, fields); await query.reload(); if (name === "deleteTopic") setExpanded(""); }
    catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }, [busy, query.action, query.reload, query.setError]);
  async function upload(category = "", retry = false) {
    if (!session || busy) return; setBusy(true); query.setError(null);
    try {
      const progress = (current: number, total: number) => setUploadStatus(`Uploading ${current} of ${total} files…`);
      const result = retry ? await uploadMaterials(session, id, failedUploads.map(failure => failure.item), progress) : await pickAndUpload(session, id, category, progress);
      if (result) {
        setFailedUploads(result.failed);
        setUploadStatus(`${result.saved} file${result.saved === 1 ? "" : "s"} uploaded${result.failed.length ? ` · ${result.failed.length} need retrying` : ""}.`);
        if (result.saved) await query.reload();
      }
    }
    catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  async function addDeadline() {
    if (busy || savingDeadline.current) return;
    const title = deadlineTitle.trim();
    if (!title) { setDeadlineError("Enter a title."); return; }
    savingDeadline.current = true; setBusy(true); setDeadlineError(null);
    try {
      await query.action("addAssignment", { courseId: id, title, dueDate: localDay(deadlineDate) });
      setAddingDeadline(false); setDeadlineTitle(""); Keyboard.dismiss();
      await query.reload();
    } catch (e) { setDeadlineError((e as Error).message); }
    finally { savingDeadline.current = false; setBusy(false); }
  }
  async function startStudy(topicId?: string) {
    if (busy) return;
    setBusy(true); query.setError(null);
    try {
      const result = await query.action<{ blockId: string; topicId: string; kind: string }>("startFocus", { courseId: id, ...(topicId ? { topicId } : {}) });
      if (!result.blockId || !result.topicId) throw new Error("Couldn't start this session. Refresh the course and try again.");
      setExpanded("");
      chooseSession({ id: result.blockId, topicId: result.topicId, kind: result.kind });
    } catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  const prepare = useCallback(async (fileId: string) => {
    setBusy(true); query.setError(null);
    try {
      const result = await query.action<{ outline?: { id: string; units: { id: string; title: string; reference: string }[] }; drafts?: { id: string; items: { id: string; title: string; task: { instruction: string } }[] } }>("prepareMaterial", { fileId, language: "en" });
      const p: Plan = result.outline ? { fileId, id: result.outline.id, outline: true, items: result.outline.units }
        : { fileId, id: result.drafts!.id, outline: false, items: result.drafts!.items.map(d => ({ id: d.id, title: d.title, instruction: d.task.instruction })) };
      setPlan(p); setSelected(p.items.map(i => i.id));
    } catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }, [query.action, query.setError]);
  async function acceptPlan() {
    if (!plan || !selected.length) return;
    setBusy(true);
    try { await query.action(plan.outline ? "acceptOutline" : "acceptTasks", { fileId: plan.fileId, draftId: plan.id, ids: selected }); setPlan(null); await query.reload(); }
    catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  const roots = useMemo(() => course?.topics.filter(t => !t.parentTopicId) ?? [], [course?.topics]);
  const covered = useMemo(() => roots.filter(t => t.done).length, [roots]);
  const selectedTopic = course?.topics.find(t => t.id === expanded);
  const topics = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return course?.topics.filter(t => !needle || t.title.toLocaleLowerCase().includes(needle)) ?? [];
  }, [course?.topics, search]);
  const assignments = useMemo(() => [...(course?.assignments ?? [])].sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate)), [course?.assignments]);
  const deleteTopic = useCallback((topic: CourseDetail["topics"][number]) => {
    if (busy) return;
    Alert.alert("Delete topic?", `${topic.title}\nIts notes and future sessions will be removed. Logged study history is kept.`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { void run("deleteTopic", { topicId: topic.id, courseId: id }); } }]);
  }, [busy, id, run]);
  const deleteAssignment = useCallback((assignment: CourseDetail["assignments"][number]) => {
    if (busy) return;
    Alert.alert("Delete deadline?", assignment.title, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { void run("deleteAssignment", { assignmentId: assignment.id, courseId: id }); } }]);
  }, [busy, id, run]);
  const deleteMaterial = useCallback((file: CourseDetail["files"][number]) => {
    if (busy) return;
    Alert.alert("Delete material?", file.filename, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { void run("deleteMaterial", { moduleFileId: file.id }); } }]);
  }, [busy, run]);
  const openFile = useCallback((file: CourseDetail["files"][number]) => {
    if (!session || busy) return;
    setBusy(true);
    void openMaterial(session, file.id, file.filename).catch(e => query.setError(e.message)).finally(() => setBusy(false));
  }, [session, busy, query.setError]);
  const renderTopic = useCallback<ListRenderItem<CourseDetail["topics"][number]>>(({ item }) =>
    <TopicRow topic={item} busy={busy} id={id} run={run} onDelete={deleteTopic} onOpen={setExpanded} />, [busy, id, run, deleteTopic]);
  const renderMaterial = useCallback<ListRenderItem<CourseDetail["files"][number]>>(({ item }) =>
    <MaterialRow file={item} busy={busy} id={id} onDelete={deleteMaterial} onOpen={openFile} onPrepare={prepare} />, [busy, id, deleteMaterial, openFile, prepare]);
  const renderDeadline = useCallback<ListRenderItem<CourseDetail["assignments"][number]>>(({ item }) =>
    <DeadlineRow assignment={item} busy={busy} run={run} onDelete={deleteAssignment} />, [busy, run, deleteAssignment]);
  return <CoursePage title={course?.name ?? "Course"} subtitle={course ? `${dateLabel(course.examDate)}${course.ects ? ` · ${course.ects} ECTS` : ""}` : undefined} query={query}
    navigation={course ? (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}><SectionTabs options={sectionOptions} motion={sectionMotion} value={tab} onChange={selectTab} /></View>
        <IconButton glass label="Course settings" icon="settings-outline" selected={tab === "manage"} onPress={() => selectTab(tab === "manage" ? "progress" : "manage")} />
      </View>
    ) : null}>
    {course && <View style={{ flex: 1 }}>
      <CourseSection motion={sectionMotion} active={tab === "progress"} data={topics} renderItem={renderTopic} query={query}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <AppText size={18} weight="700" style={{ flex: 1 }}>Topics · {roots.length}</AppText>
          <IconButton label="Practice recall" icon="flash-outline" onPress={() => router.push({ pathname: "/practice", params: { courseId: id } })} />
          <IconButton label={searchOpen ? "Close topic search" : "Find a topic"} icon={searchOpen ? "close-outline" : "search-outline"} onPress={() => { setSearchOpen(!searchOpen); setSearch(""); }} />
        </View>
        <ProgressBar value={roots.length ? covered / roots.length * 100 : 0} label={`${covered}/${roots.length} covered${course.isPassed ? " · Passed" : ""}`} />
        {searchOpen && <TextInput autoFocus accessibilityLabel="Find a topic" placeholder="Search topics" placeholderTextColor={theme.muted} value={search} onChangeText={value => { setSearch(value); }} autoCorrect={false} clearButtonMode="while-editing" returnKeyType="search"
          style={{ minHeight: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: theme.surface, color: theme.text, fontSize: 16 }} />}

        {!topics.length && <><AppText muted>{search.trim() ? "No matching topics." : "No topics yet."}</AppText>{!search.trim() && <LinkButton label="Add study task" onPress={() => edit("saveStudyTask", { courseId: id })} />}</>}
      </CourseSection>
      <CourseSection motion={sectionMotion} active={tab === "materials"} data={course.files} renderItem={renderMaterial} query={query}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <AppText size={18} weight="700" style={{ flex: 1 }}>Materials · {course.files.length}</AppText>
          {!isDemo && <ActionMenu glass label="Add material" text="Add material" icon="add-outline" disabled={busy} items={materialTypes.map(({ id: typeId, category, title }) => ({ id: typeId, title, onPress: () => { void upload(category); } }))} />}
        </View>
        {isDemo ? <AppText size={14} muted>Sign in to add files.</AppText> : <>
          {uploadStatus ? <AppText size={13} muted>{uploadStatus}</AppText> : null}
          {failedUploads.map(failure => <ErrorMessage key={failure.item.asset.uri} message={`${failure.item.asset.name}: ${failure.message}`} />)}
          {failedUploads.length ? <Action secondary busy={busy} onPress={() => { void upload("", true); }}>Retry failed files</Action> : null}
        </>}
        {!course.files.length ? <AppText size={14} muted>No files yet.</AppText> : null}

      </CourseSection>
      <CourseSection motion={sectionMotion} active={tab === "deadlines"} data={assignments} renderItem={renderDeadline} query={query}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <AppText size={18} weight="700">Deadlines · {course.assignments.filter(a => !a.done).length}</AppText>
          <IconButton glass label="Add deadline" icon="add-outline" disabled={busy || addingDeadline} onPress={() => { closeSwipeRow(); setDeadlineDate(new Date()); setDeadlineError(null); setAddingDeadline(true); }} />
        </View>
        {addingDeadline && <View style={{ gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.line }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <TextInput autoFocus accessibilityLabel="Deadline title" placeholder="Deadline title" placeholderTextColor={theme.muted} value={deadlineTitle} onChangeText={setDeadlineTitle} editable={!busy} maxLength={2000} returnKeyType="done" onSubmitEditing={() => { void addDeadline(); }}
              style={{ flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 8, color: theme.text, fontSize: 16 }} />
            <IconButton label="Save deadline" icon="checkmark-outline" busy={busy} disabled={!deadlineTitle.trim()} onPress={() => { void addDeadline(); }} />
            <IconButton label="Cancel deadline" icon="close-outline" disabled={busy} onPress={() => { setAddingDeadline(false); setDeadlineTitle(""); setDeadlineError(null); Keyboard.dismiss(); }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8 }}><AppText size={13} muted>Due</AppText><DateTimePicker value={deadlineDate} disabled={busy} mode="date" display="compact" presentation="inline" accentColor={theme.brand} themeVariant={theme.dark ? "dark" : "light"} onValueChange={(_, date) => setDeadlineDate(date)} /></View>
          <ErrorMessage message={deadlineError} />
        </View>}

        {!course.assignments.length && !addingDeadline ? <AppText size={14} muted>No deadlines.</AppText> : null}
      </CourseSection>
      <CourseSection motion={sectionMotion} active={tab === "manage"} query={query}>
        <AppText size={18} weight="700">Course settings</AppText>
        <Card style={{ gap: 0, paddingVertical: 0 }}>
          <ContentRow title="Exam & study days" subtitle={`Exam ${dateLabel(course.examDate)}`} icon="calendar-outline" disabled={busy} onPress={() => edit("updateCourse", { courseId: id, examDate: course.examDate, studyDays: course.studyDays.split(","), difficulty: String(course.difficulty) })} />
          <ContentRow title={course.grade === null ? "Record exam grade" : "Edit exam grade"} subtitle={course.grade === null ? "No grade recorded" : `Grade ${course.grade.toFixed(1)}`} icon="school-outline" disabled={busy} onPress={() => edit("saveGrade", { courseId: id, grade: course.grade === null ? "" : String(course.grade) })} />
        </Card>
        <View style={{ gap: 8 }}><AppText size={14} muted>Study plan & progress</AppText>
          <Card style={{ gap: 0, paddingVertical: 0 }}>
            <ContentRow title="Add study task" icon="add-circle-outline" disabled={busy} onPress={() => edit("saveStudyTask", { courseId: id })} />
            {!isDemo && <ContentRow title="Update progress" icon="checkmark-circle-outline" disabled={busy} onPress={() => edit("applyProgress", { courseId: id })} />}
            <ContentRow title="Repair study plan" icon="refresh-outline" disabled={busy} onPress={() => { void run("refreshPlan", { courseId: id }); }} />
            <ContentRow title="Progress insights" icon="stats-chart-outline" disabled={busy} onPress={() => router.dismissTo("/insights")} />
          </Card>
        </View>
        <View style={{ gap: 8 }}><AppText size={14} muted>Course status</AppText>
          <Card style={{ gap: 0, paddingVertical: 0 }}>
            <ContentRow title={course.passed ? "Remove manual pass" : "Mark course passed"} subtitle={course.isPassed ? "Passed" : "Active"} icon="flag-outline" disabled={busy} onPress={() => { void run("setPassed", { courseId: id, passed: course.passed ? "0" : "1" }); }} />
          </Card>
          <LinkButton label="Delete course" danger onPress={() => Alert.alert("Delete this course?", "This removes its topics, files, sessions and notes.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { if (busy) return; setBusy(true); void query.action("deleteCourse", { courseId: id }).then(() => router.replace("/(tabs)/courses")).catch(e => query.setError(e.message)).finally(() => setBusy(false)); } }])} />
        </View>
      </CourseSection>
    </View>}
    <Modal visible={!!selectedTopic} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setExpanded("")}>
      <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><AppText size={20} weight="700" style={{ flex: 1 }}>{selectedTopic?.title}</AppText><IconButton label="Close topic details" icon="close-outline" onPress={() => setExpanded("")} /></View>
        {selectedTopic && <>
          {!selectedTopic.done && !course?.isPassed && <Action busy={busy} onPress={() => { void startStudy(selectedTopic.id); }}>Study this topic</Action>}
          {selectedTopic.task ? <><AppText>{selectedTopic.task.instruction}</AppText><AppText size={14} muted>{selectedTopic.task.successCriteria}</AppText></> : null}
          <Chips options={[{ label: "Solid", value: "solid" }, { label: "Practice", value: "practice" }, { label: "Struggling", value: "struggling" }]} value={selectedTopic.confidence ?? ""} onChange={v => { void run("setConfidence", { topicId: selectedTopic.id, confidence: v === selectedTopic.confidence ? "" : v }); }} />
          {selectedTopic.note ? <AppText>{selectedTopic.note}</AppText> : <AppText muted>No notes yet.</AppText>}
          <LinkButton label={selectedTopic.note ? "Edit notes" : "Add notes"} onPress={() => { setExpanded(""); edit("saveNote", { topicId: selectedTopic.id, body: selectedTopic.note }); }} />
          <LinkButton label="Delete topic" danger onPress={() => deleteTopic(selectedTopic)} />
          <ErrorMessage message={query.error} />
        </>}
      </ScrollView>
    </Modal>
    <Modal visible={!!plan} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPlan(null)}><ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 24, gap: 16 }}>
      <LinkButton label="Close" onPress={() => setPlan(null)} /><AppText size={25} weight="700">Review study plan</AppText><AppText muted>Select the units to add. Existing topics are kept.</AppText>
      {plan?.items.map(item => <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(item.id) }} onPress={() => setSelected(ids => ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id])}><Card><AppText weight="600">{selected.includes(item.id) ? "✓ " : "○ "}{item.title}</AppText><AppText size={13} muted>{item.reference ?? item.instruction}</AppText></Card></Pressable>)}
      <ErrorMessage message={query.error} /><Action busy={busy} disabled={!selected.length} onPress={() => { void acceptPlan(); }}>Add selected units</Action>
    </ScrollView></Modal>
  </CoursePage>;
}
