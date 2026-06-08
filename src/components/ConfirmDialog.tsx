"use client";

import { useId, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
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
  /** Red toast if the action throws. */
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
  /** Confirm (destructive) button label. */
  confirmLabel?: string;
  /** Confirm button label while the action is in flight. */
  pendingLabel?: string;
  /** Cancel button label. */
  cancelLabel?: string;

  /** Classes for the wrapping <form> (e.g. layout helpers like `shrink-0`). */
  className?: string;
};

export default function ConfirmDialog({
  action,
  fields,
  successMessage,
  errorMessage = "Couldn't complete that — please try again.",
  triggerLabel,
  triggerVariant,
  triggerSize = "md",
  triggerClassName,
  triggerAriaLabel,
  title,
  message,
  confirmLabel = "Delete",
  pendingLabel = "Deleting…",
  cancelLabel = "Cancel",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  // The confirm button is portaled out of the <form> by Radix, so it's wired
  // back to it by id (`form={formId}`) — that keeps the real submit + the
  // hidden fields together while the dialog renders at the document root.
  const formId = useId();

  const triggerClasses = triggerVariant
    ? buttonClasses(triggerVariant, triggerSize, triggerClassName)
    : triggerClassName;

  return (
    <ToastForm
      id={formId}
      action={action}
      successMessage={successMessage}
      errorMessage={errorMessage}
      onDone={() => setOpen(false)}
      className={className}
    >
      {fields &&
        Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

      <ConfirmModal
        open={open}
        setOpen={setOpen}
        formId={formId}
        triggerLabel={triggerLabel}
        triggerClasses={triggerClasses}
        triggerAriaLabel={triggerAriaLabel}
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        pendingLabel={pendingLabel}
        cancelLabel={cancelLabel}
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
