import * as React from "react";

import { cn } from "@/components/lib/utils";
import { fieldClass } from "@/components/ui/input";

/**
 * StudyFlow's select primitive — a styled **native** `<select>`, deliberately.
 *
 * Unlike the Dialog/Dropdown swaps, this stays a real `<select>` rather than a
 * Radix popover: these selects live inside server-action forms and submit via
 * native FormData (the `weekday`/`courseId` fields), and the native control is
 * already fully keyboard-operable and uses the platform's accessible option
 * list (better on mobile/touch). Swapping in a custom listbox would change the
 * submission contract and interaction model — out of scope for a presentation
 * pass. So we only restyle: the shared {@link Input} `fieldClass` base plus a
 * pointer cursor, keeping the native disclosure arrow. Spread the props <Field>
 * supplies for label + inline-error wiring; pass `<option>`s as children.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(fieldClass, "cursor-pointer", className)}
      {...props}
    />
  );
}

export { Select };
