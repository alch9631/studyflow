"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@/components/i18n/messages";
import { saveNote, deleteNote } from "../actions";

/**
 * Per-topic study note: a collapsible scratchpad ("prof emphasized X", "see
 * slide 23", a formula to remember). Autosaves a debounced write while you type
 * and flushes on blur, so nothing is lost — there's no Save button to forget.
 *
 * Optimistic by design: the textarea is local state (the source of truth while
 * editing), so typing is instant and `saveNote` persists in the background. The
 * live status line + the summary dot reflect what's actually on the server.
 */

const MAX_LENGTH = 10_000; // mirrors LIMITS.MAX_NOTE_LENGTH (server-enforced)
const DEBOUNCE_MS = 900;

type Status = "idle" | "dirty" | "saving" | "saved" | "error";

const STATUS_KEY: Record<Status, MessageKey> = {
  idle: "courseDetail.noteStatusIdle",
  dirty: "courseDetail.noteStatusDirty",
  saving: "courseDetail.noteStatusSaving",
  saved: "courseDetail.noteStatusSaved",
  error: "courseDetail.noteStatusError",
};

export default function NoteEditor({
  topicId,
  topicTitle,
  initialBody,
}: {
  topicId: string;
  topicTitle: string;
  initialBody: string;
}) {
  const [body, setBody] = useState(initialBody);
  const [status, setStatus] = useState<Status>(initialBody ? "saved" : "idle");
  const savedRef = useRef(initialBody);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusId = useId();
  const { toast } = useToast();
  const t = useT();

  const hasNote = body.trim().length > 0;
  const nearLimit = body.length > MAX_LENGTH * 0.9;

  const persist = useCallback(
    async (value: string) => {
      if (value === savedRef.current) return;
      setStatus("saving");
      const fd = new FormData();
      fd.set("topicId", topicId);
      fd.set("body", value);
      try {
        await saveNote(fd);
        savedRef.current = value;
        // Don't clobber a "saved" with stale state if the user kept typing.
        setStatus((s) => (s === "saving" ? "saved" : s));
      } catch {
        setStatus("error");
      }
    },
    [topicId],
  );

  function onChange(value: string) {
    setBody(value);
    setStatus(value === savedRef.current ? "saved" : "dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void persist(value), DEBOUNCE_MS);
  }

  // Flush a pending autosave immediately (e.g. on blur / before leaving).
  function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void persist(body);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function clear() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setBody("");
    setStatus("saving");
    const fd = new FormData();
    fd.set("topicId", topicId);
    try {
      await deleteNote(fd);
      savedRef.current = "";
      setStatus("idle");
      toast(t("courseDetail.noteCleared"), "success");
    } catch {
      setStatus("error");
      toast(t("courseDetail.noteClearError"), "error");
    }
  }

  return (
    <details className="ml-7 mt-1">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-xs text-brand">
        <span aria-hidden="true">📝</span>
        {t("courseDetail.note")}
        {hasNote && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-brand"
            aria-label={t("courseDetail.noteHasNote")}
            title={t("courseDetail.noteHasNoteTitle")}
          />
        )}
      </summary>
      <div className="mt-2 space-y-1.5">
        <Textarea
          aria-label={t("courseDetail.noteAria", { title: topicTitle })}
          aria-describedby={statusId}
          value={body}
          maxLength={MAX_LENGTH}
          rows={3}
          placeholder={t("courseDetail.notePlaceholder")}
          onChange={(e) => onChange(e.target.value)}
          onBlur={flush}
          className="w-full text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <p
            id={statusId}
            aria-live="polite"
            className={`text-xs ${
              status === "error"
                ? "text-red-600 dark:text-red-400"
                : status === "saved"
                  ? "text-green-600 dark:text-green-400"
                  : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {t(STATUS_KEY[status])}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {nearLimit && (
              <span className="text-xs tabular-nums text-gray-400">
                {body.length}/{MAX_LENGTH}
              </span>
            )}
            {hasNote && (
              <button
                type="button"
                onClick={clear}
                className="rounded text-xs font-medium text-gray-500 transition-colors hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-gray-400 dark:hover:text-red-400"
              >
                {t("courseDetail.clearNote")}
              </button>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
