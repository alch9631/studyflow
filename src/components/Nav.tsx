"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

const TABS = [
  { href: "/courses", label: "Courses" },
  { href: "/today", label: "Today" },
  { href: "/catalog", label: "Modules" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
      <nav className="mx-auto flex max-w-3xl items-center gap-1 px-3 py-3 text-sm sm:px-4">
        <Link href="/" className="mr-auto flex items-center gap-2 font-bold tracking-tight">
          <span
            className="rounded px-1.5 py-0.5 text-xs font-extrabold text-white"
            style={{ backgroundColor: "#00509b" }}
          >
            TUHH
          </span>
          StudyFlow
        </Link>
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
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
        <span className="ml-1">
          <ThemeToggle />
        </span>
      </nav>
    </header>
  );
}
