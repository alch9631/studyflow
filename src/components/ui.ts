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
 * Card / panel surfaces — one radius (rounded-2xl) and border treatment across
 * the app. The elevated white surface is also the base of the shadcn `Card`
 * primitive (ui/card.tsx); `cardClass` stays the token for surfaces that aren't
 * a `<Card>` element (e.g. the confirmation-dialog panel). Pick by fill:
 *   cardClass       — elevated surface, white fill (sits above the page).
 *   panelClass      — section panel, no fill (sits directly on the page bg).
 *   mutedCardClass  — tinted/inset surface (empty states, callouts).
 * Compose with padding/spacing at the callsite, e.g. `${panelClass} p-5`.
 */
export const cardClass =
  "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900";

export const panelClass = "rounded-2xl border border-gray-200 dark:border-gray-800";

export const mutedCardClass =
  "rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900";

/**
 * Text / number / date input surfaces — one border, radius, fill, and hover
 * treatment so every field matches. Width is intentionally left to the callsite
 * (`w-full`, `w-20`, …); the visible focus ring is defined globally in
 * globals.css. Compose: `className={`${inputClass} w-full`}`.
 */
export const inputClass =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600";
