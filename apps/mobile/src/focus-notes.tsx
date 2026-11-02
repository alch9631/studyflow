import { useEffect, useRef, useState } from "react";
import * as Crypto from "expo-crypto";
import type { MobileFocusNote } from "../../../shared/mobile";
import { api } from "./api";
import { useSession } from "./session";
import { Action, AppText, Card, ErrorMessage } from "./ui";
import { Field, LinkButton } from "./workspace";

export default function FocusNotes({ topicId, entries, draft, onDraftChange, disabled, onBusyChange, onReload }: {
  topicId: string; entries: MobileFocusNote[]; draft: string; onDraftChange: (value: string) => void;
  disabled: boolean; onBusyChange: (value: boolean) => void; onReload: () => Promise<void>;
}) {
  const { session } = useSession();
  const [saved, setSaved] = useState<MobileFocusNote[]>([]);
  const [editing, setEditing] = useState<MobileFocusNote | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(10);
  const request = useRef<{ id: string; body: string } | null>(null);
  const byId = new Map(entries.map(note => [note.id, note]));
  for (const note of saved) if (!byId.has(note.id) || note.updatedAt >= byId.get(note.id)!.updatedAt) byId.set(note.id, note);
  const history = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  useEffect(() => { onBusyChange(busy || editing !== null); }, [busy, editing, onBusyChange]);

  async function save(existing?: MobileFocusNote) {
    if (!session || busy || disabled) return;
    const text = existing ? body : draft;
    if (!text.trim()) return;
    setBusy(true); setError(null);
    if (!request.current || request.current.body !== text) request.current = { id: Crypto.randomUUID(), body: text };
    try {
      const result = await api<{ note: MobileFocusNote }>(session.server, session.token, `actions/${existing ? "updateFocusNote" : "addFocusNote"}`, {
        method: "POST", body: { fields: { topicId, id: existing?.id ?? request.current.id, body: text, ...(existing ? { updatedAt: existing.updatedAt } : {}) } },
      });
      setSaved(notes => [result.note, ...notes.filter(note => note.id !== result.note.id)]);
      if (existing) setEditing(null);
      else { request.current = null; onDraftChange(""); }
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save this note. Your text is still here."); }
    finally { setBusy(false); }
  }

  return <>
    <Field label="Your working notes" value={draft} onChange={onDraftChange} multiline disabled={disabled || busy} maxLength={4000} />
    <Action secondary busy={busy && !editing} disabled={disabled || busy || !draft.trim()} onPress={() => { void save(); }}>Save note</Action>
    <ErrorMessage message={error} />
    {history.length > 0 && <AppText size={19} weight="700">Saved notes</AppText>}
    {history.slice(0, limit).map(note => <Card key={note.id}>
      <AppText size={12} muted>{new Date(note.createdAt).toLocaleString()}</AppText>
      {editing?.id === note.id ? <>
        <Field label="Edit saved note" value={body} onChange={setBody} multiline disabled={disabled || busy} maxLength={note.id.startsWith("topic:") ? 10000 : 4000} />
        <Action busy={busy} disabled={disabled || !body.trim()} onPress={() => { if (editing) void save(editing); }}>Save changes</Action>
        <LinkButton label="Cancel edit" onPress={() => { if (!busy) { setEditing(null); setError(null); } }} />
      </> : <>
        <AppText size={15}>{note.body}</AppText>
        <LinkButton label="Edit note" onPress={() => { if (!busy && !disabled) { setEditing(note); setBody(note.body); setError(null); } }} />
      </>}
    </Card>)}
    {history.length > limit && <LinkButton label="Show more notes" onPress={() => setLimit(value => value + 10)} />}
    {history.length > 0 && !editing && <LinkButton label="Refresh saved notes" onPress={() => {
      if (busy || disabled) return;
      setBusy(true); setError(null);
      void onReload().catch(() => setError("Couldn't refresh your notes. Try again when you're connected.")).finally(() => setBusy(false));
    }} />}
  </>;
}
