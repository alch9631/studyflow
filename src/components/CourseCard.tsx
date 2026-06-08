"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { editCourse, deleteCourse, type EditState } from "@/app/courses/actions";
import { examCountdownLabel } from "@/lib/dates";
import SubmitButton from "./SubmitButton";
import ConfirmDialog from "./ConfirmDialog";
import { buttonClasses, cardClass } from "./ui";

const DAYS = [
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
  { v: 0, label: "Sun" },
];

export type CardCourse = {
  id: string;
  name: string;
  examDate: string;
  examInDays: number;
  studyDays: string;
  done: number;
  total: number;
  apple: { emoji: string; label: string; cls: string };
};

export default function CourseCard({ course }: { course: CardCourse }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<EditState, FormData>(editCourse, null);
  const pct = course.total ? Math.round((course.done / course.total) * 100) : 0;
  const days = course.studyDays.split(",");

  return (
    <div className={`${cardClass} p-4 shadow-sm transition-shadow hover:shadow-md`}>
      {/* Header: priority + name, exam date */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            title={`${course.apple.label} priority`}
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${course.apple.cls}`}
          >
            {course.apple.emoji} {course.apple.label}
          </span>
          <Link
            href={`/courses/${course.id}`}
            className="mt-1 block truncate text-base font-semibold hover:underline"
          >
            {course.name}
          </Link>
        </div>
        <span className="shrink-0 text-right">
          <span
            className={`block text-xs font-semibold ${
              course.examInDays < 0
                ? "text-gray-400 dark:text-gray-500"
                : course.examInDays <= 7
                  ? "text-red-600 dark:text-red-400"
                  : course.examInDays <= 21
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-gray-600 dark:text-gray-300"
            }`}
          >
            ⏳ {examCountdownLabel(course.examInDays)}
          </span>
          <span className="block text-xs text-gray-400 dark:text-gray-500">{course.examDate}</span>
        </span>
      </div>

      {/* Progress */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {course.done}/{course.total} topics done
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/courses/${course.id}`} className={buttonClasses("primary", "md")}>
          Open →
        </Link>
        <button
          type="button"
          aria-expanded={editing}
          onClick={() => setEditing((e) => !e)}
          className={buttonClasses("secondary", "md")}
        >
          {editing ? "✕ Close" : "✏️ Edit"}
        </button>
      </div>

      {/* Inline edit (inside the card) */}
      {editing && (
        <>
          <form action={action} className="mt-3 space-y-3 border-t border-gray-100 dark:border-gray-800 pt-3">
            <input type="hidden" name="courseId" value={course.id} />
            <div className="flex flex-wrap gap-3">
              <label className="flex-1 text-sm">
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Name</span>
                <input
                  name="name"
                  defaultValue={course.name}
                  maxLength={100}
                  className="mt-0.5 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1.5"
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Exam date</span>
                <input
                  type="date"
                  name="examDate"
                  defaultValue={course.examDate}
                  className="mt-0.5 rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1.5"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <label key={d.v} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    name="studyDays"
                    value={d.v}
                    defaultChecked={days.includes(String(d.v))}
                  />
                  {d.label}
                </label>
              ))}
            </div>
            <div aria-live="polite" className="flex items-center gap-3">
              <SubmitButton variant="primary" size="md" pendingLabel="Saving…">
                Save
              </SubmitButton>
              {state?.ok && <span className="text-sm text-green-600 dark:text-green-400">✓ Saved</span>}
              {state?.error && <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span>}
            </div>
          </form>
          <ConfirmDialog
            action={deleteCourse}
            fields={{ courseId: course.id }}
            className="mt-2"
            triggerLabel="🗑 Delete"
            triggerVariant="danger"
            triggerSize="md"
            title="Delete this course?"
            message={
              <>
                Deleting <strong>{course.name}</strong> also removes its topics,
                deadlines, and study plan. This can&apos;t be undone.
              </>
            }
            confirmLabel="Delete course"
            errorMessage="Couldn't delete that course — please try again."
          />
        </>
      )}
    </div>
  );
}
