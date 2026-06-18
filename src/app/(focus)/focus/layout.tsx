/**
 * Focus is a sealed, distraction-free room. It lives in its own `(focus)` route
 * group with this dedicated, minimal segment layout so the route's structure
 * makes its intent explicit: it carries NO app chrome of its own — no nav, no
 * bottom tab bar, no quick-add FAB, no tab-bar padding.
 *
 * The root layout (src/app/layout.tsx) still owns the shared <html>/<body>, the
 * providers (i18n, toast, service worker, …), and the global chrome; the chrome
 * components opt themselves out of /focus by path (Nav / BottomTabBar /
 * QuickAddFab return null, MainContent drops the tab-bar padding), so what
 * actually renders here is just the full-viewport focus screen. Keeping a bare
 * segment layout here means anything added under /focus inherits the sealed
 * room, not the app shell.
 */
export default function FocusLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
