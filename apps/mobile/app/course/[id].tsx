import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { CourseDetail, FormFields } from "../../../../shared/mobileWorkspace";
import { Action, AppText, Card, ErrorMessage, useTheme } from "../../src/ui";
import { Chips, dateLabel, edit, Field, LinkButton, Page, ProgressBar, useMobileData } from "../../src/workspace";
import { useSession } from "../../src/session";
import { openMaterial, pickAndUpload } from "../../src/materials";

type Plan = { fileId: string; id: string; outline: boolean; items: { id: string; title: string; reference?: string; instruction?: string }[] };
export default function Course() {
  const { id } = useLocalSearchParams<{ id: string }>(); const query = useMobileData<CourseDetail>(`courses/${encodeURIComponent(id)}`);
  const { session } = useSession(); const theme = useTheme(); const course = query.data;
  const [tab, setTab] = useState("progress"); const [busy, setBusy] = useState(false); const [expanded, setExpanded] = useState(""); const [search, setSearch] = useState(""); const [limit, setLimit] = useState(40);
  const [plan, setPlan] = useState<Plan | null>(null); const [selected, setSelected] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  async function run(name: string, fields: FormFields = {}, navigate = false) {
    if (busy) return; setBusy(true); query.setError(null);
    try { const result = await query.action(name, fields); if (navigate && result.blockId) router.push(`/focus/${result.blockId}`); else await query.reload(); }
    catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  async function upload() {
    if (!session || busy) return; setBusy(true); query.setError(null);
    try { if (await pickAndUpload(session, id, category)) await query.reload(); }
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
  const topics = course?.topics.filter(t => t.title.toLowerCase().includes(search.toLowerCase())) ?? [];
  return <Page back title={course?.name ?? "Course"} subtitle={course ? `Exam ${dateLabel(course.examDate)}${course.ects ? ` · ${course.ects} ECTS` : ""}` : undefined} query={query}>
    {course && <>
      <Card><ProgressBar value={roots.length ? roots.filter(t => t.done).length / roots.length * 100 : 0} label={`${roots.filter(t => t.done).length} of ${roots.length} topics covered`} />
        <AppText muted>{course.isPassed ? course.grade !== null ? `Passed · Grade ${course.grade.toFixed(1)}` : "Passed without a grade" : "Active module"}</AppText>
        {!course.isPassed && <Action busy={busy} onPress={() => { void run("startFocus", { courseId: id, language: "en" }, true); }}>Start studying</Action>}
      </Card>
      <Chips options={[{ label: "Progress", value: "progress" }, { label: "Materials", value: "materials" }, { label: "Deadlines", value: "deadlines" }, { label: "Manage", value: "manage" }]} value={tab} onChange={setTab} />
      {tab === "progress" && <>
        <View style={{ flexDirection: "row", gap: 20 }}><LinkButton label="Update progress" onPress={() => edit("applyProgress", { courseId: id })} /><LinkButton label="Practice recall" onPress={() => router.push({ pathname: "/practice", params: { courseId: id } })} /></View>
        <Field label="Find a topic" value={search} onChange={setSearch} />
        {topics.slice(0, limit).map(t => <Card key={t.id}>
          <Pressable onPress={() => setExpanded(expanded === t.id ? "" : t.id)} accessibilityRole="button" accessibilityState={{ expanded: expanded === t.id }}><AppText size={17} weight="600">{t.done ? "✓ " : ""}{t.title}</AppText><AppText size={12} muted>{t.parentTopicId ? "Study task" : "Topic"}{t.confidence ? ` · ${t.confidence}` : ""}</AppText></Pressable>
          <LinkButton label={t.done ? "Mark as not covered" : "Mark as covered"} onPress={() => { void run("toggleTopic", { courseId: id, topicId: t.id, done: t.done ? "false" : "true" }); }} />
          {expanded === t.id && <>
            {t.task && <><AppText>{t.task.instruction}</AppText><AppText size={14} muted>Goal: {t.task.successCriteria}</AppText></>}
            <Chips options={[{ label: "Solid", value: "solid" }, { label: "More practice", value: "practice" }, { label: "Struggling", value: "struggling" }]} value={t.confidence ?? ""} onChange={v => { void run("setConfidence", { topicId: t.id, confidence: v === t.confidence ? "" : v }); }} />
            {!!t.note && <AppText size={14}>{t.note}</AppText>}
            <LinkButton label={t.note ? "Edit notes" : "Add notes"} onPress={() => edit("saveNote", { topicId: t.id, body: t.note })} />
            {!course.isPassed && <LinkButton label="Study this topic" onPress={() => { void run("startFocus", { courseId: id, topicId: t.id, language: "en" }, true); }} />}
            <LinkButton label="Delete topic" danger onPress={() => Alert.alert("Delete this topic?", "Its unfinished sessions will be removed from the plan.", [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { void run("deleteTopic", { topicId: t.id, courseId: id }); } }])} />
          </>}
        </Card>)}
        {topics.length > limit && <LinkButton label="Show more topics" onPress={() => setLimit(n => n + 40)} />}
        {!topics.length && <AppText muted>Upload material or add a study task to get started.</AppText>}
        <Action secondary onPress={() => edit("saveStudyTask", { courseId: id })}>Add a study task</Action>
      </>}
      {tab === "materials" && <>
        <AppText muted>Add scripts, exercises, slides, past papers or notes from Files or iCloud Drive.</AppText>
        <Chips value={category} onChange={setCategory} options={[{ label: "Auto detect", value: "" }, { label: "Script", value: "skript" }, { label: "Exercises", value: "uebung" }, { label: "Past paper", value: "altklausur" }, { label: "Slides", value: "slides" }, { label: "Other", value: "sonstiges" }]} />
        <Action busy={busy} onPress={() => { void upload(); }}>Upload a file</Action>
        {course.files.map(file => <Card key={file.id}><AppText weight="700">{file.filename}</AppText><AppText size={12} muted>{file.category ?? "Material"} · {(file.sizeBytes / 1024).toFixed(0)} KB</AppText>{!!file.summary && <AppText size={14}>{file.summary}</AppText>}
          <LinkButton label="Open original" onPress={() => { if (!session || busy) return; setBusy(true); void openMaterial(session, file.id, file.filename).catch(e => query.setError(e.message)).finally(() => setBusy(false)); }} />
          <Action secondary busy={busy} onPress={() => { void prepare(file.id); }}>Build study plan from material</Action>
          <LinkButton label="Delete file" danger onPress={() => Alert.alert("Delete this material?", file.filename, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { void run("deleteMaterial", { moduleFileId: file.id }); } }])} />
        </Card>)}
      </>}
      {tab === "deadlines" && <>
        <Action secondary onPress={() => edit("addAssignment", { courseId: id })}>Add a deadline</Action>
        {course.assignments.map(a => <Card key={a.id}><AppText weight="600">{a.done ? "✓ " : ""}{a.title}</AppText><AppText muted>Due {dateLabel(a.dueDate)}</AppText><LinkButton label={a.done ? "Reopen" : "Mark complete"} onPress={() => { void run("toggleAssignment", { assignmentId: a.id, done: a.done ? "false" : "true" }); }} /><LinkButton label="Delete deadline" danger onPress={() => Alert.alert("Delete deadline?", a.title, [{ text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { void run("deleteAssignment", { assignmentId: a.id }); } }])} /></Card>)}
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
    <Modal visible={!!plan} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPlan(null)}><ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={{ padding: 24, gap: 16 }}>
      <LinkButton label="Close" onPress={() => setPlan(null)} /><AppText size={25} weight="700">Review study plan</AppText><AppText muted>Select the units to add. Existing topics are kept.</AppText>
      {plan?.items.map(item => <Pressable key={item.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(item.id) }} onPress={() => setSelected(ids => ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id])}><Card><AppText weight="600">{selected.includes(item.id) ? "✓ " : "○ "}{item.title}</AppText><AppText size={13} muted>{item.reference ?? item.instruction}</AppText></Card></Pressable>)}
      <ErrorMessage message={query.error} /><Action busy={busy} disabled={!selected.length} onPress={() => { void acceptPlan(); }}>Add selected units</Action>
    </ScrollView></Modal>
  </Page>;
}
