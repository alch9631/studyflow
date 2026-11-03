import { useRef, useState } from "react";
import { Alert, Modal, ScrollView, View } from "react-native";
import type { CourseSummary } from "../../../shared/mobileWorkspace";
import { Action, AppText, ErrorMessage, IconButton, useTheme } from "./ui";
import { Field } from "./workspace";

export type SavedExamNote = { body: string; updatedAt: string | null };

/** Each opening keeps its own version so another device's edits stay protected. */
export function ExamNote({ course, onSave, onClose }: {
  course: CourseSummary;
  onSave: (body: string, updatedAt: string) => Promise<SavedExamNote>;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [body, setBody] = useState(course.examNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  function close() {
    if (saving.current) return;
    if (body === (course.examNote ?? "")) { onClose(); return; }
    Alert.alert("Discard note changes?", "Your changes haven't been saved.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: onClose },
    ]);
  }
  async function save() {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(null);
    try { await onSave(body, course.examNoteUpdatedAt ?? ""); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't save. Your note is still here."); }
    finally { saving.current = false; setBusy(false); }
  }
  return <Modal visible animationType="slide" presentationStyle="formSheet" onRequestClose={close}>
    <ScrollView style={{ backgroundColor: theme.background }} contentInsetAdjustmentBehavior="automatic" automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <AppText size={22} weight="700" style={{ flex: 1 }}>Exam note</AppText>
        <IconButton glass label="Close exam note" icon="close-outline" disabled={busy} onPress={close} />
      </View>
      <AppText size={18} weight="600">{course.name}</AppText>
      <Field label="Note" value={body} onChange={setBody} multiline placeholder="What do you want to remember?" maxLength={4000} disabled={busy} />
      <ErrorMessage message={error} />
      <Action busy={busy} onPress={() => { void save(); }}>Save note</Action>
    </ScrollView>
  </Modal>;
}
