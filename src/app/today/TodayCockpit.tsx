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
import { recoverPlan } from "./actions";
import { toggleBlock, moveBlockToTomorrow, saveBlockNote } from "../courses/actions";
import {
  fmtDuration,
  type CockpitBlock,
  type Lane,
  type Capacity,
  type RiskVerdict,
} from "./cockpit";
import type { PlanExplanation } from "@/lib/planExplain";

/**
 * The Today cockpit — a calm "safe place" with one primary action.
 *
 * The page computes the lanes + risk verdict (pure, in cockpit.ts) and hands
 * them down; this component shows exactly three things, in order:
 *
 *   1. HERO — the next task ("Start <Xm>: <topic>") with the course as subtitle
 *      and ONE primary button "Start focus" (→ /focus).
 *   2. STATUS LINE — one calm, honest line: over-capacity (with deferral) or
 *      on-track. Never more than this single status surface.
 *   3. The rest of today's blocks as a QUIET list of simple rows (tap → the
 *      existing session sheet).
 *
 * Everything demoted — the why-this-plan explanation, the recover/respread
 * action, and the full can-slide list — lives behind ONE secondary drawer
 * ("Help me catch up"). No energy toggle, no persistent timer, no red banners.
 */
export default function TodayCockpit({
  blocks,
  lanes,
  hero,
  cap,
  risk,
  explain,
}: {
  blocks: CockpitBlock[];
  /** Plain object map of blockId → lane (serializable across the boundary). */
  lanes: Record<string, Lane>;
  hero: CockpitBlock | null;
  cap: Capacity;
  risk: RiskVerdict;
  /** Deterministic "why this plan?" reasons (from lib/planExplain). */
  explain: PlanExplanation;
}) {
  const t = useT();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const openBlock = openId ? blocks.find((b) => b.id === openId) ?? null : null;

  // Start distraction-free Focus mode for a chosen block (or today's next).
  function openFocus(blockId?: string) {
    router.push(blockId ? `/focus?blockId=${encodeURIComponent(blockId)}` : "/focus");
  }

  // The open blocks below the hero, in plan order, minus the hero itself. One
  // quiet list — not four labelled lanes. The full can-slide list lives in the
  // drawer; here we just show the day's remaining rows.
  const restBlocks = blocks.filter((b) => !b.completed && b.id !== hero?.id);
  // The deferred (slide) blocks, for the "Help me catch up" drawer.
  const slideBlocks = blocks.filter((b) => !b.completed && lanes[b.id] === "slide");

  return (
    <div>
      {/* ── HERO: the one next action ── */}
      {hero ? (
        <HeroCard
          block={hero}
          onOpen={() => setOpenId(hero.id)}
          onStartFocus={() => openFocus(hero.id)}
        />
      ) : (
        <div className="mb-6 text-center">
          <p className="text-lg font-semibold text-green-700 dark:text-green-400">
            {t("today.heroAllDone")}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("today.heroAllDoneSub")}</p>
        </div>
      )}

      {/* ── STATUS LINE: one calm honest line (the only status surface) ── */}
      {hero && <StatusLine cap={cap} risk={risk} deferred={slideBlocks.length > 0} />}

      {/* ── THE REST OF TODAY: one quiet list of simple rows ── */}
      {restBlocks.length > 0 && (
        <ul className="mt-7 space-y-1">
          {restBlocks.map((b) => (
            <li key={b.id}>
              <QuietRow block={b} onOpen={() => setOpenId(b.id)} />
            </li>
          ))}
        </ul>
      )}

      {/* ── ONE secondary affordance: everything demoted lives here ── */}
      <div className="mt-8">
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="text-sm font-medium text-gray-500 underline-offset-4 hover:text-gray-700 hover:underline dark:text-gray-400 dark:hover:text-gray-200"
        >
          {t("today.helpOpen")}
        </button>
      </div>

      {/* ── SESSION SHEET ── */}
      <SessionSheet
        block={openBlock}
        onClose={() => setOpenId(null)}
        onStartFocus={() => {
          const id = openBlock?.id;
          setOpenId(null);
          openFocus(id);
        }}
      />

      {/* ── HELP ME CATCH UP drawer: explanation + respread + can-slide list ── */}
      <HelpDrawer
        open={helpOpen}
        explain={explain}
        slideBlocks={slideBlocks}
        onClose={() => setHelpOpen(false)}
        onStartFocus={(id) => {
          setHelpOpen(false);
          openFocus(id);
        }}
      />
    </div>
  );
}

/** The big primary hero: "Start <minutes>m: <topic>" + ONE "Start focus" button. */
function HeroCard({
  block,
  onOpen,
  onStartFocus,
}: {
  block: CockpitBlock;
  onOpen: () => void;
  onStartFocus: () => void;
}) {
  const t = useT();
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full text-left"
        aria-label={t("today.heroOpen")}
      >
        <span className="block text-2xl font-bold leading-snug sm:text-3xl">
          {t("today.heroNextAction", { minutes: block.minutes, topic: block.topicTitle })}
        </span>
        <span className="mt-1.5 block text-sm text-gray-500 dark:text-gray-400">
          {block.course.name}
          {block.kind === "review" && <> · {t("today.sheetReview")}</>}
        </span>
      </button>
      <div className="mt-5">
        <Button onClick={onStartFocus} size="lg" className="w-full sm:w-auto">
          {t("today.heroStartFocus")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The single status line — calm by default, honest when needed. Over capacity
 * with lower-priority work set aside → say so gently; otherwise a calm,
 * positive on-track line. Never invents a move that didn't happen.
 */
function StatusLine({
  cap,
  risk,
  deferred,
}: {
  cap: Capacity;
  risk: RiskVerdict;
  deferred: boolean;
}) {
  const t = useT();
  // Honest over-capacity copy: only mention deferral if work was actually set
  // aside (a slide block exists). Otherwise the calm/on-track line.
  const label =
    risk === "over" && deferred
      ? t("today.statusDeferred")
      : risk === "over"
        ? t("today.statusOver", { time: fmtDuration(cap.overMin) })
        : risk === "clear"
          ? t("today.statusClear")
          : t("today.statusOnTrack");
  return (
    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{label}</p>
  );
}

/**
 * A quiet row in the rest-of-today list: tap the body to open the session
 * sheet; tap the checkbox to mark done inline; swipe to complete/reopen —
 * reusing the shared optimistic toggle. Borderless: whitespace over edges.
 */
function QuietRow({ block, onOpen }: { block: CockpitBlock; onOpen: () => void }) {
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
      contentClassName="flex items-center gap-3 rounded-xl bg-transparent px-1 py-2.5"
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
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
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
            optimisticDone ? "text-gray-400 dark:text-gray-500 line-through" : "font-medium"
          }`}
        >
          {block.topicTitle}
        </span>
        <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
          {fmtDuration(block.minutes)} · {block.course.name}
          {isReview && <> · {t("block.review")}</>}
        </span>
      </button>
    </SwipeRow>
  );
}

/**
 * Focused bottom-sheet for one study block: topic + course + est time, with
 * actions — Mark done (toggleBlock), Move to tomorrow (moveBlockToTomorrow),
 * Start focus (→ /focus), and a quick note (saveBlockNote). Built on the shared
 * Dialog primitive, pinned to the bottom on mobile.
 */
function SessionSheet({
  block,
  onClose,
  onStartFocus,
}: {
  block: CockpitBlock | null;
  onClose: () => void;
  onStartFocus: () => void;
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
              {block.course.name} · {t("today.sheetEst", { time: fmtDuration(block.minutes) })}
              {block.kind === "review" && <> · {t("today.sheetReview")}</>}
            </DialogDescription>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" onClick={onStartFocus} className="col-span-2">
                {t("today.heroStartFocus")}
              </Button>
              <Button type="button" variant="secondary" onClick={markDone}>
                {optimisticDone ? t("today.sheetMarkNotDone") : t("today.sheetMarkDone")}
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

/** Shared bottom-sheet dialog content classes (mirrors the SessionSheet). */
const SHEET_CONTENT_CLASS =
  "inset-x-0 bottom-0 top-auto m-0 max-h-[85vh] max-w-none overflow-y-auto rounded-b-none rounded-t-2xl sm:inset-0 sm:m-auto sm:max-w-md sm:rounded-2xl";

/**
 * "Help me catch up" drawer — the ONE secondary affordance that holds everything
 * demoted from Today: the deterministic why-this-plan explanation, the
 * recover/respread action (reuses recoverPlan), and the full can-slide list of
 * lower-priority work the student can push to tomorrow. Calm language only.
 */
function HelpDrawer({
  open,
  explain,
  slideBlocks,
  onClose,
  onStartFocus,
}: {
  open: boolean;
  explain: PlanExplanation;
  slideBlocks: CockpitBlock[];
  onClose: () => void;
  onStartFocus: (blockId: string) => void;
}) {
  const t = useT();
  const { capacity, order } = explain;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className={SHEET_CONTENT_CLASS}>
        <DialogTitle>{t("today.helpTitle")}</DialogTitle>
        <DialogDescription>{t("today.helpSubtitle")}</DialogDescription>

        {/* Respread — the one recovery action, calmly worded. */}
        <form action={recoverPlan} className="mt-4">
          <Button type="submit" className="w-full">
            {t("today.helpRespreadCta")}
          </Button>
          <p className="mt-1.5 text-center text-xs text-gray-500 dark:text-gray-400">
            {t("today.helpRespreadHint")}
          </p>
        </form>

        {/* The full can-slide list — lower-priority work, fine to push to tomorrow. */}
        {slideBlocks.length > 0 && (
          <section className="mt-6">
            <h3 className="text-sm font-semibold">{t("today.helpSlideTitle")}</h3>
            <p className="mb-2 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {t("today.helpSlideHint")}
            </p>
            <ul className="space-y-1">
              {slideBlocks.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => onStartFocus(b.id)}
                    className="flex w-full items-center gap-3 rounded-xl px-1 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium">{b.topicTitle}</span>
                      <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                        {fmtDuration(b.minutes)} · {b.course.name}
                        {b.kind === "review" && <> · {t("block.review")}</>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Why this plan — the deterministic explanation, demoted here. */}
        <section className="mt-6">
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
