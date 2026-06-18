import Link from "next/link";
import type { ReactNode } from "react";
import { mutedCardClass, type ButtonVariant } from "./ui";
import { Button } from "./ui/button";

/**
 * The standard "you have no data yet" panel. One friendly headline, one line of
 * guidance, and one (or a few) clear calls-to-action pointing at the relevant
 * create/add flow. Mirrors the surface used on the Courses page so every empty
 * view reads the same — same card, spacing, type scale, and dark-mode.
 */

export type EmptyStateAction = {
  label: ReactNode;
  href: string;
  variant?: ButtonVariant;
};

export default function EmptyState({
  icon,
  title,
  description,
  actions = [],
  children,
}: {
  /** Decorative lead icon (e.g. a lucide line icon). Rendered centered above the title. */
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: EmptyStateAction[];
  children?: ReactNode;
}) {
  return (
    <div className={`${mutedCardClass} p-6 text-center`}>
      {icon && (
        <p className="flex justify-center text-gray-400 dark:text-gray-500" aria-hidden="true">
          {icon}
        </p>
      )}
      <p className="mt-2 font-semibold">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      )}
      {actions.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {actions.map((a, i) => (
            <Button
              key={a.href + i}
              asChild
              variant={a.variant ?? (i === 0 ? "primary" : "secondary")}
            >
              <Link href={a.href}>{a.label}</Link>
            </Button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
