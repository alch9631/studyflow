"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Search,
  BookOpen,
  FileText,
  PencilLine,
  Hourglass,
  CornerDownLeft,
  type LucideIcon,
} from "lucide-react";
import { inputClass } from "./ui";
import EmptyState from "./EmptyState";
import { useT } from "./i18n/I18nProvider";

/**
 * One searchable record across the user's own data. Built server-side
 * (src/app/search/page.tsx) from courses, their topics, and their deadlines —
 * all already userId-scoped — so the client only ever filters data that belongs
 * to the signed-in student.
 */
export type SearchItem = {
  /** Stable, type-prefixed key (e.g. "topic-abc") — also the listbox option id. */
  key: string;
  type: "course" | "topic" | "deadline";
  /** The name/title we match against and display. */
  title: string;
  /** Where selecting the result jumps to (deep-links into the course page). */
  href: string;
  /** Parent course name — shown as context for topics & deadlines. */
  courseName?: string;
  /** Short trailing detail, e.g. "exam 2026-07-01" or "due 2026-06-12". */
  meta?: string;
};

/**
 * Data for the pre-typing landing view (shown before the student types). Gives
 * them somewhere to go instead of a blank field: their own courses, the next
 * exams, and a couple of fixed quick jumps.
 */
export type SearchStartData = {
  courses: { id: string; name: string; href: string }[];
  exams: { id: string; name: string; href: string; examLabel: string }[];
};

const TYPE_META: Record<
  SearchItem["type"],
  { labelKey: "search.groupCourses" | "search.groupTopics" | "search.groupDeadlines"; Icon: LucideIcon }
> = {
  course: { labelKey: "search.groupCourses", Icon: BookOpen },
  topic: { labelKey: "search.groupTopics", Icon: FileText },
  deadline: { labelKey: "search.groupDeadlines", Icon: PencilLine },
};

const TYPE_ORDER: SearchItem["type"][] = ["course", "topic", "deadline"];

/** Split `text` on the first case-insensitive hit of `q`, wrapping it in <mark>. */
function highlight(text: string, q: string) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-brand/15 px-0.5 text-inherit dark:bg-brand/30">
        {text.slice(i, i + q.length)}
      </mark>
      {text.slice(i + q.length)}
    </>
  );
}

export default function GlobalSearch({
  items,
  initialQuery = "",
  start,
}: {
  items: SearchItem[];
  initialQuery?: string;
  start?: SearchStartData;
}) {
  const router = useRouter();
  const t = useT();
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const [lastQuery, setLastQuery] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // Focus the field on mount so the page is usable straight from the keyboard.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();

  // Flat, type-ordered list of matches. We match the title first; falling back
  // to the parent course name lets "calculus" surface that course's topics too.
  const results = useMemo(() => {
    if (!q) return [] as SearchItem[];
    const scored = items
      .map((it) => {
        const title = it.title.toLowerCase();
        const inTitle = title.includes(q);
        const inCourse = it.courseName?.toLowerCase().includes(q) ?? false;
        if (!inTitle && !inCourse) return null;
        // Rank: title-start > title-contains > course-name-only.
        const rank = title.startsWith(q) ? 0 : inTitle ? 1 : 2;
        return { it, rank };
      })
      .filter((x): x is { it: SearchItem; rank: number } => x !== null);

    scored.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      const ta = TYPE_ORDER.indexOf(a.it.type);
      const tb = TYPE_ORDER.indexOf(b.it.type);
      if (ta !== tb) return ta - tb;
      return a.it.title.localeCompare(b.it.title);
    });
    return scored.map((s) => s.it);
  }, [items, q]);

  // Reset the active row whenever the query changes (adjusting state during
  // render — React's recommended alternative to a setState-in-effect).
  if (query !== lastQuery) {
    setLastQuery(query);
    setActive(0);
  }

  const grouped = useMemo(() => {
    return TYPE_ORDER.map((type) => ({
      type,
      items: results.filter((r) => r.type === type),
    })).filter((g) => g.items.length > 0);
  }, [results]);

  function go(item: SearchItem | undefined) {
    if (item) router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (results.length === 0 ? 0 : (a + 1) % results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) =>
        results.length === 0 ? 0 : (a - 1 + results.length) % results.length,
      );
    } else if (e.key === "Enter") {
      if (results[active]) {
        e.preventDefault();
        go(results[active]);
      }
    } else if (e.key === "Escape") {
      if (query) {
        e.preventDefault();
        setQuery("");
      }
    }
  }

  // Scroll the active option into view when arrow-keying through a long list.
  const activeKey = results[active]?.key;
  useEffect(() => {
    if (!activeKey) return;
    document
      .getElementById(`${listId}-${activeKey}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeKey, listId]);

  const hasQuery = q.length > 0;

  return (
    <div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-activedescendant={
            activeKey ? `${listId}-${activeKey}` : undefined
          }
          aria-autocomplete="list"
          aria-label={t("search.inputAria")}
          enterKeyHint="go"
          autoComplete="off"
          placeholder={t("search.placeholder")}
          // 16px text avoids iOS focus-zoom; extra left pad clears the icon.
          className={`${inputClass} w-full py-3 pl-10 pr-4 text-base`}
        />
      </div>

      {/* Screen-reader running count of matches. */}
      <p className="sr-only" role="status" aria-live="polite">
        {hasQuery ? t.n("search.resultsCount", results.length) : ""}
      </p>

      {!hasQuery ? (
        <SearchStart start={start} t={t} />
      ) : results.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Search className="h-7 w-7" />}
            title={t("search.noMatchesTitle")}
            description={
              <>
                {t("search.noMatchesPre")} <strong>“{query.trim()}”</strong>
                {t("search.noMatchesPost")}
              </>
            }
          />
        </div>
      ) : (
        <ul id={listId} role="listbox" aria-label={t("search.resultsLabel")} className="mt-4 space-y-4">
          {grouped.map((group) => {
            const RowIcon = TYPE_META[group.type].Icon;
            return (
            <li key={group.type}>
              <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t(TYPE_META[group.type].labelKey)}
              </p>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const idx = results.indexOf(item);
                  const isActive = idx === active;
                  return (
                    <li key={item.key}>
                      <Link
                        id={`${listId}-${item.key}`}
                        href={item.href}
                        role="option"
                        aria-selected={isActive}
                        onMouseMove={() => setActive(idx)}
                        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                          isActive
                            ? "border-brand bg-brand/5 dark:bg-brand/10"
                            : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-900"
                        }`}
                      >
                        <RowIcon
                          className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {highlight(item.title, query.trim())}
                          </span>
                          {(item.courseName || item.meta) && (
                            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                              {item.courseName}
                              {item.courseName && item.meta && " · "}
                              {item.meta}
                            </span>
                          )}
                        </span>
                        <CornerDownLeft
                          className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Fixed destinations always worth offering, regardless of the user's data. */
const QUICK_JUMPS: { href: string; labelKey: "search.jumpToday" | "search.jumpCourses" | "search.jumpCatalog" }[] = [
  { href: "/today", labelKey: "search.jumpToday" },
  { href: "/courses", labelKey: "search.jumpCourses" },
  { href: "/catalog", labelKey: "search.jumpCatalog" },
];

/**
 * The pre-typing landing view: recent courses, upcoming exams, and quick jumps,
 * so an empty search box still points the student somewhere useful. Falls back
 * to the plain hint when there's no data yet (e.g. a brand-new account).
 */
function SearchStart({ start, t }: { start?: SearchStartData; t: ReturnType<typeof useT> }) {
  const hasCourses = (start?.courses.length ?? 0) > 0;
  const hasExams = (start?.exams.length ?? 0) > 0;

  return (
    <div className="mt-6 space-y-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">{t("search.startSubtitle")}</p>

      {hasExams && (
        <section>
          <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("search.upcomingExams")}
          </p>
          <ul className="space-y-1">
            {start!.exams.map((e) => (
              <li key={`exam-${e.id}`}>
                <Link
                  href={e.href}
                  className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
                >
                  <Hourglass className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                      {t("search.examIn", { label: e.examLabel })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasCourses ? (
        <section>
          <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("search.recentCourses")}
          </p>
          <ul className="space-y-1">
            {start!.courses.map((c) => (
              <li key={`course-${c.id}`}>
                <Link
                  href={c.href}
                  className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
                >
                  <BookOpen className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("search.noCoursesYet")}</p>
      )}

      <section>
        <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t("search.quickJumps")}
        </p>
        <div className="flex flex-wrap gap-2 px-1">
          {QUICK_JUMPS.map((j) => (
            <Link
              key={j.href}
              href={j.href}
              className="rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              {t(j.labelKey)}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
