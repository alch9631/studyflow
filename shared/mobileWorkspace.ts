import type { MobileTask } from "./mobile";

export type CourseSummary = {
  id: string; name: string; examDate: string; grade: number | null; passed: boolean; isPassed: boolean;
  ects: number | null; difficulty: number; studyDays: string; topicsDone: number; topicsTotal: number;
  remainingMinutes: number; completedMinutes: number; loggedMinutes: number;
};
export type CourseDetail = Pick<CourseSummary, "id" | "name" | "examDate" | "grade" | "passed" | "isPassed" | "ects" | "difficulty" | "studyDays"> & {
  topics: { id: string; title: string; done: boolean; confidence: string | null; parentTopicId: string | null; task: MobileTask | null; note: string; questions: string[] }[];
  files: { id: string; filename: string; category: string | null; sizeBytes: number; summary: string; createdAt: string }[];
  assignments: { id: string; title: string; dueDate: string; done: boolean }[];
};
export type PublishedExamOption = { key: string; title: string; date: string | null; time: string };
export type ExamCourse = {
  id: string; name: string; currentDate: string; suggestedKey: string; matchedKey: string;
  hint: "matched" | "ambiguous" | "individual" | "unpublished" | "unmatched";
  published: { title: string; date: string | null; time: string; location: string } | null;
};
export type ExamData = { today: string; semester: string | null; checkedAt: string | null; courses: ExamCourse[]; results: CourseSummary[]; allCourses: CourseSummary[] };
export type InsightsData = {
  today: string; hasData: boolean; loggedMinutes: number; totalPlannedMinutes: number; totalCompletedMinutes: number;
  currentStreak: number; longestStreak: number; weekPlanned: number; weekDone: number; weekPct: number;
  duePct: number; consistency: number; activeDays: number; upcomingWorkload: number; completedModules: number;
  grades: { gpa: number | null; lpEarned: number; gradedCount: number };
  dailyLoad: { key: string; label: string; min: number }[];
  evidence: { attempts: number; goalsMet: number; practiceNeeded: number; laterRecall: number };
  heatmap: { date: string; min: number; future: boolean; examWeek: boolean }[];
  courses: { id: string; name: string; grade: number | null; passed?: boolean; ects: number | null; examDate: string; topicsTotal: number; topicsDone: number; progressPct: number; actualMinutes: number; remainingStudyMinutes: number; daysToExam: number; pressurePerDay: number }[];
};
export type CalendarData = {
  today: string; days: string[];
  blocks: { id: string; date: string; topicTitle: string; topicId: string; kind: string; minutes: number; completed: boolean; start: number | null; end: number | null; course: { id: string; name: string } }[];
  lectures: { id: string; title: string; weekday: number; startMin: number; endMin: number; location: string | null; courseId: string | null }[];
  exams: { id: string; name: string; date: string }[];
};
export type PreferencesData = { user: { name: string | null; email: string }; preferences: { dayStartMin: number; dayEndMin: number; energy: string; dailyBudgetMin: number }; calendarToken: string };
export type CatalogItem = { id: string; name: string; code: string; section: string; ects: number; university: string; program: string; examDate: string | null; content: string };
export type FormFields = Record<string, string | string[]>;
export type ActionResult = { ok?: boolean; redirect?: string; message?: string | null; blockId?: string; updated?: number; planRebuilt?: boolean };
