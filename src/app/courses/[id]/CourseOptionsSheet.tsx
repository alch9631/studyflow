"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Settings, X } from "lucide-react";

import { cn } from "@/components/lib/utils";
import { iconButtonClass } from "@/components/ui";
import { useT } from "@/components/i18n/I18nProvider";
import {
  SheetConfirmContext,
  type SheetConfirmCtx,
} from "@/components/lib/confirmSheet";

/**
 * The course "⚙️ options" control: an icon-only trigger (label appears on
 * desktop) that opens a side **Sheet** holding the course-settings forms, the
 * grade form, the full deadlines management, and the delete action.
 *
 * Built on Radix **Dialog** — NOT Radix DropdownMenu — on purpose: this panel
 * contains real <form> elements (and framer-motion + confirmation dialogs).
 * Nesting forms inside a Radix *menu* crashes in production; a Radix Dialog is
 * the supported home for them. So every form here lives inside a Dialog, never a
 * menu.
 *
 * The panel content is server-rendered by the page and passed through as
 * `children` (server components as a client component's children), which keeps
 * the server actions, server-side i18n, and ConfirmDialog wiring intact.
 *
 * **One scroll-lock at a time.** A destructive ConfirmDialog inside the panel
 * registers itself through {@link CourseSheetContext}. When such a confirm
 * opens, the sheet *closes itself* (releasing its body scroll-lock / focus
 * trap) so the confirm becomes the single, top-level modal — two scroll-locking
 * Radix dialogs never stack. The panel subtree is kept mounted (but visually
 * hidden + inert) only while a confirm is mid-flight so the confirm's form,
 * server action, and `useFormStatus` wiring survive the sheet closing; once the
 * confirm closes, the whole subtree unmounts and every lock is released.
 *
 * The sheet slides in from the right on desktop and rises from the bottom on
 * mobile; `prefers-reduced-motion` collapses motion to an instant opacity swap.
 */

export default function CourseOptionsSheet({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  // True while a destructive confirm inside the panel has its modal open. We
  // keep the (closed) panel subtree mounted during this window so the confirm's
  // form survives, then unmount once it's done.
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const reduce = useReducedMotion();

  const ctx = React.useMemo<SheetConfirmCtx>(
    () => ({ closeSheet: () => setOpen(false), setConfirmOpen }),
    [],
  );

  // The panel chrome shows only while the sheet is genuinely open. The subtree
  // stays mounted while a confirm is finishing, but inert + hidden so it neither
  // grabs focus nor paints behind the confirm modal.
  const mounted = open || confirmOpen;
  const chromeHidden = !open && confirmOpen;

  return (
    <SheetConfirmContext.Provider value={ctx}>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger
          type="button"
          aria-label={t("courseDetail.optionsAria")}
          className={iconButtonClass(
            "inline-flex shrink-0 gap-1.5 border border-gray-300 px-0 text-gray-700 hover:bg-gray-100 sm:w-auto sm:px-4 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800",
          )}
        >
          <Settings className="h-5 w-5" aria-hidden="true" />
          <span className="hidden text-sm font-medium sm:inline">
            {t("courseDetail.optionsLabel")}
          </span>
        </DialogPrimitive.Trigger>

        <AnimatePresence>
          {mounted && (
            <DialogPrimitive.Portal forceMount>
              {!chromeHidden && (
                <DialogPrimitive.Overlay asChild forceMount>
                  <motion.div
                    className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduce ? 0 : 0.15, ease: "easeOut" }}
                  />
                </DialogPrimitive.Overlay>
              )}
              <DialogPrimitive.Content
                asChild
                forceMount
                // While we keep the panel mounted purely to host a finishing
                // confirm, suppress Radix's auto-focus/return-focus so the
                // confirm modal keeps focus, and don't let Escape/outside taps
                // re-target the hidden panel.
                onOpenAutoFocus={chromeHidden ? (e) => e.preventDefault() : undefined}
                onCloseAutoFocus={chromeHidden ? (e) => e.preventDefault() : undefined}
              >
                <motion.div
                  // `inert` + aria-hidden when chrome is hidden: fully removes the
                  // stale panel from the a11y tree and the tab order so the
                  // confirm modal owns focus.
                  inert={chromeHidden}
                  aria-hidden={chromeHidden || undefined}
                  className={cn(
                    // Mobile: a bottom sheet that nearly fills the viewport.
                    // Desktop (sm+): a right-anchored side sheet.
                    "fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-5 shadow-xl",
                    "sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:h-dvh sm:w-full sm:max-w-md sm:rounded-none sm:rounded-l-2xl",
                    "dark:border-gray-800 dark:bg-gray-900",
                    chromeHidden && "pointer-events-none invisible",
                  )}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: "8%" }}
                  animate={chromeHidden ? { opacity: 0 } : { opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: "8%" }}
                  transition={{ duration: reduce ? 0 : 0.2, ease: "easeOut" }}
                >
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">
                      {t("courseDetail.optionsTitle")}
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Close
                      aria-label={t("common.close")}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </DialogPrimitive.Close>
                  </div>
                  <DialogPrimitive.Description className="sr-only">
                    {t("courseDetail.optionsDesc")}
                  </DialogPrimitive.Description>
                  {children}
                </motion.div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          )}
        </AnimatePresence>
      </DialogPrimitive.Root>
    </SheetConfirmContext.Provider>
  );
}
