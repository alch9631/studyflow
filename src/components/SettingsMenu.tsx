"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { iconButtonClass } from "./ui";
import { applyMode, THEME_OPTIONS, useThemeMode, type Mode } from "./lib/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/**
 * Desktop header settings menu: a quick-access dropdown for the theme switch
 * plus a link through to the full Settings page. Replaces the bare gear link so
 * the most-used preference (light/dark/system) is one click away from anywhere,
 * while everything else still lives on /settings.
 *
 * The Radix menu handles keyboard + focus; theme state is the shared store, so
 * a change here stays in sync with the Settings page's segmented control.
 */
export default function SettingsMenu() {
  const pathname = usePathname();
  const mode = useThemeMode();
  const onSettings = pathname.startsWith("/settings");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Settings"
        className={iconButtonClass(
          `ml-1 hidden lg:inline-flex ${
            onSettings
              ? "bg-brand text-white"
              : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          }`,
        )}
      >
        <span aria-hidden="true">⚙️</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(v) => applyMode(v as Mode)}
        >
          {THEME_OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.v} value={o.v}>
              <span aria-hidden="true">{o.icon}</span>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/settings" aria-current={onSettings ? "page" : undefined}>
            <span aria-hidden="true">⚙️</span>
            All settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
