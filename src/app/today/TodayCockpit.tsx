"use client";

import { useRef, useState } from "react";
import SessionLengthDialog, { type SessionChoice } from "@/components/SessionLengthDialog";
import { restoreFocusClock } from "@/lib/focusClock";
import { Check, MoreHorizontal, Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { iconButtonClass } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import { useOptimisticToggle } from "@/components/useOptimisticToggle";
import SwipeRow from "@/components/SwipeRow";
import { toggleBlock, moveBlockToTomorrow, saveBlockNote } from "../courses/actions";
import { fmtDuration, type CockpitBlock } from "./cockpit";

/** The next task leads. Menus belong to task headings, never the Start button. */
export default function TodayCockpit({ blocks, hero }: {
  blocks: CockpitBlock[]; hero: CockpitBlock | null;
}) {
  const t = useT();
  const [noteBlock, setNoteBlock] = useState<CockpitBlock | null>(null);
  const noteTrigger = useRef<HTMLButtonElement | null>(null);
  const [sessionChoice, setSessionChoice] = useState<SessionChoice | null>(null);
  const sessionTrigger = useRef<HTMLButtonElement | null>(null);
  const rest = blocks.filter((block) => !block.completed && block.id !== hero?.id);
  function notes(block: CockpitBlock, trigger: HTMLButtonElement | null) {
    noteTrigger.current = trigger;
    setNoteBlock(block);
  }
  function chooseLength(block: CockpitBlock, trigger: HTMLButtonElement) {
    sessionTrigger.current = trigger;
    let elapsed = block.progress?.elapsedSeconds ?? 0;
    let minutes = block.progress?.sessionMinutes ?? block.minutes;
    try {
      const clock = restoreFocusClock(sessionStorage.getItem(`sf-study-clock-${block.id}`), Date.now());
      if (clock) {
        elapsed = Math.max(elapsed, clock.elapsed); minutes = clock.minutes;
        sessionStorage.setItem(`sf-study-clock-${block.id}`, JSON.stringify({ ...clock, running: false }));
      }
    } catch {}
    setSessionChoice({ id: block.id, topicId: block.topicId, kind: block.kind, title: block.topicTitle, minutes, elapsed });
  }
  return <>
    {hero && <section data-today-task className="mx-auto max-w-md py-2">
      <div data-task-heading className="flex items-start justify-between gap-3">
        <div className="min-w-0 pt-1">
          <h2 className="text-2xl font-semibold"><button type="button" onClick={(event) => chooseLength(hero, event.currentTarget)} title={hero.topicTitle} aria-haspopup="dialog" className="inline-flex min-h-11 items-center break-words text-left"><span className="line-clamp-2">{hero.topicTitle}</span></button></h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground"><span className="truncate">{hero.course.name}</span><span className="shrink-0">· {fmtDuration(hero.minutes)}</span></p>
        </div>
        <TaskActions block={hero} onNotes={(trigger) => notes(hero, trigger)} />
      </div>
      <Button type="button" size="lg" className="relative mt-5 w-full" aria-haspopup="dialog" onClick={(event) => chooseLength(hero, event.currentTarget)}>{t(hero.progress ? "focus.resume" : "minimal.start")}</Button>
    </section>}
    {rest.length > 0 && <ul data-today-tasks className="mx-auto mt-6 max-w-md divide-y divide-border">
      {rest.map((block) => <li key={block.id}><QuietRow block={block} onStart={(trigger) => chooseLength(block, trigger)} onNotes={(trigger) => notes(block, trigger)} /></li>)}
    </ul>}
    <TaskNotes block={noteBlock} onClose={() => setNoteBlock(null)} returnFocus={() => noteTrigger.current?.focus()} />
    {sessionChoice && <SessionLengthDialog choice={sessionChoice} onClose={() => setSessionChoice(null)} returnFocus={() => sessionTrigger.current?.focus()} />}
  </>;
}

function useBlockToggle(block: CockpitBlock) {
  const t = useT();
  const toggle = useOptimisticToggle({ action: toggleBlock, actionId: "toggleBlock", done: block.completed,
    doneMessage: t("block.sessionDone"), undoneMessage: t("block.sessionNotDone"), errorMessage: t("block.sessionError"),
    fields: { blockId: block.id, revalidate: "/today" } });
  function fire(next: boolean) {
    const data = new FormData(); data.set("blockId", block.id); data.set("revalidate", "/today");
    toggle.fire(data, next, true);
  }
  return { done: toggle.optimisticDone, fire };
}

function TaskActions({ block, onNotes }: { block: CockpitBlock; onNotes: (trigger: HTMLButtonElement | null) => void }) {
  const t = useT(); const { toast } = useToast();
  const { done, fire } = useBlockToggle(block);
  const [pending, setPending] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const openingNotes = useRef(false);
  async function move() {
    if (pending) return;
    setPending(true);
    const data = new FormData(); data.set("blockId", block.id);
    try {
      const result = await moveBlockToTomorrow(data);
      toast(t(result.ok ? "today.sheetMoved" : result.reason === "exam-day" ? "today.sheetMoveExamEve" : "today.sheetMoveError"), result.ok ? "success" : "error");
    } catch { toast(t("today.sheetMoveError"), "error"); }
    finally { setPending(false); }
  }
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><button ref={trigger} type="button" disabled={pending}
      aria-label={t("today.taskActions", { topic: block.topicTitle })}
      className={iconButtonClass("inline-flex shrink-0 items-center justify-center text-muted-foreground hover:bg-accent")}>
      <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
    </button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" onCloseAutoFocus={(event) => {
      if (!openingNotes.current) return;
      openingNotes.current = false;
      event.preventDefault();
      // Finish releasing the menu's focus scope before opening the editor.
      onNotes(trigger.current);
    }}>
      <DropdownMenuItem className="min-h-11" onSelect={() => fire(!done)}>{t(done ? "today.sheetMarkNotDone" : "today.sheetMarkDone")}</DropdownMenuItem>
      <DropdownMenuItem className="min-h-11" onSelect={() => void move()}>{t("today.sheetMoveTomorrow")}</DropdownMenuItem>
      <DropdownMenuItem className="min-h-11" onSelect={() => { openingNotes.current = true; }}>{t("focus.notesLabel")}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function QuietRow({ block, onStart, onNotes }: { block: CockpitBlock; onStart: (trigger: HTMLButtonElement) => void; onNotes: (trigger: HTMLButtonElement | null) => void }) {
  const t = useT(); const { done, fire } = useBlockToggle(block);
  return <SwipeRow className="rounded-xl" contentClassName="flex items-center gap-1 bg-background py-2"
    right={done ? undefined : { label: t("block.done"), icon: <Check className="h-4 w-4" aria-hidden="true" />, tone: "success", onTrigger: () => fire(true) }}
    left={done ? { label: t("block.reopen"), icon: <Undo2 className="h-4 w-4" aria-hidden="true" />, tone: "neutral", onTrigger: () => fire(false) } : undefined}>
    <button type="button" onClick={() => fire(!done)} aria-pressed={done} aria-label={t(done ? "block.markNotDone" : "block.markDone")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-accent">
      <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${done ? "border-brand bg-brand text-brand-foreground" : "border-input"}`}>{done && <Check className="h-3.5 w-3.5" aria-hidden="true" />}</span>
    </button>
    <button type="button" aria-haspopup="dialog" onClick={(event) => onStart(event.currentTarget)} className="relative min-h-11 min-w-0 flex-1 py-1 text-left">
      <span title={block.topicTitle} className={`line-clamp-2 break-words text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}>{block.topicTitle}</span>
      <span className="mt-1 block truncate text-xs text-muted-foreground">{block.course.name} · {fmtDuration(block.minutes)}</span>
    </button>
    <TaskActions block={block} onNotes={onNotes} />
  </SwipeRow>;
}

function TaskNotes({ block, onClose, returnFocus }: { block: CockpitBlock | null; onClose: () => void; returnFocus: () => void }) {
  const t = useT(); const { toast } = useToast();
  const [draft, setDraft] = useState(""); const [topic, setTopic] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (block && block.id !== topic) { setTopic(block.id); setDraft(block.note ?? ""); }
  async function save() {
    if (!block || pending) return;
    setPending(true);
    const data = new FormData(); data.set("blockId", block.id); data.set("body", draft);
    try {
      const result = await saveBlockNote(data);
      toast(t(result.ok ? "today.sheetNoteSaved" : "today.sheetNoteError"), result.ok ? "success" : "error");
      if (result.ok) onClose();
    } catch { toast(t("today.sheetNoteError"), "error"); }
    finally { setPending(false); }
  }
  return <Dialog open={!!block} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogContent mobileSheet onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }}>
      <DialogTitle>{t("focus.notesLabel")}</DialogTitle><DialogDescription>{block?.topicTitle}</DialogDescription>
      <Textarea aria-label={t("focus.notesLabel")} value={draft} maxLength={10000} rows={4} onChange={(event) => setDraft(event.target.value)} className="mt-3 w-full" />
      <Button className="mt-3 w-full" disabled={pending || draft === (block?.note ?? "")} onClick={() => void save()}>{t(pending ? "today.sheetNoteSaving" : "today.sheetNoteSave")}</Button>
    </DialogContent>
  </Dialog>;
}
