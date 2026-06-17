"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import { useOptimisticToggle } from "@/components/useOptimisticToggle";
import PomodoroTimer, { type TimerBlock } from "@/components/PomodoroTimer";
import { toggleBlock, saveBlockNote } from "../courses/actions";
import { fmtDuration } from "../today/cockpit";

/** The single block Focus mode works on (serializable across the boundary). */
export type FocusBlock = {
  id: string;
  topicTitle: string;
  minutes: number;
  completed: boolean;
  kind: string;
  course: { name: string };
};

/**
 * Distraction-free Focus island: ONE task, a big timer, quick notes, and
 * done/stop — rendered as a full-screen overlay (fixed inset-0, z-50) so the
 * global nav/tab-bar are visually out of the way without touching the root
 * layout. Mark-done reuses the shared optimistic toggleBlock; notes reuse the
 * existing saveBlockNote path; the timer reuses the shared PomodoroTimer (which
 * logs finished sprints against this block). "Stop" returns to Today.
 */
export default function FocusSession({
  block,
  upNextTopic,
}: {
  block: FocusBlock;
  upNextTopic: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const { optimisticDone, fire } = useOptimisticToggle({
    action: toggleBlock,
    actionId: "toggleBlock",
    done: block.completed,
    doneMessage: t("focus.doneToast"),
    undoneMessage: t("focus.reopenToast"),
    errorMessage: t("focus.doneError"),
  });

  // The shared Pomodoro logs a finished sprint against the open block.
  const timerBlocks: TimerBlock[] = optimisticDone
    ? []
    : [{ id: block.id, topicTitle: block.topicTitle, completed: false, course: { name: block.course.name } }];

  function toggleDone() {
    const fd = new FormData();
    fd.set("blockId", block.id);
    fd.set("revalidate", "/today");
    fire(fd, !optimisticDone, true);
  }

  async function saveNote() {
    if (savingNote || note.trim().length === 0) return;
    setSavingNote(true);
    const fd = new FormData();
    fd.set("blockId", block.id);
    fd.set("body", note);
    try {
      await saveBlockNote(fd);
      toast(t("focus.notesSaved"), "success");
    } catch {
      toast(t("focus.notesError"), "error");
    } finally {
      setSavingNote(false);
    }
  }

  function stop() {
    router.push("/today");
  }

  const isReview = block.kind === "review";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white dark:bg-gray-950">
      <div className="mx-auto flex min-h-full max-w-md flex-col px-5 py-6 [padding-top:calc(env(safe-area-inset-top)+1.5rem)] [padding-bottom:calc(env(safe-area-inset-bottom)+1.5rem)]">
        {/* Minimal top row: just an exit affordance, no nav. */}
        <div className="mb-6 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            {t("focus.title")}
          </span>
          <button
            type="button"
            onClick={stop}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            {t("focus.exit")}
          </button>
        </div>

        {/* The one task. */}
        <div className="text-center">
          <h1
            className={`text-2xl font-bold leading-tight sm:text-3xl ${
              optimisticDone ? "text-gray-400 line-through dark:text-gray-500" : ""
            }`}
          >
            {block.topicTitle}
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t("focus.course", { course: block.course.name })} · {fmtDuration(block.minutes)}
            {isReview && <> · {t("focus.review")}</>}
          </p>
        </div>

        {/* The big timer (shared Pomodoro, logs sprints to this block). */}
        <div className="mt-7">
          <PomodoroTimer blocks={timerBlocks} />
        </div>

        {/* Quick notes. */}
        <div className="mt-5">
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
            {t("focus.notesLabel")}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("focus.notesPlaceholder")}
            rows={3}
            className="mt-1 w-full resize-none rounded-xl border border-gray-300 bg-white p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
          <div className="mt-2 flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={savingNote || note.trim().length === 0}
              onClick={saveNote}
            >
              {savingNote ? t("focus.notesSaving") : t("focus.notesSave")}
            </Button>
          </div>
        </div>

        {/* Done / Stop — pushed to the bottom. */}
        <div className="mt-auto grid grid-cols-2 gap-2 pt-8">
          <Button type="button" onClick={toggleDone}>
            {optimisticDone ? t("focus.reopen") : t("focus.done")}
          </Button>
          <Button type="button" variant="secondary" onClick={stop}>
            {t("focus.stop")}
          </Button>
        </div>

        {upNextTopic && !optimisticDone && (
          <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
            {t("focus.nextUp", { topic: upNextTopic })}
          </p>
        )}
      </div>
    </div>
  );
}
