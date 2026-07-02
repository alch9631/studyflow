"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
 * The session lifecycle drives which controls the student sees — the controls
 * are STATE-DRIVEN, never all-active-at-once:
 *
 *   idle    — nothing has happened yet → primary "Start focus", secondary "Leave".
 *   running — the focus clock is ticking → primary "Pause", secondary "Finish early".
 *   resting — paused (or the focus time elapsed) WITH real focus behind it →
 *             primary "Mark session done", secondary "Keep working".
 *
 * "resting" is the only state that offers "Mark session done": it never leads
 * before any focus has actually happened. Reopening a done block drops back to
 * idle so the flow can begin again.
 */
type Phase = "idle" | "running" | "resting";

/** localStorage key the shared PomodoroTimer persists its focus length under. */
const FOCUS_MIN_KEY = "sf-focus-min";
const DEFAULT_FOCUS_MIN = 25;

/** Read the persisted focus length (1–180 min), guarded for SSR. */
function readFocusMin(): number {
  if (typeof window === "undefined") return DEFAULT_FOCUS_MIN;
  try {
    const v = parseInt(localStorage.getItem(FOCUS_MIN_KEY) ?? "", 10);
    if (!Number.isNaN(v) && v >= 1 && v <= 180) return v;
  } catch {}
  return DEFAULT_FOCUS_MIN;
}

/**
 * Distraction-free Focus island: ONE task, a big timer, quick notes, and a
 * single state-driven control pair — rendered as a full-screen overlay (fixed
 * inset-0, z-50) so the global nav/tab-bar are visually out of the way without
 * touching the root layout. Mark-done reuses the shared optimistic toggleBlock;
 * notes reuse the existing saveBlockNote path; the timer reuses the shared
 * PomodoroTimer (which logs finished sprints against this block).
 *
 * The bottom controls follow the session `Phase` (see above) instead of always
 * offering Stop / Mark done: before any focus, the leading action is "Start
 * focus" and the escape is a quiet "Leave"; "Mark session done" only ever
 * appears once real focus is behind the student.
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

  // Session lifecycle + the elapsed focus clock FocusSession owns (the source of
  // truth for whether any real focus has happened — independent of the embedded
  // Pomodoro's own countdown, which keeps doing the sprint timing + logging).
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);

  const { optimisticDone, fire } = useOptimisticToggle({
    action: toggleBlock,
    actionId: "toggleBlock",
    done: block.completed,
    doneMessage: t("focus.doneToast"),
    undoneMessage: t("focus.reopenToast"),
    errorMessage: t("focus.doneError"),
    fields: { blockId: block.id, revalidate: "/today" },
  });

  // Latest elapsed value for the running effect to baseline against without
  // re-subscribing each second (pausing keeps it; resuming continues from it).
  const elapsedRef = useRef(elapsedSec);
  useEffect(() => {
    elapsedRef.current = elapsedSec;
  });

  // Advance the elapsed clock only while running. When the elapsed time reaches
  // the student's focus length, the session has earned a rest → flip to
  // "resting" so "Mark session done" surfaces on its own (no nagging before
  // then). Timestamp-based math (not per-tick increments): background tabs and
  // a suspended iOS PWA throttle or pause timers, which would freeze a
  // tick-counting clock — so recompute from Date.now() on every tick and again
  // whenever the tab becomes visible.
  useEffect(() => {
    if (phase !== "running") return;
    const targetSec = readFocusMin() * 60;
    const startedAt = Date.now() - elapsedRef.current * 1000;
    const sync = () => {
      const next = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSec(next);
      if (next >= targetSec) setPhase("resting");
    };
    const id = setInterval(sync, 1000);
    const onVisibility = () => {
      if (!document.hidden) sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase]);

  // Marking the block done from elsewhere (or reopening it) keeps the controls
  // honest: a reopened block starts a fresh session at idle with a clean clock.
  const prevDone = useRef(optimisticDone);
  useEffect(() => {
    if (prevDone.current && !optimisticDone) {
      setPhase("idle");
      setElapsedSec(0);
    }
    prevDone.current = optimisticDone;
  }, [optimisticDone]);

  // The shared Pomodoro logs a finished sprint against the open block.
  const timerBlocks: TimerBlock[] = optimisticDone
    ? []
    : [{ id: block.id, topicTitle: block.topicTitle, completed: false, course: { name: block.course.name } }];

  // Whether any real focus has happened — gates "Mark session done".
  const hasFocused = elapsedSec > 0;

  function markDone() {
    const fd = new FormData();
    fd.set("blockId", block.id);
    fd.set("revalidate", "/today");
    fire(fd, true, true);
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

  function leave() {
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
            onClick={leave}
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

        {/* One collapsible note — clearly a control even when collapsed (a
            bordered, full-width button), opened only when the student reaches
            for it. */}
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
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setNotesOpen(false)}
                >
                  {t("focus.notesClose")}
                </Button>
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
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => setNotesOpen(true)}
            >
              {t("focus.addNote")}
            </Button>
          )}
        </div>

        {/* State-driven session controls — pushed to the bottom, given room to
            breathe. Exactly ONE primary + ONE secondary, chosen by `phase`:
              idle    → Start focus / Leave
              running → Pause / Finish early
              resting → Mark session done / Keep working
            Once the block is done, a single calm Reopen replaces the pair so no
            stale "running" action lingers. */}
        <div className="mt-auto pt-12">
          {optimisticDone ? (
            <div className="grid grid-cols-1 gap-3">
              <Button
                type="button"
                size="lg"
                variant="secondary"
                onClick={() => {
                  const fd = new FormData();
                  fd.set("blockId", block.id);
                  fd.set("revalidate", "/today");
                  fire(fd, false, true);
                }}
              >
                {t("focus.reopen")}
              </Button>
            </div>
          ) : phase === "idle" ? (
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" size="lg" onClick={() => setPhase("running")}>
                {t("focus.startFocus")}
              </Button>
              <Button type="button" size="lg" variant="secondary" onClick={leave}>
                {t("focus.leave")}
              </Button>
            </div>
          ) : phase === "running" ? (
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" size="lg" onClick={() => setPhase("resting")}>
                {t("focus.pause")}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                onClick={hasFocused ? () => setPhase("resting") : leave}
              >
                {hasFocused ? t("focus.finishEarly") : t("focus.leave")}
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Button type="button" size="lg" onClick={markDone}>
                {t("focus.markSessionDone")}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                onClick={() => setPhase("running")}
              >
                {t("focus.keepWorking")}
              </Button>
            </div>
          )}
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
