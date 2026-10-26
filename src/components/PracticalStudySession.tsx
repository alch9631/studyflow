"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Pause, Play, X } from "lucide-react";
import type { FocusBlock } from "@/lib/focusTypes";
import { checkpointStudy, finishFocusSession } from "@/app/courses/studyActions";
import { readStudyProgress, taskSourceHref } from "@/lib/studyTask";
import { useT } from "./i18n/I18nProvider";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Select } from "./ui/select";
import { iconButtonClass } from "./ui";

// The question/answer interface is only downloaded when the student asks for it.
const StudyTaskSession = dynamic(() => import("./StudyTaskSession"));
const subscribe = () => () => {};

/** Read once after hydration, advancing a suspended iPhone clock by wall time. */
function readClock(key: string) {
  const clock = JSON.parse(sessionStorage.getItem(key) ?? "null");
  if (!clock || !Number.isFinite(clock.at) || !Number.isInteger(clock.elapsed) || clock.elapsed < 0 || clock.elapsed > 36000 ||
      !Number.isInteger(clock.minutes) || clock.minutes < 5 || clock.minutes > 600 || typeof clock.running !== "boolean") return null;
  return { ...clock, elapsed: Math.min(clock.minutes * 60, clock.elapsed + (clock.running ? Math.max(0, Math.floor((Date.now() - clock.at) / 1000)) : 0)) };
}

export default function PracticalStudySession({ block }: { block: FocusBlock }) {
  const t = useT();
  const router = useRouter();
  const [response, setResponse] = useState(block.progress?.response ?? "");
  const [elapsed, setElapsed] = useState(block.progress?.elapsedSeconds ?? 0);
  const [sessionMinutes, setSessionMinutes] = useState(block.progress?.sessionMinutes ?? block.minutes);
  const [running, setRunning] = useState(true);
  const [checkOpen, setCheckOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [status, setStatus] = useState<"saving" | "error" | "">("");
  const [leaving, setLeaving] = useState(false);
  const finished = useRef(false);
  const saving = useRef<Promise<boolean> | null>(null);
  const localKey = `sf-study-work-${block.topicId}`;
  const clockKey = `sf-study-clock-${block.id}`;
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [restored, setRestored] = useState(false);
  if (hydrated && !restored) {
    setRestored(true);
    try {
      const saved = readStudyProgress(sessionStorage.getItem(localKey));
      if (saved && (!block.progress || saved.updatedAt > block.progress.updatedAt)) {
        setResponse(saved.response); setElapsed(saved.elapsedSeconds);
        if (saved.sessionMinutes) setSessionMinutes(saved.sessionMinutes);
      }
      const clock = readClock(clockKey);
      const startRequested = sessionStorage.getItem("sf-focus-start") === block.id;
      if (startRequested) sessionStorage.removeItem("sf-focus-start");
      if (clock) {
        setElapsed(clock.elapsed); setSessionMinutes(clock.minutes); setRunning((clock.running || startRequested) && clock.elapsed < clock.minutes * 60);
      }
    } catch {}
  }
  const work = useRef({ response, elapsedSeconds: elapsed, sessionMinutes });
  useEffect(() => { work.current = { response, elapsedSeconds: elapsed, sessionMinutes }; }, [response, elapsed, sessionMinutes]);

  const persist = useCallback(() => {
    if (!restored || finished.current) return;
    try {
      sessionStorage.setItem(localKey, JSON.stringify({ version: 1, ...work.current, updatedAt: new Date().toISOString() }));
      sessionStorage.setItem(clockKey, JSON.stringify({ elapsed: work.current.elapsedSeconds, minutes: work.current.sessionMinutes, running, at: Date.now() }));
    } catch {}
  }, [restored, localKey, clockKey, running]);
  useEffect(() => { persist(); }, [response, elapsed, sessionMinutes, persist]);

  const save = useCallback(async (exit = false): Promise<boolean> => {
    // Chain checkpoints so simultaneous pause/autosave/exit requests cannot race.
    const previous = saving.current;
    const request = (async () => {
      if (previous) await previous;
      if (finished.current) return true;
      const data = new FormData();
      data.set("blockId", block.id); data.set("topicId", block.topicId);
      data.set("response", work.current.response); data.set("elapsedSeconds", String(work.current.elapsedSeconds));
      data.set("updatedAt", new Date().toISOString()); data.set("sessionMinutes", String(work.current.sessionMinutes));
      if (exit) data.set("leaving", "1");
      setStatus("saving");
      try {
        const result = await checkpointStudy(data);
        if (!finished.current) setStatus(result.ok ? "" : "error");
        return result.ok;
      } catch { if (!finished.current) setStatus("error"); return false; }
    })();
    saving.current = request;
    const result = await request;
    if (saving.current === request) saving.current = null;
    return result;
  }, [block.id, block.topicId]);

  useEffect(() => {
    if (!restored) return;
    const timer = setInterval(() => { if (work.current.response || work.current.elapsedSeconds) void save(); }, 15000);
    const visibility = () => { if (document.hidden) { persist(); void save(); } };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", persist);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", persist); };
  }, [restored, save, persist]);
  useEffect(() => {
    if (!restored || response === (block.progress?.response ?? "")) return;
    const timer = setTimeout(() => void save(), 1000);
    return () => clearTimeout(timer);
  }, [restored, response, save, block.progress?.response]);
  useEffect(() => {
    if (!running || !restored) return;
    const base = Date.now() - work.current.elapsedSeconds * 1000;
    const tick = () => {
      const seconds = Math.min(sessionMinutes * 60, Math.max(0, Math.floor((Date.now() - base) / 1000)));
      work.current.elapsedSeconds = seconds;
      setElapsed(seconds);
      if (seconds >= sessionMinutes * 60) setRunning(false);
    };
    const timer = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [running, restored, sessionMinutes]);

  function clearDraft() {
    finished.current = true;
    try { sessionStorage.removeItem(localKey); sessionStorage.removeItem(clockKey); sessionStorage.removeItem("sf-focus-session"); } catch {}
  }
  async function leave(complete = false) {
    if (leaving) return;
    setRunning(false); setLeaving(true);
    // Save the paused clock immediately; reloading after leaving must not count the break.
    try { sessionStorage.setItem(clockKey, JSON.stringify({ elapsed: work.current.elapsedSeconds, minutes: work.current.sessionMinutes, running: false, at: Date.now() })); } catch {}
    if (complete) {
      finished.current = true;
      if (saving.current) await saving.current;
      try {
        const result = await finishFocusSession({ blockId: block.id, topicId: block.topicId, response: work.current.response, elapsedSeconds: work.current.elapsedSeconds });
        if (!result.ok) throw new Error();
        clearDraft(); router.push("/today"); return;
      } catch { finished.current = false; setStatus("error"); setLeaving(false); }
    } else if (await save(true)) router.push("/today");
    else setLeaving(false);
  }
  const remaining = Math.max(0, sessionMinutes * 60 - elapsed);
  const source = block.task && taskSourceHref(block.task, block.fileAvailable);

  return <div data-focus-session className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground">
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <main className="mx-auto flex min-h-full max-w-lg flex-col pb-4 pl-[calc(1.25rem+env(safe-area-inset-left))] pr-[calc(1.25rem+env(safe-area-inset-right))] pt-[calc(.75rem+env(safe-area-inset-top))]">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 pt-2"><h1 className="line-clamp-2 break-words text-xl font-semibold" title={block.topicTitle}>{block.topicTitle}</h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">{block.course.name}</p></div>
          <button type="button" className={iconButtonClass("inline-flex shrink-0 items-center justify-center text-muted-foreground hover:bg-accent")} aria-label={t("flow.saveLeave")} disabled={leaving} onClick={() => void leave()}><X className="h-5 w-5" aria-hidden="true" /></button>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <div role="timer" aria-label={t("flow.timer")} className="text-7xl font-medium tabular-nums tracking-tight sm:text-8xl">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</div>
          <p role="status" className="mt-3 min-h-5 text-sm text-muted-foreground">{remaining === 0 ? t("focus.timeUp") : running ? t("focus.title") : t("focus.paused")}</p>
          {source && <a href={source} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-brand-ink underline underline-offset-4">{t("study.openMaterial")}</a>}
        </div>
        <details onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-muted-foreground">{t("focus.details")}</summary>
          {detailsOpen && <div className="pb-3">
            <label className="mt-2 block text-sm font-medium">{t("flow.time")}
              <Select value={sessionMinutes} className="mt-1 w-full" disabled={leaving} onChange={(event) => setSessionMinutes(Number(event.target.value))}>
                {[...new Set([15, 25, 30, 45, sessionMinutes])].sort((a, b) => a - b).map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
              </Select>
            </label>
            {block.task && <StudyTaskSession blockId={block.id} topicId={block.topicId} courseId={block.course.id} task={block.task} fileAvailable={block.fileAvailable}
              actualMinutes={Math.floor(elapsed / 60)} open={checkOpen} onOpenChange={(value) => { if (value) setRunning(false); setCheckOpen(value); }}
              response={response} onResponseChange={setResponse} onCompleted={clearDraft} />}
            <label className="mt-4 block text-sm font-medium">{t("focus.notesLabel")}<Textarea rows={3} maxLength={4000} value={response} onChange={(event) => setResponse(event.target.value)} className="mt-2 w-full" /></label>
            {block.lastAttempt && <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm">{t("flow.lastAttempt")}</summary><p className="whitespace-pre-wrap break-words text-sm">{block.lastAttempt}</p></details>}
            {block.note && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{block.note}</p>}
          </div>}
        </details>
        {status === "error" && <div role="alert" className="py-2 text-sm"><p>{t("flow.saveError")}</p><Button variant="secondary" className="mt-2" onClick={() => void save()}>{t("common.save")}</Button></div>}
      </main>
    </div>
    <footer className="shrink-0 bg-background pb-[calc(1rem+env(safe-area-inset-bottom))] pl-[calc(1.25rem+env(safe-area-inset-left))] pr-[calc(1.25rem+env(safe-area-inset-right))] pt-3">
      <div className="mx-auto grid max-w-lg grid-cols-2 gap-3">
        <Button type="button" size="lg" disabled={leaving || remaining === 0} onClick={() => { setRunning((value) => !value); if (running) void save(); }}>
          {running ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}{t(running ? "focus.pause" : "focus.resume")}
        </Button>
        <Button type="button" size="lg" variant="secondary" disabled={leaving} onClick={() => void leave(true)}>{leaving ? t("study.saving") : t("focus.finish")}</Button>
      </div>
    </footer>
  </div>;
}
