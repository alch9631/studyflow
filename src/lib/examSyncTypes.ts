export const TUHH_EXAM_URL = "https://intranet.tuhh.de/stud/pruefung/index.php?Lang=de";

export type PublishedExam = {
  key: string;
  title: string;
  names: string[];
  date: string | null;
  time: string;
  location: string;
  note: string;
  individualAppointment: boolean;
};

export type ExamSchedule = {
  semester: string;
  checkedAt: string;
  exams: PublishedExam[];
};

export type ExamSyncCourse = {
  id: string;
  name: string;
  currentDate: string;
  suggestedKey: string;
  hint: "matched" | "ambiguous" | "individual" | "unpublished" | "unmatched";
};

export type ExamSyncPreview = {
  semester: string;
  checkedAt: string;
  exams: PublishedExam[];
  courses: ExamSyncCourse[];
};

export type ExamDateChange = {
  courseId: string;
  expectedDate: string;
  examKey: string;
};

export type ExamSyncError = "source-unavailable" | "conflict" | "invalid" | "rate-limited" | "save-error";

export type ExamPreviewResult =
  | { ok: true; preview: ExamSyncPreview }
  | { ok: false; reason: ExamSyncError };

export type ExamApplyResult =
  | { ok: true; updated: number; planRebuilt: boolean; checkedAt: string }
  | { ok: false; reason: ExamSyncError };
