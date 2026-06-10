"use client";

import {
  createContext,
  useContext,
  useId,
  type ReactNode,
} from "react";
import { Label } from "@/components/ui/label";

/**
 * Accessible form-field primitives that wire up the relationships screen
 * readers rely on, without changing any server-action signatures:
 *
 *  - a real <label htmlFor> bound to the control's id,
 *  - an inline error message with a stable id,
 *  - aria-invalid + aria-describedby on the control when that field has an error.
 *
 * Inline errors come from <ValidatedForm>, which validates on the client (native
 * HTML5 constraints) and publishes a `{ name: message }` map through context.
 * <Field> reads the message for its own `name`; standalone use (no provider) just
 * renders the label + control with no error UI.
 */

type FieldErrors = Record<string, string>;

const FieldErrorContext = createContext<FieldErrors>({});

/** Provider used by <ValidatedForm> to broadcast the current per-field errors. */
export function FieldErrorProvider({
  errors,
  children,
}: {
  errors: FieldErrors;
  children: ReactNode;
}) {
  return (
    <FieldErrorContext.Provider value={errors}>
      {children}
    </FieldErrorContext.Provider>
  );
}

/** Props passed to a <Field> render function so the control can be wired up. */
export type FieldControlProps = {
  id: string;
  name: string;
  "aria-invalid": boolean | undefined;
  "aria-describedby": string | undefined;
};

/**
 * Label + control + inline error, correctly associated. Pass the control as a
 * render function that spreads the supplied props onto its <input>/<textarea>/
 * <select>:
 *
 *   <Field name="title" label="Title">
 *     {(p) => <input {...p} required className="…" />}
 *   </Field>
 *
 * `labelClassName` / `className` let each callsite keep its existing layout.
 */
export function Field({
  name,
  label,
  hint,
  required,
  className,
  labelClassName = "block",
  children,
}: {
  name: string;
  label: ReactNode;
  /** Optional helper text rendered under the label, also linked via aria-describedby. */
  hint?: ReactNode;
  /** Marks the visible label with an asterisk; does not set the control's `required`. */
  required?: boolean;
  className?: string;
  labelClassName?: string;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const errors = useContext(FieldErrorContext);
  const error = errors[name];
  const reactId = useId();
  const id = `field-${name}-${reactId}`;
  const errorId = `${id}-error`;
  const hintId = hint ? `${id}-hint` : undefined;

  const describedBy =
    [error ? errorId : undefined, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      <Label htmlFor={id} className={labelClassName}>
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-red-600 dark:text-red-400">
            *
          </span>
        )}
      </Label>
      {hint && (
        <p id={hintId} className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {hint}
        </p>
      )}
      {children({
        id,
        name,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {error && (
        <p
          id={errorId}
          className="mt-1 text-xs font-medium text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}
