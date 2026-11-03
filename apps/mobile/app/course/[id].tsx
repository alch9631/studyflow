import { useEffect, useState } from "react";
import { Alert, Keyboard, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { CourseDetail, FormFields } from "../../../../shared/mobileWorkspace";
import { Action, AppText, Card, ErrorMessage, IconButton, useTheme } from "../../src/ui";
import { Chips, chooseSession, dateLabel, edit, LinkButton, Page, ProgressBar, useMobileData } from "../../src/workspace";
import { ActionMenu } from "../../src/action-menu";
import { SwipeRow, useCloseSwipeRow } from "../../src/swipe-row";
import { ContentRow } from "../../src/content-row";
import { SectionTabs } from "../../src/section-tabs";
import { useSession } from "../../src/session";
import { openMaterial, pickAndUpload, uploadMaterials, type MaterialUploadFailure } from "../../src/materials";

type Plan = { fileId: string; id: string; outline: boolean; items: { id: string; title: string; reference?: string; instruction?: string }[] };

/** Mount a section on first use, then retain its native rows for instant returns. */
function CourseSection({ active, children }: { active: boolean; children: React.ReactNode }) {
  const [visited, setVisited] = useState(active);
  useEffect(() => { if (active) setVisited(true); }, [active]);
  if (!active && !visited) return null;
  return <View aria-hidden={!active} accessibilityElementsHidden={!active} importantForAccessibility={active ? "auto" : "no-hide-descendants"}
    style={active ? { gap: 18 } : { display: "none" }}>{children}</View>;
}

export default function Course() {
  const { id, section } = useLocalSearchParams<{ id: string; section?: string }>();
  return <CourseWorkspace key={id} id={id} section={section} />;
}

function CourseWorkspace({ id, section }: { id: string; section?: string }) {
  const query = useMobileData<CourseDetail>(`courses/${encodeURIComponent(id)}`);
  const { session, isDemo } = useSession(); const theme = useTheme(); const course = query.data;
  const closeSwipeRow = useCloseSwipeRow();
  const sections = { progress: "Topics", materials: "Materials", deadlines: "Deadlines", manage: "Settings" };
  const initialTab = section && Object.hasOwn(sections, section) ? section : "progress";
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { setTab(initialTab); setExpanded(""); }, [id, initialTab]);
  const [busy, setBusy] = useState(false); const [expanded, setExpanded] = useState(""); const [search, setSearch] = useState(""); const [searchOpen, setSearchOpen] = useState(false); const [limit, setLimit] = useState(40);
  const [plan, setPlan] = useState<Plan | null>(null); const [selected, setSelected] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [failedUploads, setFailedUploads] = useState<MaterialUploadFailure[]>([]);
  const [uploadStatus, setUploadStatus] = useState("");
  useEffect(() => { setSearch(""); setLimit(40); }, [id]);
  function selectTab(value: string) { closeSwipeRow(); Keyboard.dismiss(); setTab(value); }
  async function run(name: string, fields: FormFields = {}) {
    if (busy) return; setBusy(true); query.setError(null);
    try { await query.action(name, fields); await query.reload(); if (name === "deleteTopic") setExpanded(""); }
    catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  async function upload(retry = false) {
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
  async function prepare(fileId: string) {
    setBusy(true); query.setError(null);
    try {
      const result = await query.action<{ outline?: { id: string; units: { id: string; title: string; reference: string }[] }; drafts?: { id: string; items: { id: string; title: string; task: { instruction: string } }[] } }>("prepareMaterial", { fileId, language: "en" });
      const p: Plan = result.outline ? { fileId, id: result.outline.id, outline: true, items: result.outline.units }
        : { fileId, id: result.drafts!.id, outline: false, items: result.drafts!.items.map(d => ({ id: d.id, title: d.title, instruction: d.task.instruction })) };
      setPlan(p); setSelected(p.items.map(i => i.id));
    } catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  async function acceptPlan() {
    if (!plan || !selected.length) return;
    setBusy(true);
    try { await query.action(plan.outline ? "acceptOutline" : "acceptTasks", { fileId: plan.fileId, draftId: plan.id, ids: selected }); setPlan(null); await query.reload(); }
    catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  const roots = course?.topics.filter(t => !t.parentTopicId) ?? [];
  const selectedTopic = course?.topics.find(t => t.id === expanded);
  const topics = course?.topics.filter(t => t.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) ?? [];
  function deleteTopic(topic: CourseDetail["topics"][number]) {
    if (busy) return;
    Alert.alert("Delete topic?", `${topic.title}\nIts notes and future sessions will be removed. Logged study history is kept.`, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { void run("deleteTopic", { topicId: topic.id, courseId: id }); } }]);
  }
  function deleteAssignment(assignment: CourseDetail["assignments"][number]) {
    if (busy) return;
    Alert.alert("Delete deadline?", assignment.title, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { void run("deleteAssignment", { assignmentId: assignment.id, courseId: id }); } }]);
  }
  function deleteMaterial(file: CourseDetail["files"][number]) {
    if (busy) return;
    Alert.alert("Delete material?", file.filename, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { void run("deleteMaterial", { moduleFileId: file.id }); } }]);
  }
  return <Page back sheet title={course?.name ?? "Course"} subtitle={course ? `Exam ${dateLabel(course.examDate)}${course.ects ? ` · ${course.ects} ECTS` : ""}` : undefined} query={query}
    actions={<IconButton glass label="Course settings" icon="settings-outline" selected={tab === "manage"} onPress={() => selectTab(tab === "manage" ? "progress" : "manage")} />}>
    {course && <>
      <SectionTabs options={Object.entries(sections).filter(([key]) => key !== "manage").map(([value, label]) => ({ value, label }))} value={tab} onChange={selectTab} />
      <CourseSection active={tab === "progress"}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <AppText size={18} weight="700" style={{ flex: 1 }}>Topics · {roots.length}</AppText>
          <IconButton label="Practice recall" icon="flash-outline" onPress={() => router.push({ pathname: "/practice", params: { courseId: id } })} />
          <IconButton label={searchOpen ? "Close topic search" : "Find a topic"} icon={searchOpen ? "close-outline" : "search-outline"} onPress={() => { setSearchOpen(!searchOpen); setSearch(""); setLimit(40); }} />
        </View>
        <ProgressBar value={roots.length ? roots.filter(t => t.done).length / roots.length * 100 : 0} label={`${roots.filter(t => t.done).length}/${roots.length} covered${course.isPassed ? " · Passed" : ""}`} />
        {searchOpen && <TextInput autoFocus accessibilityLabel="Find a topic" placeholder="Search topics" placeholderTextColor={theme.muted} value={search} onChangeText={value => { setSearch(value); setLimit(40); }} autoCorrect={false} clearButtonMode="while-editing" returnKeyType="search"
          style={{ minHeight: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: theme.surface, color: theme.text, fontSize: 16 }} />}
        <View>{topics.slice(0, limit).map(t => <SwipeRow key={t.id} disabled={busy}
          leading={{ label: t.done ? "Reopen" : "Complete", icon: t.done ? "arrow-undo-outline" : "checkmark-outline", onPress: () => { void run("toggleTopic", { courseId: id, topicId: t.id, done: t.done ? "false" : "true" }); } }}
          trailing={{ label: "Delete", icon: "trash-outline", destructive: true, onPress: () => deleteTopic(t) }}>
          <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: theme.line, paddingVertical: 8, gap: 4 }}>
          <IconButton label={`${t.done ? "Mark not covered" : "Mark covered"}: ${t.title}`} icon={t.done ? "checkmark-circle" : "ellipse-outline"} disabled={busy} onPress={() => { void run("toggleTopic", { courseId: id, topicId: t.id, done: t.done ? "false" : "true" }); }} />
          <View style={{ flex: 1 }}><AppText selectable={false} weight="600">{t.title}</AppText>{t.confidence ? <AppText selectable={false} size={13} muted>{t.confidence}</AppText> : null}</View>
          <IconButton label={`Notes & details: ${t.title}`} icon="create-outline" onPress={() => setExpanded(t.id)} />
        </View></SwipeRow>)}</View>
        {topics.length > limit && <LinkButton label="Show more topics" onPress={() => setLimit(n => n + 40)} />}
        {!topics.length && <><AppText muted>{search.trim() ? "No matching topics." : "Add a study task or upload materials to plan what to work on."}</AppText>{!search.trim() && <LinkButton label="Add study task" onPress={() => edit("saveStudyTask", { courseId: id })} />}</>}
      </CourseSection>
      <CourseSection active={tab === "materials"}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <AppText size={18} weight="700">Materials · {course.files.length}</AppText>
        </View>
        {isDemo ? <AppText size={14} muted>Sample notes are included. Sign in to add files.</AppText> : <>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <ActionMenu label="File category" text={({ "": "Auto detect", skript: "Script", uebung: "Exercises", altklausur: "Past paper", slides: "Slides", sonstiges: "Other" } as Record<string, string>)[category]} icon="chevron-down" disabled={busy} items={[
              { id: "", title: "Auto detect" }, { id: "skript", title: "Script" }, { id: "uebung", title: "Exercises" }, { id: "altklausur", title: "Past paper" }, { id: "slides", title: "Slides" }, { id: "sonstiges", title: "Other" },
            ].map(item => ({ ...item, state: category === item.id ? "on" : "off", onPress: () => setCategory(item.id) }))} />
            <Action secondary busy={busy} onPress={() => { void upload(); }}>Add files</Action>
          </View>
          {uploadStatus ? <AppText size={13} muted>{uploadStatus}</AppText> : null}
          {failedUploads.map(failure => <ErrorMessage key={failure.item.asset.uri} message={`${failure.item.asset.name}: ${failure.message}`} />)}
          {failedUploads.length ? <Action secondary busy={busy} onPress={() => { void upload(true); }}>Retry failed files</Action> : null}
        </>}
        <View>{course.files.map(file => <SwipeRow key={file.id} disabled={busy} trailing={{ label: "Delete", icon: "trash-outline", destructive: true, onPress: () => deleteMaterial(file) }}>
              <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: theme.line, gap: 4 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${file.filename}`} disabled={busy} onPress={() => { if (!session || busy) return; setBusy(true); void openMaterial(session, file.id, file.filename).catch(e => query.setError(e.message)).finally(() => setBusy(false)); }} style={{ flex: 1, minHeight: 52, paddingVertical: 12 }}>
                <AppText selectable={false} size={14} weight="600">{file.filename}</AppText>
              </Pressable>
              <ActionMenu label={`Material actions: ${file.filename}`} disabled={busy} items={[
                { id: "plan", title: "Build study plan", image: "list.bullet.clipboard", onPress: () => { void prepare(file.id); } },
                ...(file.mockExamQuestions ? [{ id: "paper", title: `Practice · ${file.mockExamQuestions} questions`, image: "brain.head.profile" as const, onPress: () => router.push({ pathname: "/practice", params: { courseId: id, examFile: file.id } }) }] : []),
                ...(file.summary ? [{ id: "summary", title: "Summary", image: "doc.text" as const, onPress: () => Alert.alert(file.filename, file.summary) }] : []),
                { id: "delete", title: "Delete file", image: "trash", attributes: { destructive: true }, onPress: () => deleteMaterial(file) },
              ]} />
            </View></SwipeRow>)}{!course.files.length ? <AppText size={14} muted>No files yet.</AppText> : null}</View>
      </CourseSection>
      <CourseSection active={tab === "deadlines"}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <AppText size={18} weight="700">Deadlines · {course.assignments.filter(a => !a.done).length}</AppText>
          <IconButton glass label="Add deadline" icon="add-outline" onPress={() => edit("addAssignment", { courseId: id })} />
        </View>
        <View>{[...course.assignments].sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate)).map(a => <SwipeRow key={a.id} disabled={busy}
          leading={{ label: a.done ? "Reopen" : "Complete", icon: a.done ? "arrow-undo-outline" : "checkmark-outline", onPress: () => { void run("toggleAssignment", { assignmentId: a.id, done: a.done ? "false" : "true" }); } }}
          trailing={{ label: "Delete", icon: "trash-outline", destructive: true, onPress: () => deleteAssignment(a) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.line }}>
          <IconButton label={`${a.done ? "Reopen" : "Complete"}: ${a.title}`} icon={a.done ? "checkmark-circle" : "ellipse-outline"} disabled={busy} onPress={() => { void run("toggleAssignment", { assignmentId: a.id, done: a.done ? "false" : "true" }); }} />
          <View style={{ flex: 1 }}><AppText selectable={false} weight="600">{a.title}</AppText><AppText selectable={false} size={13} muted>{dateLabel(a.dueDate)}</AppText></View>
          <IconButton label={`Delete deadline: ${a.title}`} icon="trash-outline" disabled={busy} onPress={() => deleteAssignment(a)} />
        </View></SwipeRow>)}</View>
        {!course.assignments.length ? <AppText size={14} muted>No deadlines.</AppText> : null}
      </CourseSection>
      <CourseSection active={tab === "manage"}>
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
            <ContentRow title="Progress insights" icon="stats-chart-outline" disabled={busy} onPress={() => router.push("/insights")} />
          </Card>
        </View>
        <View style={{ gap: 8 }}><AppText size={14} muted>Course status</AppText>
          <Card style={{ gap: 0, paddingVertical: 0 }}>
            <ContentRow title={course.passed ? "Remove manual pass" : "Mark course passed"} subtitle={course.isPassed ? "Passed" : "Active"} icon="flag-outline" disabled={busy} onPress={() => { void run("setPassed", { courseId: id, passed: course.passed ? "0" : "1" }); }} />
          </Card>
          <LinkButton label="Delete course" danger onPress={() => Alert.alert("Delete this course?", "This removes its topics, files, sessions and notes.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { if (busy) return; setBusy(true); void query.action("deleteCourse", { courseId: id }).then(() => router.replace("/(tabs)/courses")).catch(e => query.setError(e.message)).finally(() => setBusy(false)); } }])} />
        </View>
      </CourseSection>
    </>}
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
  </Page>;
}
