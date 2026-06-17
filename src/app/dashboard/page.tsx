import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { daysUntil } from "@/lib/dates";
import { todayISO } from "@/lib/planService";
import UploadDropzone from "./UploadDropzone";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Dashboard (preview)",
  description: "Experimental three-column desktop study cockpit.",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default async function DashboardPage() {
  const userId = await getCurrentUserId();
  const today = todayISO();

  // ── Week window (Mon–Sun, local time) ────────────────────────────────────
  const now = new Date();
  const back = (now.getDay() + 6) % 7; // days since Monday
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
  const sevenAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);

  const [courses, weekBlocks, recentDone] = await Promise.all([
    prisma.course.findMany({
      where: { userId },
      orderBy: { examDate: "asc" },
      select: {
        id: true,
        name: true,
        examDate: true,
        ects: true,
        aiOptimized: true,
        topics: { select: { done: true } },
      },
    }),
    prisma.studyBlock.findMany({
      where: { course: { userId }, date: { gte: weekStart, lt: weekEnd } },
      orderBy: { date: "asc" },
      select: {
        date: true,
        topicTitle: true,
        minutes: true,
        kind: true,
        completed: true,
        course: { select: { name: true, aiOptimized: true } },
      },
    }),
    prisma.studyBlock.findMany({
      where: { course: { userId }, completed: true, date: { gte: sevenAgo } },
      select: { minutes: true },
    }),
  ]);

  // ── Velocity ──────────────────────────────────────────────────────────────
  const minutes7d = recentDone.reduce((s, b) => s + b.minutes, 0);
  const topicsTotal = courses.reduce((s, c) => s + c.topics.length, 0);
  const topicsDone = courses.reduce((s, c) => s + c.topics.filter((t) => t.done).length, 0);
  const weekDoneCount = weekBlocks.filter((b) => b.completed).length;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
    return d;
  });

  const nextExam = courses[0];
  const isAiBlock = (b: (typeof weekBlocks)[number]) => b.kind === "review" || b.course.aiOptimized;

  return (
    <main className="min-h-screen bg-[#020617] px-4 py-5 text-slate-200 lg:px-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Study Cockpit</h1>
          <p className="text-xs text-slate-500">Experimental desktop view · preview</p>
        </div>
        <Link
          href="/today"
          className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-indigo-500 hover:text-white"
        >
          ← Back to app
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20fr_55fr_25fr]">
        {/* ── Left: Course & Material Hub ───────────────────────────────── */}
        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
              Courses
            </h2>
            <div className="flex flex-wrap gap-2">
              {courses.length === 0 && <p className="text-sm text-slate-500">No courses yet.</p>}
              {courses.map((c) => (
                <Link
                  key={c.id}
                  href={`/courses/${c.id}`}
                  className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-500/20"
                >
                  {c.name}
                  {c.ects ? <span className="ml-1 text-indigo-400/70">· {c.ects} CP</span> : null}
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
              Add material
            </h2>
            <UploadDropzone courses={courses.map((c) => ({ id: c.id, name: c.name }))} />
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
              Exam dates
            </h2>
            <ul className="space-y-2">
              {courses.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span className="truncate text-slate-300">{c.name}</span>
                  <span className="ml-2 shrink-0 rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                    {c.examDate.toISOString().slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        {/* ── Middle: Weekly Plan View ──────────────────────────────────── */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">This week</h2>
            <span className="flex items-center gap-2 text-xs text-slate-400">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> AI-generated block
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {days.map((d, i) => {
              const dayBlocks = weekBlocks.filter((b) => ymd(b.date) === ymd(d));
              const isToday = ymd(d) === ymd(now);
              return (
                <div key={i} className="flex flex-col gap-2">
                  <div
                    className={`rounded-md px-2 py-1 text-center text-xs font-semibold ${
                      isToday ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {WEEKDAYS[i]} {d.getDate()}
                  </div>
                  {dayBlocks.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-800 px-2 py-3 text-center text-[10px] text-slate-600">
                      —
                    </div>
                  )}
                  {dayBlocks.map((b, j) => {
                    const ai = isAiBlock(b);
                    return (
                      <div
                        key={j}
                        className={`rounded-lg bg-slate-900 px-2 py-2 ${
                          ai ? styles.aiBlock : "border border-slate-800"
                        } ${b.completed ? "opacity-50" : ""}`}
                      >
                        <p className="line-clamp-2 text-xs font-medium text-slate-100">
                          {b.topicTitle}
                        </p>
                        <p className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                          <span className="truncate">{b.course.name}</span>
                          <span
                            className={`ml-1 shrink-0 ${ai ? "text-emerald-400" : "text-indigo-400"}`}
                          >
                            {b.minutes}m
                          </span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Right: AI Study Co-Pilot ──────────────────────────────────── */}
        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
              Upcoming exams
            </h2>
            <ul className="space-y-3">
              {courses.length === 0 && <p className="text-sm text-slate-500">Nothing scheduled.</p>}
              {courses.map((c) => {
                const d = daysUntil(c.examDate, today);
                return (
                  <li key={c.id} className="flex items-center justify-between">
                    <span className="truncate text-sm text-slate-300">{c.name}</span>
                    <span
                      className={`ml-2 shrink-0 text-sm font-bold ${
                        d <= 7 ? "text-emerald-400" : "text-white"
                      }`}
                    >
                      {d < 0 ? "done" : `${d}d`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
              Study velocity
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Metric value={`${Math.round((minutes7d / 60) * 10) / 10}h`} label="last 7 days" />
              <Metric value={`${weekDoneCount}`} label="blocks done (week)" />
              <Metric value={`${topicsDone}/${topicsTotal}`} label="topics mastered" />
              <Metric
                value={`${topicsTotal ? Math.round((topicsDone / topicsTotal) * 100) : 0}%`}
                label="overall progress"
              />
            </div>
          </section>

          <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 ${styles.pulse}`} />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-emerald-300">
                AI Co-Pilot
              </h2>
            </div>
            <p className="mt-3 text-sm text-slate-300">
              {nextExam ? (
                <>
                  AI is structuring your <span className="font-semibold text-white">{nextExam.name}</span>{" "}
                  exam prep<span className={styles.pulse}>…</span>
                </>
              ) : (
                "Add a course and the Co-Pilot will build your plan."
              )}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {courses.filter((c) => c.aiOptimized).length} of {courses.length} plans AI-validated.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
      <p className="text-lg font-bold text-white">{value}</p>
      <p className="text-[10px] leading-tight text-slate-500">{label}</p>
    </div>
  );
}
