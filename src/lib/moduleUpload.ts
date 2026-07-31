/**
 * Safety rules for analysing an uploaded module file into a course's topics.
 *
 * Uploading a file runs the material through the AI and reconciles the course's
 * topic set against the result. That is the most destructive thing a student can
 * trigger by accident, because deleting a Topic row also:
 *   • cascade-deletes its Note (prisma: Note.topicId onDelete Cascade),
 *   • discards its `done` flag, `confidence` rating and generated `questions`,
 *   • orphans every completed StudyBlock that referenced it — StudyBlock.topicId
 *     has no FK to Topic, so those rows survive pointing at a dead id and the
 *     completion fold silently stops crediting the work they represent.
 *
 * These two decisions are kept here as pure functions so the rules are pinned by
 * tests rather than by a comment inside a server action.
 */

/** How an upload reconciles against the course's existing topics. */
export type UploadMode = "append" | "replace";

/**
 * Resolve the requested upload mode.
 *
 * The destructive mode must be asked for EXPLICITLY. A caller that says nothing
 * gets the additive path — a course accumulates materials (script, exercise
 * sheets, past papers), so a newly uploaded file is an addition to the course,
 * not a redefinition of it. The one uploader in the app posts no mode field at
 * all, and defaulting that to "replace" meant every real upload wiped the
 * student's topics, notes and progress.
 */
export function resolveUploadMode(raw: string | null | undefined): UploadMode {
  return typeof raw === "string" && raw.trim() === "replace" ? "replace" : "append";
}

/** The bits of a Topic row that say whether a student has invested in it. */
export type TopicRemovalCandidate = {
  id: string;
  done?: boolean | null;
  confidence?: string | null;
};

/**
 * Of the topics a replace would drop, decide which may actually be deleted.
 *
 * A topic the student marked done, rated, wrote a note on, or already studied
 * carries history that the analysis of a single file knows nothing about, so it
 * is never deleted — only topics that are purely AI-derived and untouched are.
 */
export function topicIdsSafeToDelete(
  dropped: TopicRemovalCandidate[],
  notedTopicIds: Iterable<string>,
  studiedTopicIds: Iterable<string>,
): string[] {
  const keep = new Set<string>([...notedTopicIds, ...studiedTopicIds]);
  return dropped
    .filter((t) => !keep.has(t.id) && !t.done && t.confidence == null)
    .map((t) => t.id);
}
