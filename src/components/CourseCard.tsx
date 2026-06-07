"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { editCourse, deleteCourse, type EditState } from "@/app/courses/actions";
import { examCountdownLabel } from "@/lib/dates";

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

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save"}
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {pending ? "Deleting…" : "🗑 Delete"}
    </button>
  );
}

export default function CourseCard({ course }: { course: CardCourse }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<EditState, FormData>(editCourse, null);
  const pct = course.total ? Math.round((course.done / course.total) * 100) : 0;
  const days = course.studyDays.split(",");

  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm">
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
        <Link
          href={`/courses/${course.id}`}
          className="rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Open →
        </Link>
        <button
          type="button"
          aria-expanded={editing}
          onClick={() => setEditing((e) => !e)}
          className="rounded-full border border-gray-300 dark:border-gray-700 px-4 py-1.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
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
            <div className="flex items-center gap-3">
              <SaveButton />
              {state?.ok && <span className="text-sm text-green-600">✓ Saved</span>}
              {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
            </div>
          </form>
          <form
            action={deleteCourse}
            onSubmit={(e) => {
              if (!confirm(`Delete "${course.name}"? This can't be undone.`)) e.preventDefault();
            }}
            className="mt-2"
          >
            <input type="hidden" name="courseId" value={course.id} />
            <DeleteButton />
          </form>
        </>
      )}
    </div>
  );
}
