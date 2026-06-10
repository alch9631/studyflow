"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./ui";

/**
 * Decorative loading spinner that scales with the button's font size (h-[1em]).
 * The button's visible label / aria-label carries the meaning, so the spinner
 * itself is aria-hidden.
 */
function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-[1em] w-[1em] shrink-0 animate-spin"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

type Props = ComponentProps<"button"> & {
  /**
   * When set, styles the button with the shared design tokens (buttonClasses).
   * Omit to keep a fully custom `className` (e.g. icon-only toggle buttons).
   */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Label shown beside the spinner while the form action is in flight. Omit for
   * icon-only buttons — they show just the spinner at the same size.
   */
  pendingLabel?: ReactNode;
};

/**
 * Submit button wired to its parent `<form>`'s pending state via
 * `useFormStatus`. While the form action runs it disables itself (preventing a
 * double-submit), sets `aria-busy`, and swaps its content for a spinner (plus an
 * optional `pendingLabel`); when the action settles it returns to normal.
 *
 * It stays a single `<button>` element throughout, so keyboard focus is never
 * lost on the busy/idle transition. Must be rendered INSIDE the `<form>` whose
 * submission it should track.
 */
export default function SubmitButton({
  variant,
  size,
  pendingLabel,
  className,
  disabled,
  children,
  ...props
}: Props) {
  const { pending } = useFormStatus();
  // With a variant, lean on the shared tokens (consistent sizing + focus ring +
  // disabled treatment). Without one, the caller owns the styling verbatim.
  const classes = variant ? buttonClasses(variant, size, className) : className;
  return (
    <button
      type="submit"
      {...props}
      disabled={disabled || pending}
      aria-busy={pending}
      className={classes}
    >
      {pending ? (
        <>
          <Spinner />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
