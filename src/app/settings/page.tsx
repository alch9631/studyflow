import type { Metadata } from "next";
import Link from "next/link";
import ThemeSetting from "@/components/ThemeSetting";
import CalendarSync from "@/components/CalendarSync";
import PushReminders from "@/components/PushReminders";
import { getCalendarToken } from "@/lib/devUser";

export const metadata: Metadata = { title: "Settings · StudyFlow" };

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const calendarToken = await getCalendarToken();

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>

      {/* Appearance */}
      <section className="mb-5 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
        <h2 className="font-semibold">Appearance</h2>
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
          Choose how StudyFlow looks. “System” follows your device setting.
        </p>
        <ThemeSetting />
      </section>

      {/* Timetable entry point */}
      <Link
        href="/timetable"
        className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-gray-200 p-5 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
      >
        <span>
          <span className="block font-semibold">📅 My timetable</span>
          <span className="block text-sm text-gray-500 dark:text-gray-400">
            Add your weekly lectures so your real week shows on Today.
          </span>
        </span>
        <span className="shrink-0 text-gray-400">→</span>
      </Link>

      {/* Calendar sync — live subscribe feed (auto-updates in Apple/Google Calendar) */}
      <section className="mb-5 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
        <h2 className="font-semibold">📆 Calendar sync</h2>
        <p className="mb-1 mt-1 text-sm text-gray-500 dark:text-gray-400">
          Subscribe to your study plan in Apple or Google Calendar. Unlike a
          one-time export, this feed auto-updates whenever your plan changes.
        </p>
        <CalendarSync token={calendarToken} />
      </section>

      {/* Reminders — web-push opt-in (activates once deployed over https) */}
      <section className="mb-5 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
        <h2 className="font-semibold">🔔 Reminders</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Get a nudge for the day&apos;s plan and upcoming exams.
        </p>
        <PushReminders />
      </section>

      {/* Account — placeholder for future login-based personalization */}
      <section className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
        <h2 className="font-semibold">Account</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          You&apos;re on a shared local profile for now. Personal login — so each
          student gets their own private courses and study plans — is coming soon.
        </p>
        <span className="mt-3 inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          🔒 Login coming soon
        </span>
      </section>
    </main>
  );
}
