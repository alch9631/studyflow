/**
 * Shared visual vocabulary — the design tokens behind StudyFlow's buttons and
 * cards. Keeping these in one place means a brand tweak lands everywhere at once,
 * and every button gets the same sizing, focus ring, and tactile press feedback.
 *
 * Pure strings (no JSX, no "use client") so this is safe to import from both
 * server and client components.
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "danger-solid"
  | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

// `transition` + `active:scale` give every button a subtle, consistent press feel.
// The keyboard focus ring is defined globally in globals.css — don't suppress it here.
const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white shadow-sm hover:bg-brand-dark",
  secondary:
    "border border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800",
  // Quiet outline danger — for triggers that *open* a destructive flow.
  danger:
    "border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40",
  // Solid danger — the dominant CTA that *commits* a destructive action
  // (e.g. the confirm button inside a confirmation dialog).
  "danger-solid":
    "bg-red-600 text-white shadow-sm hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500",
  ghost: "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm sm:text-base",
};

/** Compose the Tailwind classes for a button-styled element (button or link). */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = "",
): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`.trim();
}

/**
 * Card / panel surfaces — one radius (rounded-2xl) and border treatment across
 * the app. Pick by fill:
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
