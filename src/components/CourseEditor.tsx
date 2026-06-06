"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { editCourse, type EditState } from "@/app/courses/actions";

const DAYS = [
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
  { v: 0, label: "Sun" },
];

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

export default function CourseEditor({
  course,
}: {
  course: { id: string; name: string; examDate: string; studyDays: string };
}) {
  const [state, action] = useActionState<EditState, FormData>(editCourse, null);
  const days = course.studyDays.split(",");

  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-700">
        ✏️ Edit
      </summary>
      <form action={action} className="mt-2 space-y-3 rounded-lg border border-gray-200 p-3">
        <input type="hidden" name="courseId" value={course.id} />
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="block text-xs font-medium text-gray-500">Name</span>
            <input
              name="name"
              defaultValue={course.name}
              className="mt-0.5 w-56 rounded-lg border border-gray-300 px-2 py-1.5"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-gray-500">Exam date</span>
            <input
              type="date"
              name="examDate"
              defaultValue={course.examDate}
              className="mt-0.5 rounded-lg border border-gray-300 px-2 py-1.5"
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
    </details>
  );
}
