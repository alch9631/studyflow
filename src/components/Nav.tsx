"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; icon: string; external?: boolean };

const TABS: Tab[] = [
  { href: "/today", label: "Today", icon: "🗓️" },
  { href: "/courses", label: "My Courses", icon: "📚" },
  { href: "/catalog", label: "Modules", icon: "🎓" },
  { href: "/insights", label: "Insights", icon: "📊" },
  { href: "/api/calendar", label: "Calendar", icon: "📅", external: true },
];

function isActive(pathname: string, t: Tab) {
  if (t.external) return false;
  return pathname === t.href || pathname.startsWith(t.href + "/");
}

export default function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* Top bar: brand + settings. Tabs show inline on desktop only. */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
        <nav className="mx-auto flex max-w-3xl items-center gap-1 px-4 py-3 text-sm">
          <Link href="/" className="mr-auto flex items-center gap-2 font-bold tracking-tight">
            <span
              className="rounded px-1.5 py-0.5 text-xs font-extrabold text-white"
              style={{ backgroundColor: "#00509b" }}
            >
              TUHH
            </span>
            StudyFlow
          </Link>

          {/* Desktop-only inline tabs */}
          <div className="mr-1 hidden items-center gap-1 lg:flex">
            {TABS.map((t) => {
              const active = isActive(pathname, t);
              const cls = `rounded-full px-3 py-1.5 font-medium transition-colors ${
                active
                  ? "bg-brand text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }`;
              return t.external ? (
                <a key={t.href} href={t.href} className={cls}>
                  {t.label}
                </a>
              ) : (
                <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cls}>
                  {t.label}
                </Link>
              );
            })}
          </div>

          {/* Settings (theme + future prefs live here) */}
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={pathname.startsWith("/settings") ? "page" : undefined}
            className={`ml-1 rounded-full px-2.5 py-1.5 text-base transition-colors ${
              pathname.startsWith("/settings")
                ? "bg-brand text-white"
                : "hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            ⚙️
          </Link>
        </nav>
      </header>

      {/* Bottom tab bar: mobile/tablet. 5 tabs, thumb-reachable, safe-area aware. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-3xl items-stretch justify-around">
          {TABS.map((t) => {
            const active = isActive(pathname, t);
            const cls = `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium leading-tight transition-colors ${
              active
                ? "text-brand"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`;
            const inner = (
              <>
                <span className="text-base leading-none">{t.icon}</span>
                <span className="whitespace-nowrap">{t.label}</span>
              </>
            );
            return t.external ? (
              <a key={t.href} href={t.href} className={cls}>
                {inner}
              </a>
            ) : (
              <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cls}>
                {inner}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
