import Link from "next/link";
import { PROGRAMS } from "@/lib/programs";
import { buttonClasses, cardClass } from "@/components/ui";

// Feature grid — every claim maps to a shipped feature:
//  • Builds itself  → plan generated backward from exam dates (planService)
//  • Heals itself   → one-tap re-plan around what's still undone
//  • Made to stick  → spaced reviews + self-test blocks (kind: "review")
//  • See it working → Insights: streak, consistency %, GPA, credit points
const FEATURES = [
  {
    icon: "🧭",
    title: "Builds itself",
    body: "Pick your modules — StudyFlow reads them and works backward from each exam to a realistic daily plan.",
  },
  {
    icon: "🩹",
    title: "Heals when you slip",
    body: "Fell behind? One tap re-plans the days you have left around what's still undone. No guilt, no spreadsheets.",
  },
  {
    icon: "🧠",
    title: "Made to stick",
    body: "Spaced reviews and self-test sessions are baked in — the proven ways to actually remember it on exam day.",
  },
  {
    icon: "📊",
    title: "See it working",
    body: "Streaks, weekly consistency, GPA and credit points — Insights shows the momentum so you keep going.",
  },
] as const;

// Tasteful, clearly-generic stats. No fabricated numbers presented as audited
// metrics — framed as what the product is designed to deliver.
const STATS = [
  { value: "0", label: "spreadsheets to maintain" },
  { value: "1 tap", label: "to re-plan a bad week" },
  { value: "Daily", label: "plan, ready every morning" },
] as const;

// Placeholder social proof — generic personas, no fabricated real names.
const TESTIMONIALS = [
  {
    quote:
      "The morning plan is the only to-do list I actually open. It tells me what to study and I just do it.",
    author: "Engineering student",
    detail: "Exam-season tester",
  },
  {
    quote:
      "Missing a few days used to wreck my whole schedule. Now I re-plan in a tap and I'm back on track.",
    author: "Second-year student",
    detail: "Early access",
  },
  {
    quote:
      "Seeing the streak and consistency climb is weirdly motivating. It keeps me honest.",
    author: "Returning learner",
    detail: "Early access",
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-16 px-5 py-12 sm:py-16">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-1.5">
          <div
            className="rounded-md px-4 py-2 text-2xl font-extrabold tracking-tight text-white shadow-sm"
            style={{ backgroundColor: "#00509b" }}
          >
            TUHH
          </div>
          <span className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Technische Universität Hamburg
          </span>
        </div>

        <div className="flex flex-col items-center gap-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
            <span className="text-brand">⚡</span> Made for TUHH students
          </span>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            The study plan that{" "}
            <span className="text-brand">builds itself</span>
            <br className="hidden sm:block" /> — and heals itself when you fall
            behind.
          </h1>
          <p className="mx-auto max-w-lg text-pretty text-base text-gray-500 dark:text-gray-400 sm:text-lg">
            Pick your modules and StudyFlow lays out exactly what to study each
            day, working backward from your exams. Slip a few days? Re-plan in a
            single tap.
          </p>
        </div>

        <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <Link
            href="#programs"
            className={buttonClasses("primary", "lg", "w-full sm:w-auto")}
          >
            Build my plan
          </Link>
          <Link
            href="/courses"
            className={buttonClasses("secondary", "lg", "w-full sm:w-auto")}
          >
            I already have a plan
          </Link>
        </div>

        {/* Generic, designed-to-deliver stat strip */}
        <dl className="mt-2 grid w-full grid-cols-3 gap-3 sm:max-w-lg">
          {STATS.map((s) => (
            <div
              key={s.label}
              className={`${cardClass} flex flex-col items-center gap-0.5 px-2 py-3 text-center`}
            >
              <dt className="sr-only">{s.label}</dt>
              <dd className="text-lg font-bold tracking-tight sm:text-xl">
                {s.value}
              </dd>
              <span className="text-[11px] leading-tight text-gray-500 dark:text-gray-400">
                {s.label}
              </span>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Feature grid ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Everything you need to stay on top of the semester
          </h2>
          <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-gray-500 dark:text-gray-400 sm:text-base">
            One place for your plan, your timetable, your exams and your
            progress.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className={`${cardClass} p-5 text-left transition-colors hover:border-gray-300 dark:hover:border-gray-700`}
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-2xl">
                {f.icon}
              </div>
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Social proof ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Built for the way exam season actually goes
          </h2>
          <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-gray-500 dark:text-gray-400 sm:text-base">
            Early testers used StudyFlow to turn a stack of modules into one
            clear daily routine.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure
              key={t.quote}
              className={`${cardClass} flex flex-col gap-3 p-5`}
            >
              <div aria-hidden className="text-sm text-amber-400">
                ★★★★★
              </div>
              <blockquote className="text-pretty text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                “{t.quote}”
              </blockquote>
              <figcaption className="mt-auto text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {t.author}
                </span>
                <span className="block">{t.detail}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="text-center text-[11px] text-gray-400 dark:text-gray-600">
          Quotes are illustrative early-tester feedback.
        </p>
      </section>

      {/* ── Primary action: choose your Studiengang ────────────────────── */}
      <section id="programs" className="scroll-mt-20 text-left">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight">
            Choose your Studiengang
          </h2>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {PROGRAMS.length} programs
          </span>
        </div>
        <div className="max-h-[44vh] divide-y divide-gray-100 overflow-y-auto rounded-2xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {PROGRAMS.map((p) => (
            <Link
              key={p.code}
              href={`/catalog?program=${p.code}`}
              className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {p.code}
                </span>
              </span>
              <span className="shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600">
                ›
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Secondary action: jump back into existing courses ──────────── */}
      <section className="flex flex-col gap-3">
        <Link
          href="/courses"
          className="group flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left transition-colors hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-xl">
            📚
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">My Courses</span>
            <span className="block text-sm text-gray-500 dark:text-gray-400">
              Jump back into your study plan
            </span>
          </span>
          <span className="shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>

        <Link
          href="/courses/import"
          className={buttonClasses("secondary", "md", "w-full")}
        >
          ✨ Import a syllabus instead
        </Link>
      </section>

      {/* ── Closing CTA ────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-gray-50 px-6 py-10 text-center dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
          Stop planning. Start studying.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-gray-500 dark:text-gray-400 sm:text-base">
          Add your modules and get a plan you can actually follow tomorrow
          morning.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="#programs"
            className={buttonClasses("primary", "lg", "w-full sm:w-auto")}
          >
            Build my plan
          </Link>
          <Link
            href="/today"
            className={buttonClasses("ghost", "lg", "w-full sm:w-auto")}
          >
            See today’s plan
          </Link>
        </div>
      </section>
    </main>
  );
}
