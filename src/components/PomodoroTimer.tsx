"use client";

import { useEffect, useRef, useState } from "react";
import { buttonClasses, iconButtonClass, inputClass } from "./ui";

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

/** Pomodoro focus timer with editable, persisted focus/break durations. */
export default function PomodoroTimer() {
  const [focusMin, setFocusMin] = useState(() => readMin(FOCUS_KEY, DEFAULT_FOCUS));
  const [breakMin, setBreakMin] = useState(() => readMin(BREAK_KEY, DEFAULT_BREAK));
  const [mode, setMode] = useState<"focus" | "break">("focus");
  const [left, setLeft] = useState(() => readMin(FOCUS_KEY, DEFAULT_FOCUS) * 60);
  const [running, setRunning] = useState(false);
  const [cycles, setCycles] = useState(0);
  const [showCfg, setShowCfg] = useState(false);

  // Latest values for the interval to read without re-subscribing each tick.
  const leftRef = useRef(left);
  const modeRef = useRef(mode);
  const focusRef = useRef(focusMin);
  const breakRef = useRef(breakMin);
  useEffect(() => {
    leftRef.current = left;
    modeRef.current = mode;
    focusRef.current = focusMin;
    breakRef.current = breakMin;
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
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          🍅 Focus Timer
        </h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          Study in focused sprints, then take a short break. Press <strong>Start</strong> when you
          sit down; it counts down and rolls into a break automatically.
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div suppressHydrationWarning className="shrink-0 text-3xl font-bold tabular-nums">
          {mm}:{ss}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            {mode === "focus" ? "🍅 Focus" : "☕ Break"}
          </div>
          <div className="truncate text-xs text-gray-500 dark:text-gray-400">
            {cycles} focus sessions done
          </div>
        </div>
        {/* Controls inline on wider screens */}
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <button onClick={() => setRunning((r) => !r)} className={buttonClasses("primary", "md")}>
            {running ? "Pause" : "Start"}
          </button>
          <button onClick={reset} className={buttonClasses("secondary", "md")}>
            Reset
          </button>
          <button
            onClick={() => setShowCfg((s) => !s)}
            aria-label="Timer settings"
            aria-expanded={showCfg}
            className={iconButtonClass(
              "inline-flex border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800",
            )}
          >
            <span aria-hidden="true">⚙︎</span>
          </button>
        </div>
      </div>

      {/* On mobile the controls drop to a full-width row so the label isn't squeezed */}
      <div className="mt-3 flex gap-2 sm:hidden">
        <button onClick={() => setRunning((r) => !r)} className={buttonClasses("primary", "md", "flex-1")}>
          {running ? "Pause" : "Start"}
        </button>
        <button onClick={reset} className={buttonClasses("secondary", "md")}>
          Reset
        </button>
        <button
          onClick={() => setShowCfg((s) => !s)}
          aria-label="Timer settings"
          aria-expanded={showCfg}
          className={iconButtonClass(
            "inline-flex border border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800",
          )}
        >
          <span aria-hidden="true">⚙︎</span>
        </button>
      </div>

      {/* Duration settings */}
      {showCfg && (
        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm">
              <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                Focus (min)
              </span>
              <input
                type="number"
                min={1}
                max={180}
                value={focusMin}
                onChange={(e) => applyDurations(parseInt(e.target.value, 10), breakMin)}
                className={`${inputClass} mt-1 w-20`}
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                Break (min)
              </span>
              <input
                type="number"
                min={1}
                max={180}
                value={breakMin}
                onChange={(e) => applyDurations(focusMin, parseInt(e.target.value, 10))}
                className={`${inputClass} mt-1 w-20`}
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => applyDurations(p.f, p.b)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors active:scale-[.97] ${
                    focusMin === p.f && breakMin === p.b
                      ? "border-brand bg-brand text-white"
                      : "border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Saved on this device. Changes apply when the timer is idle.
          </p>
        </div>
      )}
    </div>
  );
}
