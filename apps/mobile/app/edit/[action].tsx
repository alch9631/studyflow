import { useRef, useState } from "react";
import { router, useLocalSearchParams, usePreventRemove } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Alert, View } from "react-native";
import type { FormFields } from "../../../../shared/mobileWorkspace";
import { forms } from "../../src/forms";
import { Action, AppText, ErrorMessage } from "../../src/ui";
import { Chips, Field, Page, useMobileData } from "../../src/workspace";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function day(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export default function EditForm() {
  const params = useLocalSearchParams<{ action: string; fields?: string; returnTo?: string }>();
  return <FormEditor key={`${params.action}:${params.fields ?? ""}`} params={params} />;
}

function FormEditor({ params }: { params: { action: string; fields?: string; returnTo?: string } }) {
  const definition = Object.hasOwn(forms, params.action) ? forms[params.action] : undefined;
  const [initialFields] = useState<FormFields>(() => {
    let initial: FormFields = {}; try { initial = JSON.parse(params.fields ?? "{}"); } catch { /* A stale link starts a fresh form. */ }
    const future = new Date(); future.setDate(future.getDate() + 28);
    return { studyDays: ["1", "2", "3", "4", "5"], difficulty: "3", dailyBudgetMin: "60", estimatedMinutes: "30", examDate: day(future), dueDate: day(future), weekday: "1", start: "09:00", end: "10:00", ...initial };
  });
  const [fields, setFields] = useState(initialFields);
  const query = useMobileData("preferences");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [allowLeave, setAllowLeave] = useState(false);
  const submitting = useRef(false);
  const dirty = JSON.stringify(fields) !== JSON.stringify(initialFields);
  const disablePrevention = usePreventRemove(!allowLeave && (dirty || busy), ({ repeat }) => {
    if (submitting.current) { Alert.alert("Saving your changes", "Wait for the save to finish before leaving."); return; }
    Alert.alert("Discard changes?", "Your changes haven't been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => { setAllowLeave(true); repeat(); } },
    ]);
  });
  const set = (key: string, value: string | string[]) => setFields(old => ({ ...old, [key]: value }));
  async function save() {
    if (!definition || submitting.current) return;
    const missing = definition.fields.find(f => f.required && !String(fields[f.name] ?? "").trim());
    if (missing) { setError(`Enter ${missing.label.toLowerCase()}.`); return; }
    if (definition.fields.some(f => f.kind === "days") && Array.isArray(fields.studyDays) && !fields.studyDays.length) { setError("Choose at least one study day."); return; }
    submitting.current = true; setBusy(true); setError(null);
    try {
      const result = await query.action(params.action, fields);
      setAllowLeave(true);
      disablePrevention();
      if (params.returnTo) router.replace(params.returnTo as "/(tabs)");
      else if (params.action === "createCourse" || params.action === "importSyllabus") {
        const course = result.redirect?.match(/^\/courses\/([^/?]+)/)?.[1];
        if (course) router.replace(`/course/${course}`); else router.back();
      } else router.back();
    } catch (e) { setError((e as Error).message); } finally { submitting.current = false; setBusy(false); }
  }
  if (!definition) return <Page back title="Form unavailable"><AppText>Return and choose an action again.</AppText></Page>;
  return <Page back title={definition.title} subtitle={definition.description}>
    {definition.fields.map(f => {
      const value = fields[f.name] ?? "";
      if (f.kind === "date") {
        const iso = String(value); const parsed = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), 12) : new Date();
        return <View key={f.name} style={{ gap: 8, alignItems: "flex-start" }}><AppText weight="600">{f.label}</AppText><DateTimePicker value={parsed} disabled={busy} mode="date" display="compact" onChange={(_, date) => { if (date) set(f.name, day(date)); }} /></View>;
      }
      if (f.kind === "choices") return <View key={f.name} style={{ gap: 8 }}><AppText weight="600">{f.label}</AppText><Chips disabled={busy} options={f.options ?? []} value={String(value)} onChange={v => set(f.name, v)} /></View>;
      if (f.kind === "days") {
        const selected = Array.isArray(value) ? value : value.split(",");
        return <View key={f.name} style={{ gap: 8 }}><AppText weight="600">{f.label}</AppText><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{weekdays.map((label, i) => <Chips key={i} disabled={busy} options={[{ label: `${selected.includes(String(i)) ? "✓ " : ""}${label}`, value: String(i) }]} value={selected.includes(String(i)) ? String(i) : ""} onChange={v => set(f.name, selected.includes(v) ? selected.filter(d => d !== v) : [...selected, v])} />)}</View></View>;
      }
      return <Field key={f.name} disabled={busy} label={f.label} value={String(value)} onChange={v => set(f.name, v)} multiline={f.kind === "multiline"} numeric={f.kind === "number"} />;
    })}
    <ErrorMessage message={error} /><Action busy={busy} onPress={() => { void save(); }}>Save</Action>
  </Page>;
}
