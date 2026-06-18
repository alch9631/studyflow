/**
 * Shared visual vocabulary — the design tokens behind StudyFlow's buttons and
 * cards. Keeping these in one place means a brand tweak lands everywhere at once,
 * and every button gets the same sizing, focus ring, and tactile press feedback.
 *
 * Button styling now lives in the shadcn/ui `Button` primitive (ui/button.tsx);
 * `buttonClasses` is the thin class-string accessor over its `buttonVariants`,
 * for the cases that can't be a real <button>/<Button> element — an aria-hidden
 * affordance span, a <label>-wrapped upload control, a link in a server file.
 *
 * Pure strings (no JSX, no "use client") so this is safe to import from both
 * server and client components.
 */

import { buttonVariants, type ButtonSize, type ButtonVariant } from "./ui/button";

export type { ButtonVariant, ButtonSize };

/** Compose the Tailwind classes for a button-styled element (button or link). */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = "",
): string {
  return buttonVariants({ variant, size, className: extra });
}

/**
 * Icon-only buttons — nav toggles, the theme switch, the Pomodoro settings cog,
 * inline delete affordances. One square 44px tap target (the same touch floor
 * `md`/`lg` text buttons clear), shared radius, focus-friendly transition, and
 * press feel, so every icon button matches instead of each re-rolling its own
 * padding. The caller supplies the display utility (`inline-flex`, or
 * `hidden lg:inline-flex` for responsive ones) plus its own color/hover
 * treatment via `extra`. Pair with an `aria-label` and mark the glyph
 * `aria-hidden`.
 */
export function iconButtonClass(extra = ""): string {
  return `min-h-11 min-w-11 items-center justify-center rounded-full text-base leading-none transition active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50 ${extra}`.trim();
}

/**
 * Hit-area expander for small marks — a tiny visual control (e.g. the ~20–24px
 * Today / topic completion checkbox, or a compact text action / disclosure
 * summary) whose *touch target* must still clear the 44×44px floor (WCAG 2.5.5 /
 * iOS HIG). The element stays its small visual size; a centred `::before`
 * pseudo-element (`before:absolute …`) inflates the clickable region to ≥44px
 * without pushing layout around. The element must establish a positioning
 * context (this includes `relative`) and be inline-flex-centred; pair the glyph
 * with an `aria-label`. Compose with the visual classes at the callsite.
 */
export const hitTargetClass =
  "relative inline-flex items-center justify-center before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:min-h-[44px] before:min-w-[44px] before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']";

/**
 * Card / panel surfaces — the calm GUARDIAN surfaces. One steady corner
 * (rounded-xl, ~14px, from --radius) and a soft shadow that reads the card by
 * elevation rather than a hard edge — so surfaces are flatter and quieter than
 * the old bordered white boxes. The elevated surface is also the base of the
 * shadcn `Card` primitive (ui/card.tsx); `cardClass` stays the token for
 * surfaces that aren't a `<Card>` element (e.g. the confirmation-dialog panel).
 * Pick by fill:
 *   cardClass       — elevated surface (bg-surface), lifted by a subtle shadow.
 *   panelClass      — section panel, no fill (sits directly on the page bg).
 *   mutedCardClass  — tinted/inset surface (empty states, callouts).
 * Compose with padding/spacing at the callsite, e.g. `${panelClass} p-5`.
 *
 * Borders are reserved for inputs, dividers, and interactive rows — surfaces
 * lean on fill + shadow instead, which is the calm of the system.
 */
export const cardClass =
  "rounded-xl bg-surface shadow-sm";

export const panelClass = "rounded-xl";

export const mutedCardClass =
  "rounded-xl bg-surface-muted";

/**
 * Text / number / date input surfaces — one border, radius, fill, and hover
 * treatment so every field matches. Inputs DO keep a visible border (the calm
 * system reserves edges for interactive controls). This is the visual base
 * behind the shadcn field primitives (ui/input.tsx, textarea.tsx, select.tsx),
 * which layer the shared `aria-[invalid]` / `disabled` states on top. Width AND
 * font-size are left to the callsite (`w-full`, `w-20`, the 16px default that
 * avoids iOS focus-zoom, the inherited `text-sm` of dense rows); the visible
 * focus ring is defined globally in globals.css.
 */
export const inputClass =
  "rounded-lg border border-input bg-surface px-3 py-2 transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/60 dark:bg-surface";
