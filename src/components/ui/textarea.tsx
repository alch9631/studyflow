import * as React from "react";

import { cn } from "@/components/lib/utils";
import { fieldClass } from "@/components/ui/input";

/**
 * StudyFlow's multi-line input primitive — the textarea counterpart of {@link
 * Input}. It shares the exact same `fieldClass` base (border, fill, hover,
 * invalid + disabled states) so single- and multi-line fields look identical;
 * `rows`, font (`font-mono text-sm` on the syllabus/topics boxes), and width
 * stay at the callsite. Spread the props <Field> supplies for label + inline-
 * error wiring.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClass, className)}
      {...props}
    />
  );
}

export { Textarea };
