// GitHub-style study heatmap for the Insights page. A pure (server-renderable)
// component: it takes a flat, Monday-aligned list of day cells (oldest → newest)
// and lays them out as a 7-row CSS grid — one column per ISO week — so missed
// days read as the lightest cell and busier days darken. No charting library; the
// grid is plain divs. The page does all the date math + day bucketing (Berlin),
// so this stays a deterministic presentational component.

import { getT } from "@/components/i18n/server";

export type HeatmapDay = {
  /** Berlin calendar day, YYYY-MM-DD. */
  date: string;
  /** Completed study minutes on that day (0 = missed). */
  min: number;
  /** Day falls within a week that contains an exam. */
  examWeek: boolean;
  /** The day is in the future (rendered as an empty placeholder). */
  future: boolean;
};

/** Five-step intensity bucket for a day's minutes (0 = no study). */
function level(min: number): 0 | 1 | 2 | 3 | 4 {
  if (min <= 0) return 0;
  if (min < 30) return 1;
  if (min < 60) return 2;
  if (min < 120) return 3;
  return 4;
}

// Brand-green ramp, matching the green progress bars used elsewhere on the page.
// Index 0 is the "missed day" surface; 1–4 deepen with minutes.
const FILL = [
  "bg-gray-100 dark:bg-gray-800",
  "bg-green-200 dark:bg-green-900",
  "bg-green-300 dark:bg-green-700",
  "bg-green-500 dark:bg-green-600",
  "bg-green-600 dark:bg-green-400",
] as const;

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * @param days Monday-aligned, oldest → newest. Length is a multiple of 7; the
 *   first cell is a Monday and the last whole week ends on the most recent Sunday.
 */
export default async function StudyHeatmap({ days }: { days: HeatmapDay[] }) {
  const t = await getT();
  const weeks = Math.ceil(days.length / 7);
  const locale = t.locale === "de" ? "de-DE" : "en-US";

  return (
    <div>
      <div
        role="img"
        aria-label={t("insights.heatmapAria", { weeks })}
        className="grid grid-flow-col gap-1 overflow-x-auto pb-1"
        style={{ gridTemplateRows: "repeat(7, minmax(0, 1fr))" }}
      >
        {days.map((d) => {
          if (d.future) {
            return <div key={d.date} aria-hidden="true" className="size-3 rounded-sm" />;
          }
          const lvl = level(d.min);
          // Format the date in the active locale for the native tooltip.
          const nice = new Date(d.date + "T00:00:00Z").toLocaleDateString(locale, {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone: "UTC",
          });
          const title =
            d.min > 0
              ? `${nice} · ${t("insights.heatmapStudied", { time: fmtMin(d.min) })}`
              : `${nice} · ${t("insights.heatmapNone")}`;
          return (
            <div
              key={d.date}
              title={title}
              className={`size-3 rounded-sm ${FILL[lvl]} ${
                d.examWeek ? "ring-1 ring-amber-400 dark:ring-amber-500" : ""
              }`}
            />
          );
        })}
      </div>

      {/* Legend — intensity ramp + the exam-week marker. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <span>{t("insights.heatmapLess")}</span>
          {FILL.map((cls, i) => (
            <span key={i} className={`size-3 rounded-sm ${cls}`} aria-hidden="true" />
          ))}
          <span>{t("insights.heatmapMore")}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="size-3 rounded-sm bg-gray-100 ring-1 ring-amber-400 dark:bg-gray-800 dark:ring-amber-500" aria-hidden="true" />
          <span>{t("insights.heatmapExamWeek")}</span>
        </div>
      </div>
    </div>
  );
}
