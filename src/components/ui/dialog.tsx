"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/components/lib/utils";

/**
 * StudyFlow's dialog primitive, on the shadcn/ui foundation (Radix Dialog).
 *
 * Radix gives us the a11y + interaction work for free — focus trap, restore-
 * focus-to-trigger, Escape-to-close, `aria-modal`, and labelled/described wiring
 * via {@link DialogTitle}/{@link DialogDescription}. The look is StudyFlow's own:
 * the overlay and panel reuse the exact colours and the `overlay-in`/`dialog-in`
 * keyframes the hand-rolled confirmation modal used, so the swap is visually
 * identical (this project has no `tailwindcss-animate`, hence the keyframes).
 *
 * The panel is centred with `inset-0 m-auto` (auto-margin centring) rather than
 * a `-translate-1/2` transform, deliberately: that leaves `transform` free for
 * the `dialog-in` keyframe (which scales/rises the panel) so the entrance
 * animation isn't clobbered by a static centring transform.
 */

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm motion-safe:animate-[overlay-in_150ms_ease-out]",
        className,
      )}
      {...props}
    />
  );
}

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
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed inset-0 z-50 m-auto h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-xl motion-safe:animate-[dialog-in_180ms_ease-out] dark:border-gray-800 dark:bg-gray-900",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <span aria-hidden="true" className="text-base leading-none">
              ✕
            </span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
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
      className={cn("mt-2 text-sm text-gray-600 dark:text-gray-300", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
};
