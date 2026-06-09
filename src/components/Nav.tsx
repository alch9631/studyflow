"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { iconButtonClass } from "./ui";
import SettingsMenu from "./SettingsMenu";
import ThemeSetting from "./ThemeSetting";

type Tab = { href: string; label: string; icon: string; external?: boolean };

const TABS: Tab[] = [
  { href: "/today", label: "Today", icon: "🗓️" },
  { href: "/courses", label: "My Courses", icon: "📚" },
  { href: "/catalog", label: "Modules", icon: "🎓" },
  { href: "/insights", label: "Insights", icon: "📊" },
  // Calendar export route (/api/calendar) is kept but hidden from nav for now.
];

const SEARCH: Tab = { href: "/search", label: "Search", icon: "🔍" };
const SETTINGS: Tab = { href: "/settings", label: "Settings", icon: "⚙️" };

function isActive(pathname: string, t: Tab) {
  if (t.external) return false;
  return pathname === t.href || pathname.startsWith(t.href + "/");
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // While the drawer is open: trap focus inside it, close on Escape, lock body
  // scroll, and return focus to the toggle on close. (Selecting a link closes the
  // drawer via each link's onClick.)
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const toggle = toggleRef.current;
    if (!panel) return;

    const focusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'),
      ).filter((el) => el.offsetParent !== null);

    focusable()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      toggle?.focus();
    };
  }, [open]);

  return (
    <>
      {/* Top bar: brand + nav. Tabs show inline on desktop; a drawer on mobile.
          The translucent header extends into the notch (pt safe-area inset);
          the inner row pads its content clear of the top + a landscape side notch. */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
        <nav
          aria-label="Primary"
          className="mx-auto flex max-w-3xl items-center gap-1 py-3 pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] text-sm"
        >
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

          {/* Global search — always visible (incl. mobile) so it's reachable
              from anywhere; opens the full-page course/topic/deadline search. */}
          <Link
            href="/search"
            aria-label="Search"
            aria-current={isActive(pathname, SEARCH) ? "page" : undefined}
            className={iconButtonClass(
              `inline-flex ${
                isActive(pathname, SEARCH)
                  ? "bg-brand text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }`,
            )}
          >
            <SearchIcon />
          </Link>

          {/* Desktop settings: a dropdown for the theme switch + a link through
              to the full Settings page. */}
          <SettingsMenu />

          {/* Mobile menu toggle */}
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav-drawer"
            className={iconButtonClass(
              "ml-1 inline-flex text-gray-600 hover:bg-gray-100 lg:hidden dark:text-gray-300 dark:hover:bg-gray-800",
            )}
          >
            <HamburgerIcon />
          </button>
        </nav>
      </header>

      {/* Mobile drawer: backdrop + slide-in panel. Stays mounted so it can animate;
          `inert` keeps it out of the tab order / a11y tree while closed. */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      >
        <div
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          ref={panelRef}
          id="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Main menu"
          inert={!open}
          className={`absolute inset-y-0 right-0 flex w-72 max-w-[80%] flex-col border-l border-gray-200 bg-white pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none dark:border-gray-800 dark:bg-gray-950 ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <span className="text-sm font-semibold tracking-tight">Menu</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className={iconButtonClass(
                "inline-flex text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
              )}
            >
              <CloseIcon />
            </button>
          </div>

          <nav aria-label="Mobile" className="flex flex-col gap-1 overflow-y-auto p-3">
            {[...TABS, SEARCH, SETTINGS].map((t) => {
              const active = isActive(pathname, t);
              const cls = `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-brand text-white"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              }`;
              const inner = (
                <>
                  <span className="text-lg leading-none" aria-hidden="true">
                    {t.icon}
                  </span>
                  <span>{t.label}</span>
                </>
              );
              return t.external ? (
                <a key={t.href} href={t.href} className={cls} onClick={() => setOpen(false)}>
                  {inner}
                </a>
              ) : (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cls}
                  onClick={() => setOpen(false)}
                >
                  {inner}
                </Link>
              );
            })}
          </nav>

          {/* Appearance: day / night / system theme, pinned to the drawer bottom. */}
          <div className="mt-auto border-t border-gray-200 p-3 dark:border-gray-800">
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Appearance
            </p>
            <ThemeSetting />
          </div>
        </div>
      </div>
    </>
  );
}
