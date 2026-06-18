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
import { GuardianScaffold } from "@/components/GuardianScaffold";
import BehindSheet from "@/components/BehindSheet";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import { useOptimisticToggle } from "@/components/useOptimisticToggle";
import SwipeRow from "@/components/SwipeRow";
import { toggleBlock, moveBlockToTomorrow, saveBlockNote } from "../courses/actions";
import {
  fmtDuration,
  type CockpitBlock,
  type Lane,
  type RiskVerdict,
} from "./cockpit";

/** Up to this many must-do rows are shown directly; the rest collapse under "Later". */
const VISIBLE_MUST_DO = 4;

/**
 * The Today screen — sacredly simple, built on the GuardianScaffold core trio.
 *
 *   STATUS  — one big, calm, honest line ("You're okay. I set the low-priority
 *             work aside.") plus a quiet reassurance count ("2 must-do, 3
 *             optional"). It only claims what's true: deferral is mentioned only
 *             when work was actually set aside.
 *   ACTION  — ONE large primary action: "Start 30m: <topic>" → /focus.
 *   ESCAPE  — the persistent, low-key "I'm behind" affordance (BehindSheet).
 *
 * Below the trio: a SHORT list of must-do sessions (max a handful visible),
 * with everything lower-priority collapsed under "Protected for later". No
 * charts, no dense cards, no goal-at-risk, no achievement pressure. Tapping a
 * row opens the focused session sheet (mark done / move / note / start focus).
 */
export default function TodayCockpit({
  blocks,
  lanes,
  hero,
  risk,
}: {
  blocks: CockpitBlock[];
  /** Plain object map of blockId → lane (serializable across the boundary). */
  lanes: Record<string, Lane>;
  hero: CockpitBlock | null;
  risk: RiskVerdict;
}) {
  const t = useT();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);

  const openBlock = openId ? blocks.find((b) => b.id === openId) ?? null : null;

  // Start the protected Focus room for a chosen block (or today's next).
  function openFocus(blockId?: string) {
    router.push(blockId ? `/focus?blockId=${encodeURIComponent(blockId)}` : "/focus");
  }

  // Must-do = open work the day actually needs (everything except the slide lane).
  // The hero is the first of these; the list shows the rest.
  const mustDo = blocks.filter((b) => !b.completed && lanes[b.id] !== "slide");
  const optional = blocks.filter((b) => !b.completed && lanes[b.id] === "slide");
  const restMustDo = mustDo.filter((b) => b.id !== hero?.id);

  // Keep the visible list short; anything past the cap folds under "Later".
  const visibleRest = restMustDo.slice(0, VISIBLE_MUST_DO);
  const overflowRest = restMustDo.slice(VISIBLE_MUST_DO);
  const laterBlocks = [...overflowRest, ...optional];

  const deferred = optional.length > 0;
  // Honest big status line. Only the deferred copy when work was truly set aside.
  const statusLine =
    risk === "clear" || !hero
      ? t("today.calmAllDone")
      : risk === "over" && deferred
        ? t("today.calmDeferred")
        : risk === "over"
          ? t("today.calmOver")
          : t("today.calmOkay");

  return (
    <>
      <GuardianScaffold
        status={
          <div>
            <p className="text-balance text-xl font-semibold leading-snug sm:text-2xl">
              {statusLine}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("today.reassureCount", {
                mustDo: mustDo.length,
                optional: optional.length,
              })}
            </p>
          </div>
        }
        action={
          hero ? (
            <>
              <Button
                size="lg"
                className="w-full"
                onClick={() => openFocus(hero.id)}
              >
                {t("today.heroNextAction", {
                  minutes: hero.minutes,
                  topic: hero.topicTitle,
                })}
              </Button>
              <button
                type="button"
                onClick={() => setOpenId(hero.id)}
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("today.heroOptions")}
              </button>
            </>
          ) : undefined
        }
        escape={
          <BehindSheet
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className="mx-auto block text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("behind.open")}
              </button>
            )}
          />
        }
      />

      {/* ── SHORT must-do list (left-aligned, quiet rows) ── */}
      {visibleRest.length > 0 && (
        <ul className="mx-auto mt-8 max-w-md space-y-1 text-left">
          {visibleRest.map((b) => (
            <li key={b.id}>
              <QuietRow block={b} onOpen={() => setOpenId(b.id)} />
            </li>
          ))}
        </ul>
      )}

      {/* ── Everything else, calmly collapsed under "Protected for later" ── */}
      {laterBlocks.length > 0 && (
        <details className="mx-auto mt-6 max-w-md text-left">
          <summary className="cursor-pointer list-none px-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            {t("today.laterToggle", { count: laterBlocks.length })}
          </summary>
          <p className="mt-1 px-1 text-xs text-muted-foreground">
            {t("today.laterHint")}
          </p>
          <ul className="mt-2 space-y-1">
            {laterBlocks.map((b) => (
              <li key={b.id}>
                <QuietRow block={b} onOpen={() => setOpenId(b.id)} muted />
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* ── SESSION SHEET (per-block actions) ── */}
      <SessionSheet
        block={openBlock}
        onClose={() => setOpenId(null)}
        onStartFocus={() => {
          const id = openBlock?.id;
          setOpenId(null);
          openFocus(id);
        }}
      />
    </>
  );
}

/**
 * A quiet row in the must-do / later list: tap the body to open the session
 * sheet; tap the checkbox to mark done inline; swipe to complete/reopen —
 * reusing the shared optimistic toggle. Borderless: whitespace over edges.
 */
function QuietRow({
  block,
  onOpen,
  muted = false,
}: {
  block: CockpitBlock;
  onOpen: () => void;
  muted?: boolean;
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
      contentClassName={`flex items-center gap-3 rounded-xl bg-transparent px-1 py-2.5 ${
        muted ? "opacity-70" : ""
      }`}
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
              ? "border-brand bg-brand text-brand-foreground"
              : "border-input hover:border-muted-foreground"
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
            optimisticDone ? "text-muted-foreground line-through" : "font-medium"
          }`}
        >
          {block.topicTitle}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {fmtDuration(block.minutes)} · {block.course.name}
          {isReview && <> · {t("block.review")}</>}
        </span>
      </button>
    </SwipeRow>
  );
}

/**
 * Focused bottom-sheet for one study block: topic + course + est time, with
 * actions — Start focus (→ /focus), Mark done (toggleBlock), Move to tomorrow
 * (moveBlockToTomorrow), and a quick note (saveBlockNote). Built on the shared
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
              <label className="block text-xs font-medium text-muted-foreground">
                {t("today.sheetNoteLabel")}
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("today.sheetNotePlaceholder")}
                rows={2}
                className="mt-1 w-full resize-none rounded-xl border border-input bg-surface p-2.5 text-sm"
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
