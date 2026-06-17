"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { useT } from "./i18n/I18nProvider";

/**
 * Mobile quick-add: a thumb-reachable floating action button that jumps straight
 * into adding a course. It sits bottom-right, clear of the {@link BottomTabBar}
 * (3.5rem) plus a 1rem gap and the device safe-area inset, and is mobile-only
 * (`lg:hidden`) — desktop surfaces a "+ New course" button in the page headers.
 *
 * It's a real `<Link>`, not a JS-driven sheet, so it works without client JS,
 * restores focus naturally on navigation, and keeps a visible focus ring (the
 * app-wide ring from globals.css). The plus glyph is decorative; the action is
 * named for screen readers via `aria-label`.
 *
 * Only shown on the My Courses list (`/courses`) — that's the one place where
 * "add a course" is the primary action. On mobile the list's header button is
 * hidden, so this FAB is its single add-course affordance; everywhere else
 * (course detail, Today, Insights, …) a floating "+ course" would be out of
 * place, so it's not rendered.
 */
const SHOW_ON = "/courses";

export default function QuickAddFab() {
  const pathname = usePathname();
  const t = useT();
  // Focus is a sealed, distraction-free room: no global app chrome there.
  if (pathname === "/focus" || pathname.startsWith("/focus/")) return null;
  if (pathname !== SHOW_ON) return null;

  return (
    <Link
      href="/catalog"
      aria-label={t("fab.addCourse")}
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg transition hover:bg-brand-dark active:scale-[.95] lg:hidden"
    >
      <Plus className="h-6 w-6" aria-hidden="true" />
    </Link>
  );
}
