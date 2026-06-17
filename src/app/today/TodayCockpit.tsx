"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import { useOptimisticToggle } from "@/components/useOptimisticToggle";
import SwipeRow from "@/components/SwipeRow";
import PomodoroTimer, { type TimerBlock } from "@/components/PomodoroTimer";
import { toggleBlock, moveBlockToTomorrow, saveBlockNote } from "../courses/actions";
import {
  fmtDuration,
  type CockpitBlock,
  type Lane,
  type Capacity,
  type RiskVerdict,
} from "./cockpit";

/**
 * The Today cockpit — a guided, mobile-first island answering "what now / what
 * can wait / am I okay". The page computes the lanes + risk verdict (pure, in
 * cockpit.ts) and hands them down; this component owns only interaction:
 *
 *   - HERO: the next must-do block as one big primary card.
 *   - RISK LINE: one calm honest line (over / tight / on-track / clear).
 *   - QUEUE: blocks grouped Now / Next / Later / Can-slide.
 *   - SESSION SHEET: tapping a block opens a focused bottom sheet (mark done,
 *     move to tomorrow, start timer, quick note).
 *   - The shared PomodoroTimer lives at the bottom; "Start timer" scrolls to it.
 *
 * The recovery/respread "smart button" and the on-track InfoToast stay on the
 * page (server) — this island doesn't duplicate them.
 */
export default function TodayCockpit({
  blocks,
  lanes,
  hero,
  cap,
  risk,
}: {
  blocks: CockpitBlock[];
  /** Plain object map of blockId → lane (serializable across the boundary). */
  lanes: Record<string, Lane>;
  hero: CockpitBlock | null;
  cap: Capacity;
  risk: RiskVerdict;
}) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const timerRef = useRef<HTMLDivElement>(null);

  // Pomodoro targets: still-open blocks (it logs a finished sprint against one).
  const timerBlocks: TimerBlock[] = blocks
    .filter((b) => !b.completed)
    .map((b) => ({ id: b.id, topicTitle: b.topicTitle, completed: b.completed, course: { name: b.course.name } }));

  const openBlock = openId ? blocks.find((b) => b.id === openId) ?? null : null;

  function scrollToTimer() {
    timerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const LANE_ORDER: Lane[] = ["now", "next", "later", "slide"];
  const LANE_LABEL: Record<Lane, string> = {
    now: t("today.queueNow"),
    next: t("today.queueNext"),
    later: t("today.queueLater"),
    slide: t("today.queueCanSlide"),
  };
  const byLane = (lane: Lane) => blocks.filter((b) => !b.completed && lanes[b.id] === lane);

  return (
    <div>
      {/* ── HERO: the next action ── */}
      {hero ? (
        <HeroCard block={hero} onOpen={() => setOpenId(hero.id)} onTimer={scrollToTimer} />
      ) : (
        <div className="mb-4 rounded-2xl border border-green-300 bg-green-50 p-5 text-center dark:border-green-900 dark:bg-green-950/40">
          <p className="text-lg font-bold text-green-800 dark:text-green-300">
            🎉 {t("today.heroAllDone")}
          </p>
          <p className="mt-1 text-sm text-green-700 dark:text-green-400">{t("today.heroAllDoneSub")}</p>
        </div>
      )}

      {/* ── RISK LINE: one calm honest line ── */}
      <RiskLine cap={cap} risk={risk} />

      {/* ── STUDY QUEUE: Now / Next / Later / Can-slide ── */}
      <div className="mt-5 space-y-5">
        {LANE_ORDER.map((lane) => {
          const items = byLane(lane);
          if (items.length === 0) return null;
          return (
            <section key={lane}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {LANE_LABEL[lane]}
                </h2>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {items.length}
                </span>
              </div>
              {lane === "slide" && (
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                  {t("today.queueCanSlideHint")}
                </p>
              )}
              <ul className="space-y-2">
                {items.map((b) => (
                  <li key={b.id}>
                    <QueueRow block={b} dim={lane === "slide"} onOpen={() => setOpenId(b.id)} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* ── POMODORO (shared timer; "Start timer" scrolls here) ── */}
      <div ref={timerRef} className="mt-6">
        <PomodoroTimer blocks={timerBlocks} />
      </div>

      {/* ── SESSION SHEET ── */}
      <SessionSheet
        block={openBlock}
        onClose={() => setOpenId(null)}
        onStartTimer={() => {
          setOpenId(null);
          scrollToTimer();
        }}
      />
    </div>
  );
}

/** The big primary "Start <minutes>m: <topic>" hero card. */
function HeroCard({
  block,
  onOpen,
  onTimer,
}: {
  block: CockpitBlock;
  onOpen: () => void;
  onTimer: () => void;
}) {
  const t = useT();
  return (
    <div className="mb-4 rounded-2xl border border-brand/40 bg-brand/5 p-5 shadow-sm dark:border-brand/30 dark:bg-brand/10">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
        aria-label={t("today.heroOpen")}
      >
        <span className="block text-lg font-bold leading-snug sm:text-xl">
          {t("today.heroNextAction", { minutes: block.minutes, topic: block.topicTitle })}
        </span>
        <span className="mt-1 block text-sm text-gray-600 dark:text-gray-400">
          📘 {block.course.name}
          {block.kind === "review" && <> · {t("today.sheetReview")}</>}
        </span>
      </button>
      <div className="mt-4 flex gap-2">
        <Button onClick={onTimer} className="flex-1">
          {t("today.heroStartTimer")}
        </Button>
        <Button variant="secondary" onClick={onOpen} className="flex-1">
          {t("today.heroOpen")}
        </Button>
      </div>
    </div>
  );
}

/** The one-line risk verdict — calm, not a red panel. */
function RiskLine({ cap, risk }: { cap: Capacity; risk: RiskVerdict }) {
  const t = useT();
  const tone =
    risk === "over"
      ? "text-amber-700 dark:text-amber-400"
      : risk === "tight"
        ? "text-gray-700 dark:text-gray-300"
        : "text-gray-500 dark:text-gray-400";
  const dot =
    risk === "over"
      ? "bg-amber-500"
      : risk === "tight"
        ? "bg-amber-400"
        : "bg-green-500";
  const label =
    risk === "over"
      ? t("today.riskOver", { time: fmtDuration(cap.overMin) })
      : risk === "tight"
        ? t("today.riskTight", { time: fmtDuration(cap.freeMin) })
        : risk === "clear"
          ? t("today.riskClear")
          : t("today.riskOnTrack", { time: fmtDuration(cap.freeMin) });
  return (
    <p className={`flex items-center gap-2 text-sm font-medium ${tone}`}>
      <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />
      {label}
    </p>
  );
}

/**
 * A queue row: tap the body to open the session sheet; tap the checkbox to mark
 * done inline; swipe to complete/reopen — reusing the shared optimistic toggle.
 */
function QueueRow({
  block,
  dim,
  onOpen,
}: {
  block: CockpitBlock;
  dim: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  const isReview = block.kind === "review";
  const { optimisticDone, fire } = useOptimisticToggle({
    action: toggleBlock,
    actionId: "toggleBlock",
    done: block.completed,
    doneMessage: t("block.sessionDone"),
    undoneMessage: t("block.sessionNotDone"),
    errorMessage: t("block.sessionError"),
  });
  const formRef = useRef<HTMLFormElement>(null);
  const formData = () => new FormData(formRef.current ?? undefined);

  return (
    <SwipeRow
      className="rounded-xl"
      contentClassName={`flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 ${dim ? "opacity-75" : ""}`}
      right={
        optimisticDone
          ? undefined
          : { label: t("block.done"), icon: "✓", tone: "success", onTrigger: () => fire(formData(), true, true) }
      }
      left={
        optimisticDone
          ? { label: t("block.reopen"), icon: "↩", tone: "neutral", onTrigger: () => fire(formData(), false, true) }
          : undefined
      }
    >
      <form ref={formRef} className="contents">
        <input type="hidden" name="blockId" value={block.id} />
        <input type="hidden" name="revalidate" value="/today" />
        <button
          type="button"
          onClick={() => fire(formData(), !optimisticDone, true)}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border transition-colors ${
            optimisticDone
              ? "border-green-500 bg-green-500 text-white"
              : "border-gray-300 dark:border-gray-700 hover:border-gray-500"
          }`}
          aria-pressed={optimisticDone}
          aria-label={optimisticDone ? t("block.markNotDone") : t("block.markDone")}
        >
          {optimisticDone ? "✓" : ""}
        </button>
      </form>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span
          className={`block break-words ${
            optimisticDone ? "text-gray-500 dark:text-gray-400 line-through" : "font-medium"
          }`}
        >
          {block.topicTitle}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="inline-flex shrink-0 items-center rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300 tabular-nums">
            {fmtDuration(block.minutes)}
          </span>
          {isReview && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              {t("block.review")}
            </span>
          )}
          <span className="inline-flex min-w-0 items-center rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            <span className="truncate">📘 {block.course.name}</span>
          </span>
        </span>
      </button>
    </SwipeRow>
  );
}

/**
 * Focused bottom-sheet for one study block: topic + course + est time, with
 * actions — Mark done (toggleBlock), Move to tomorrow (moveBlockToTomorrow),
 * Start timer (scroll to the Pomodoro), and a quick note (saveBlockNote). Built
 * on the shared Dialog primitive, pinned to the bottom on mobile.
 */
function SessionSheet({
  block,
  onClose,
  onStartTimer,
}: {
  block: CockpitBlock | null;
  onClose: () => void;
  onStartTimer: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [pendingMove, setPendingMove] = useState(false);
  const [note, setNote] = useState("");
  const [pendingNote, setPendingNote] = useState(false);

  const { optimisticDone, fire } = useOptimisticToggle({
    action: toggleBlock,
    actionId: "toggleBlock",
    done: block?.completed ?? false,
    doneMessage: t("block.sessionDone"),
    undoneMessage: t("block.sessionNotDone"),
    errorMessage: t("block.sessionError"),
  });

  async function move() {
    if (!block || pendingMove) return;
    setPendingMove(true);
    const fd = new FormData();
    fd.set("blockId", block.id);
    try {
      await moveBlockToTomorrow(fd);
      toast(t("today.sheetMoved"), "success");
      onClose();
    } catch {
      toast(t("today.sheetMoveError"), "error");
    } finally {
      setPendingMove(false);
    }
  }

  async function saveNote() {
    if (!block || pendingNote) return;
    setPendingNote(true);
    const fd = new FormData();
    fd.set("blockId", block.id);
    fd.set("body", note);
    try {
      await saveBlockNote(fd);
      toast(t("today.sheetNoteSaved"), "success");
    } catch {
      toast(t("today.sheetNoteError"), "error");
    } finally {
      setPendingNote(false);
    }
  }

  function markDone() {
    if (!block) return;
    const fd = new FormData();
    fd.set("blockId", block.id);
    fd.set("revalidate", "/today");
    fire(fd, !optimisticDone, true);
  }

  return (
    <Dialog
      open={block != null}
      onOpenChange={(next) => {
        if (!next && !pendingMove && !pendingNote) onClose();
      }}
    >
      {/* Bottom-sheet styling on mobile (pinned to the bottom edge), centred card
          on larger screens — overriding the primitive's default centring. */}
      <DialogContent className="inset-x-0 bottom-0 top-auto m-0 max-w-none rounded-b-none rounded-t-2xl sm:inset-0 sm:m-auto sm:max-w-sm sm:rounded-2xl">
        {block && (
          <>
            <DialogTitle className="pr-8">{block.topicTitle}</DialogTitle>
            <DialogDescription>
              📘 {block.course.name} · {t("today.sheetEst", { time: fmtDuration(block.minutes) })}
              {block.kind === "review" && <> · {t("today.sheetReview")}</>}
            </DialogDescription>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={markDone} className="col-span-2">
                {optimisticDone ? t("today.sheetMarkNotDone") : t("today.sheetMarkDone")}
              </Button>
              <Button type="button" variant="secondary" onClick={onStartTimer}>
                {t("today.sheetStartTimer")}
              </Button>
              <Button type="button" variant="secondary" disabled={pendingMove} onClick={move}>
                {pendingMove ? t("today.sheetMoving") : t("today.sheetMoveTomorrow")}
              </Button>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                {t("today.sheetNoteLabel")}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("today.sheetNotePlaceholder")}
                rows={2}
                className="mt-1 w-full resize-none rounded-xl border border-gray-300 bg-white p-2.5 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pendingNote || note.trim().length === 0}
                  onClick={saveNote}
                >
                  {pendingNote ? t("today.sheetNoteSaving") : t("today.sheetNoteSave")}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
