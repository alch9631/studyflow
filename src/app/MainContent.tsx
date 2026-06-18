"use client";

import { usePathname } from "next/navigation";

/**
 * Path-aware wrapper for the app shell's scrollable content region (the
 * `#main-content` landmark). It normally reserves bottom padding to clear the
 * mobile {@link BottomTabBar} (its 3.5rem height + the safe-area inset); the
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

  return (
    <div
      id="main-content"
      tabIndex={-1}
      className={`flex-1 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] ${
        onFocus ? "" : "pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0"
      }`}
    >
      {children}
    </div>
  );
}
