"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import { useOptimisticToggle } from "@/components/useOptimisticToggle";
import { toggleBlock, saveBlockNote, logFocus } from "@/app/courses/actions";
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

/** Never notifies — pairs with useSyncExternalStore as a pure hydration flag. */
const emptySubscribe = () => () => {};

/** sessionStorage key for an in-progress session (survives client-side nav). */
const SESSION_STATE_KEY = "sf-focus-session";

type SavedSession = {
  blockId: string;
  phase: Phase;
  elapsedSec: number;
  /** Wall-clock time of the save, so a running clock keeps counting away. */
  at: number;
};

/** Read a persisted session for `blockId`, advancing a running clock. */
function readSession(blockId: string): { phase: Phase; elapsedSec: number } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<SavedSession>;
    if (
      s.blockId !== blockId ||
      (s.phase !== "running" && s.phase !== "resting") ||
      typeof s.elapsedSec !== "number" ||
      typeof s.at !== "number"
    ) {
      return null;
    }
    let elapsedSec = Math.max(0, Math.floor(s.elapsedSec));
    // Deadline-based math: a running clock kept counting while we were away.
    if (s.phase === "running") {
      elapsedSec += Math.max(0, Math.floor((Date.now() - s.at) / 1000));
    }
    return { phase: s.phase, elapsedSec };
  } catch {
    return null;
  }
}

/**
 * Distraction-free Focus island: ONE task, a big timer, quick notes, and a
 * single state-driven control pair — rendered as a full-screen overlay (fixed
 * inset-0, z-50) so the global nav/tab-bar are visually out of the way without
 * touching the root layout. Mark-done reuses the shared optimistic toggleBlock;
 * notes reuse the existing saveBlockNote path.
 *
 * There is exactly ONE clock here: a countdown over the BLOCK's planned
 * minutes, owned by this component and driven only by the bottom session
 * controls (no embedded Pomodoro with its own Start button — two disconnected
 * timers is how "Start focus does nothing" happens). When the countdown hits
 * zero the session lands on "resting" and offers to log the focused minutes
 * against this block via the shared `logFocus` action.
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

  // Session lifecycle + the elapsed focus clock FocusSession owns — the ONE
  // source of truth for both the visible countdown and whether any real focus
  // has happened. The target is always the block's planned length.
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const targetSec = block.minutes * 60;

  // The end-of-countdown log offer: `logOpen` drives the dialog; `logMinutes`
  // holds the focused minutes it credits (capped at the block's plan).
  const [logOpen, setLogOpen] = useState(false);
  const [logMinutes, setLogMinutes] = useState(block.minutes);

  // Restore an in-progress session lost to client-side navigation (this is all
  // component state, so an unmount would otherwise silently reset the session
  // to idle while the embedded Pomodoro sprint kept running). Done during
  // render once hydration allows it (the adjust-state-during-render pattern —
  // the server HTML must show the idle default). If the block's length elapsed
  // while away, cap the clock at the target and land on "resting" with the log
  // offer open — instead of a clock that overshot.
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const [restoredSession, setRestoredSession] = useState(false);
  if (hydrated && !restoredSession) {
    setRestoredSession(true);
    const saved = readSession(block.id);
    if (saved) {
      const finished = saved.phase === "running" && saved.elapsedSec >= targetSec;
      setElapsedSec(finished ? targetSec : saved.elapsedSec);
      setPhase(finished ? "resting" : saved.phase);
      if (finished) {
        setLogMinutes(block.minutes);
        setLogOpen(true);
      }
    }
  }

  // Mirror the live session to sessionStorage so navigating away and back
  // keeps the clock honest. Removed only on an active→idle transition (e.g. a
  // reopened block starting fresh): surviving state means "still mid-session".
  const hadSession = useRef(false);
  useEffect(() => {
    try {
      if (phase !== "idle") {
        const state: SavedSession = {
          blockId: block.id,
          phase,
          elapsedSec,
          at: Date.now(),
        };
        sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(state));
      } else if (hadSession.current) {
        sessionStorage.removeItem(SESSION_STATE_KEY);
      }
      hadSession.current = phase !== "idle";
    } catch {}
  }, [phase, elapsedSec, block.id]);

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
  // the block's planned length, the session has earned a rest → flip to
  // "resting" and open the log offer (no nagging before then). Timestamp-based
  // math (not per-tick increments): background tabs and a suspended iOS PWA
  // throttle or pause timers, which would freeze a tick-counting clock — so
  // recompute from Date.now() on every tick and again whenever the tab becomes
  // visible.
  useEffect(() => {
    if (phase !== "running") return;
    const startedAt = Date.now() - elapsedRef.current * 1000;
    // "Keep working" after the countdown already hit zero counts overtime
    // quietly — without this guard the first tick would bounce straight back
    // to "resting" and re-open the log offer in a loop.
    const alreadyFinished = elapsedRef.current >= targetSec;
    const sync = () => {
      const next = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSec(next);
      if (!alreadyFinished && next >= targetSec) {
        setPhase("resting");
        setLogMinutes(block.minutes);
        setLogOpen(true);
      }
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
  }, [phase, targetSec, block.minutes]);

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

  // Whether any real focus has happened — gates "Mark session done".
  const hasFocused = elapsedSec > 0;

  // The visible countdown, clamped at 0:00 (overtime never shows negative).
  const remainingSec = Math.max(0, targetSec - elapsedSec);
  const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const ss = String(remainingSec % 60).padStart(2, "0");

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
      const res = await saveBlockNote(fd);
      if (res.ok) {
        toast(t("focus.notesSaved"), "success");
      } else {
        toast(t("focus.notesError"), "error");
      }
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

        {/* The big clock — the block's planned minutes counting down, driven
            only by the bottom session controls. No buttons up here: this is a
            quiet room, not a control panel. */}
        <div className="mt-12 text-center">
          <div className="text-6xl font-semibold tabular-nums sm:text-7xl">
            {mm}:{ss}
          </div>
          {phase === "resting" && remainingSec > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">{t("focus.paused")}</p>
          )}
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

      <LogFocusDialog
        open={logOpen}
        minutes={logMinutes}
        blockId={block.id}
        onClose={() => setLogOpen(false)}
      />
    </div>
  );
}

/**
 * End-of-countdown confirmation: the block's planned time is up — offer to log
 * the focused minutes against THIS block via the shared `logFocus` action (the
 * same path the Pomodoro sprint logging and the "🍅 +Nm" buttons use, so it
 * feeds adaptive pacing and can auto-complete the block server-side).
 * Dismissing logs nothing; "Mark session done" below stays available either way.
 */
function LogFocusDialog({
  open,
  minutes,
  blockId,
  onClose,
}: {
  open: boolean;
  minutes: number;
  blockId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const t = useT();
  const [pending, setPending] = useState(false);

  async function submit() {
    if (pending) return;
    setPending(true);
    const fd = new FormData();
    fd.set("blockId", blockId);
    fd.set("minutes", String(minutes));
    fd.set("revalidate", "/today");
    try {
      await logFocus(fd);
      toast(t("pomodoro.logged", { minutes }), "success");
      onClose();
    } catch {
      toast(t("pomodoro.logError"), "error");
    } finally {
      setPending(false);
    }
  }

  // While logging, hold the dialog open so nothing races the submit.
  const lockWhilePending = (e: Event) => {
    if (pending) e.preventDefault();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent
        showCloseButton={!pending}
        onEscapeKeyDown={lockWhilePending}
        onPointerDownOutside={lockWhilePending}
        onInteractOutside={lockWhilePending}
      >
        <DialogTitle>{t("focus.timeUp")}</DialogTitle>
        <DialogDescription>{t("focus.timeUpBody", { minutes })}</DialogDescription>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={onClose}
            className="w-full sm:w-auto"
          >
            {t("pomodoro.notNow")}
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={submit}
            className="w-full sm:w-auto"
          >
            {pending ? t("pomodoro.logging") : t("pomodoro.log", { minutes })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
