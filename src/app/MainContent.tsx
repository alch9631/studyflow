"use client";

import { usePathname } from "next/navigation";

/**
 * Path-aware wrapper for the app shell's scrollable content region (the
 * `#main-content` landmark). It normally reserves bottom padding to clear the
 * mobile {@link BottomTabBar} (its shared height + the safe-area inset); the
 * left/right insets keep content off a landscape notch.
 *
 * Focus is a sealed, distraction-free room with NO global chrome — no nav, no
 * bottom tab bar, no FAB — so there the tab-bar padding is dropped too, letting
 * the focus screen own the full viewport. /focus is its own `(focus)` route
 * group with a bare segment layout; this wrapper just mirrors that by skipping
 * the chrome padding on it, and stays fully transparent on every other route.
 */
export default function MainContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onFocus = pathname === "/focus" || pathname.startsWith("/focus/");
  const onCourses = pathname === "/courses";

  return (
    <div
      id="main-content"
      tabIndex={-1}
      className={`min-w-0 flex-1 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] ${
        onFocus ? "" : onCourses
          ? "pb-[calc(var(--mobile-tab-height)+env(safe-area-inset-bottom)+5.5rem)] lg:pb-0"
          : "pb-[calc(var(--mobile-tab-height)+env(safe-area-inset-bottom)+1rem)] lg:pb-0"
      }`}
    >
      {children}
    </div>
  );
}
