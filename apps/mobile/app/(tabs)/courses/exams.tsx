import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import type { CourseSummary, ExamCourse, ExamData, PublishedExamOption } from "../../../../../shared/mobileWorkspace";
import { Action, AppText, Card, ErrorMessage, IconButton, useTheme } from "../../../src/ui";
import { dateLabel, edit, Field, LinkButton, Page, ProgressBar, useMobileData } from "../../../src/workspace";
import { useSession } from "../../../src/session";
import { SwipeRow, useCloseSwipeRow } from "../../../src/swipe-row";
import { SectionTabs } from "../../../src/section-tabs";
import { ExamNote, type SavedExamNote } from "../../../src/exam-note";

export default function Exams() {
  const { isDemo } = useSession();
  const query = useMobileData<ExamData>("exams");
  const theme = useTheme();
  const [tab, setTab] = useState("remaining");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [match, setMatch] = useState<ExamCourse | null>(null);
  const [options, setOptions] = useState<PublishedExamOption[]>([]);
  const [search, setSearch] = useState("");
  const [rebuild, setRebuild] = useState(false);
  const [details, setDetails] = useState<{ course: CourseSummary; exam?: ExamCourse } | null>(null);
  const [noteCourse, setNoteCourse] = useState<CourseSummary | null>(null);
  const [savedNotes, setSavedNotes] = useState<Record<string, SavedExamNote>>({});
  const closeSwipeRow = useCloseSwipeRow();
  function openNote(course: CourseSummary) {
    closeSwipeRow();
    const saved = savedNotes[course.id];
    setNoteCourse(saved && (!course.examNoteUpdatedAt || (saved.updatedAt && saved.updatedAt > course.examNoteUpdatedAt))
      ? { ...course, examNote: saved.body, examNoteUpdatedAt: saved.updatedAt } : course);
  }
  function editDate(course: CourseSummary) {
    closeSwipeRow(); setDetails(null);
    edit("updateCourse", { courseId: course.id, examDate: course.examDate, studyDays: course.studyDays.split(","), difficulty: String(course.difficulty) });
  }
  function editGrade(course: CourseSummary) {
    closeSwipeRow(); setDetails(null);
    edit("saveGrade", { courseId: course.id, grade: course.grade === null ? "" : String(course.grade) });
  }
  async function setPassed(course: CourseSummary, passed: boolean) {
    if (busy) return;
    setBusy(true); query.setError(null); setDetails(null);
    try {
      await query.action("setPassed", { courseId: course.id, passed: passed ? "1" : "0", ...(!passed ? { clearPassingGrade: "1" } : {}) });
      await query.reload();
    } catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  function unmark(course: CourseSummary) {
    if (busy) return;
    Alert.alert("Unmark as passed?", course.grade !== null && course.grade <= 4
      ? "This clears the passing grade and returns the module to remaining exams."
      : "This returns the module to remaining exams and updates your study plan.",
    [{ text: "Cancel", style: "cancel" }, { text: "Unmark passed", style: "destructive", onPress: () => { void setPassed(course, false); } }]);
  }
  async function refresh() {
    setBusy(true); query.setError(null); setNotice("");
    try { const result = await query.action("refreshExams"); setRebuild(result.planRebuilt === false); setNotice(`${result.updated ?? 0} exam dates updated.`); await query.reload(); }
    catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  async function loadOptions(course: ExamCourse) {
    setBusy(true); query.setError(null);
    try { const result = await query.action<{ exams: PublishedExamOption[] }>("examOptions", { courseId: course.id }); setOptions(result.exams); setSearch(""); setMatch(course); }
    catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  function choose(exam: PublishedExamOption) {
    if (!match || !exam.date) return;
    const course = match;
    Alert.alert("Use this published exam?", `${course.name}\n${dateLabel(exam.date)} ${exam.time}`, [{ text: "Cancel", style: "cancel" }, { text: "Use exam", onPress: () => { void (async () => {
      setMatch(null); setBusy(true);
      try { const result = await query.action("syncExams", { changes: JSON.stringify([{ courseId: course.id, expectedDate: course.currentDate, examKey: exam.key }]) }); setRebuild(result.planRebuilt === false); await query.reload(); }
      catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
    })(); } }]);
  }
  function shiftMonth(delta: number) { const date = new Date(month + "-01T12:00:00Z"); date.setUTCMonth(date.getUTCMonth() + delta); setMonth(date.toISOString().slice(0, 7)); }
  const first = new Date(month + "-01T12:00:00Z");
  const offset = (first.getUTCDay() + 6) % 7;
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const exams = query.data?.courses ?? [];
  return <Page back tabPage title="Exams" query={query} actions={!isDemo ? <IconButton label="Refresh university exam dates" icon="refresh-outline" busy={busy} onPress={() => { void refresh(); }} /> : undefined}>
    <SectionTabs options={[{ label: `Remaining (${exams.length})`, value: "remaining" }, { label: "Results & grades", value: "results" }]} value={tab} onChange={value => { closeSwipeRow(); setTab(value); }} />
    {!!notice && <AppText muted>{notice}</AppText>}
    {rebuild && <Card><AppText>Your dates saved. The study plan needs another rebuild.</AppText><Action busy={busy} onPress={() => { setBusy(true); void query.action("rebuildAfterExamSync").then(() => { setRebuild(false); return query.reload(); }).catch(e => query.setError(e.message)).finally(() => setBusy(false)); }}>Rebuild study plan</Action></Card>}
    {tab === "remaining" ? <>
      <Card glass><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <IconButton label="Previous month" icon="chevron-back-outline" onPress={() => shiftMonth(-1)} /><AppText weight="700" style={{ flex: 1, textAlign: "center" }}>{first.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</AppText><IconButton label="Next month" icon="chevron-forward-outline" onPress={() => shiftMonth(1)} /></View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <View key={i} style={{ width: "14.28%", alignItems: "center", paddingVertical: 5 }}><AppText size={12} muted>{d}</AppText></View>)}
          {Array.from({ length: Math.ceil((offset + last) / 7) * 7 }, (_, i) => {
            const day = i - offset + 1; const valid = day > 0 && day <= last;
            const iso = `${month}-${String(day).padStart(2, "0")}`; const matches = exams.filter(e => e.currentDate === iso);
            return <Pressable key={i} disabled={!matches.length} accessibilityLabel={matches.length ? `${dateLabel(iso)}: ${matches.map(e => e.name).join(", ")}` : undefined} onPress={() => Alert.alert(dateLabel(iso), matches.map(e => e.name).join("\n"))} style={{ width: "14.28%", minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: matches.length ? theme.tint : "transparent" }}>
              <AppText size={14} weight={matches.length ? "700" : "400"} muted={!matches.length}>{valid ? day : " "}</AppText>{!!matches.length && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.brand }} />}
            </Pressable>;
          })}</View>
      </Card>
      {!query.loading && !query.error && !exams.length && <Card><AppText weight="600">No remaining exams.</AppText><LinkButton label="Add a course" onPress={() => edit("createCourse")} /></Card>}
      {exams.map(exam => {
        const c = query.data!.allCourses.find(c => c.id === exam.id)!;
        if (!c) return null;
        const days = Math.round((Date.parse(exam.currentDate) - Date.parse(query.data!.today)) / 86400_000);
        return <SwipeRow key={exam.id} disabled={busy}
          leading={{ label: "Mark done", icon: "checkmark-outline", onPress: () => { void setPassed(c, true); } }}
          trailing={{ label: "Edit date", icon: "calendar-outline", onPress: () => editDate(c) }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit exam note: ${exam.name}`} accessibilityHint="Long press for exam options" disabled={busy} onPress={() => openNote(c)} onLongPress={() => { closeSwipeRow(); setDetails({ course: c, exam }); }}>
          <Card glass>
          <AppText selectable={false} size={18} weight="700">{exam.name}</AppText>
          <AppText selectable={false} weight="600">{dateLabel(exam.currentDate)} · {days < 0 ? "Date passed" : days === 0 ? "Today" : `${days} days left`}</AppText>
          <ProgressBar value={c.topicsTotal ? c.topicsDone / c.topicsTotal * 100 : 0} label={`${c.topicsDone}/${c.topicsTotal} covered`} />
        </Card></Pressable></SwipeRow>;
      })}
    </> : <>
      {!query.loading && !query.error && !query.data?.results.length && <AppText muted>No results yet.</AppText>}
      {query.data?.results.map(c => <SwipeRow key={c.id} disabled={busy}
        leading={{ label: "Edit grade", icon: "create-outline", onPress: () => editGrade(c) }}
        trailing={c.isPassed ? { label: "Unmark passed", icon: "arrow-undo-outline", destructive: true, onPress: () => unmark(c) } : undefined}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit exam note: ${c.name}`} accessibilityHint="Long press for result options" disabled={busy} onPress={() => openNote(c)} onLongPress={() => { closeSwipeRow(); setDetails({ course: c }); }}>
        <Card glass><AppText selectable={false} size={18} weight="700">{c.name}</AppText>
        <AppText selectable={false} size={14}>{c.grade !== null ? `Grade ${c.grade.toFixed(1)}` : "Passed"}{!c.isPassed ? " · Not passed" : ""}{c.ects ? ` · ${c.ects} ECTS` : ""}</AppText></Card>
      </Pressable></SwipeRow>)}
      <Action secondary onPress={() => router.navigate("/insights")}>Open progress insights</Action>
    </>}
    {noteCourse && <ExamNote key={noteCourse.id} course={noteCourse} onClose={() => setNoteCourse(null)} onSave={async (body, updatedAt) => {
      try {
        const { note } = await query.action<{ note: SavedExamNote }>("saveExamNote", { courseId: noteCourse.id, body, updatedAt });
        setSavedNotes(current => ({ ...current, [noteCourse.id]: note }));
        await query.reload();
        return note;
      } catch (e) {
        // Keep this editor's draft/revision, but let reopening load the latest note.
        await query.reload();
        throw e;
      }
    }} />}
    <Modal visible={!!details} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setDetails(null)}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }} style={{ backgroundColor: theme.background }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><AppText size={22} weight="700" style={{ flex: 1 }}>{details?.course.name}</AppText><IconButton glass label="Close exam information" icon="close-outline" onPress={() => setDetails(null)} /></View>
        {details && <>
          <AppText>Exam {dateLabel(details.course.examDate)}</AppText>
          {details.exam?.published && <AppText size={14} muted>{[details.exam.published.time, details.exam.published.location].filter(Boolean).join(" · ") || "Published university date"}</AppText>}
          <LinkButton label="Edit date" onPress={() => editDate(details.course)} />
          <LinkButton label="Edit grade" onPress={() => editGrade(details.course)} />
          <LinkButton label={details.course.isPassed ? "Unmark passed" : "Mark done"} onPress={() => details.course.isPassed ? unmark(details.course) : void setPassed(details.course, true)} />
          {!isDemo && details.exam && <LinkButton label="Match published exam" onPress={() => { const exam = details.exam!; setDetails(null); void loadOptions(exam); }} />}
        </>}
      </ScrollView>
    </Modal>
    <Modal visible={!!match} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMatch(null)}><ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled" style={{ backgroundColor: theme.background }}>
      <LinkButton label="Close" onPress={() => setMatch(null)} /><AppText size={24} weight="700">Match published exam</AppText><Field label="Search exams" value={search} onChange={setSearch} />
      {!options.length && <ErrorMessage message="Refresh university dates first to load published exams." />}
      {options.filter(o => o.title.toLowerCase().includes(search.toLowerCase())).map(o => <Card key={o.key}><AppText weight="600">{o.title}</AppText><AppText muted>{o.date ? dateLabel(o.date) : "Date unpublished"} {o.time}</AppText><LinkButton label="Choose exam" onPress={() => choose(o)} /></Card>)}
    </ScrollView></Modal>
  </Page>;
}
