import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signIn } from "@/auth";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to StudyFlow to access your study plan.",
};

export const dynamic = "force-dynamic";

export default function LoginPage() {
  // Server action: kick off the Google OAuth flow and return to /today after.
  async function signInWithGoogle() {
    "use server";
    await signIn("google", { redirectTo: "/today" });
  }

  // When the app runs without auth (local dev / the Pi), there is no real
  // sign-in to do — send the user straight to the app.
  if (process.env.ALLOW_DEV_USER === "1") redirect("/today");

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-8 px-5 py-12 text-center">
      <div className="flex flex-col items-center gap-2">
        <span aria-hidden className="text-4xl">📚</span>
        <h1 className="text-2xl font-bold tracking-tight">Welcome to StudyFlow</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          The study plan that builds itself. Sign in to get started.
        </p>
      </div>

      <Card className="w-full p-6">
        <form action={signInWithGoogle}>
          <Button type="submit" variant="secondary" size="lg" className="w-full">
            <span aria-hidden>🔵</span>
            Sign in with Google
          </Button>
        </form>
      </Card>
    </main>
  );
}
