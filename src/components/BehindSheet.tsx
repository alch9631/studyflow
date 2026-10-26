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
import { fmtDuration, type recoveryActionPreviews } from "@/app/today/cockpit";
import { protectToday, moveOptionalWork, recoverPlan } from "@/app/today/actions";

/** The exact same summaries rendered by Today; do not flatten or budget-cap them. */
export type BehindPreview = ReturnType<typeof recoveryActionPreviews>;

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
  // preview). Rebalancing remains available for overdue or future work.
  const showProtect = !preview || preview.protect.moved > 0;
  const showMove = !preview || preview.move.moved > 0;

  // Only a full rebuild has a simulated exam outcome. Date shifts report their
  // actual remaining workload without promising how the future plan will fit.
  const examLine = preview?.lighter.examReach === "possible"
    ? t("behind.examPossible")
    : preview?.lighter.examReach === "notFully"
      ? t("behind.examNotFully")
      : null;

  return (
    <>
      {trigger(() => setOpen(true))}

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Bottom-sheet on mobile, centred card on larger screens — matching the
            other Today sheets. Generous padding makes it read as a calm room. */}
        <DialogContent mobileSheet>
          <DialogTitle>{t("behind.title")}</DialogTitle>
          <DialogDescription>{t("behind.subtitle")}</DialogDescription>

          <div className="mt-5 flex flex-col gap-3">
            <BehindOption action={recoverPlan} label={t("behind.recommendedAction")} hint={t("behind.recommendedHint")}
              preview={preview ? t("behind.lighterPreview", { from: preview.lighter.beforeCount, remaining: preview.lighter.afterCount, pace: fmtDuration(preview.lighter.afterPaceMin) }) : null}
              days={preview?.lighter.days} examLine={examLine} pendingLabel={t("behind.working")} recommended />
            <details><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">{t("behind.otherOptions")}</summary>
            <div className="mt-3 space-y-4">
            {showProtect && (
              <BehindOption
                action={protectToday}
                label={t("behind.protectTitle")}
                hint={t("behind.protectHint")}
                preview={
                  preview
                    ? t("behind.protectPreview", {
                        from: preview.protect.beforeCount,
                        remaining: preview.protect.afterCount,
                        moved: preview.protect.moved,
                        pace: fmtDuration(preview.protect.afterPaceMin),
                      })
                    : null
                }
                pendingLabel={t("behind.working")}
                days={preview?.protect.days}
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
                        from: preview.move.beforeCount,
                        remaining: preview.move.afterCount,
                        pace: fmtDuration(preview.move.afterPaceMin),
                        moved: preview.move.moved,
                      })
                    : null
                }
                pendingLabel={t("behind.working")}
                days={preview?.move.days}
              />
            )}
            </div></details>
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
  examLine,
  pendingLabel,
  days,
  recommended = false,
}: {
  action: () => Promise<void>;
  label: string;
  hint: string;
  /** Brief before→after line shown above the hint, when available. */
  preview: string | null;
  /** Honest nearest-exam line ("still possible" / "no longer fully possible"). */
  examLine?: string | null;
  pendingLabel: string;
  days?: { date: string; minutes: number; capacity: number }[];
  recommended?: boolean;
}) {
  const t = useT();
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <SubmitButton variant={recommended ? "primary" : "secondary"} pendingLabel={pendingLabel} className="w-full">
        {label}
      </SubmitButton>
      {preview && (
        <p className="px-1 text-xs font-medium text-foreground">{preview}</p>
      )}
      {examLine && (
        <p className="px-1 text-xs font-medium text-muted-foreground">{examLine}</p>
      )}
      <p className="px-1 text-xs text-muted-foreground">{hint}</p>
      {days && <ul className="mt-2 space-y-1 text-sm">{days.map((day) => <li key={day.date} className="flex flex-wrap justify-between gap-2">
        <span>{day.date}</span><span>{t("behind.dayLoad", { time: fmtDuration(day.minutes), capacity: fmtDuration(day.capacity) })}{day.minutes > day.capacity ? ` · ${t("behind.overCapacity")}` : ""}</span>
      </li>)}</ul>}
    </form>
  );
}
