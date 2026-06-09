import { streakStyle, streakLabel } from "./lib/streak";
import type { Translator } from "./i18n/messages";

/**
 * Study-streak UI — surfaces the run of consecutive active study days computed in
 * `lib/stats`. Two presentations share one milestone treatment (🔥 intensifies at
 * 3 / 7 / 30 days, see `components/lib/streak`):
 *   • <StreakBadge>  — a compact pill for the /today header.
 *   • <StreakCard>   — the headline streak panel on /insights (current + best).
 */

/**
 * Compact streak pill for the /today header. Renders nothing for a 0-day streak —
 * there's nothing to celebrate yet, and an empty "0-day streak" reads as nagging.
 */
export function StreakBadge({
  streak,
  t,
  className = "",
}: {
  streak: number;
  t: Translator;
  className?: string;
}) {
  if (streak <= 0) return null;
  const { flames, badgeClass } = streakStyle(streak);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass} ${className}`.trim()}
      title={t.n("streak.badgeTitle", streak)}
    >
      <span aria-hidden="true">{flames}</span>
      <span>{streakLabel(t, streak)}</span>
    </span>
  );
}

/**
 * Headline streak panel for /insights. Shows the current streak with its
 * milestone treatment, a nudge toward the next milestone, and the all-time best
 * as a secondary chip. Handles the empty (no-streak) state with encouragement
 * rather than a bare "0".
 */
export function StreakCard({
  current,
  best,
  t,
}: {
  current: number;
  best: number;
  t: Translator;
}) {
  const active = current > 0;
  const { flames, badgeClass, toNext } = streakStyle(current);

  const nudge = !active
    ? t("streak.startOne")
    : toNext === null
      ? t("streak.legendary")
      : t.n("streak.toNext", toNext);

  return (
    <section
      aria-label={t("streak.streakAria")}
      className={`flex items-center justify-between gap-4 rounded-2xl border p-4 sm:p-5 ${
        active ? badgeClass : "border-gray-200 dark:border-gray-800"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-3xl leading-none" aria-hidden="true">
          {active ? flames : "🔥"}
        </span>
        <div className="min-w-0">
          <p className="text-lg font-bold leading-tight">
            {active ? streakLabel(t, current) : t("streak.noActive")}
          </p>
          <p className="mt-0.5 text-xs opacity-80">{nudge}</p>
        </div>
      </div>
      {best > 1 && (
        <div className="shrink-0 text-right">
          <div className="text-xs opacity-80">
            {active && current >= best ? t("streak.personalBest") : t("streak.best")}
          </div>
          <div className="text-lg font-bold tabular-nums">
            {best}
            <span className="ml-0.5 text-sm font-medium opacity-80">{t("streak.dayShort")}</span>
          </div>
        </div>
      )}
    </section>
  );
}
