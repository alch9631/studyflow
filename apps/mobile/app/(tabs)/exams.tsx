import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import type { ExamCourse, ExamData, PublishedExamOption } from "../../../../shared/mobileWorkspace";
import { Action, AppText, Card, ErrorMessage, useTheme } from "../../src/ui";
import { Chips, dateLabel, edit, Field, LinkButton, Page, ProgressBar, useMobileData } from "../../src/workspace";

export default function Exams() {
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
  return <Page title="Exams" subtitle="Your dates, preparation and results." query={query}>
    <Chips options={[{ label: `Remaining (${exams.length})`, value: "remaining" }, { label: "Results & grades", value: "results" }]} value={tab} onChange={setTab} />
    {!!notice && <AppText muted>{notice}</AppText>}
    {rebuild && <Card><AppText>Your dates saved. The study plan needs another rebuild.</AppText><Action busy={busy} onPress={() => { setBusy(true); void query.action("rebuildAfterExamSync").then(() => { setRebuild(false); return query.reload(); }).catch(e => query.setError(e.message)).finally(() => setBusy(false)); }}>Rebuild study plan</Action></Card>}
    {tab === "remaining" ? <>
      <Card><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <LinkButton label="‹" onPress={() => shiftMonth(-1)} /><AppText weight="700">{first.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</AppText><LinkButton label="›" onPress={() => shiftMonth(1)} /></View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <View key={i} style={{ width: "14.28%", alignItems: "center", paddingVertical: 5 }}><AppText size={12} muted>{d}</AppText></View>)}
          {Array.from({ length: 42 }, (_, i) => {
            const day = i - offset + 1; const valid = day > 0 && day <= last;
            const iso = `${month}-${String(day).padStart(2, "0")}`; const matches = exams.filter(e => e.currentDate === iso);
            return <Pressable key={i} disabled={!matches.length} accessibilityLabel={matches.length ? `${dateLabel(iso)}: ${matches.map(e => e.name).join(", ")}` : undefined} onPress={() => Alert.alert(dateLabel(iso), matches.map(e => e.name).join("\n"))} style={{ width: "14.28%", minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: matches.length ? theme.tint : "transparent" }}>
              <AppText size={14} weight={matches.length ? "700" : "400"} muted={!matches.length}>{valid ? day : " "}</AppText>{!!matches.length && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.brand }} />}
            </Pressable>;
          })}</View>
      </Card>
      <Action secondary busy={busy} onPress={() => { void refresh(); }}>Refresh university exam dates</Action>
      {query.data?.checkedAt && <AppText size={12} muted>{query.data.semester} · Checked {new Date(query.data.checkedAt).toLocaleString()}</AppText>}
      {!query.loading && !exams.length && <Card><AppText weight="600">No remaining exams.</AppText><LinkButton label="Add a course" onPress={() => edit("createCourse")} /></Card>}
      {exams.map(exam => {
        const c = query.data!.allCourses.find(c => c.id === exam.id)!;
        if (!c) return null;
        const days = Math.round((Date.parse(exam.currentDate) - Date.parse(query.data!.today)) / 86400_000);
        return <Card key={exam.id}><AppText size={20} weight="700">{exam.name}</AppText><AppText weight="600">{dateLabel(exam.currentDate)} · {days < 0 ? "Date passed" : days === 0 ? "Today" : `${days} days left`}</AppText>
          {exam.published && <AppText size={14} muted>{[exam.published.time, exam.published.location].filter(Boolean).join(" · ") || "Published university date"}</AppText>}
          <ProgressBar value={c?.topicsTotal ? c.topicsDone / c.topicsTotal * 100 : 0} label={`${c?.topicsDone ?? 0} of ${c?.topicsTotal ?? 0} topics covered`} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 18 }}><LinkButton label="Preparation" onPress={() => router.push(`/course/${exam.id}`)} /><LinkButton label="Edit date" onPress={() => edit("updateCourse", { courseId: c.id, examDate: c.examDate, studyDays: c.studyDays.split(","), difficulty: String(c.difficulty) })} /><LinkButton label="Record result" onPress={() => edit("saveGrade", { courseId: c.id, grade: c.grade === null ? "" : String(c.grade) })} /></View>
          <LinkButton label="Match a published exam" onPress={() => { if (!busy) void loadOptions(exam); }} />
        </Card>;
      })}
    </> : <>
      <AppText muted>German grades: 1.0 is best; 4.0 or better passes. You can also record an ungraded pass.</AppText>
      {query.data?.allCourses.map(c => <Card key={c.id}><AppText size={18} weight="700">{c.name}</AppText><AppText muted>{c.grade !== null ? `Grade ${c.grade.toFixed(1)}` : "No grade recorded"}{c.isPassed ? " · Passed" : " · Remaining"}{c.ects ? ` · ${c.ects} ECTS` : ""}</AppText>
        <LinkButton label="Edit grade" onPress={() => edit("saveGrade", { courseId: c.id, grade: c.grade === null ? "" : String(c.grade) })} />
        <LinkButton label={c.passed ? "Remove manual pass" : "Mark course passed"} onPress={() => Alert.alert(c.passed ? "Remove manual pass?" : "Mark this course passed?", "Your study schedule will update automatically. Any recorded grade is kept.", [{ text: "Cancel", style: "cancel" }, { text: "Save", onPress: () => { void query.action("setPassed", { courseId: c.id, passed: c.passed ? "0" : "1" }).then(query.reload).catch(e => query.setError(e.message)); } }])} />
      </Card>)}
      <Action secondary onPress={() => router.push("/insights")}>Open progress insights</Action>
    </>}
    <Modal visible={!!match} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMatch(null)}><ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled" style={{ backgroundColor: theme.background }}>
      <LinkButton label="Close" onPress={() => setMatch(null)} /><AppText size={24} weight="700">Match published exam</AppText><Field label="Search exams" value={search} onChange={setSearch} />
      {!options.length && <ErrorMessage message="Refresh university dates first to load published exams." />}
      {options.filter(o => o.title.toLowerCase().includes(search.toLowerCase())).map(o => <Card key={o.key}><AppText weight="600">{o.title}</AppText><AppText muted>{o.date ? dateLabel(o.date) : "Date unpublished"} {o.time}</AppText><LinkButton label="Choose exam" onPress={() => choose(o)} /></Card>)}
    </ScrollView></Modal>
  </Page>;
}
