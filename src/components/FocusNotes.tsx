"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from "react";
import { Pencil } from "lucide-react";
import type { FocusNoteEntry } from "@/lib/focusNotes";
import { addFocusNote, updateFocusNote } from "@/app/(focus)/focus/noteActions";
import { useLocale, useT } from "./i18n/I18nProvider";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import { iconButtonClass } from "./ui";

export type FocusNotesHandle = { flush: () => Promise<boolean> };
type Editor = FocusNoteEntry & { conflict?: string };
const subscribe = () => () => {};
function mergeNotes(current: FocusNoteEntry[], incoming: FocusNoteEntry[]) {
  const notes = new Map(current.map((note) => [note.id, note]));
  for (const note of incoming) if (!notes.has(note.id) || notes.get(note.id)!.updatedAt <= note.updatedAt) notes.set(note.id, note);
  return [...notes.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

/** The composer stays visible; saved entries remain editable across sessions. */
const FocusNotes = forwardRef<FocusNotesHandle, { topicId: string; initialNotes: FocusNoteEntry[]; draft: string; onDraftChange: (value: string) => void; disabled: boolean }>(
function FocusNotes({ topicId, initialNotes, draft, onDraftChange, disabled }, ref) {
  const t = useT(); const locale = useLocale();
  const [notes, setNotes] = useState(initialNotes);
  const [received, setReceived] = useState(initialNotes);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<"" | "save" | "limit" | "conflict">("");
  const editorRef = useRef<Editor | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const editInput = useRef<HTMLTextAreaElement>(null);
  const restoreEditFocus = useRef<string | null>(null);
  const live = useRef({ draft, onDraftChange });
  const noteId = useRef<string | null>(null);
  const saving = useRef<Promise<boolean> | null>(null);
  const editKey = `sf-note-edit-${topicId}`;
  const createKey = `sf-note-create-${topicId}`;
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [restored, setRestored] = useState(false);
  if (hydrated && !restored) {
    setRestored(true);
    try {
      const saved = JSON.parse(sessionStorage.getItem(editKey) ?? "null");
      if (saved && typeof saved.body === "string" && saved.body.length <= 10000 && typeof saved.updatedAt === "string" && Number.isFinite(Date.parse(saved.updatedAt)) && notes.some((note) => note.id === saved.id)) setEditor(saved);
    } catch {}
  }
  useEffect(() => {
    editorRef.current = editor;
    if (!restored) return;
    try { if (editor) sessionStorage.setItem(editKey, JSON.stringify(editor)); else sessionStorage.removeItem(editKey); } catch {}
  }, [editor, restored, editKey]);
  useEffect(() => { live.current = { draft, onDraftChange }; }, [draft, onDraftChange]);
  useEffect(() => { if (editor?.id) editInput.current?.focus(); }, [editor?.id]);
  if (received !== initialNotes) { setReceived(initialNotes); setNotes((current) => mergeNotes(current, initialNotes)); }

  function changeEditor(value: Editor | null) { editorRef.current = value; setEditor(value); }
  function changeDraft(value: string) { live.current.draft = value; onDraftChange(value); }
  async function run(action: () => Promise<boolean>) {
    if (saving.current) return saving.current;
    const request = (async () => { setPending(true); try { return await action(); }
      catch { setError("save"); return false; } finally { setPending(false); } })();
    saving.current = request;
    const ok = await request;
    if (saving.current === request) saving.current = null;
    return ok;
  }
  function addDraft() {
    const body = live.current.draft.trim();
    if (!body) return Promise.resolve(true);
    return run(async () => {
      let id = noteId.current;
      if (!id) { try { id = sessionStorage.getItem(createKey); } catch {} }
      id ??= crypto.randomUUID(); noteId.current = id;
      try { sessionStorage.setItem(createKey, id); } catch {}
      const result = await addFocusNote({ id, topicId, body });
      if (!result.ok) { setError(result.reason === "limit" ? "limit" : "save"); return false; }
      setNotes((current) => mergeNotes(current, [result.note]));
      noteId.current = null; setError("");
      try { sessionStorage.removeItem(createKey); } catch {}
      if (live.current.draft.trim() === result.note.body) changeDraft("");
      composer.current?.focus();
      return true;
    });
  }
  function saveEditor() {
    const edit = editorRef.current;
    if (!edit) return Promise.resolve(true);
    if (!edit.body.trim()) { setError("save"); return Promise.resolve(false); }
    return run(async () => {
      const result = await updateFocusNote({ topicId, id: edit.id, body: edit.body, updatedAt: edit.updatedAt });
      if (!result.ok) {
        if (result.reason === "conflict" && "note" in result && result.note) {
          setNotes((current) => mergeNotes(current, [result.note]));
          changeEditor({ ...edit, updatedAt: result.note.updatedAt, conflict: result.note.body }); setError("conflict");
        } else setError("save");
        return false;
      }
      setNotes((current) => mergeNotes(current, [result.note])); restoreEditFocus.current = edit.id; changeEditor(null); setError("");
      return true;
    });
  }
  useImperativeHandle(ref, () => ({ flush: async () => {
    if (saving.current && !await saving.current) return false;
    if (!await saveEditor()) return false;
    return addDraft();
  } }));

  function date(value: string) { return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value)); }
  return <section data-focus-notes className="focus-session-notes py-3">
    <label className="block text-sm font-medium">{t("focus.notesLabel")}
      <Textarea ref={composer} rows={3} maxLength={4000} value={draft} disabled={disabled} onChange={(event) => changeDraft(event.target.value)} className="mt-2 w-full" />
    </label>
    <Button type="button" size="sm" variant="secondary" className="mt-2" disabled={disabled || pending || !!editor || !draft.trim()} onClick={() => void addDraft()}>{t(pending ? "common.saving" : "focus.addNote")}</Button>
    {error && !editor && <p role="alert" className="mt-3 text-sm text-destructive">{t(error === "limit" ? "focus.noteLimit" : "focus.noteError")}</p>}
    {notes.length > 0 && <ol aria-label={t("focus.savedNotes")} className="mt-4 divide-y divide-border">
      {notes.map((note) => <li key={note.id} data-note-id={note.id} className="py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <time dateTime={note.createdAt} className="text-xs text-muted-foreground">{date(note.createdAt)}</time>
            {editor?.id !== note.id && <p className="mt-1 whitespace-pre-wrap break-words text-base [overflow-wrap:anywhere]">{note.body}</p>}
          </div>
          {editor?.id !== note.id && <button type="button" disabled={disabled || pending || !!editor} aria-label={`${t("focus.editNote")} · ${note.body.slice(0, 80)}`} title={t("focus.editNote")}
            ref={(node) => { if (node && !disabled && !pending && restoreEditFocus.current === note.id) { restoreEditFocus.current = null; node.focus(); } }}
            className={iconButtonClass("inline-flex shrink-0 items-center justify-center text-muted-foreground hover:bg-accent")}
            onClick={() => { setError(""); changeEditor(note); }}><Pencil className="h-4 w-4" aria-hidden="true" /></button>}
        </div>
        {editor?.id === note.id && <div className="mt-2">
          <Textarea ref={editInput} aria-label={t("focus.editNote")} rows={3} value={editor.body} maxLength={note.id.startsWith("topic:") ? 10000 : 4000} disabled={disabled || pending}
            onChange={(event) => changeEditor({ ...editor, body: event.target.value })} />
          {error && <p role="alert" className="mt-2 text-sm text-destructive">{t(error === "conflict" ? "focus.noteConflict" : "focus.noteError")}</p>}
          {editor.conflict && <div className="mt-2 text-sm"><p className="font-medium">{t("focus.latestNote")}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{editor.conflict}</p></div>}
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" disabled={disabled || pending || !editor.body.trim()} onClick={() => void saveEditor()}>{t(pending ? "common.saving" : "common.save")}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={disabled || pending} onClick={() => { restoreEditFocus.current = note.id; changeEditor(null); setError(""); }}>{t("common.cancel")}</Button>
          </div>
        </div>}
      </li>)}
    </ol>}
  </section>;
});
export default FocusNotes;
