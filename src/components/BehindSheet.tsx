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

/**
 * The signature "I'm behind" sheet — StudyFlow's calmest recovery surface.
 *
 * A persistent, low-key affordance (rendered as Today's escape hatch) opens a
 * quiet sheet with exactly THREE options, in order of increasing touch:
 *
 *   1. Protect today      → protectToday      (pushes only today's reviews to
 *                                              tomorrow; keeps must-do study)
 *   2. Move optional work  → moveOptionalWork  (pushes all of today's open work
 *                                              to tomorrow; nothing is lost)
 *   3. Make a lighter plan → recoverPlan       (respreads everything across the
 *                                              days before each exam)
 *
 * Every option is a server action already proven safe elsewhere — this sheet
 * invents no planner logic. Wording stays calm and reassuring: no "panic", no
 * "crunch", no blame. Each option commits and the page revalidates, so the sheet
 * closes onto a calmer Today.
 *
 * The trigger is owned by the caller (Today passes it as `trigger`); this
 * component owns only the sheet itself, so the affordance can sit wherever a
 * screen wants its escape hatch.
 */
export default function BehindSheet({
  trigger,
}: {
  /** Render-prop for the low-key opener; receives an `open` callback. */
  trigger: (open: () => void) => React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

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
            <BehindOption
              action={protectToday}
              label={t("behind.protectTitle")}
              hint={t("behind.protectHint")}
              pendingLabel={t("behind.working")}
            />
            <BehindOption
              action={moveOptionalWork}
              label={t("behind.moveTitle")}
              hint={t("behind.moveHint")}
              pendingLabel={t("behind.working")}
            />
            <BehindOption
              action={recoverPlan}
              label={t("behind.lighterTitle")}
              hint={t("behind.lighterHint")}
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
  pendingLabel,
}: {
  action: () => Promise<void>;
  label: string;
  hint: string;
  pendingLabel: string;
}) {
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <SubmitButton variant="secondary" pendingLabel={pendingLabel} className="w-full">
        {label}
      </SubmitButton>
      <p className="px-1 text-xs text-muted-foreground">{hint}</p>
    </form>
  );
}
