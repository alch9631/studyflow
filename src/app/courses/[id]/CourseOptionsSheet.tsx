"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { cn } from "@/components/lib/utils";
import { iconButtonClass } from "@/components/ui";
import { useT } from "@/components/i18n/I18nProvider";

/**
 * The course "⚙️ options" control: an icon-only trigger (label appears on
 * desktop) that opens a side **Sheet** holding the course-settings forms, the
 * grade form, the full deadlines management, and the delete action.
 *
 * Built on Radix **Dialog** — NOT Radix DropdownMenu — on purpose: this panel
 * contains real <form> elements (and framer-motion + nested confirmation
 * dialogs). Nesting forms inside a Radix *menu* crashes in production; a Radix
 * Dialog is the supported home for them (the app's own ConfirmDialog already
 * nests a full form inside DialogContent and ships to prod). So every form here
 * lives inside a Dialog, never a menu.
 *
 * The panel content is server-rendered by the page and passed through as
 * `children` (server components as a client component's children), which keeps
 * the server actions, server-side i18n, and ConfirmDialog wiring intact.
 *
 * The sheet slides in from the right on desktop and rises from the bottom on
 * mobile; `prefers-reduced-motion` collapses motion to an instant opacity swap.
 */
export default function CourseOptionsSheet({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const reduce = useReducedMotion();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        type="button"
        aria-label={t("courseDetail.optionsAria")}
        className={iconButtonClass(
          "inline-flex shrink-0 gap-1.5 border border-gray-300 px-0 text-gray-700 hover:bg-gray-100 sm:w-auto sm:px-4 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800",
        )}
      >
        <span aria-hidden="true">⚙️</span>
        <span className="hidden text-sm font-medium sm:inline">
          {t("courseDetail.optionsLabel")}
        </span>
      </DialogPrimitive.Trigger>

      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.15, ease: "easeOut" }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                className={cn(
                  // Mobile: a bottom sheet that nearly fills the viewport.
                  // Desktop (sm+): a right-anchored side sheet.
                  "fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-5 shadow-xl",
                  "sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:h-dvh sm:w-full sm:max-w-md sm:rounded-none sm:rounded-l-2xl",
                  "dark:border-gray-800 dark:bg-gray-900",
                )}
                initial={
                  reduce
                    ? { opacity: 0 }
                    : { opacity: 0, y: "8%" }
                }
                animate={{ opacity: 1, y: 0 }}
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
                    <span aria-hidden="true" className="text-base leading-none">
                      ✕
                    </span>
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
  );
}
