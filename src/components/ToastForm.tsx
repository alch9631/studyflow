"use client";

import { useRef, type ComponentProps, type ReactNode } from "react";
import { useToast } from "./Toast";

/**
 * A drop-in replacement for `<form action={serverAction}>` that adds toast
 * feedback without touching the server action itself.
 *
 * - On success it shows `successMessage` (a green toast).
 * - On failure it shows `errorMessage` (a red toast) and re-throws so the
 *   nearest error boundary still sees genuine errors.
 *
 * Next's own control-flow signals — `redirect()` / `notFound()` — throw an
 * error carrying a `digest` like `NEXT_REDIRECT;...`. Those are NOT failures, so
 * we let them bubble untouched (the navigation still happens, no error toast).
 * Use this for revalidate-only actions (toggles, add/delete); redirecting
 * actions already land on a page that renders its own status banner.
 */

type ServerAction = (formData: FormData) => void | Promise<void>;

export function isNextControlFlow(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const digest = (err as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

export default function ToastForm({
  action,
  successMessage,
  errorMessage = "Something went wrong — please try again.",
  onDone,
  children,
  ...formProps
}: Omit<ComponentProps<"form">, "action"> & {
  action: ServerAction;
  /** Shown as a green toast after the action resolves. Omit to stay silent. */
  successMessage?: string;
  /** Shown as a red toast if the action throws a real error. */
  errorMessage?: string;
  /** Optional callback after a successful (non-redirecting) submit. */
  onDone?: () => void;
  children: ReactNode;
}) {
  const { toast } = useToast();
  // Guard against a double-fire if React replays the action.
  const inFlight = useRef(false);

  async function wrapped(formData: FormData) {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await action(formData);
      if (successMessage) toast(successMessage, "success");
      onDone?.();
    } catch (err) {
      if (isNextControlFlow(err)) throw err; // redirect / notFound — not a failure
      toast(errorMessage, "error");
      throw err;
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <form action={wrapped} {...formProps}>
      {children}
    </form>
  );
}
