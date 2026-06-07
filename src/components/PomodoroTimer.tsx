"use client";

import { useEffect, useRef, useState } from "react";

const FOCUS = 25 * 60;
const BREAK = 5 * 60;

/** A simple Pomodoro focus timer (25 min focus / 5 min break) with a cycle count. */
export default function PomodoroTimer() {
  const [mode, setMode] = useState<"focus" | "break">("focus");
  const [left, setLeft] = useState(FOCUS);
  const [running, setRunning] = useState(false);
  const [cycles, setCycles] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    tick.current = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [running]);

  useEffect(() => {
    if (left > 0) return;
    // Switch phase when the timer hits zero.
    if (mode === "focus") {
      setCycles((c) => c + 1);
      setMode("break");
      setLeft(BREAK);
    } else {
      setMode("focus");
      setLeft(FOCUS);
    }
  }, [left, mode]);

  const mm = String(Math.floor(Math.max(left, 0) / 60)).padStart(2, "0");
  const ss = String(Math.max(left, 0) % 60).padStart(2, "0");

  function reset() {
    setRunning(false);
    setMode("focus");
    setLeft(FOCUS);
  }

  return (
    <div className="mb-6 flex items-center gap-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <div className="text-3xl font-bold tabular-nums">
        {mm}:{ss}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium">
          {mode === "focus" ? "🍅 Focus" : "☕ Break"}
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-500">{cycles} focus sessions done</div>
      </div>
      <button
        onClick={() => setRunning((r) => !r)}
        className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
      >
        {running ? "Pause" : "Start"}
      </button>
      <button
        onClick={reset}
        className="rounded-full border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        Reset
      </button>
    </div>
  );
}
