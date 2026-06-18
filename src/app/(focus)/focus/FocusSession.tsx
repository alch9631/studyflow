"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import { useOptimisticToggle } from "@/components/useOptimisticToggle";
import PomodoroTimer, { type TimerBlock } from "@/components/PomodoroTimer";
import { toggleBlock, saveBlockNote } from "@/app/courses/actions";
import { fmtDuration } from "@/app/today/cockpit";

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
  const [notesOpen, setNotesOpen] = useState(false);

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
    // The sealed quiet room: the calm near-white / deep-slate page colour fills
    // the whole viewport (via the design tokens), generously spaced and centred.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex min-h-full max-w-md flex-col px-6 py-8 [padding-top:calc(env(safe-area-inset-top)+2rem)] [padding-bottom:calc(env(safe-area-inset-bottom)+2rem)]">
        {/* Minimal top row: just an exit affordance, no nav. */}
        <div className="mb-10 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-ink">
            {t("focus.title")}
          </span>
          <button
            type="button"
            onClick={stop}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {t("focus.exit")}
          </button>
        </div>

        {/* The one task — large, centred, with plenty of air around it. */}
        <div className="text-center">
          <h1
            className={`text-balance text-3xl font-semibold leading-tight sm:text-4xl ${
              optimisticDone ? "text-muted-foreground line-through" : ""
            }`}
          >
            {block.topicTitle}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("focus.course", { course: block.course.name })} · {fmtDuration(block.minutes)}
            {isReview && <> · {t("focus.review")}</>}
          </p>
        </div>

        {/* The big timer (shared Pomodoro, logs sprints to this block). A plain
            timer in Focus: the reset/settings icon buttons are hidden so only
            Start remains — this is a quiet room, not a control panel. */}
        <div className="mt-12 [&_button[aria-label]]:hidden">
          <PomodoroTimer blocks={timerBlocks} />
        </div>

        {/* One collapsible note, opened only when the student reaches for it. */}
        <div className="mt-10">
          {notesOpen ? (
            <>
              <label className="block text-xs font-medium text-muted-foreground">
                {t("focus.notesLabel")}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("focus.notesPlaceholder")}
                rows={3}
                autoFocus
                className="mt-1 w-full resize-none rounded-xl border border-input bg-surface p-3 text-sm"
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
            </>
          ) : (
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className="mx-auto block text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("focus.addNote")}
            </button>
          )}
        </div>

        {/* Done / Stop — pushed to the bottom, given room to breathe. */}
        <div className="mt-auto grid grid-cols-2 gap-3 pt-12">
          <Button type="button" size="lg" onClick={toggleDone}>
            {optimisticDone ? t("focus.reopen") : t("focus.done")}
          </Button>
          <Button type="button" size="lg" variant="secondary" onClick={stop}>
            {t("focus.stop")}
          </Button>
        </div>

        {upNextTopic && !optimisticDone && (
          <p className="mt-5 text-center text-xs text-muted-foreground">
            {t("focus.nextUp", { topic: upNextTopic })}
          </p>
        )}
      </div>
    </div>
  );
}
