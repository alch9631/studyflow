import type { MobileBlock, MobileFocusNote, MobileProgressInput, MobileTask } from "../../../shared/mobile";
import type { CalendarData, CatalogItem, CourseDetail, PreferencesData } from "../../../shared/mobileWorkspace";

export const DEMO_SERVER = "demo://studyflow";
export type DemoBlock = MobileBlock & { date: string; start: number | null; end: number | null; actualMinutes: number; outcome?: "session" | "complete" | "practice" };
export type DemoState = {
  today: string; sequence: number; courses: CourseDetail[]; blocks: DemoBlock[];
  progress: Record<string, MobileProgressInput>; notes: Record<string, MobileFocusNote[]>;
  preferences: PreferencesData; lectures: CalendarData["lectures"]; catalog: CatalogItem[];
  undo: DemoBlock[] | null;
};

export const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
export function demoToday() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(part => parts.find(value => value.type === part)!.value).join("-");
}
export const copyDemo = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function task(instruction: string, question: string, answer: string, excerpt: string): MobileTask {
  return { instruction, successCriteria: "I can explain the idea in my own words and have checked my answer.",
    sourceRef: "Sample study notes", sourceExcerpt: excerpt, sourceUrl: null, sourceFileId: null, checkQuestion: question, answerKey: answer };
}
export function createDemoState(today = demoToday()): DemoState {
  const courses: CourseDetail[] = [
    { id: "demo-maths", name: "Linear Algebra", examDate: shiftDay(today, 14), ects: 6, grade: null, passed: false, isPassed: false, difficulty: 3, studyDays: "1,2,3,4,5",
      topics: [
        { id: "demo-vectors", title: "Vectors and linear combinations", done: false, confidence: "practice", parentTopicId: null, note: "A linear combination scales vectors and adds the results.", questions: [],
          task: task("Recall how to form a linear combination. Work through 2u + 3v with u = (1, 0) and v = (0, 1).", "What is 2u + 3v?", "(2, 3)", "A linear combination of u and v has the form au + bv. For the standard basis, the coefficients give the resulting coordinates.") },
        { id: "demo-matrices", title: "Matrix multiplication", done: false, confidence: null, parentTopicId: null, note: "", questions: [],
          task: task("Read the row-by-column rule, then calculate one entry of a matrix product without looking at your notes.", "How do you find entry (i, j) of AB?", "Take the dot product of row i of A with column j of B.", "The number of columns of A must equal the number of rows of B. Each entry of AB is a row-column dot product.") },
      ], files: [], assignments: [{ id: "demo-deadline", title: "Problem sheet 3", dueDate: shiftDay(today, 2), done: false }] },
    { id: "demo-algorithms", name: "Algorithms & Data Structures", examDate: shiftDay(today, 28), ects: 6, grade: null, passed: false, isPassed: false, difficulty: 3, studyDays: "1,2,3,4,5",
      topics: [{ id: "demo-search", title: "Binary search", done: false, confidence: "solid", parentTopicId: null, note: "", questions: [],
        task: task("Trace binary search on a sorted array of eight numbers. Explain why the search interval halves at each step.", "What is the time complexity of binary search?", "O(log n)", "Binary search compares the target to the middle value and discards half the remaining interval after each comparison.") }], files: [], assignments: [] },
    { id: "demo-programming", name: "Programming Fundamentals", examDate: shiftDay(today, -30), ects: 6, grade: 2, passed: false, isPassed: true, difficulty: 2, studyDays: "1,2,3,4,5",
      topics: [{ id: "demo-functions", title: "Functions and variables", done: true, confidence: "solid", parentTopicId: null, note: "Small functions are easier to test and reuse.", questions: [], task: null }], files: [], assignments: [] },
  ];
  const block = (id: string, course: CourseDetail, topicIndex: number, date: string, minutes: number, completed = false, kind = "study"): DemoBlock => {
    const topic = course.topics[topicIndex];
    return { id, course: { id: course.id, name: course.name }, topicId: topic.id, title: topic.title, task: topic.task,
      minutes, completed, kind, progress: null, date, start: null, end: null, actualMinutes: completed ? minutes : 0 };
  };
  const blocks = [
    block("demo-review", courses[0], 0, today, 10, false, "review"),
    block("demo-study", courses[0], 1, today, 30),
    block("demo-done", courses[1], 0, today, 15, true),
    block("demo-missed", courses[1], 0, shiftDay(today, -1), 20),
    block("demo-tomorrow", courses[1], 0, shiftDay(today, 1), 30),
    block("demo-history-1", courses[0], 0, shiftDay(today, -2), 25, true),
    block("demo-history-2", courses[2], 0, shiftDay(today, -3), 30, true),
  ];
  return { today, sequence: 0, courses, blocks, progress: {}, notes: {}, undo: null,
    preferences: { user: { name: "Alex Demo", email: "demo@studyflow.example" }, preferences: { dayStartMin: 540, dayEndMin: 1080, energy: "morning", dailyBudgetMin: 90 }, calendarToken: "" },
    lectures: [{ id: "demo-lecture", title: "Algorithms lecture", weekday: new Date(`${today}T12:00:00Z`).getUTCDay(), startMin: 540, endMin: 630, location: "Sample lecture room", courseId: "demo-algorithms" }],
    catalog: [{ id: "demo-catalog-calculus", code: "DEMO-101", name: "Calculus I", section: "Mathematics", ects: 6, university: "Demo university", program: "Engineering", examDate: shiftDay(today, 42), content: "Limits, derivatives, and integrals." },
      { id: "demo-catalog-physics", code: "DEMO-102", name: "Physics I", section: "Science", ects: 6, university: "Demo university", program: "Engineering", examDate: shiftDay(today, 49), content: "Motion, forces, energy, and momentum." }],
  };
}
