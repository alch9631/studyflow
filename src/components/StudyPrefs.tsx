import { saveStudyPrefs } from "@/app/settings/actions";
import { Button } from "./ui/button";
import { getT } from "./i18n/server";
import { minutesToHHMM } from "@/lib/calendarTime";
import type { StudyPrefs } from "@/lib/timePlacer";

/**
 * Auto-scheduling preferences control (study window + energy). A plain server
 * form posting to {@link saveStudyPrefs}; rendered from the settings page with
 * the user's current prefs so the inputs are pre-filled. Times are <input
 * type="time"> (HH:MM), energy is a simple select — both map straight to the
 * action's parser. Persists into User.preferences (JSON string).
 */
export default async function StudyPrefsForm({ prefs }: { prefs: StudyPrefs }) {
  const t = await getT();
  return (
    <form action={saveStudyPrefs} className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("settings.studyWindowStart")}</span>
          <input
            type="time"
            name="dayStart"
            defaultValue={minutesToHHMM(prefs.dayStartMin)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("settings.studyWindowEnd")}</span>
          <input
            type="time"
            name="dayEnd"
            defaultValue={minutesToHHMM(prefs.dayEndMin)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t("settings.energyLabel")}</span>
        <select
          name="energy"
          defaultValue={prefs.energy}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <option value="morning">{t("settings.energyMorning")}</option>
          <option value="evening">{t("settings.energyEvening")}</option>
          <option value="any">{t("settings.energyAny")}</option>
        </select>
      </label>
      <Button type="submit" variant="primary" size="md">
        {t("common.save")}
      </Button>
    </form>
  );
}
