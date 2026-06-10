import * as React from "react";

import { cn } from "@/components/lib/utils";
import { inputClass } from "@/components/ui";

/**
 * StudyFlow's text-input primitive, on the shadcn/ui foundation.
 *
 * The visual base is the app's existing `inputClass` design token (one border,
 * radius, fill, shadow, and hover treatment) so every field matches — kept
 * verbatim so the swap is purely structural. On top of it this primitive bakes
 * in the two interactive states every form field shares, which used to be
 * copy-pasted at each callsite:
 *
 *   - `aria-[invalid]:…` — a red border when <Field>/<ValidatedForm> marks the
 *     control invalid (they set `aria-invalid` + `aria-describedby` for the
 *     inline error message), so error styling stays tied to the field.
 *   - `disabled:…` — a consistent dimmed, not-allowed look.
 *
 * Font-size and width are intentionally left to the callsite (`w-full`, `w-20`,
 * the 16px default that avoids iOS focus-zoom, …); the visible keyboard focus
 * ring is defined globally in globals.css. Spread the props <Field> hands you:
 *   <Field name="title" label="Title">{(p) => <Input {...p} required />}</Field>
 */
const fieldClass = cn(
  inputClass,
  "disabled:cursor-not-allowed disabled:opacity-60",
  "aria-[invalid]:border-red-500 aria-[invalid]:hover:border-red-500",
);

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input data-slot="input" className={cn(fieldClass, className)} {...props} />
  );
}

export { Input, fieldClass };
