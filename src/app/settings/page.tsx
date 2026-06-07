import type { Metadata } from "next";
import ThemeSetting from "@/components/ThemeSetting";

export const metadata: Metadata = { title: "Settings · StudyFlow" };

export default function SettingsPage() {
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
