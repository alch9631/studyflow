"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import type { Translator } from "@/components/i18n/messages";
import { useOptimisticToggle } from "@/components/useOptimisticToggle";
import SwipeRow from "@/components/SwipeRow";
import PomodoroTimer, { type TimerBlock } from "@/components/PomodoroTimer";
import { recoverPlan } from "./actions";
import { toggleBlock, moveBlockToTomorrow, saveBlockNote } from "../courses/actions";
import {
  fmtDuration,
  reorderByEnergy,
  type CockpitBlock,
  type Lane,
  type Capacity,
  type RiskVerdict,
  type Energy,
  type Triage,
  type TriageBlock,
} from "./cockpit";
import type { PlanExplanation } from "@/lib/planExplain";

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
  explain,
  panic,
}: {
  blocks: CockpitBlock[];
  /** Plain object map of blockId → lane (serializable across the boundary). */
  lanes: Record<string, Lane>;
  hero: CockpitBlock | null;
  cap: Capacity;
  risk: RiskVerdict;
  /** Deterministic "why this plan?" reasons (from lib/planExplain). */
  explain: PlanExplanation;
  /** Crunch-mode triage, present only when a near exam is over capacity. */
  panic: { examName: string; examDays: number; triage: Triage } | null;
}) {
  const t = useT();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  // Energy of the day — CLIENT-ONLY reorder of the displayed queue (no persist).
  const [energy, setEnergy] = useState<Energy>("normal");
  const [explainOpen, setExplainOpen] = useState(false);
  const [crunchOpen, setCrunchOpen] = useState(false);

  // Pomodoro targets: still-open blocks (it logs a finished sprint against one).
  const timerBlocks: TimerBlock[] = blocks
    .filter((b) => !b.completed)
    .map((b) => ({ id: b.id, topicTitle: b.topicTitle, completed: b.completed, course: { name: b.course.name } }));

  const openBlock = openId ? blocks.find((b) => b.id === openId) ?? null : null;

  // "Start timer" now opens distraction-free Focus mode for the chosen block.
  function openFocus(blockId?: string) {
    router.push(blockId ? `/focus?blockId=${encodeURIComponent(blockId)}` : "/focus");
  }

  const LANE_ORDER: Lane[] = ["now", "next", "later", "slide"];
  const LANE_LABEL: Record<Lane, string> = {
    now: t("today.queueNow"),
    next: t("today.queueNext"),
    later: t("today.queueLater"),
    slide: t("today.queueCanSlide"),
  };
  // Reorder the displayed queue by the chosen energy (pure, client-side). The
  // lane grouping is preserved; only the WITHIN-lane order changes.
  const byLane = (lane: Lane) =>
    reorderByEnergy(blocks.filter((b) => !b.completed && lanes[b.id] === lane), energy);

  return (
    <div>
      {/* ── ENERGY + drawer entry points ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <EnergyToggle energy={energy} onChange={setEnergy} />
        <div className="ml-auto flex flex-wrap gap-2">
          {panic && (
            <button
              type="button"
              onClick={() => setCrunchOpen(true)}
              className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
            >
              ⚡ {t("today.crunchOpen")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExplainOpen(true)}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            ? {t("today.explainOpen")}
          </button>
        </div>
      </div>
      {/* ── HERO: the next action ── */}
      {hero ? (
        <HeroCard block={hero} onOpen={() => setOpenId(hero.id)} onTimer={() => openFocus(hero.id)} />
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
                  // #12: a subtle move transition so an energy reorder / respread
                  // settles smoothly rather than snapping.
                  <li key={b.id} className="transition-all duration-300 ease-out">
                    <QueueRow block={b} dim={lane === "slide"} onOpen={() => setOpenId(b.id)} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* ── POMODORO (shared timer) ── */}
      <div className="mt-6">
        <PomodoroTimer blocks={timerBlocks} />
      </div>

      {/* ── SESSION SHEET ── */}
      <SessionSheet
        block={openBlock}
        onClose={() => setOpenId(null)}
        onStartTimer={() => {
          const id = openBlock?.id;
          setOpenId(null);
          openFocus(id);
        }}
      />

      {/* ── EXPLAIN-MY-PLAN drawer ── */}
      <ExplainDrawer open={explainOpen} explain={explain} onClose={() => setExplainOpen(false)} />

      {/* ── PANIC / CRUNCH drawer ── */}
      {panic && (
        <CrunchDrawer
          open={crunchOpen}
          examName={panic.examName}
          examDays={panic.examDays}
          triage={panic.triage}
          onClose={() => setCrunchOpen(false)}
          onFocus={(id) => {
            setCrunchOpen(false);
            openFocus(id);
          }}
        />
      )}
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

/**
 * Energy of the day — a small segmented Low / Normal / High control. CLIENT-ONLY:
 * it never persists and never re-plans; it just reorders the queue the user sees
 * (see reorderByEnergy). A one-line hint explains the active mode.
 */
function EnergyToggle({ energy, onChange }: { energy: Energy; onChange: (e: Energy) => void }) {
  const t = useT();
  const opts: { value: Energy; label: string }[] = [
    { value: "low", label: t("today.energyLow") },
    { value: "normal", label: t("today.energyNormal") },
    { value: "high", label: t("today.energyHigh") },
  ];
  const hint =
    energy === "high"
      ? t("today.energyHintHigh")
      : energy === "low"
        ? t("today.energyHintLow")
        : t("today.energyHintNormal");
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t("today.energyLabel")}</span>
      <div
        role="radiogroup"
        aria-label={t("today.energyAria")}
        className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-800 dark:bg-gray-900"
      >
        {opts.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={energy === o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              energy === o.value
                ? "bg-brand text-brand-foreground"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <span className="hidden text-xs text-gray-400 dark:text-gray-500 sm:inline">{hint}</span>
    </div>
  );
}

/** Shared bottom-sheet dialog content classes (mirrors the SessionSheet). */
const SHEET_CONTENT_CLASS =
  "inset-x-0 bottom-0 top-auto m-0 max-h-[85vh] max-w-none overflow-y-auto rounded-b-none rounded-t-2xl sm:inset-0 sm:m-auto sm:max-w-md sm:rounded-2xl";

/**
 * "Why this plan?" drawer — renders the DETERMINISTIC explanation built in
 * lib/planExplain (capacity reason + ordering reason). Every sentence is a
 * truthful read of the same signals the planner uses; nothing is generated.
 */
function ExplainDrawer({
  open,
  explain,
  onClose,
}: {
  open: boolean;
  explain: PlanExplanation;
  onClose: () => void;
}) {
  const t = useT();
  const { capacity, order } = explain;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className={SHEET_CONTENT_CLASS}>
        <DialogTitle>{t("explain.title")}</DialogTitle>
        <DialogDescription>{t("explain.methodNote")}</DialogDescription>

        <section className="mt-4">
          <h3 className="text-sm font-semibold">{t("explain.capacityHeading")}</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{capacityReason(t, capacity)}</p>
        </section>

        {order && (
          <section className="mt-4">
            <h3 className="text-sm font-semibold">{t("explain.orderHeading")}</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{orderReason(t, order)}</p>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Render the capacity reason in the active locale (truthful, from the math). */
function capacityReason(t: Translator, cap: PlanExplanation["capacity"]): string {
  switch (cap.kind) {
    case "clear":
      return t("explain.capacityClear");
    case "over":
      return t("explain.capacityOver", {
        remaining: fmtDuration(cap.remainingMin),
        available: fmtDuration(cap.availableMin),
        over: fmtDuration(cap.overMin),
      });
    case "tight":
      return t("explain.capacityTight", {
        remaining: fmtDuration(cap.remainingMin),
        available: fmtDuration(cap.availableMin),
        free: fmtDuration(cap.freeMin),
      });
    case "ontrack":
      return t("explain.capacityOnTrack", {
        remaining: fmtDuration(cap.remainingMin),
        available: fmtDuration(cap.availableMin),
        free: fmtDuration(cap.freeMin),
      });
  }
}

/** Render the ordering reason in the active locale (truthful, from the signals). */
function orderReason(t: Translator, order: NonNullable<PlanExplanation["order"]>): string {
  switch (order.kind) {
    case "sooner-exam":
      return t("explain.orderSoonerExam", {
        before: order.before,
        after: order.after,
        beforeDays: order.beforeDays,
        afterDays: order.afterDays,
      });
    case "more-effort":
      return t("explain.orderMoreEffort", {
        before: order.before,
        after: order.after,
        beforeMin: fmtDuration(order.beforeMin),
        afterMin: fmtDuration(order.afterMin),
      });
    case "tie":
      return t("explain.orderTie", { before: order.before, after: order.after });
  }
}

/**
 * Crunch mode — a CALM triage drawer for when a near exam meets an over-capacity
 * day. Everything shown is the student's OWN data (no fabricated exam topics): a
 * minimum-viable "do these first" list (by exam proximity + effort), skim/skip
 * candidates (short / review / already-confident topics), and a practice-first
 * hint. The respread button reuses the existing recoverPlan action.
 */
function CrunchDrawer({
  open,
  examName,
  examDays,
  triage,
  onClose,
  onFocus,
}: {
  open: boolean;
  examName: string;
  examDays: number;
  triage: Triage;
  onClose: () => void;
  onFocus: (blockId: string) => void;
}) {
  const t = useT();
  const empty = triage.mustDo.length === 0 && triage.skim.length === 0;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className={SHEET_CONTENT_CLASS}>
        <DialogTitle>⚡ {t("panic.title")}</DialogTitle>
        <DialogDescription>
          {t("panic.subtitle", { course: examName, days: examDays })}
        </DialogDescription>

        {empty ? (
          <div className="mt-4 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
            <p className="font-semibold">{t("panic.nothingTitle")}</p>
            <p className="mt-1">{t("panic.nothingBody")}</p>
          </div>
        ) : (
          <>
            {/* Practice-first hint (calm, generic study advice — not exam content). */}
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-800 dark:bg-gray-900">
              <p className="font-semibold">{t("panic.practiceTitle")}</p>
              <p className="mt-1 text-gray-600 dark:text-gray-300">{t("panic.practiceBody")}</p>
            </div>

            {triage.mustDo.length > 0 && (
              <section className="mt-4">
                <h3 className="text-sm font-semibold">{t("panic.mvpTitle")}</h3>
                <p className="mb-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t("panic.mvpHint")}</p>
                <ul className="space-y-2">
                  {triage.mustDo.map((b) => (
                    <TriageRow key={b.id} block={b} onFocus={() => onFocus(b.id)} />
                  ))}
                </ul>
              </section>
            )}

            {triage.skim.length > 0 && (
              <section className="mt-4">
                <h3 className="text-sm font-semibold">{t("panic.skimTitle")}</h3>
                <p className="mb-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t("panic.skimHint")}</p>
                <ul className="space-y-2">
                  {triage.skim.map((b) => (
                    <TriageRow key={b.id} block={b} dim onFocus={() => onFocus(b.id)} />
                  ))}
                </ul>
              </section>
            )}

            {/* Reuse the existing recover/respread action — no new planner logic. */}
            <form action={recoverPlan} className="mt-5">
              <Button type="submit" variant="secondary" className="w-full">
                ↻ {t("panic.respreadCta")}
              </Button>
              <p className="mt-1.5 text-center text-xs text-gray-500 dark:text-gray-400">
                {t("panic.respreadHint")}
              </p>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One triage row: topic + course + est time + confidence tag; tap to Focus. */
function TriageRow({
  block,
  dim,
  onFocus,
}: {
  block: TriageBlock;
  dim?: boolean;
  onFocus: () => void;
}) {
  const t = useT();
  return (
    <li>
      <button
        type="button"
        onClick={onFocus}
        className={`flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left transition-colors hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600 ${
          dim ? "opacity-75" : ""
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block break-words font-medium">{block.topicTitle}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className="tabular-nums">{fmtDuration(block.minutes)}</span>
            <span className="truncate">· 📘 {block.courseName}</span>
            {block.kind === "review" && <span>· {t("focus.review")}</span>}
            {block.confidence === "solid" && (
              <span className="text-green-600 dark:text-green-400">· {t("panic.confidentTag")}</span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}
