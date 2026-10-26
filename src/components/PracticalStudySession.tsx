"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { FocusBlock } from "@/app/(focus)/focus/FocusSession";
import { checkpointStudy } from "@/app/courses/studyActions";
import { readStudyProgress } from "@/lib/studyTask";
import { useT } from "./i18n/I18nProvider";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import StudyTaskSession from "./StudyTaskSession";
import { X } from "lucide-react";
import { iconButtonClass } from "./ui";

const subscribe = () => () => {};

export default function PracticalStudySession({ block }: { block: FocusBlock }) {
  const t = useT(); const router = useRouter();
  const [response, setResponse] = useState(block.progress?.response ?? "");
  const [elapsed, setElapsed] = useState(block.progress?.elapsedSeconds ?? 0);
  const [running, setRunning] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [status, setStatus] = useState<"saved" | "saving" | "error" | "">(block.progress ? "saved" : "");
  const [leaving, setLeaving] = useState(false);
  const finished = useRef(false);
  const sessionMinutes = block.progress?.sessionMinutes ?? block.minutes;
  const localKey = `sf-study-work-${block.topicId}`;
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [restored, setRestored] = useState(false);
  if (hydrated && !restored) {
    setRestored(true);
    try {
      const saved = readStudyProgress(sessionStorage.getItem(localKey));
      if (saved && (!block.progress || saved.updatedAt > block.progress.updatedAt)) {
        setResponse(saved.response); setElapsed(saved.elapsedSeconds);
      }
    } catch {}
  }
  const work = useRef({ response, elapsedSeconds: elapsed });
  useEffect(() => {
    work.current = { response, elapsedSeconds: elapsed };
    if (!restored || finished.current) return;
    try { sessionStorage.setItem(localKey, JSON.stringify({ version: 1, ...work.current, sessionMinutes, updatedAt: new Date().toISOString() })); } catch {}
  }, [response, elapsed, restored, localKey, sessionMinutes]);
  const save = useCallback(async () => {
    if (finished.current) return true;
    const data = new FormData(); data.set("blockId", block.id); data.set("topicId", block.topicId);
    data.set("response", work.current.response); data.set("elapsedSeconds", String(work.current.elapsedSeconds)); data.set("updatedAt", new Date().toISOString());
    data.set("sessionMinutes", String(sessionMinutes));
    setStatus("saving");
    try {
      const result = await checkpointStudy(data);
      if (!finished.current) setStatus(result.ok ? "saved" : "error");
      return result.ok;
    } catch { if (!finished.current) setStatus("error"); return false; }
  }, [block.id, block.topicId, sessionMinutes]);
  useEffect(() => {
    const timer = setInterval(() => { if (work.current.response || work.current.elapsedSeconds) void save(); }, 15000);
    const visibility = () => { if (document.hidden) void save(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [save]);
  useEffect(() => {
    if (response === (block.progress?.response ?? "")) return;
    const timer = setTimeout(() => void save(), 1000);
    return () => clearTimeout(timer);
  }, [response, save, block.progress?.response]);
  useEffect(() => {
    if (!running) return;
    const base = Date.now() - work.current.elapsedSeconds * 1000;
    const timer = setInterval(() => setElapsed(Math.min(36000, Math.floor((Date.now() - base) / 1000))), 1000);
    return () => clearInterval(timer);
  }, [running]);
  async function leave() {
    if (leaving) return;
    setRunning(false); setLeaving(true);
    if (await save()) router.push("/today");
    else setLeaving(false);
  }
  return <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground">
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    <main className="mx-auto max-w-lg pb-6 pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pt-1"><h1 className="break-words text-2xl font-semibold">{block.topicTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{block.course.name} · {sessionMinutes} min</p></div>
        <button type="button" className={iconButtonClass("inline-flex shrink-0 items-center justify-center text-muted-foreground hover:bg-accent")} aria-label={t("flow.saveLeave")} disabled={leaving} onClick={() => void leave()}><X className="h-5 w-5" aria-hidden="true" /></button>
      </div>
      <StudyTaskSession blockId={block.id} topicId={block.topicId} courseId={block.course.id} task={block.task} fileAvailable={block.fileAvailable}
        actualMinutes={Math.floor(elapsed / 60)} open={checkOpen} onOpenChange={(value) => { setRunning(false); setCheckOpen(value); }}
        response={response} onResponseChange={setResponse} hideCheckButton onCompleted={() => { finished.current = true; try { sessionStorage.removeItem(localKey); } catch {} }} />
      <details className="mt-6"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-muted-foreground">{t("flow.sessionTools")}</summary>
      <label className="mt-2 block text-sm font-medium">{t("focus.notesLabel")}<Textarea rows={3} maxLength={4000} value={response} onChange={(event) => setResponse(event.target.value)} className="mt-2 w-full" /></label>
      {block.lastAttempt && <details className="mt-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">{t("flow.lastAttempt")}</summary><p className="whitespace-pre-wrap break-words text-sm">{block.lastAttempt}</p></details>}
      {block.note && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">{block.note}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium tabular-nums">{t("flow.timer")} · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
        <Button type="button" variant="secondary" className="mt-2 w-full" onClick={() => { setRunning((value) => !value); if (running) void save(); }}>{t(running ? "focus.pause" : "focus.startFocus")}</Button>
      </div>
      </details>
      <p role="status" className={`mt-3 text-sm text-muted-foreground ${status === "error" ? "" : "sr-only"}`}>{status === "saving" ? t("flow.savingProgress") : status === "error" ? t("flow.saveError") : status === "saved" ? t("flow.saved") : ""}</p>
      {status === "error" && <Button variant="secondary" className="mt-2" onClick={() => void save()}>{t("common.save")}</Button>}
    </main>
    </div>
    <div className="shrink-0 border-t border-border bg-surface pb-[calc(1rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] pt-3">
      <div className="mx-auto max-w-lg"><Button type="button" className="w-full" onClick={() => { setRunning(false); setCheckOpen(true); }}>{t("study.checkResult")}</Button></div>
    </div>
  </div>;
}
