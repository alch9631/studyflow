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
    <header className="border-b border-gray-200 bg-white">
      <nav className="mx-auto flex max-w-3xl items-center gap-1 px-4 py-3 text-sm">
        <Link href="/" className="mr-3 font-bold tracking-tight">
          StudyFlow ⚡
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
                  ? "bg-black text-white"
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
