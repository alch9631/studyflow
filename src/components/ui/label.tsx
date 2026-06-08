import * as React from "react";

import { cn } from "@/components/lib/utils";

/**
 * StudyFlow's label primitive, on the shadcn/ui foundation.
 *
 * A thin styled `<label>` (native, like Button/Card) rather than a Radix wrapper:
 * the `htmlFor`→control association the swap needs already works natively, so no
 * extra dependency buys anything here. It carries the app's default field-label
 * style (`text-sm font-medium`); callsites override per layout via `className`
 * (e.g. the muted `text-xs text-gray-500` row labels, or `sr-only` when the
 * placeholder already names the field). Used by <Field> to render the label it
 * ties to each input's id.
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  );
}

export { Label };
