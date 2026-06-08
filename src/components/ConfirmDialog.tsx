"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import ToastForm from "./ToastForm";
import SubmitButton from "./SubmitButton";
import { buttonClasses, cardClass, type ButtonSize, type ButtonVariant } from "./ui";

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
  const triggerRef = useRef<HTMLButtonElement>(null);

  const triggerClasses = triggerVariant
    ? buttonClasses(triggerVariant, triggerSize, triggerClassName)
    : triggerClassName;

  return (
    <ToastForm
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

      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerAriaLabel}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={triggerClasses}
      >
        {triggerLabel}
      </button>

      <ConfirmModal
        open={open}
        onRequestClose={() => setOpen(false)}
        returnFocusTo={triggerRef}
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
  onRequestClose,
  returnFocusTo,
  title,
  message,
  confirmLabel,
  pendingLabel,
  cancelLabel,
}: {
  open: boolean;
  onRequestClose: () => void;
  returnFocusTo: React.RefObject<HTMLButtonElement | null>;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  cancelLabel: string;
}) {
  // Read the parent form's status: while the delete is in flight we hold the
  // dialog open and lock out cancel/Escape/backdrop so nothing races the submit.
  const { pending } = useFormStatus();
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // While open: focus the (safe) Cancel button, trap focus, lock body scroll,
  // close on Escape, and return focus to the trigger on close. Mirrors the
  // mobile-nav drawer's modal handling so behaviour is consistent app-wide.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const trigger = returnFocusTo.current;

    cancelRef.current?.focus();

    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>("button:not([disabled])"),
      ).filter((el) => el.offsetParent !== null);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!pending) onRequestClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
  }, [open, pending, onRequestClose, returnFocusTo]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        onClick={() => {
          if (!pending) onRequestClose();
        }}
        className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm motion-safe:animate-[overlay-in_150ms_ease-out]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className={`${cardClass} relative w-full max-w-sm p-5 shadow-xl motion-safe:animate-[dialog-in_180ms_ease-out]`}
      >
        <h2 id={titleId} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p id={descId} className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {message}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onRequestClose}
            disabled={pending}
            className={buttonClasses("secondary", "md", "w-full sm:w-auto")}
          >
            {cancelLabel}
          </button>
          <SubmitButton
            variant="danger-solid"
            size="md"
            pendingLabel={pendingLabel}
            className="w-full sm:w-auto"
          >
            {confirmLabel}
          </SubmitButton>
        </div>
      </div>
    </div>
  );
}
