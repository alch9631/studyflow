"use client";

import { useState, type ReactNode } from "react";
import { CalendarDays, Layers, RotateCw, SlidersHorizontal } from "lucide-react";
import { iconButtonClass } from "./ui";
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
  iconOnly = false,
  attention = false,
  children,
}: {
  /** Render-prop for the opener; receives an `open` callback. */
  trigger?: (open: () => void) => React.ReactNode;
  /** Optional impact summaries, computed without changing the plan. */
  preview?: BehindPreview;
  iconOnly?: boolean;
  attention?: boolean;
  children?: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  // Hide options that would move 0 sessions (only meaningful when we have a
  // preview). Rebalancing remains available for overdue or future work.
  const showProtect = !preview || preview.protect.moved > 0;
  const showMove = !preview || preview.move.moved > 0;

  return (
    <>
      {trigger ? trigger(() => setOpen(true)) : <button type="button" onClick={() => setOpen(true)} aria-label={t("behind.open")} title={t("behind.open")}
        className={iconOnly ? iconButtonClass("relative inline-flex shrink-0 items-center justify-center text-muted-foreground hover:bg-accent") : "min-h-11 text-sm font-medium text-brand-ink"}>
        {iconOnly ? <><SlidersHorizontal className="h-5 w-5" aria-hidden="true" />{attention && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />}</> : t("behind.open")}
      </button>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent mobileSheet data-plan-adjustments>
          <DialogTitle>{t("behind.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("behind.subtitle")}</DialogDescription>
          {children && <div className="mt-4 space-y-3 text-sm">{children}</div>}

          <div className="mt-3 divide-y divide-border">
            <BehindOption action={recoverPlan} label={t("behind.rebalanceAction")} icon={<RotateCw className="h-5 w-5" aria-hidden="true" />}
              preview={preview ? t.n("behind.todayImpact", preview.lighter.afterCount, { count: preview.lighter.afterCount, time: fmtDuration(preview.lighter.afterPaceMin) }) : null}
              pendingLabel={t("behind.working")} />
            {showProtect && (
              <BehindOption
                action={protectToday}
                label={t("behind.reviewsAction")}
                icon={<Layers className="h-5 w-5" aria-hidden="true" />}
                preview={preview ? t("behind.movedImpact", { count: preview.protect.moved }) : null}
                pendingLabel={t("behind.working")}
              />
            )}
            {showMove && (
              <BehindOption
                action={moveOptionalWork}
                label={t("behind.moveAction")}
                icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
                preview={preview ? t("behind.movedImpact", { count: preview.move.moved }) : null}
                pendingLabel={t("behind.working")}
              />
            )}
          </div>

          {preview?.lighter.examReach === "notFully" && <p className="mt-3 text-sm text-muted-foreground">{t("behind.examNotFully")}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One action and one impact line. Each row keeps its own pending state. */
function BehindOption({
  action,
  label,
  icon,
  preview,
  pendingLabel,
}: {
  action: () => Promise<void>;
  label: string;
  icon: ReactNode;
  preview: string | null;
  pendingLabel: string;
}) {
  return (
    <form action={action}>
      <SubmitButton pendingLabel={pendingLabel} className="flex min-h-16 w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-accent disabled:opacity-50">
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="min-w-0"><span className="block text-base font-medium">{label}</span>
          {preview && <span className="mt-0.5 block text-xs text-muted-foreground">{preview}</span>}
        </span>
      </SubmitButton>
    </form>
  );
}
