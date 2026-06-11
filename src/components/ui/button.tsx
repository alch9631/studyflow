import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/components/lib/utils";

/**
 * StudyFlow's button primitive, on the shadcn/ui foundation (cva + `asChild`).
 *
 * The variant/size class strings are the app's existing design tokens, kept
 * verbatim so the shadcn swap is purely structural — no visual change. The
 * keyboard focus ring is defined globally in globals.css; don't suppress it here.
 *
 * `transition` + `active:scale` give every button a subtle, consistent press
 * feel. `md`/`lg` carry a 44px min height so primary tap targets clear the
 * mobile touch-target floor; `sm` stays compact for dense, inline actions.
 *
 * For an element that should *look* like a button but be a link, use `asChild`:
 *   <Button asChild variant="primary"><Link href="/today">Go</Link></Button>
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-foreground shadow-sm hover:bg-brand-dark",
        secondary:
          "border border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800",
        // Quiet outline danger — for triggers that *open* a destructive flow.
        danger:
          "border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40",
        // Solid danger — the dominant CTA that *commits* a destructive action
        // (e.g. the confirm button inside a confirmation dialog).
        "danger-solid":
          "bg-red-600 text-white shadow-sm hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500",
        ghost:
          "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
      },
      size: {
        sm: "px-3 py-1.5 text-xs",
        md: "min-h-11 px-4 py-2 text-sm",
        lg: "min-h-11 px-5 py-2.5 text-sm sm:text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
