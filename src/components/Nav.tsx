"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const TABS = [
  { href: "/courses", label: "Courses", icon: "📚" },
  { href: "/today", label: "Today", icon: "🗓️" },
  { href: "/catalog", label: "Modules", icon: "🎓" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* Top bar: brand + theme toggle. Tabs show inline on desktop only. */}
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
          <div className="mr-1 hidden items-center gap-1 sm:flex">
            {TABS.map((t) => {
              const active = isActive(pathname, t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3 py-1.5 font-medium transition-colors ${
                    active
                      ? "bg-brand text-white"
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>

          <ThemeToggle />
        </nav>
      </header>

      {/* Bottom tab bar: mobile only. Clean, thumb-reachable, safe-area aware. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-3xl items-stretch justify-around">
          {TABS.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                  active
                    ? "text-brand"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
