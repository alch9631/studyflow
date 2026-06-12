import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getT } from "@/components/i18n/server";

export default async function Home() {
  const t = await getT();

  // Feature grid — every claim maps to a shipped feature:
  //  • Builds itself  → plan generated backward from exam dates (planService)
  //  • Heals itself   → one-tap re-plan around what's still undone
  //  • Made to stick  → spaced reviews + self-test blocks (kind: "review")
  //  • See it working → Insights: streak, consistency %, GPA, credit points
  const FEATURES = [
    { icon: "🧭", title: t("landing.feat1Title"), body: t("landing.feat1Body") },
    { icon: "🩹", title: t("landing.feat2Title"), body: t("landing.feat2Body") },
    { icon: "🧠", title: t("landing.feat3Title"), body: t("landing.feat3Body") },
    { icon: "📊", title: t("landing.feat4Title"), body: t("landing.feat4Body") },
  ] as const;

  // Tasteful, clearly-generic stats. No fabricated numbers presented as audited
  // metrics — framed as what the product is designed to deliver.
  const STATS = [
    { value: t("landing.stat1Value"), label: t("landing.stat1Label") },
    { value: t("landing.stat2Value"), label: t("landing.stat2Label") },
    { value: t("landing.stat3Value"), label: t("landing.stat3Label") },
  ] as const;

  // Placeholder social proof — generic personas, no fabricated real names.
  const TESTIMONIALS = [
    { quote: t("landing.quote1"), author: t("landing.quote1Author"), detail: t("landing.quote1Detail") },
    { quote: t("landing.quote2"), author: t("landing.quote2Author"), detail: t("landing.quote2Detail") },
    { quote: t("landing.quote3"), author: t("landing.quote3Author"), detail: t("landing.quote3Detail") },
  ] as const;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-16 px-5 py-12 sm:py-16">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-1.5">
          <div className="rounded-md bg-brand px-4 py-2 text-2xl font-extrabold tracking-tight text-brand-foreground shadow-sm">
            TUHH
          </div>
          <span className="text-xs uppercase tracking-widest text-gray-500 dark:text-gray-400">
            {t("landing.uni")}
          </span>
        </div>

        <div className="flex flex-col items-center gap-4">
          {/* Badge is decorative clutter on a phone — desktop only. */}
          <span className="hidden items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-600 sm:inline-flex dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
            <span className="text-brand-ink">⚡</span> {t("landing.badge")}
          </span>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            {t("landing.heroTitlePre")}
            <span className="text-brand-ink">{t("landing.heroTitleHighlight")}</span>
            {t("landing.heroTitlePost")}
          </h1>
          {/* Subhead reinforces the hero on desktop; hidden on mobile to keep
              the phone view to one scannable line + CTA. */}
          <p className="mx-auto hidden max-w-lg text-pretty text-base text-gray-500 sm:block sm:text-lg dark:text-gray-400">
            {t("landing.heroSubtitle")}
          </p>
        </div>

        <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/catalog">{t("landing.buildPlan")}</Link>
          </Button>
          <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
            <Link href="/courses">{t("landing.havePlan")}</Link>
          </Button>
        </div>

        {/* Generic, designed-to-deliver stat strip */}
        <dl className="mt-2 grid w-full grid-cols-3 gap-3 sm:max-w-lg">
          {STATS.map((s) => (
            <Card
              key={s.label}
              className="flex flex-col items-center gap-0.5 px-2 py-3 text-center"
            >
              <dt className="sr-only">{s.label}</dt>
              <dd className="text-lg font-bold tracking-tight sm:text-xl">
                {s.value}
              </dd>
              <span className="text-[11px] leading-tight text-gray-500 dark:text-gray-400">
                {s.label}
              </span>
            </Card>
          ))}
        </dl>
      </section>

      {/* ── Feature grid ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t("landing.featuresTitle")}
          </h2>
          {/* Section subhead is desktop-only — on mobile the cards speak for
              themselves. */}
          <p className="mx-auto mt-2 hidden max-w-md text-pretty text-sm text-gray-500 sm:block sm:text-base dark:text-gray-400">
            {t("landing.featuresSubtitle")}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <Card
              key={f.title}
              className="p-5 text-left transition-colors hover:border-gray-300 dark:hover:border-gray-700"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-2xl">
                {f.icon}
              </div>
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              {/* Card body is title-only on mobile to keep the page short and
                  scannable; the supporting line returns on desktop. */}
              <p className="mt-1 hidden text-sm leading-relaxed text-gray-500 sm:block dark:text-gray-400">
                {f.body}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Social proof ───────────────────────────────────────────────── */}
      {/* Testimonials are a desktop-only trust signal; on a phone they're a long
          scroll between the user and the program picker, so the whole section is
          hidden below the sm breakpoint. */}
      <section className="hidden flex-col gap-6 sm:flex">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t("landing.proofTitle")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-gray-500 dark:text-gray-400 sm:text-base">
            {t("landing.proofSubtitle")}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {TESTIMONIALS.map((tm) => (
            <Card asChild key={tm.quote} className="flex flex-col gap-3 p-5">
              <figure>
                <div aria-hidden className="text-sm text-amber-400">
                  ★★★★★
                </div>
              <blockquote className="text-pretty text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                “{tm.quote}”
              </blockquote>
              <figcaption className="mt-auto text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {tm.author}
                </span>
                <span className="block">{tm.detail}</span>
              </figcaption>
              </figure>
            </Card>
          ))}
        </div>
        <p className="text-center text-[11px] text-gray-500 dark:text-gray-400">
          {t("landing.quotesDisclaimer")}
        </p>
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
            <span className="block font-semibold">{t("landing.myCourses")}</span>
            <span className="block text-sm text-gray-500 dark:text-gray-400">
              {t("landing.myCoursesDesc")}
            </span>
          </span>
          <span className="shrink-0 text-gray-500 transition-transform group-hover:translate-x-0.5 dark:text-gray-400">
            →
          </span>
        </Link>

        <Button asChild variant="secondary" className="w-full">
          <Link href="/courses/import">{t("landing.importInstead")}</Link>
        </Button>
      </section>

      {/* ── Closing CTA ────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-gray-50 px-6 py-10 text-center dark:border-gray-800 dark:bg-gray-900">
        <h2 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
          {t("landing.ctaTitle")}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-pretty text-sm text-gray-500 dark:text-gray-400 sm:text-base">
          {t("landing.ctaSubtitle")}
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/catalog">{t("landing.buildPlan")}</Link>
          </Button>
          <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
            <Link href="/today">{t("landing.seeToday")}</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
