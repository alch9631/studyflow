"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RotateCcw, Settings } from "lucide-react";
import { iconButtonClass } from "./ui";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { useToast } from "./Toast";
import { useT } from "./i18n/I18nProvider";
import { logFocus } from "@/app/courses/actions";

/** A Today study block the completed focus sprint can be logged against. */
export type TimerBlock = {
  id: string;
  topicTitle: string;
  completed: boolean;
  course: { name: string };
};

const FOCUS_KEY = "sf-focus-min";
const BREAK_KEY = "sf-break-min";
const DEFAULT_FOCUS = 25;
const DEFAULT_BREAK = 5;

/** Read a persisted minute setting (1–180), guarded for SSR. */
function readMin(key: string, def: number): number {
  if (typeof window === "undefined") return def;
  try {
    const v = parseInt(localStorage.getItem(key) ?? "", 10);
    if (!Number.isNaN(v) && v >= 1 && v <= 180) return v;
  } catch {}
  return def;
}

const PRESETS = [
  { f: 25, b: 5, label: "25 / 5" },
  { f: 50, b: 10, label: "50 / 10" },
  { f: 15, b: 3, label: "15 / 3" },
];

/**
 * Pomodoro focus timer with editable, persisted focus/break durations.
 *
 * When a focus sprint finishes it offers to log that sprint against a Today
 * study block via the same `logFocus` action the manual "🍅 +Nm" buttons use —
 * so the timer and those buttons are no longer disconnected. The block is
 * pre-selected (current/next incomplete one) but the user confirms or picks a
 * different block, and can dismiss without logging.
 */
export default function PomodoroTimer({ blocks = [] }: { blocks?: TimerBlock[] }) {
  const t = useT();
  const [focusMin, setFocusMin] = useState(() => readMin(FOCUS_KEY, DEFAULT_FOCUS));
  const [breakMin, setBreakMin] = useState(() => readMin(BREAK_KEY, DEFAULT_BREAK));
  const [mode, setMode] = useState<"focus" | "break">("focus");
  const [left, setLeft] = useState(() => readMin(FOCUS_KEY, DEFAULT_FOCUS) * 60);
  const [running, setRunning] = useState(false);
  const [cycles, setCycles] = useState(0);
  const [showCfg, setShowCfg] = useState(false);
  // The auto-log prompt: `logOpen` drives the dialog; `logMinutes` is the length
  // of the sprint that just finished (held through the close animation so the
  // button label doesn't flash while the dialog animates out).
  const [logOpen, setLogOpen] = useState(false);
  const [logMinutes, setLogMinutes] = useState(focusMin);
  // Bumped on each sprint completion so the dialog remounts fresh — re-defaulting
  // its block selection to the current/next block without a setState-in-effect.
  const [logEpisode, setLogEpisode] = useState(0);

  // Blocks still open today — the only sensible targets to log a sprint against.
  const loggable = blocks.filter((b) => !b.completed);

  // Latest values for the interval to read without re-subscribing each tick.
  const leftRef = useRef(left);
  const modeRef = useRef(mode);
  const focusRef = useRef(focusMin);
  const breakRef = useRef(breakMin);
  const loggableRef = useRef(loggable);
  useEffect(() => {
    leftRef.current = left;
    modeRef.current = mode;
    focusRef.current = focusMin;
    breakRef.current = breakMin;
    loggableRef.current = loggable;
  });

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      // All setState here runs in the interval callback (not the effect body),
      // and each runs once per tick — so no nested-updater double-counting.
      if (leftRef.current > 1) {
        setLeft(leftRef.current - 1);
      } else if (modeRef.current === "focus") {
        setCycles((c) => c + 1);
        setMode("break");
        setLeft(breakRef.current * 60);
        // Sprint done → offer to log it against a Today block (if any are open).
        if (loggableRef.current.length > 0) {
          setLogMinutes(focusRef.current);
          setLogEpisode((n) => n + 1);
          setLogOpen(true);
        }
      } else {
        setMode("focus");
        setLeft(focusRef.current * 60);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const mm = String(Math.floor(Math.max(left, 0) / 60)).padStart(2, "0");
  const ss = String(Math.max(left, 0) % 60).padStart(2, "0");

  function persist(key: string, val: number) {
    try {
      localStorage.setItem(key, String(val));
    } catch {}
    // Let the Today "+Nm" focus-log buttons track the selected focus length live.
    if (key === FOCUS_KEY && typeof window !== "undefined") {
      window.dispatchEvent(new Event("sf-focus-change"));
    }
  }

  /** Apply new durations; if idle, reflect the current phase's new length. */
  function applyDurations(f: number, b: number) {
    const nf = Math.min(180, Math.max(1, f || DEFAULT_FOCUS));
    const nb = Math.min(180, Math.max(1, b || DEFAULT_BREAK));
    setFocusMin(nf);
    setBreakMin(nb);
    persist(FOCUS_KEY, nf);
    persist(BREAK_KEY, nb);
    if (!running) setLeft((mode === "focus" ? nf : nb) * 60);
  }

  function reset() {
    setRunning(false);
    setMode("focus");
    setLeft(focusMin * 60);
  }

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900">
      {/* Compact one-line bar: time · phase · sessions · start/pause · reset · settings.
          Full duration controls live behind the gear (settings panel below). */}
      <div className="flex items-center gap-2">
        <span suppressHydrationWarning className="shrink-0 text-2xl font-bold tabular-nums">
          {mm}:{ss}
        </span>
        <span
          className="shrink-0 text-base leading-none"
          title={mode === "focus" ? t("pomodoro.focus") : t("pomodoro.break")}
          aria-label={mode === "focus" ? t("pomodoro.focus") : t("pomodoro.break")}
        >
          {mode === "focus" ? "🍅" : "☕"}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-gray-500 dark:text-gray-400">
          {t.n("pomodoro.sessionsDone", cycles)}
        </span>
        <Button size="sm" onClick={() => setRunning((r) => !r)} className="shrink-0">
          {running ? t("pomodoro.pause") : t("pomodoro.start")}
        </Button>
        <button
          onClick={reset}
          aria-label={t("pomodoro.reset")}
          title={t("pomodoro.reset")}
          className={iconButtonClass(
            "inline-flex border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800",
          )}
        >
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          onClick={() => setShowCfg((s) => !s)}
          aria-label={t("pomodoro.timerSettings")}
          aria-expanded={showCfg}
          className={iconButtonClass(
            "inline-flex border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800",
          )}
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Duration settings */}
      {showCfg && (
        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm">
              <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("pomodoro.focusMin")}
              </span>
              <Input
                type="number"
                min={1}
                max={180}
                value={focusMin}
                onChange={(e) => applyDurations(parseInt(e.target.value, 10), breakMin)}
                className="mt-1 w-20 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("pomodoro.breakMin")}
              </span>
              <Input
                type="number"
                min={1}
                max={180}
                value={breakMin}
                onChange={(e) => applyDurations(focusMin, parseInt(e.target.value, 10))}
                className="mt-1 w-20 text-sm"
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyDurations(p.f, p.b)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors active:scale-[.97] ${
                    focusMin === p.f && breakMin === p.b
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t("pomodoro.savedHint")}
          </p>
        </div>
      )}

      {loggable.length > 0 && (
        <LogSprintDialog
          key={logEpisode}
          open={logOpen}
          minutes={logMinutes}
          blocks={loggable}
          onClose={() => setLogOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Confirmation dialog shown when a focus sprint completes: pick (or confirm) the
 * Today block to credit the sprint to, then log it via the shared `logFocus`
 * action. Dismissing logs nothing. The action revalidates `/today` so the block's
 * progress reflects the sprint immediately.
 */
function LogSprintDialog({
  open,
  minutes,
  blocks,
  onClose,
}: {
  open: boolean;
  minutes: number;
  blocks: TimerBlock[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const t = useT();
  const selectId = useId();
  // The dialog is remounted (keyed) each time a sprint completes, so the initial
  // value here is always the current/next block — no open-sync effect needed.
  const [blockId, setBlockId] = useState(blocks[0]?.id ?? "");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!blockId || pending) return;
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
        <DialogTitle>{t("pomodoro.sprintDone")}</DialogTitle>
        <DialogDescription>
          {t("pomodoro.sprintDesc", { minutes })}
        </DialogDescription>
        <div className="mt-4">
          <label
            htmlFor={selectId}
            className="block text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            {t("pomodoro.studyBlock")}
          </label>
          <Select
            id={selectId}
            value={blockId}
            onChange={(e) => setBlockId(e.target.value)}
            disabled={pending}
            className="mt-1"
          >
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.topicTitle} — {b.course.name}
              </option>
            ))}
          </Select>
        </div>
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
            disabled={pending || !blockId}
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
