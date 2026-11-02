/** JSON contracts shared by the native app and the server. No framework imports. */
export type MobileTask = {
  instruction: string;
  successCriteria: string;
  sourceRef: string;
  sourceExcerpt?: string;
  sourceUrl: string | null;
  sourceFileId: string | null;
  checkQuestion: string;
  answerKey: string;
};

export type MobileBlock = {
  id: string;
  topicId: string;
  title: string;
  minutes: number;
  completed: boolean;
  kind: string;
  course: { id: string; name: string };
  task: MobileTask | null;
  progress: { response: string; elapsedSeconds: number; updatedAt: string; sessionMinutes?: number } | null;
  note?: string;
  notes?: MobileFocusNote[];
  fileAvailable?: boolean;
};

export type MobileFocusNote = { id: string; body: string; createdAt: string; updatedAt: string };

export type MobileToday = {
  date: string;
  user: { name: string | null; email: string };
  blocks: MobileBlock[];
  summary: { plannedMinutes: number; completedMinutes: number; completedCount: number; totalCount: number };
  nextExam: { name: string; date: string } | null;
  nextBlockId?: string;
  resumeBlock?: MobileBlock | null;
  planHealth?: {
    overdueSessions: number; overdueMinutes: number; availableMinutes: number; overloaded: boolean; undoAvailable: boolean;
    previews: Record<"protect" | "move" | "lighter", { beforeCount: number; afterCount: number; moved: number; afterPaceMin: number; examReach: string }>;
    nextDays: { date: string; minutes: number; count: number }[];
  };
  assignments?: { id: string; title: string; dueDate: string; done: boolean; course: { id: string; name: string } }[];
  lectures?: { id: string; title: string; startMin: number; endMin: number; location: string | null }[];
};

export type MobileSession = { token: string; expiresAt: string; userId: string };
/** A device checkpoint also holds pause/check state absent from the server copy. */
export function preferredProgress<L extends { updatedAt: string }, R extends { updatedAt: string }>(local: L | null, remote: R | null | undefined): L | R | null {
  return local && (!remote || local.updatedAt >= remote.updatedAt) ? local : remote ?? null;
}
export type MobileProgressInput = {
  topicId: string;
  response: string;
  elapsedSeconds: number;
  updatedAt: string;
  sessionMinutes?: number;
};
export type MobileFinishInput = { topicId: string; kind?: string; response: string; elapsedSeconds: number };
export type MobileResultInput = {
  topicId: string;
  response: string;
  actualMinutes: number;
  checked: boolean;
  outcome: "complete" | "practice";
};

/** A wall-clock anchor keeps a timer correct when iOS suspends JavaScript. */
export function elapsedAt(savedSeconds: number, startedAt: number | null, now: number): number {
  return Math.min(36000, Math.max(0, savedSeconds + (startedAt === null ? 0 : Math.floor(Math.max(0, now - startedAt) / 1000))));
}

export function formatTimer(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60).toString().padStart(2, "0")}:${(safe % 60).toString().padStart(2, "0")}`;
}
