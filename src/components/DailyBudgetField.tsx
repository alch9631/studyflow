"use client";

import { useT } from "./i18n/I18nProvider";
import { Input } from "./ui/input";

export default function DailyBudgetField({ minutes, formId }: { minutes: number; formId?: string }) {
  const t = useT();
  return <label className="block text-sm font-medium">{t("study.dailyBudget")}
    <Input type="number" name="dailyBudgetMin" form={formId} min={15} max={360} step={15} required defaultValue={minutes} className="mt-1 w-full" />
    <span className="mt-1 block text-xs font-normal text-muted-foreground">{t("start.budgetHint")}</span>
  </label>;
}
