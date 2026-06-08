"use client";

import {
  useCallback,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useToast } from "./Toast";
import { FieldErrorProvider } from "./Field";

/** The exact submit-handler type React expects on a <form> in this React version. */
type FormSubmitHandler = NonNullable<ComponentProps<"form">["onSubmit"]>;
type FormSubmitEvent = Parameters<FormSubmitHandler>[0];

/**
 * An accessible drop-in for `<form action={serverAction}>`. It layers
 * client-side validation, inline field errors, and focus management on top of
 * the same toast feedback as <ToastForm> — WITHOUT touching the server action.
 *
 * On submit it:
 *  1. Runs native HTML5 constraint validation (required, min/max, type=…) plus an
 *     optional cross-field `validate(formData)` for rules the browser can't express.
 *  2. If anything is invalid, it cancels the submit, publishes a `{ name: msg }`
 *     map to <Field> via context (rendered inline next to each control), focuses
 *     the first invalid control, and stops — the server action never runs.
 *  3. If everything is valid, it clears errors and lets the form action proceed,
 *     showing `successMessage` / `errorMessage` toasts like <ToastForm>.
 *
 * Next's control-flow signals (redirect / notFound) are re-thrown untouched so
 * navigation still happens with no spurious error toast.
 */

type ServerAction = (formData: FormData) => void | Promise<void>;
type Errors = Record<string, string>;

function isNextControlFlow(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const digest = (err as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")
  );
}

type FormControl =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement;

/** Friendly fallback message when the browser doesn't supply one. */
function nativeMessage(el: FormControl): string {
  return el.validationMessage || "Please check this field.";
}

function isFormControl(el: Element): el is FormControl {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  );
}

export default function ValidatedForm({
  action,
  successMessage,
  errorMessage = "Something went wrong — please try again.",
  validate,
  onDone,
  children,
  onSubmit,
  ...formProps
}: Omit<ComponentProps<"form">, "action"> & {
  action: ServerAction;
  successMessage?: string;
  errorMessage?: string;
  /**
   * Optional cross-field validation the browser can't express (e.g. end > start).
   * Return a `{ fieldName: message }` map of errors, or null/empty when valid.
   */
  validate?: (formData: FormData) => Errors | null | undefined;
  onDone?: () => void;
  children: ReactNode;
}) {
  const { toast } = useToast();
  const [errors, setErrors] = useState<Errors>({});
  const inFlight = useRef(false);

  // Focus + scroll the first control whose name is in `errs`.
  const focusFirstInvalid = useCallback(
    (form: HTMLFormElement, errs: Errors) => {
      const names = Object.keys(errs);
      for (const el of Array.from(form.elements)) {
        if (isFormControl(el) && names.includes(el.name)) {
          el.focus();
          if (typeof el.scrollIntoView === "function") {
            el.scrollIntoView({ block: "center", behavior: "smooth" });
          }
          return;
        }
      }
    },
    [],
  );

  const handleSubmit = useCallback<FormSubmitHandler>(
    (e: FormSubmitEvent) => {
      onSubmit?.(e);
      if (e.defaultPrevented) return;

      const form = e.currentTarget;
      const found: Errors = {};

      // 1) Native constraints — first error per field name.
      for (const el of Array.from(form.elements)) {
        if (!isFormControl(el) || !el.name || el.disabled) continue;
        if (found[el.name]) continue;
        if (!el.checkValidity()) {
          found[el.name] = nativeMessage(el);
        }
      }

      // 2) Cross-field rules (don't overwrite a native error already found).
      const custom = validate?.(new FormData(form));
      if (custom) {
        for (const [name, msg] of Object.entries(custom)) {
          if (msg && !found[name]) found[name] = msg;
        }
      }

      if (Object.keys(found).length > 0) {
        e.preventDefault(); // cancel the server action
        setErrors(found);
        focusFirstInvalid(form, found);
        return;
      }

      // Valid — clear any stale errors and let the form action run.
      setErrors({});
    },
    [onSubmit, validate, focusFirstInvalid],
  );

  const wrapped = useCallback(
    async (formData: FormData) => {
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
    },
    [action, successMessage, errorMessage, onDone, toast],
  );

  return (
    <form
      action={wrapped}
      onSubmit={handleSubmit}
      noValidate
      {...formProps}
    >
      <FieldErrorProvider errors={errors}>{children}</FieldErrorProvider>
    </form>
  );
}
