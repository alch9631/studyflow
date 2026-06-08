import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import ThemeSetting from "@/components/ThemeSetting";
import CalendarSync from "@/components/CalendarSync";
import PushReminders from "@/components/PushReminders";
import { panelClass } from "@/components/ui";
import { getCalendarToken } from "@/lib/devUser";

export const metadata: Metadata = { title: "Settings · StudyFlow" };

export const dynamic = "force-dynamic";

/** Small caps label that groups related settings sections. */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 mt-8 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
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
  const [calendarToken, { msg }] = await Promise.all([
    getCalendarToken(),
    searchParams,
  ]);

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">⚙️ Settings</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Set up your timetable, calendar sync and reminders — and choose how StudyFlow looks.
      </p>

      {msg === "rate-limited" && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
        >
          That was a bit too quick — please wait a moment, then try again.
        </div>
      )}

      {/* High-value setup: get your real week + sync + nudges going first. */}
      <GroupLabel>Study setup</GroupLabel>
      <div className="space-y-4">
        {/* Timetable entry point — a navigation row into /timetable. */}
        <Link
          href="/timetable"
          className={`${panelClass} flex items-center justify-between gap-3 p-5 transition-colors hover:border-gray-400 dark:hover:border-gray-600`}
        >
          <span className="min-w-0">
            <h3 className="flex items-center gap-2 font-semibold">
              <span aria-hidden>🗓️</span>My timetable
            </h3>
            <span className="mt-1 block text-sm text-gray-500 dark:text-gray-400">
              Add your weekly lectures so your real week shows up on Today.
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-gray-400">
            →
          </span>
        </Link>

        {/* Calendar sync — live subscribe feed (auto-updates in Apple/Google Calendar). */}
        <Section
          icon="📆"
          title="Calendar sync"
          description="Subscribe to your study plan in Apple or Google Calendar. Unlike a one-time export, this feed updates itself whenever your plan changes."
        >
          <CalendarSync token={calendarToken} />
        </Section>

        {/* Reminders — web-push opt-in (activates once deployed over https). */}
        <Section
          icon="🔔"
          title="Reminders"
          description="Get a nudge for the day's plan and any exams coming up."
        >
          <PushReminders />
        </Section>
      </div>

      {/* App-level preferences and account. */}
      <GroupLabel>Preferences</GroupLabel>
      <div className="space-y-4">
        {/* Appearance — theme selector. */}
        <Section
          icon="🎨"
          title="Appearance"
          description="Choose how StudyFlow looks. “System” follows your device's light or dark setting."
        >
          <div className="mt-3">
            <ThemeSetting />
          </div>
        </Section>

        {/* Account — placeholder for future login-based personalization. */}
        <Section
          icon="👤"
          title="Account"
          description="You're on a shared local profile for now. Personal login — so each student gets their own private courses and study plans — is coming soon."
        >
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            🔒 Login coming soon
          </span>
        </Section>
      </div>
    </main>
  );
}
