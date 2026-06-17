import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/components/lib/utils";

/**
 * StudyFlow's card primitive, on the shadcn/ui foundation.
 *
 * Calm surface: a card is read by its subtle fill + spacing + gentle rounding,
 * not a hard edge. We drop the border in favour of a quiet off-white / dark
 * panel fill (light + dark mirror the same calm system). Callsites that need a
 * true edge can still add their own `border` class.
 * Unlike stock shadcn, the root imposes NO padding/gap: callsites already own
 * their spacing (`<Card className="p-5">`), so this preserves every layout.
 *
 * `asChild` lets the surface render as a different element (e.g. a `<Link>` or
 * `<figure>`) while keeping the card styling — see CourseCard.
 *
 * The header/title/description/content/footer sub-parts are thin slots for
 * composing structured cards; existing cards that lay out their own children
 * keep working with just `<Card>`.
 */

const cardSurface =
  "rounded-2xl bg-gray-50 dark:bg-gray-900/60";

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

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-1", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-gray-500 dark:text-gray-400", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn(className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-footer" className={cn("flex items-center", className)} {...props} />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
