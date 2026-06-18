"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import SubmitButton from "@/components/SubmitButton";
import { useT } from "@/components/i18n/I18nProvider";
import { protectToday, moveOptionalWork, recoverPlan } from "@/app/today/actions";

/** Before→after preview numbers so each option's label matches its real effect. */
export type BehindPreview = {
  /** Today's open (incomplete) session count before any action. */
  todayCount: number;
  /** How many sessions "Protect today" would move (today's open reviews). */
  protectMoves: number;
  /** Essentials that remain on today after "Protect today". */
  essentialsAfterProtect: number;
  /** How many sessions "Move today's work" would move (ALL open today). */
  moveMoves: number;
};

/**
 * The ONE recovery surface — "Adjust today". StudyFlow's calmest catch-up sheet,
 * and the single entry point that replaced the old trio of triggers (the amber
 * "Rebuild my plan" banner, "Other options", and "I'm behind").
 *
 * It opens a quiet sheet with up to three options, in order of increasing touch.
 * Each label now matches its true effect, and an option that would move zero
 * sessions is hidden (no dead choices):
 *
 *   1. Protect today       → protectToday     (moves only today's reviews to
 *                                              tomorrow; keeps the essentials)
 *   2. Move today's work    → moveOptionalWork (moves ALL of today's open work to
 *                                              tomorrow — named for what it does)
 *   3. Make a lighter plan  → recoverPlan      (respreads everything across the
 *                                              days before each exam — always on)
 *
 * Where `preview` is supplied, each option shows a brief before→after line
 * (today N → essentials / moved), so the choice is honest at a glance. Every
 * option is a server action already proven safe elsewhere — this sheet invents
 * no planner logic. Wording stays calm: no "panic", no "crunch", no blame.
 *
 * The trigger is owned by the caller (Today passes it as `trigger`); this
 * component owns only the sheet itself.
 */
export default function BehindSheet({
  trigger,
  preview,
}: {
  /** Render-prop for the opener; receives an `open` callback. */
  trigger: (open: () => void) => React.ReactNode;
  /** Optional before→after numbers; without it the options show hints only. */
  preview?: BehindPreview;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  // Hide options that would move 0 sessions (only meaningful when we have a
  // preview). "Make a lighter plan" is always available — respread is never a
  // no-op surface even when today is empty.
  const showProtect = !preview || preview.protectMoves > 0;
  const showMove = !preview || preview.moveMoves > 0;

  return (
    <>
      {trigger(() => setOpen(true))}

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Bottom-sheet on mobile, centred card on larger screens — matching the
            other Today sheets. Generous padding makes it read as a calm room. */}
        <DialogContent className="inset-x-0 bottom-0 top-auto m-0 max-w-none rounded-b-none rounded-t-2xl sm:inset-0 sm:m-auto sm:max-w-sm sm:rounded-2xl">
          <DialogTitle>{t("behind.title")}</DialogTitle>
          <DialogDescription>{t("behind.subtitle")}</DialogDescription>

          <div className="mt-5 flex flex-col gap-3">
            {showProtect && (
              <BehindOption
                action={protectToday}
                label={t("behind.protectTitle")}
                hint={t("behind.protectHint")}
                preview={
                  preview
                    ? t("behind.protectPreview", {
                        from: preview.todayCount,
                        essentials: preview.essentialsAfterProtect,
                        moved: preview.protectMoves,
                      })
                    : null
                }
                pendingLabel={t("behind.working")}
              />
            )}
            {showMove && (
              <BehindOption
                action={moveOptionalWork}
                label={t("behind.moveTitle")}
                hint={t("behind.moveHint")}
                preview={
                  preview
                    ? t("behind.movePreview", {
                        from: preview.todayCount,
                        moved: preview.moveMoves,
                      })
                    : null
                }
                pendingLabel={t("behind.working")}
              />
            )}
            <BehindOption
              action={recoverPlan}
              label={t("behind.lighterTitle")}
              hint={t("behind.lighterHint")}
              preview={null}
              pendingLabel={t("behind.working")}
            />
          </div>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            {t("behind.reassure")}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * One calm option row: a full-width secondary button (the action's title) with a
 * one-line plain-language hint beneath it. The button is its own form so each
 * option commits its server action independently with a pending state.
 */
function BehindOption({
  action,
  label,
  hint,
  preview,
  pendingLabel,
}: {
  action: () => Promise<void>;
  label: string;
  hint: string;
  /** Brief before→after line shown above the hint, when available. */
  preview: string | null;
  pendingLabel: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <SubmitButton variant="secondary" pendingLabel={pendingLabel} className="w-full">
        {label}
      </SubmitButton>
      {preview && (
        <p className="px-1 text-xs font-medium text-foreground">{preview}</p>
      )}
      <p className="px-1 text-xs text-muted-foreground">{hint}</p>
    </form>
  );
}
