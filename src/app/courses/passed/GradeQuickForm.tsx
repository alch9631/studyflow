"use client";

import { saveGradeInline } from "@/app/courses/actions";
import SubmitButton from "@/components/SubmitButton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n/I18nProvider";

/**
 * The Passed page's one-line final-grade entry: number field + save, right on
 * the card — no sheet to open. Saves via {@link saveGradeInline} (revalidates
 * in place, never navigates) and toasts the outcome honestly, including the
 * "invalid grade" rejection that would otherwise be a silent no-op.
 *
 * Saving a failing grade (over 4.0) on a module passed without the bestanden
 * flag re-opens it — the module moves back to My Courses with its plan; the
 * server action rebuilds the schedule, this form just reports what happened.
 */
export default function GradeQuickForm({
  courseId,
  initialGrade,
}: {
  courseId: string;
  initialGrade: number | null;
}) {
  const t = useT();
  const { toast } = useToast();

  async function save(formData: FormData) {
    // Catch a failed invocation itself (offline, server error mid-POST) — the
    // route error boundary replacing the whole page is not honest feedback for
    // a one-field save. Same convention as SwipeCourseCard.togglePassed.
    let outcome: Awaited<ReturnType<typeof saveGradeInline>>;
    try {
      outcome = await saveGradeInline(formData);
    } catch {
      toast(t("passedPage.gradeError"), "error");
      return;
    }
    if (outcome.ok) {
      // A failing (or cleared) grade re-opens the module — its card is about
      // to leave this list, so say that instead of a bare "saved".
      toast(
        outcome.reopened ? t("passedPage.gradeSavedReopened") : t("passedPage.gradeSaved"),
        "success",
      );
      return;
    }
    toast(
      outcome.reason === "rate-limited"
        ? t("courses.rateLimited")
        : outcome.reason === "invalid"
          ? t("passedPage.gradeInvalid")
          : t("passedPage.gradeError"),
      "error",
    );
  }

  return (
    <form action={save} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="courseId" value={courseId} />
      <div className="text-sm">
        <label htmlFor={`grade-${courseId}`} className="block font-medium">
          {t("courseDetail.finalGrade")}
        </label>
        {/* Text + decimal keypad, not type="number": German users type "1,7"
            and number inputs swallow the comma; parseGrade normalizes it. */}
        <Input
          id={`grade-${courseId}`}
          type="text"
          inputMode="decimal"
          name="grade"
          maxLength={4}
          defaultValue={initialGrade ?? ""}
          placeholder={t("courseDetail.gradePlaceholder")}
          className="mt-1 w-28"
        />
      </div>
      <SubmitButton variant="secondary" size="md" pendingLabel={t("common.saving")}>
        {t("passedPage.saveGrade")}
      </SubmitButton>
    </form>
  );
}
