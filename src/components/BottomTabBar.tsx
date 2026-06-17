"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement, SVGProps } from "react";
import { useT } from "./i18n/I18nProvider";
import type { MessageKey } from "./i18n/messages";

type Icon = (props: SVGProps<SVGSVGElement>) => ReactElement;
type Tab = { href: string; labelKey: MessageKey; Icon: Icon };

/** Line icons in the same stroke style as Nav's HamburgerIcon (24px box, 2px). */
function iconProps(extra: SVGProps<SVGSVGElement>): SVGProps<SVGSVGElement> {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...extra,
  };
}

function TodayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="2" x2="8" y2="5" />
      <line x1="16" y1="2" x2="16" y2="5" />
    </svg>
  );
}

function CalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="2" x2="8" y2="5" />
      <line x1="16" y1="2" x2="16" y2="5" />
      <line x1="8" y1="13" x2="8" y2="13" />
      <line x1="12" y1="13" x2="12" y2="13" />
      <line x1="16" y1="13" x2="16" y2="13" />
    </svg>
  );
}

function CoursesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <line x1="8" y1="3" x2="8" y2="17" />
    </svg>
  );
}

function InsightsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <line x1="4" y1="20" x2="20" y2="20" />
      <line x1="7" y1="20" x2="7" y2="13" />
      <line x1="12" y1="20" x2="12" y2="8" />
      <line x1="17" y1="20" x2="17" y2="11" />
    </svg>
  );
}

const TABS: Tab[] = [
  { href: "/today", labelKey: "nav.today", Icon: TodayIcon },
  { href: "/calendar", labelKey: "nav.calendar", Icon: CalendarIcon },
  { href: "/courses", labelKey: "nav.courses", Icon: CoursesIcon },
  { href: "/insights", labelKey: "nav.insights", Icon: InsightsIcon },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Thumb-reachable bottom navigation for the primary destinations. Mobile
 * only (`lg:hidden`) — desktop keeps the inline top-bar tabs; the drawer still
 * carries the secondary items (Modules, Settings, Appearance). The app shell
 * adds matching bottom padding (layout.tsx) so this never overlaps content.
 */
export default function BottomTabBar() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav
      aria-label={t("nav.primaryMobile")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:hidden dark:border-gray-800 dark:bg-gray-950/95"
    >
      <ul className="mx-auto flex max-w-3xl items-stretch">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 py-2 text-[11px] font-medium transition-colors ${
                  active
                    ? "text-brand-ink dark:text-white"
                    : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
                }`}
              >
                <tab.Icon className="h-6 w-6" />
                <span>{t(tab.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
