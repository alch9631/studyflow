/**
 * Shared visual vocabulary — the design tokens behind StudyFlow's buttons and
 * cards. Keeping these in one place means a brand tweak lands everywhere at once,
 * and every button gets the same sizing, focus ring, and tactile press feedback.
 *
 * Pure strings (no JSX, no "use client") so this is safe to import from both
 * server and client components.
 */

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

// `transition` + `active:scale` give every button a subtle, consistent press feel.
// The keyboard focus ring is defined globally in globals.css — don't suppress it here.
const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white shadow-sm hover:bg-brand-dark",
  secondary:
    "border border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800",
  danger:
    "border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40",
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

/** The standard surface card: rounded, bordered, dark-mode aware. */
export const cardClass =
  "rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900";
