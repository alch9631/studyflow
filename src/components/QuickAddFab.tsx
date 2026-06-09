"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
 * Hidden where it would be redundant or out of place: the marketing landing page
 * and the new-course page itself.
 */
const HIDDEN_ON = ["/", "/courses/new"];

export default function QuickAddFab() {
  const pathname = usePathname();
  if (HIDDEN_ON.includes(pathname)) return null;

  return (
    <Link
      href="/courses/new"
      aria-label="Add a course"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))] z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg transition hover:bg-brand-dark active:scale-[.95] lg:hidden"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </Link>
  );
}
