import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/components/lib/utils";

/**
 * StudyFlow's card primitive, on the shadcn/ui foundation.
 *
 * Calm surface: a card is read by its subtle fill + soft shadow + spacing, not
 * a hard edge. It uses the GUARDIAN `bg-surface` token (a faint cool-tinted
 * panel in both themes) lifted by a subtle shadow rather than a border, with one
 * steady un-bubbly corner (rounded-xl). Callsites that need a true edge can
 * still add their own `border` class.
 * Unlike stock shadcn, the root imposes NO padding/gap: callsites already own
 * their spacing (`<Card className="p-5">`), so this preserves every layout.
 *
 * `asChild` lets the surface render as a different element (e.g. a `<Link>` or
 * `<figure>`) while keeping the card styling — see CourseCard.
 *
 */

const cardSurface =
  "rounded-xl bg-surface shadow-sm";

function Card({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "div";
  return (
    <Comp data-slot="card" className={cn(cardSurface, className)} {...props} />
  );
}

export { Card };
