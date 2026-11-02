import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { Collapsible, Host, RNHostView } from "@expo/ui";
import { router, useLocalSearchParams } from "expo-router";
import type { CourseDetail, FormFields } from "../../../../shared/mobileWorkspace";
import { Action, AppText, Card, ErrorMessage, IconButton, useTheme } from "../../src/ui";
import { Chips, dateLabel, edit, Field, LinkButton, Page, ProgressBar, useMobileData } from "../../src/workspace";
import { ActionMenu } from "../../src/action-menu";
import { useSession } from "../../src/session";
import { openMaterial, pickAndUpload, uploadMaterials, type MaterialUploadFailure } from "../../src/materials";

type Plan = { fileId: string; id: string; outline: boolean; items: { id: string; title: string; reference?: string; instruction?: string }[] };
export default function Course() {
  const { id, section } = useLocalSearchParams<{ id: string; section?: string }>(); const query = useMobileData<CourseDetail>(`courses/${encodeURIComponent(id)}`);
  const { session, isDemo } = useSession(); const theme = useTheme(); const course = query.data;
  const sections = { progress: "Topics", materials: "Materials", deadlines: "Deadlines", manage: "Settings" };
  const initialTab = section && Object.hasOwn(sections, section) ? section : "progress";
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { setTab(initialTab); setExpanded(""); }, [id, initialTab]);
  const [filesOpen, setFilesOpen] = useState(section === "materials"); const [busy, setBusy] = useState(false); const [expanded, setExpanded] = useState(""); const [search, setSearch] = useState(""); const [limit, setLimit] = useState(40);
  const [plan, setPlan] = useState<Plan | null>(null); const [selected, setSelected] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [failedUploads, setFailedUploads] = useState<MaterialUploadFailure[]>([]);
  const [uploadStatus, setUploadStatus] = useState("");
  async function run(name: string, fields: FormFields = {}, navigate = false) {
    if (busy) return; setBusy(true); query.setError(null);
    try { const result = await query.action(name, fields); if (navigate && result.blockId) router.push({ pathname: "/focus/[id]", params: { id: result.blockId, topicId: result.topicId, kind: result.kind } }); else await query.reload(); }
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
        if (result.saved) { setFilesOpen(true); await query.reload(); }
      }
    }
    catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
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
  const topics = course?.topics.filter(t => t.title.toLowerCase().includes(search.toLowerCase())) ?? [];
  return <Page back title={course?.name ?? "Course"} subtitle={course ? `Exam ${dateLabel(course.examDate)}${course.ects ? ` · ${course.ects} ECTS` : ""}` : undefined} query={query}>
    {course && <>
      <View style={{ gap: 10 }}><ProgressBar value={roots.length ? roots.filter(t => t.done).length / roots.length * 100 : 0} label={`${roots.filter(t => t.done).length}/${roots.length} topics covered${course.isPassed ? " · Passed" : ""}`} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <ActionMenu label="Course sections" text={sections[tab as keyof typeof sections]} icon="chevron-down" items={Object.entries(sections).map(([key, title]) => ({ id: key, title, state: tab === key ? "on" : "off", onPress: () => setTab(key) }))} />
          <ActionMenu label="Course actions" disabled={busy} items={[
            { id: "recall", title: "Practice recall", image: "brain.head.profile", onPress: () => router.push({ pathname: "/practice", params: { courseId: id } }) },
            ...(!course.isPassed ? [{ id: "study", title: "Study next topic", image: "play" as const, onPress: () => { void run("startFocus", { courseId: id, language: "en" }, true); } }] : []),
            ...(!isDemo ? [{ id: "progress", title: "Update progress", image: "chart.bar" as const, onPress: () => edit("applyProgress", { courseId: id }) }] : []),
            { id: "task", title: "Add study task", image: "plus", onPress: () => edit("saveStudyTask", { courseId: id }) },
            { id: "settings", title: "Course settings", image: "gearshape", onPress: () => setTab("manage") },
          ]} />
        </View>
      </View>
      {tab === "progress" && <>
        <Field label="Find a topic" value={search} onChange={setSearch} />
        <View>{topics.slice(0, limit).map(t => <View key={t.id} style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: theme.line, paddingVertical: 8, gap: 4 }}>
          <IconButton label={`${t.done ? "Mark not covered" : "Mark covered"}: ${t.title}`} icon={t.done ? "checkmark-circle" : "ellipse-outline"} disabled={busy} onPress={() => { void run("toggleTopic", { courseId: id, topicId: t.id, done: t.done ? "false" : "true" }); }} />
          <View style={{ flex: 1 }}><AppText weight="600">{t.title}</AppText>{t.confidence ? <AppText size={13} muted>{t.confidence}</AppText> : null}</View>
          <IconButton label={`Notes & details: ${t.title}`} icon="create-outline" onPress={() => setExpanded(t.id)} />
        </View>)}</View>
        {topics.length > limit && <LinkButton label="Show more topics" onPress={() => setLimit(n => n + 40)} />}
        {!topics.length && <AppText muted>Upload material or add a study task to get started.</AppText>}
      </>}
      {tab === "materials" && <>
        {isDemo ? <AppText size={14} muted>Sample notes are included. Sign in to add files.</AppText> : <>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
            <LinkButton label="+ Add files" onPress={() => { void upload(); }} />
            <ActionMenu label="File category" text={({ "": "Auto detect", skript: "Script", uebung: "Exercises", altklausur: "Past paper", slides: "Slides", sonstiges: "Other" } as Record<string, string>)[category]} icon="chevron-down" disabled={busy} items={[
              { id: "", title: "Auto detect" }, { id: "skript", title: "Script" }, { id: "uebung", title: "Exercises" }, { id: "altklausur", title: "Past paper" }, { id: "slides", title: "Slides" }, { id: "sonstiges", title: "Other" },
            ].map(item => ({ ...item, state: category === item.id ? "on" : "off", onPress: () => setCategory(item.id) }))} />
          </View>
          {uploadStatus ? <AppText size={13} muted>{uploadStatus}</AppText> : null}
          {failedUploads.map(failure => <ErrorMessage key={failure.item.asset.uri} message={`${failure.item.asset.name}: ${failure.message}`} />)}
          {failedUploads.length ? <Action secondary busy={busy} onPress={() => { void upload(true); }}>Retry failed files</Action> : null}
        </>}
        <Host matchContents={{ vertical: true }} seedColor={theme.brand}>
          <Collapsible label={`Uploaded materials · ${course.files.length}`} isOpen={filesOpen} onOpenChange={setFilesOpen} labelStyle={{ fontSize: 15, color: theme.text, lineHeight: 44 }}>
            <RNHostView matchContents={{ vertical: true }}><View>{course.files.map(file => <View key={file.id} style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: theme.line, gap: 4 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${file.filename}`} disabled={busy} onPress={() => { if (!session || busy) return; setBusy(true); void openMaterial(session, file.id, file.filename).catch(e => query.setError(e.message)).finally(() => setBusy(false)); }} style={{ flex: 1, minHeight: 52, paddingVertical: 12 }}>
                <AppText size={14} weight="600">{file.filename}</AppText><AppText size={12} muted>{(file.sizeBytes / 1024).toFixed(0)} KB</AppText>
              </Pressable>
              <ActionMenu label={`Material actions: ${file.filename}`} disabled={busy} items={[
                { id: "plan", title: "Build study plan", image: "list.bullet.clipboard", onPress: () => { void prepare(file.id); } },
                ...(file.mockExamQuestions ? [{ id: "paper", title: `Practice · ${file.mockExamQuestions} questions`, image: "brain.head.profile" as const, onPress: () => router.push({ pathname: "/practice", params: { courseId: id, examFile: file.id } }) }] : []),
                ...(file.summary ? [{ id: "summary", title: "Summary", image: "doc.text" as const, onPress: () => Alert.alert(file.filename, file.summary) }] : []),
                { id: "delete", title: "Delete file", image: "trash", attributes: { destructive: true }, onPress: () => Alert.alert("Delete material?", file.filename, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { void run("deleteMaterial", { moduleFileId: file.id }); } }]) },
              ]} />
            </View>)}{!course.files.length ? <AppText size={14} muted>No files yet.</AppText> : null}</View></RNHostView>
          </Collapsible>
        </Host>
      </>}
      {tab === "deadlines" && <>
        <LinkButton label="+ Add deadline" onPress={() => edit("addAssignment", { courseId: id })} />
        <View>{course.assignments.map(a => <View key={a.id} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.line }}>
          <IconButton label={`${a.done ? "Reopen" : "Complete"}: ${a.title}`} icon={a.done ? "checkmark-circle" : "ellipse-outline"} disabled={busy} onPress={() => { void run("toggleAssignment", { assignmentId: a.id, done: a.done ? "false" : "true" }); }} />
          <View style={{ flex: 1 }}><AppText weight="600">{a.title}</AppText><AppText size={13} muted>{dateLabel(a.dueDate)}</AppText></View>
          <ActionMenu label={`Deadline actions: ${a.title}`} disabled={busy} items={[
            { id: "delete", title: "Delete deadline", image: "trash", attributes: { destructive: true }, onPress: () => Alert.alert("Delete deadline?", a.title, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { void run("deleteAssignment", { assignmentId: a.id, courseId: id }); } }]) },
          ]} />
        </View>)}</View>
        {!course.assignments.length ? <AppText size={14} muted>No deadlines.</AppText> : null}
      </>}
      {tab === "manage" && <>
        <Action secondary onPress={() => edit("updateCourse", { courseId: id, examDate: course.examDate, studyDays: course.studyDays.split(","), difficulty: String(course.difficulty) })}>Edit exam & study days</Action>
        <Action secondary onPress={() => edit("saveGrade", { courseId: id, grade: course.grade === null ? "" : String(course.grade) })}>Record exam grade</Action>
        <Action secondary busy={busy} onPress={() => { void run("setPassed", { courseId: id, passed: course.passed ? "0" : "1" }); }}>{course.passed ? "Remove manual pass" : "Mark course passed"}</Action>
        <Action secondary busy={busy} onPress={() => { void run("refreshPlan", { courseId: id }); }}>Repair study plan</Action>
        <LinkButton label="View all progress insights" onPress={() => router.push("/insights")} />
        <LinkButton label="Delete course" danger onPress={() => Alert.alert("Delete this course?", "This removes its topics, files, sessions and notes.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { if (busy) return; setBusy(true); void query.action("deleteCourse", { courseId: id }).then(() => router.replace("/(tabs)/courses")).catch(e => query.setError(e.message)).finally(() => setBusy(false)); } }])} />
      </>}
    </>}
    <Modal visible={!!selectedTopic} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setExpanded("")}>
      <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><AppText size={20} weight="700" style={{ flex: 1 }}>{selectedTopic?.title}</AppText><IconButton label="Close topic details" icon="close-outline" onPress={() => setExpanded("")} /></View>
        {selectedTopic && <>
          {selectedTopic.task ? <><AppText>{selectedTopic.task.instruction}</AppText><AppText size={14} muted>{selectedTopic.task.successCriteria}</AppText></> : null}
          <Chips options={[{ label: "Solid", value: "solid" }, { label: "Practice", value: "practice" }, { label: "Struggling", value: "struggling" }]} value={selectedTopic.confidence ?? ""} onChange={v => { void run("setConfidence", { topicId: selectedTopic.id, confidence: v === selectedTopic.confidence ? "" : v }); }} />
          {selectedTopic.note ? <AppText>{selectedTopic.note}</AppText> : <AppText muted>No notes yet.</AppText>}
          <LinkButton label={selectedTopic.note ? "Edit notes" : "Add notes"} onPress={() => { setExpanded(""); edit("saveNote", { topicId: selectedTopic.id, body: selectedTopic.note }); }} />
          {!course?.isPassed ? <LinkButton label="Study topic" onPress={() => { setExpanded(""); void run("startFocus", { courseId: id, topicId: selectedTopic.id, language: "en" }, true); }} /> : null}
          <LinkButton label="Delete topic" danger onPress={() => Alert.alert("Delete topic?", "Unfinished sessions and notes will be removed.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { void run("deleteTopic", { topicId: selectedTopic.id, courseId: id }); } }])} />
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
