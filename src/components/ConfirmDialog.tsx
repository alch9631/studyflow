"use client";

import { useId, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useT } from "./i18n/I18nProvider";
import { useSheetConfirm } from "./lib/confirmSheet";
import ToastForm from "./ToastForm";
import SubmitButton from "./SubmitButton";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./ui";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

/**
 * A destructive-action button that asks for confirmation before it fires.
 *
 * Replaces the browser's native `confirm()` (which can't be styled, themed, or
 * made keyboard-trappable) with an accessible in-app modal that matches
 * StudyFlow's design system. The actual work is still a plain server action —
 * this only gates *when* the form submits.
 *
 *   <ConfirmDialog
 *     action={deleteCourse}
 *     fields={{ courseId: course.id }}
 *     triggerLabel="🗑 Delete this course"
 *     triggerVariant="danger"
 *     title="Delete this course?"
 *     message={<>This removes its topics, deadlines, and study plan.</>}
 *     confirmLabel="Delete course"
 *   />
 *
 * Layering: the form is a {@link ToastForm}, so success/error toasts and the
 * in-flight pending state come for free. The trigger and the modal live inside
 * that one form; the modal's confirm button is the real submit, so
 * `useFormStatus` drives its spinner and a double-submit can't slip through.
 */

type ServerAction = (formData: FormData) => void | Promise<void>;

type Props = {
  /** The destructive server action to run on confirm. */
  action: ServerAction;
  /** Hidden form fields the action needs (e.g. the record id). */
  fields?: Record<string, string>;
  /** Green toast after a successful, non-redirecting submit. Omit to stay silent. */
  successMessage?: string;
  /** Red toast if the action throws (localized default). */
  errorMessage?: string;

  /** Visible content of the trigger button (text and/or icon). */
  triggerLabel: ReactNode;
  /** Use the shared button tokens for the trigger. Omit for a custom icon button. */
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  /** Extra classes for the trigger (the whole className when no variant is set). */
  triggerClassName?: string;
  /** Accessible label for an icon-only trigger. */
  triggerAriaLabel?: string;

  /** Dialog heading. */
  title: string;
  /** Dialog body — what's about to happen, and that it can't be undone. */
  message: ReactNode;
  /** Confirm (destructive) button label (localized default). */
  confirmLabel?: string;
  /** Confirm button label while the action is in flight (localized default). */
  pendingLabel?: string;
  /** Cancel button label (localized default). */
  cancelLabel?: string;

  /** Classes for the wrapping <form> (e.g. layout helpers like `shrink-0`). */
  className?: string;

  /**
   * Set when this ConfirmDialog lives INSIDE the CourseOptionsSheet. The confirm
   * stays a normal modal (its own scroll-lock + focus trap), but opening it tells
   * the sheet to close itself first (via {@link useCourseSheetConfirm}). That
   * guarantees only ONE scroll-locking Radix dialog is ever active — two
   * stacked locks were what left the page frozen with a leaked scroll-lock /
   * pointer-events block. Outside the sheet (no provider) it's a no-op.
   */
  nested?: boolean;
};

export default function ConfirmDialog({
  action,
  fields,
  successMessage,
  errorMessage,
  triggerLabel,
  triggerVariant,
  triggerSize = "md",
  triggerClassName,
  triggerAriaLabel,
  title,
  message,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  className,
  nested = false,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // The confirm button is portaled out of the <form> by Radix, so it's wired
  // back to it by id (`form={formId}`) — that keeps the real submit + the
  // hidden fields together while the dialog renders at the document root.
  const formId = useId();

  // When `nested` inside the course options sheet, keep the sheet informed of
  // this confirm's open state through every close path (Cancel/Escape/outside
  // AND a successful submit's onDone) so it never gets stuck holding a hidden
  // panel mounted. No-op when used standalone.
  const notifySheet = useSheetConfirm();
  const setConfirmOpen = (next: boolean) => {
    setOpen(next);
    if (nested) notifySheet(next);
  };

  const triggerClasses = triggerVariant
    ? buttonClasses(triggerVariant, triggerSize, triggerClassName)
    : triggerClassName;

  return (
    <ToastForm
      id={formId}
      action={action}
      successMessage={successMessage}
      errorMessage={errorMessage ?? t("confirmDialog.error")}
      onDone={() => setConfirmOpen(false)}
      className={className}
    >
      {fields &&
        Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

      <ConfirmModal
        open={open}
        setOpen={setConfirmOpen}
        formId={formId}
        triggerLabel={triggerLabel}
        triggerClasses={triggerClasses}
        triggerAriaLabel={triggerAriaLabel}
        title={title}
        message={message}
        confirmLabel={confirmLabel ?? t("confirmDialog.confirm")}
        pendingLabel={pendingLabel ?? t("confirmDialog.pending")}
        cancelLabel={cancelLabel ?? t("common.cancel")}
      />
    </ToastForm>
  );
}

function ConfirmModal({
  open,
  setOpen,
  formId,
  triggerLabel,
  triggerClasses,
  triggerAriaLabel,
  title,
  message,
  confirmLabel,
  pendingLabel,
  cancelLabel,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  formId: string;
  triggerLabel: ReactNode;
  triggerClasses?: string;
  triggerAriaLabel?: string;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  cancelLabel: string;
}) {
  // Read the parent form's status (this component renders inside the ToastForm,
  // so the status flows through Radix's portal via React context). While the
  // delete is in flight we hold the dialog open and lock out
  // Cancel/Escape/backdrop so nothing races the submit. Radix handles the focus
  // trap, scroll lock, Escape, and restoring focus to the trigger on close.
  const { pending } = useFormStatus();
  const lockWhilePending = (e: Event) => {
    if (pending) e.preventDefault();
  };

  return (
    // Always a real modal (its own scroll-lock + focus trap). When `nested`, the
    // host sheet steps aside (see ConfirmDialog → setConfirmOpen) the moment this
    // opens, so the two scroll-locks never stack.
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger
        type="button"
        aria-label={triggerAriaLabel}
        className={triggerClasses}
      >
        {triggerLabel}
      </DialogTrigger>

      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={lockWhilePending}
        onPointerDownOutside={lockWhilePending}
        onInteractOutside={lockWhilePending}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{message}</DialogDescription>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              className="w-full sm:w-auto"
            >
              {cancelLabel}
            </Button>
          </DialogClose>
          <SubmitButton
            form={formId}
            variant="danger-solid"
            size="md"
            pendingLabel={pendingLabel}
            className="w-full sm:w-auto"
          >
            {confirmLabel}
          </SubmitButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
