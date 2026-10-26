import Link from "next/link";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { parsePrefs } from "@/lib/timePlacer";
import { minutesToHHMM } from "@/lib/calendarTime";
import { todayISO } from "@/lib/planService";
import { getT } from "@/components/i18n/server";
import StartForm from "./StartForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Start studying" };

export default async function StartPage() {
  const userId = await getCurrentUserId();
  const [user, t] = await Promise.all([prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { preferences: true } }), getT()]);
  const prefs = parsePrefs(user.preferences);
  const tomorrow = new Date(todayISO() + "T00:00:00Z"); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return <main className="mx-auto max-w-xl px-4 py-8 sm:px-6">
    <h1 className="text-2xl font-semibold">{t("start.title")}</h1>
    <p className="mb-7 mt-2 text-sm leading-relaxed text-muted-foreground">{t("start.description")}</p>
    <StartForm requestId={randomUUID()} budget={user.preferences ? prefs.dailyBudgetMin ?? 60 : 60} dayStart={minutesToHHMM(prefs.dayStartMin)} dayEnd={minutesToHHMM(prefs.dayEndMin)} today={tomorrow.toISOString().slice(0,10)} />
    <Link href="/catalog" className="mt-6 inline-flex min-h-11 items-center text-sm text-brand-ink underline">{t("start.catalog")}</Link>
  </main>;
}
