import Link from "next/link";
import type { Translator } from "@/components/i18n/messages";

/** One exam chip's data — name + whole days until its exam. */
export type ExamChip = {
  id: string;
  name: string;
  days: number;
};

/**
 * Horizontal, scrollable strip of exam-countdown chips at the very top of Today
 * ("OS 4d · Algorithms 24d"), colored by urgency:
 *   - ≤ 7 days  → red
 *   - ≤ 21 days → amber
 *   - else      → neutral
 *
 * Server-rendered (pure data + Links). Past exams are filtered out by the page;
 * this just renders the chips it's given. Short names are shown as-is — the page
 * passes the course name; long names truncate within the chip.
 */
export default function ExamStrip({ exams, t }: { exams: ExamChip[]; t: Translator }) {
  if (exams.length === 0) return null;
  return (
    <nav
      aria-label={t("today.examStripTitle")}
      className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex w-max gap-2">
        {exams.map((e) => {
          const tone =
            e.days <= 7
              ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              : e.days <= 21
                ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                : "border-gray-200 bg-white text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300";
          return (
            <li key={e.id} className="shrink-0">
              <Link
                href={`/courses/${e.id}`}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80 ${tone}`}
              >
                <span className="max-w-[10rem] truncate">{e.name}</span>
                <span className="tabular-nums opacity-80">{e.days}d</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
