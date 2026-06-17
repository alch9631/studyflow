import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import ThemeSetting from "@/components/ThemeSetting";
import LanguageToggle from "@/components/LanguageToggle";
import CalendarSync from "@/components/CalendarSync";
import PushReminders from "@/components/PushReminders";
import StudyPrefsForm from "@/components/StudyPrefs";
import { panelClass } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { getCalendarToken, getCurrentUserId } from "@/lib/devUser";
import { prisma } from "@/lib/db";
import { parsePrefs } from "@/lib/timePlacer";
import { auth } from "@/auth";
import { signOutAction } from "./actions";
import { getT } from "@/components/i18n/server";

export const metadata: Metadata = {
  title: "Settings",
  description: "Theme, calendar sync, and study reminders for StudyFlow.",
};

export const dynamic = "force-dynamic";

/** Small caps label that groups related settings sections. */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 mt-8 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
      {children}
    </h2>
  );
}

/** A titled settings panel: icon + heading, help text, then its control. */
function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className={`${panelClass} p-5`}>
      <h3 className="flex items-center gap-2 font-semibold">
        <span aria-hidden>{icon}</span>
        {title}
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      {children}
    </section>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const userId = await getCurrentUserId();
  const [calendarToken, { msg }, t, session, user] = await Promise.all([
    getCalendarToken(),
    searchParams,
    getT(),
    auth(),
    prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } }),
  ]);
  const prefs = parsePrefs(user?.preferences);

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t("settings.subtitle")}
      </p>

      {msg === "rate-limited" && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
        >
          {t("settings.rateLimited")}
        </div>
      )}

      {msg === "prefs-saved" && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
        >
          {t("settings.prefsSaved")}
        </div>
      )}

      {/* High-value setup: get your real week + sync + nudges going first. */}
      <GroupLabel>{t("settings.studySetup")}</GroupLabel>
      <div className="space-y-4">
        {/* Timetable entry point — a navigation row into /timetable. */}
        <Link
          href="/timetable"
          className={`${panelClass} flex items-center justify-between gap-3 p-5 transition-colors hover:border-gray-400 dark:hover:border-gray-600`}
        >
          <span className="min-w-0">
            <h3 className="flex items-center gap-2 font-semibold">
              <span aria-hidden>🗓️</span>{t("settings.timetableTitle")}
            </h3>
            <span className="mt-1 block text-sm text-gray-500 dark:text-gray-400">
              {t("settings.timetableDesc")}
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-gray-500 dark:text-gray-400">
            →
          </span>
        </Link>

        {/* Calendar sync — live subscribe feed (auto-updates in Apple/Google Calendar). */}
        <Section
          icon="📆"
          title={t("settings.calendarTitle")}
          description={t("settings.calendarDesc")}
        >
          <CalendarSync token={calendarToken} />
        </Section>

        {/* Reminders — web-push opt-in (activates once deployed over https). */}
        <Section
          icon="🔔"
          title={t("settings.remindersTitle")}
          description={t("settings.remindersDesc")}
        >
          <PushReminders />
        </Section>

        {/* Auto-schedule prefs — study window + energy, feed the calendar's
            "Auto-arrange times" placement (M3b). */}
        <Section
          icon="⏰"
          title={t("settings.studyPrefsTitle")}
          description={t("settings.studyPrefsDesc")}
        >
          <StudyPrefsForm prefs={prefs} />
        </Section>
      </div>

      {/* App-level preferences and account. */}
      <GroupLabel>{t("settings.preferences")}</GroupLabel>
      <div className="space-y-4">
        {/* Language — DE / EN, persisted and applied app-wide. */}
        <Section
          icon="🌍"
          title={t("settings.languageTitle")}
          description={t("settings.languageDesc")}
        >
          <div className="mt-3">
            <LanguageToggle />
          </div>
        </Section>

        {/* Appearance — theme selector. */}
        <Section
          icon="🎨"
          title={t("settings.appearanceTitle")}
          description={t("settings.appearanceDesc")}
        >
          <div className="mt-3">
            <ThemeSetting />
          </div>
        </Section>

      </div>

      {/* Account — signed-in identity + sign out. When the app runs without auth
          (ALLOW_DEV_USER=1) there is no real session, so we keep the original
          muted placeholder line instead of showing a sign-out control. */}
      {session?.user ? (
        <>
          <GroupLabel>{t("settings.accountTitle")}</GroupLabel>
          <Section icon="👤" title={t("settings.accountTitle")} description={session.user.email ?? ""}>
            <form action={signOutAction} className="mt-3">
              <Button type="submit" variant="secondary" size="md">
                Sign out
              </Button>
            </form>
          </Section>
        </>
      ) : (
        <p className="mt-4 flex items-center gap-1.5 px-1 text-xs text-gray-500 dark:text-gray-400">
          <span aria-hidden>👤</span>
          {t("settings.accountTitle")} — {t("settings.loginSoon")}
        </p>
      )}
      <details className="mt-8 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
        <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-200">
          {t("courses.howTitle")}
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            {t("courses.how1Pre")}{" "}
            <Link href="/catalog" className="text-brand-ink hover:underline">{t("courses.how1Catalog")}</Link>{t("courses.how1Mid")}{" "}
            <Link href="/courses/import" className="text-brand-ink hover:underline">{t("courses.how1Upload")}</Link>{t("courses.how1Post")}
          </li>
          <li>{t("courses.how2")}</li>
          <li>
            {t("courses.how3Pre")} <strong>{t("courses.how3Strong")}</strong> {t("courses.how3Post")}
          </li>
          <li>
            {t("courses.how4Pre")} <strong>{t("courses.how4Spaced")}</strong> {t("courses.how4Mid")}{" "}
            <strong>{t("courses.how4SelfTest")}</strong> {t("courses.how4Post")}
          </li>
          <li>
            {t("courses.how5Pre")} <Link href="/today" className="text-brand-ink hover:underline">{t("courses.how5Today")}</Link>{" "}
            {t("courses.how5Post")}
          </li>
        </ol>
        <p className="mt-3 border-t border-gray-200 dark:border-gray-800 pt-2">
          <strong>{t("courses.appleTitle")}</strong> {t("courses.appleBody")}{" "}
          <span className="font-medium text-green-700 dark:text-green-400">{t("courses.appleOnTrack")}</span>,
          <span className="font-medium text-yellow-800 dark:text-yellow-300"> {t("courses.appleMedium")}</span>,
          <span className="font-medium text-red-700 dark:text-red-400"> {t("courses.appleHigh")}</span>{t("courses.appleTail")}
        </p>
      </details>
    </main>
  );
}
