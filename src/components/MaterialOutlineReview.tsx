"use client";

import { useState } from "react";
import { outlineTopicTitle, type MaterialOutline } from "@/lib/documentOutline";
import { applyMaterialOutline } from "@/app/courses/studyActions";
import { useT } from "./i18n/I18nProvider";
import { Button } from "./ui/button";

export default function MaterialOutlineReview({ outline, fileId, onSaved, onTasks, loadingTasks = false }: {
  outline: MaterialOutline; fileId: string; onSaved: () => void; onTasks: () => void; loadingTasks?: boolean;
}) {
  const t = useT();
  const [selected, setSelected] = useState(outline.units.map((unit) => unit.id));
  const [replace, setReplace] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const chapters = outline.entries.filter((entry) => !entry.parentId);
  async function save() {
    setPending(true); setError(false);
    try {
      const result = await applyMaterialOutline(fileId, outline.id, selected, replace);
      if (!result.ok) { setError(true); return; }
      onSaved();
    } catch { setError(true); } finally { setPending(false); }
  }
  return <div className="mt-4 space-y-4">
    <Button type="button" variant="secondary" disabled={pending} onClick={() => setSelected(selected.length === outline.units.length ? [] : outline.units.map((unit) => unit.id))}>
      {t(selected.length === outline.units.length ? "flow.deselectAll" : "flow.selectAll")}
    </Button>
    <ol className="divide-y divide-border border-y border-border">{chapters.map((chapter) => {
      const units = outline.units.filter((unit) => unit.id === chapter.id || unit.parentId === chapter.id);
      return <li key={chapter.id} className="py-2"><details open={chapters.length === 1}>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold leading-relaxed">
          {chapter.id.startsWith("h-") ? "" : `${chapter.id} `}{chapter.title}
          <span className="ml-2 whitespace-nowrap text-xs font-normal text-muted-foreground">{units.filter((unit) => selected.includes(unit.id)).length}/{units.length}</span>
        </summary>
        <ul className="space-y-2 pb-2">{units.map((unit) => {
          return <li key={unit.id} className="pl-2">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
              <input type="checkbox" disabled={pending} className="mt-1 h-5 w-5 shrink-0" checked={selected.includes(unit.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, unit.id] : ids.filter((id) => id !== unit.id))} />
              <span className="min-w-0 break-words text-sm"><span className="font-medium">{outlineTopicTitle(unit)}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{unit.reference} · {t("flow.outlineEstimate", { minutes: unit.estimatedMinutes })}</span>
              </span>
            </label>
            <a className="ml-8 inline-flex min-h-11 items-center text-sm text-brand-ink underline underline-offset-4" href={`/api/materials/${encodeURIComponent(fileId)}${unit.page ? `#page=${unit.page}` : ""}`} target="_blank" rel="noreferrer">{t("study.openMaterial")}</a>
          </li>;
        })}</ul>
      </details></li>;
    })}</ol>
    <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={pending} checked={replace} onChange={(event) => setReplace(event.target.checked)} />
      <span>{t("flow.replaceOutline")}<span className="mt-1 block text-xs text-muted-foreground">{t("flow.replaceOutlineHint")}</span></span>
    </label>
    {error && <p role="alert" className="text-sm">{t("flow.outlineSaveError")}</p>}
    <div className="sticky bottom-0 space-y-2 bg-surface pt-3">
      <Button className="w-full whitespace-normal" type="button" disabled={pending || loadingTasks || !selected.length} onClick={() => void save()}>{pending ? t("study.saving") : t("flow.useOutline", { count: selected.length })}</Button>
      <Button className="w-full whitespace-normal" variant="ghost" type="button" disabled={pending || loadingTasks} onClick={onTasks}>{t(loadingTasks ? "flow.preparing" : "flow.smallTasks")}</Button>
    </div>
  </div>;
}
