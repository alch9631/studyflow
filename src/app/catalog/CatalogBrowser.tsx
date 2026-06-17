"use client";

import { useId, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { useT } from "@/components/i18n/I18nProvider";
import SubmitButton from "@/components/SubmitButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { inputClass } from "@/components/ui";

/**
 * One catalog module, pre-shaped on the server. `examDate` is pre-serialized to
 * a YYYY-MM-DD string (or null) and `snippet` is the trimmed handbook preview,
 * so this client island never needs the heavy `content` field or a Date object.
 */
export type CatalogModule = {
  id: string;
  code: string;
  name: string;
  section: string;
  ects: number;
  examDate: string | null;
  snippet: string;
  /** True when the student already has a course sourced from this module. */
  added: boolean;
};

/**
 * The catalog as a course PICKER, not a database dump. Live search by name/code,
 * a section filter, multi-select with a sticky "Add selected (N)" tray + confirm,
 * an "Added" badge on modules already in the plan, and a per-module info popover.
 *
 * All state is controlled and client-only; the single wrapping <form> posts the
 * checked module ids to the shared `addFromCatalog` server action on confirm.
 */
export default function CatalogBrowser({
  modules,
  action,
}: {
  modules: CatalogModule[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const t = useT();
  const formId = useId();
  const [query, setQuery] = useState("");
  const [section, setSection] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Catalog is search-FIRST: until the student narrows down (search/section) or
  // explicitly asks to browse everything, sections stay collapsed so the page
  // reads as "find a module", not a 40-row database dump.
  const [browseAll, setBrowseAll] = useState(false);

  // Sections for the filter dropdown — derived once, in display order.
  const sections = useMemo(() => {
    const seen: string[] = [];
    for (const m of modules) if (!seen.includes(m.section)) seen.push(m.section);
    return seen;
  }, [modules]);

  // Live filter: case-insensitive match on name OR code, plus the section pick.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return modules.filter((m) => {
      if (section && m.section !== section) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q);
    });
  }, [modules, query, section]);

  // Group the visible modules by section for a scannable list.
  const bySection = useMemo(() => {
    const map = new Map<string, CatalogModule[]>();
    for (const m of filtered) {
      if (!map.has(m.section)) map.set(m.section, []);
      map.get(m.section)!.push(m);
    }
    return [...map.entries()];
  }, [filtered]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCount = selected.size;

  // The student has narrowed down once they search or pick a section — that's
  // when we reveal the matching modules. Otherwise the list stays collapsed
  // (counts only) unless they tap "Browse all".
  const isNarrowing = query.trim() !== "" || section !== "";
  const revealLists = isNarrowing || browseAll;

  return (
    <>
      {/* Search + section filter — sticky so they stay reachable while scrolling. */}
      <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8 dark:border-gray-800 dark:bg-gray-950/95">
        <input
          type="search"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("catalog.searchPlaceholder")}
          aria-label={t("catalog.searchLabel")}
          className={`${inputClass} w-full text-base`}
        />
        {sections.length > 1 && (
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor={`${formId}-section`} className="sr-only">
              {t("catalog.filterSection")}
            </label>
            <select
              id={`${formId}-section`}
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className={`${inputClass} min-w-0 flex-1 text-sm`}
            >
              <option value="">{t("catalog.allSections")}</option>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/^Fachmodule der /, "")}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <form id={formId} action={action} className="space-y-3 pb-28">
        {/* Calm, search-first default: a short prompt instead of an open list. */}
        {!revealLists && bySection.length > 0 && (
          <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            {t("catalog.findPrompt")}
          </p>
        )}

        {bySection.length === 0 ? (
          <p className="rounded-xl border border-gray-200 p-5 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
            {t("catalog.noMatches")}
          </p>
        ) : (
          bySection.map(([sec, mods]) => (
            <details
              key={sec}
              open={revealLists}
              className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-gray-50 px-3 py-2.5 text-sm font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                <span className="truncate">{sec.replace(/^Fachmodule der /, "")}</span>
                <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-normal text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {mods.length}
                </span>
              </summary>
              <ul className="space-y-1.5 p-2.5">
                {mods.map((m) => (
                  <ModuleRow
                    key={m.id}
                    module={m}
                    checked={selected.has(m.id)}
                    onToggle={() => toggle(m.id)}
                    t={t}
                  />
                ))}
              </ul>
            </details>
          ))
        )}

        {/* Opt-in escape hatch: expand the whole catalog for browsers who'd
            rather scan than search. Hidden once they're already narrowing. */}
        {!isNarrowing && bySection.length > 0 && (
          <button
            type="button"
            onClick={() => setBrowseAll((v) => !v)}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-center text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {browseAll ? t("catalog.collapseAll") : t("catalog.browseAll")}
          </button>
        )}

        {/* Confirm modal lives INSIDE the form so the SubmitButton's pending
            state flows through Radix's portal via form-status context. */}
        <ConfirmAddDialog open={confirmOpen} setOpen={setConfirmOpen} count={selectedCount} t={t} />
      </form>

      {/* Sticky bottom tray — only while something is selected. */}
      {selectedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 p-3 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="shrink-0 text-sm font-medium text-gray-500 underline-offset-4 hover:underline dark:text-gray-400"
            >
              {t("catalog.clearSelection")}
            </button>
            <Button
              type="button"
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={() => setConfirmOpen(true)}
            >
              {t.n("catalog.addSelectedN", selectedCount)}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function ModuleRow({
  module: m,
  checked,
  onToggle,
  t,
}: {
  module: CatalogModule;
  checked: boolean;
  onToggle: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <li>
      <div
        className={`relative rounded-lg border p-3 pr-10 transition-colors ${
          m.added
            ? "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50"
            : "border-gray-200 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
        }`}
      >
        <label
          className={`flex items-start gap-3 ${m.added ? "cursor-default" : "cursor-pointer"}`}
        >
          {m.added ? (
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white"
            >
              ✓
            </span>
          ) : (
            <input
              type="checkbox"
              name="moduleId"
              value={m.id}
              checked={checked}
              onChange={onToggle}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
          )}
          <span className="min-w-0 flex-1 leading-snug">
            <span className={`font-medium ${m.added ? "text-gray-500 dark:text-gray-400" : ""}`}>
              {m.name}
            </span>
            {m.added && (
              <span className="ml-2 inline-block rounded-full bg-green-100 px-2 py-0.5 align-middle text-[11px] font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                {t("catalog.added")}
              </span>
            )}
          </span>
        </label>

        {/* Module details — a clear "ⓘ Info" affordance, not a bare "?". */}
        <details className="absolute right-2 top-2">
          <summary
            aria-label={t("catalog.detailsFor", { name: m.name })}
            title={t("catalog.details")}
            className="inline-flex cursor-pointer list-none items-center gap-1 rounded-full border border-gray-300 px-1.5 py-0.5 text-[11px] font-medium text-gray-500 transition-colors hover:border-brand hover:text-brand-ink dark:border-gray-700 dark:text-gray-400"
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t("catalog.info")}</span>
          </summary>
          <div className="absolute right-0 top-8 z-10 w-64 max-w-[75vw] rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600 shadow-lg dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
            <div className="font-medium text-gray-700 dark:text-gray-200">
              {m.code} · {m.ects} LP
              {m.examDate ? ` · ${t("catalog.examShort", { date: m.examDate })}` : ""}
            </div>
            {m.snippet && <p className="mt-1.5 leading-relaxed">{m.snippet}…</p>}
          </div>
        </details>
      </div>
    </li>
  );
}

/**
 * Batch-add confirmation. The dialog renders INSIDE the catalog <form>, so even
 * though Radix portals it to the document root, the SubmitButton's
 * `useFormStatus` still reads that form's pending state through React context —
 * driving its spinner and blocking a double-submit. Submitting closes the modal.
 */
function ConfirmAddDialog({
  open,
  setOpen,
  count,
  t,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  count: number;
  t: ReturnType<typeof useT>;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showCloseButton={false}>
        <DialogTitle>{t.n("catalog.confirmTitle", count)}</DialogTitle>
        <DialogDescription>{t("catalog.confirmBody")}</DialogDescription>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button type="button" variant="secondary" className="w-full sm:w-auto">
              {t("common.cancel")}
            </Button>
          </DialogClose>
          <SubmitButton
            variant="primary"
            size="md"
            pendingLabel={t("catalog.adding")}
            className="w-full sm:w-auto"
          >
            {t.n("catalog.confirmAdd", count)}
          </SubmitButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
