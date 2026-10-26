import type { StudyTask, StudyProgress } from "@/lib/studyTask";

/** The single block Focus mode works on (serializable across the boundary). */
export type FocusBlock = {
  id: string;
  topicTitle: string;
  minutes: number;
  completed: boolean;
  kind: string;
  course: { id: string; name: string };
  topicId: string;
  task: StudyTask | null;
  progress?: StudyProgress | null;
  lastAttempt?: string | null;
  fileAvailable: boolean;
  /** Existing course notes remain available alongside the session draft. */
  note?: string | null;
};
