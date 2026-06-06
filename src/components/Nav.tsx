"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/courses", label: "Courses" },
  { href: "/today", label: "Today" },
  { href: "/catalog", label: "Modules" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur">
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
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
