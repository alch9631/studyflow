"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { iconButtonClass } from "./ui";
import { applyMode, THEME_OPTIONS, useThemeMode, type Mode } from "./lib/theme";
import { useLocale, useSetLocale, useT } from "./i18n/I18nProvider";
import { LOCALES, type Locale } from "./i18n/messages";
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
  const locale = useLocale();
  const setLocale = useSetLocale();
  const t = useT();
  const onSettings = pathname.startsWith("/settings");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("nav.settings")}
        className={iconButtonClass(
          `ml-1 hidden lg:inline-flex ${
            onSettings
              ? "bg-brand text-brand-foreground"
              : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          }`,
        )}
      >
        <Settings className="h-5 w-5" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("nav.theme")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(v) => applyMode(v as Mode)}
        >
          {THEME_OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.v} value={o.v}>
              <span aria-hidden="true">{o.icon}</span>
              {t(`theme.${o.v}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>{t("nav.language")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(v) => setLocale(v as Locale)}
        >
          {LOCALES.map((l) => (
            <DropdownMenuRadioItem key={l} value={l}>
              {t(`language.${l}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/settings" aria-current={onSettings ? "page" : undefined}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            {t("nav.allSettings")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
