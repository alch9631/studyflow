import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  AlarmClock,
  Lightbulb,
  CalendarPlus,
  Bell,
  Palette,
  Globe,
  User,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
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
import { isPushConfigured } from "@/lib/push";
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

/** A titled row inside a grouped settings card: icon + heading, help text,
    then its control. Padding only — the parent card owns the border/divider. */
function Row({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
        {title}
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      {children}
    </div>
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

  // Dev-only affordances: features that aren't a finished product row in
  // production (a "coming soon" reminders no-op when push isn't configured, and
  // the login placeholder before auth exists) only show in development.
  const isDev = process.env.NODE_ENV !== "production";
  const showReminders = isPushConfigured() || isDev;
  const showAccount = !!session?.user || isDev;

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

      {/* STUDY SETUP — your real week + how the planner uses it. */}
      <GroupLabel>{t("settings.studySetup")}</GroupLabel>
      <div className={`${panelClass} divide-y divide-gray-200 dark:divide-gray-800`}>
        {/* Timetable entry point — a navigation row into /timetable. */}
        <Link
          href="/timetable"
          className="flex items-center justify-between gap-3 p-5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
        >
          <span className="min-w-0">
            <h3 className="flex items-center gap-2 font-semibold">
              <CalendarDays className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
              {t("settings.timetableTitle")}
            </h3>
            <span className="mt-1 block text-sm text-gray-500 dark:text-gray-400">
              {t("settings.timetableDesc")}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
        </Link>

        {/* Auto-schedule prefs — study window + energy, feed the calendar's
            "Auto-arrange times" placement (M3b). */}
        <Row
          icon={AlarmClock}
          title={t("settings.studyPrefsTitle")}
          description={t("settings.studyPrefsDesc")}
        >
          <StudyPrefsForm prefs={prefs} />
        </Row>

        {/* How StudyFlow plans — the methodology explainer, collapsed by default. */}
        <details className="group p-5 text-sm text-gray-600 dark:text-gray-300">
          <summary className="flex cursor-pointer items-center gap-2 font-semibold text-gray-900 dark:text-gray-100">
            <Lightbulb className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
            {t("courses.howTitle")}
          </summary>
          <ol className="mt-3 list-decimal space-y-1 pl-5">
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
      </div>

      {/* CALENDAR — live subscribe feed (auto-updates in Apple/Google Calendar). */}
      <GroupLabel>{t("settings.calendarTitle")}</GroupLabel>
      <div className={panelClass}>
        <Row
          icon={CalendarPlus}
          title={t("settings.calendarTitle")}
          description={t("settings.calendarDesc")}
        >
          <CalendarSync token={calendarToken} />
        </Row>
      </div>

      {/* REMINDERS — web-push opt-in (activates once deployed over https). Hidden
          in production until push is actually configured, so we never show a
          "coming soon" no-op as a live product row. */}
      {showReminders && (
        <>
          <GroupLabel>{t("settings.remindersTitle")}</GroupLabel>
          <div className={panelClass}>
            <Row
              icon={Bell}
              title={t("settings.remindersTitle")}
              description={t("settings.remindersDesc")}
            >
              <PushReminders />
            </Row>
          </div>
        </>
      )}

      {/* APPEARANCE — theme + language, persisted and applied app-wide. */}
      <GroupLabel>{t("settings.appearance")}</GroupLabel>
      <div className={`${panelClass} divide-y divide-gray-200 dark:divide-gray-800`}>
        <Row
          icon={Palette}
          title={t("settings.appearanceTitle")}
          description={t("settings.appearanceDesc")}
        >
          <div className="mt-3">
            <ThemeSetting />
          </div>
        </Row>
        <Row
          icon={Globe}
          title={t("settings.languageTitle")}
          description={t("settings.languageDesc")}
        >
          <div className="mt-3">
            <LanguageToggle />
          </div>
        </Row>
      </div>

      {/* ACCOUNT — signed-in identity + sign out. With a real session this is a
          live row. Without one (e.g. ALLOW_DEV_USER=1) the "login coming soon"
          placeholder is a dev-only affordance, hidden in production. */}
      {showAccount && (
        <>
          <GroupLabel>{t("settings.accountTitle")}</GroupLabel>
          <div className={panelClass}>
            {session?.user ? (
              <Row icon={User} title={t("settings.accountTitle")} description={session.user.email ?? ""}>
                <form action={signOutAction} className="mt-3">
                  <Button type="submit" variant="secondary" size="md">
                    {t("settings.signOut")}
                  </Button>
                </form>
              </Row>
            ) : (
              <Row icon={User} title={t("settings.accountTitle")} description={t("settings.loginSoon")} />
            )}
          </div>
        </>
      )}
    </main>
  );
}
