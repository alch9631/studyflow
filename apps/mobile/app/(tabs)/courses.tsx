import { useState } from "react";
import { router } from "expo-router";
import type { CourseSummary } from "../../../../shared/mobileWorkspace";
import { Action, AppText, Card } from "../../src/ui";
import { Chips, dateLabel, edit, Field, LinkButton, minutesLabel, Page, ProgressBar, useMobileData } from "../../src/workspace";

export default function Courses() {
  const query = useMobileData<CourseSummary[]>("courses"); const [tab, setTab] = useState("active"); const [search, setSearch] = useState("");
  const all = query.data ?? []; const list = all.filter(c => c.isPassed === (tab === "passed") && c.name.toLowerCase().includes(search.toLowerCase()));
  return <Page title="Courses" subtitle="Your modules, materials and preparation." query={query}>
    <Chips options={[{ label: `Active (${all.filter(c => !c.isPassed).length})`, value: "active" }, { label: `Passed (${all.filter(c => c.isPassed).length})`, value: "passed" }]} value={tab} onChange={setTab} />
    <Field label="Search courses" value={search} onChange={setSearch} />
    {list.map(c => <Card key={c.id}><AppText size={21} weight="700">{c.name}</AppText><AppText muted>{c.isPassed ? c.grade !== null ? `Passed · Grade ${c.grade.toFixed(1)}` : "Passed without grade" : `Exam ${dateLabel(c.examDate)}`}{c.ects ? ` · ${c.ects} ECTS` : ""}</AppText>
      <ProgressBar value={c.topicsTotal ? c.topicsDone / c.topicsTotal * 100 : 0} label={`${c.topicsDone} of ${c.topicsTotal} topics covered`} /><AppText size={13} muted>{minutesLabel(c.loggedMinutes)} focus time · {minutesLabel(c.remainingMinutes)} remaining</AppText><LinkButton label="Open course" onPress={() => router.push(`/course/${c.id}`)} />
    </Card>)}
    {!query.loading && !list.length && <AppText muted>{tab === "passed" ? "Passed modules will appear here." : "Add your courses to build a study plan."}</AppText>}
    <Action onPress={() => edit("createCourse")}>Add a course</Action><Action secondary onPress={() => router.push("/catalog")}>Browse university modules</Action><LinkButton label="Import a syllabus" onPress={() => edit("importSyllabus")} />
  </Page>;
}
