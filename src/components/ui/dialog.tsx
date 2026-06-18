"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";

import { cn } from "@/components/lib/utils";
import { useT } from "@/components/i18n/I18nProvider";

/**
 * StudyFlow's dialog primitive, on the shadcn/ui foundation (Radix Dialog).
 *
 * Radix gives us the a11y + interaction work for free — focus trap, restore-
 * focus-to-trigger, Escape-to-close, `aria-modal`, and labelled/described wiring
 * via {@link DialogTitle}/{@link DialogDescription}. The look is StudyFlow's own:
 * the overlay and panel reuse the exact colours the hand-rolled confirmation
 * modal used, so the swap is visually identical.
 *
 * Open/close is animated with Framer Motion: the overlay and content are
 * `forceMount`ed and gated by {@link AnimatePresence} (driven by the open state
 * exposed through {@link DialogOpenContext}), which is what lets the panel
 * animate *out* on close — Radix alone unmounts instantly. Radix's focus trap,
 * scroll lock, Escape, and restore-focus-to-trigger all keep working because the
 * node stays mounted through the short exit transition.
 *
 * The panel is centred with `inset-0 m-auto` (auto-margin centring) rather than
 * a `-translate-1/2` transform, deliberately: that leaves `transform` free for
 * Framer's scale/rise entrance so the centring isn't clobbered by it.
 *
 * `prefers-reduced-motion` is honoured via Framer's `useReducedMotion`: motion
 * collapses to an instant opacity swap.
 */

/** Exposes the dialog's open state to {@link DialogContent} so AnimatePresence
 *  can keep the (forceMounted) panel around long enough to animate it out. */
const DialogOpenContext = React.createContext(false);

function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  // Track open ourselves (mirroring controlled/uncontrolled usage) so the value
  // is available to DialogContent's AnimatePresence regardless of which mode the
  // caller uses. ConfirmDialog drives this controlled.
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const isControlled = open !== undefined;
  const actualOpen = isControlled ? open : internalOpen;

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  return (
    <DialogOpenContext.Provider value={actualOpen}>
      <DialogPrimitive.Root open={actualOpen} onOpenChange={handleOpenChange} {...props}>
        {children}
      </DialogPrimitive.Root>
    </DialogOpenContext.Provider>
  );
}

const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** Show the top-right "✕" close affordance. Omit it for flows that must
   *  commit through an explicit choice (e.g. a confirmation's Cancel button). */
  showCloseButton?: boolean;
}) {
  const open = React.useContext(DialogOpenContext);
  const reduce = useReducedMotion();
  const t = useT();

  return (
    <AnimatePresence>
      {open && (
        <DialogPortal forceMount>
          <DialogPrimitive.Overlay asChild forceMount>
            <motion.div
              data-slot="dialog-overlay"
              className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.15, ease: "easeOut" }}
            />
          </DialogPrimitive.Overlay>
          <DialogPrimitive.Content asChild forceMount data-slot="dialog-content" {...props}>
            <motion.div
              className={cn(
                "fixed inset-0 z-50 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-xl bg-surface p-5 shadow-xl",
                className,
              )}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
            >
              {children}
              {showCloseButton && (
                <DialogPrimitive.Close
                  aria-label={t("common.close")}
                  className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </DialogPrimitive.Close>
              )}
            </motion.div>
          </DialogPrimitive.Content>
        </DialogPortal>
      )}
    </AnimatePresence>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("mt-2 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
};
