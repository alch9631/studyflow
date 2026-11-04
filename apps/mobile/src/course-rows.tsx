import { memo } from "react";
import { Alert, Pressable, View } from "react-native";
import { router } from "expo-router";
import type { CourseDetail, FormFields } from "../../../shared/mobileWorkspace";
import { AppText, IconButton, useTheme } from "./ui";
import { dateLabel } from "./workspace";
import { ActionMenu } from "./action-menu";
import { SwipeRow } from "./swipe-row";

type RunAction = (name: string, fields: FormFields) => Promise<void>;
type Topic = CourseDetail["topics"][number];
type Material = CourseDetail["files"][number];
type Deadline = CourseDetail["assignments"][number];

export const TopicRow = memo(function TopicRow({ topic: t, busy, id, run, onDelete, onOpen }: {
  topic: Topic; busy: boolean; id: string; run: RunAction; onDelete: (topic: Topic) => void; onOpen: (id: string) => void;
}) {
  const theme = useTheme();
  return <SwipeRow disabled={busy}
    leading={{ label: t.done ? "Reopen" : "Complete", icon: t.done ? "arrow-undo-outline" : "checkmark-outline", onPress: () => { void run("toggleTopic", { courseId: id, topicId: t.id, done: t.done ? "false" : "true" }); } }}
    trailing={{ label: "Delete", icon: "trash-outline", destructive: true, onPress: () => onDelete(t) }}>
    <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: theme.line, paddingVertical: 8, gap: 4 }}>
      <IconButton label={`${t.done ? "Mark not covered" : "Mark covered"}: ${t.title}`} icon={t.done ? "checkmark-circle" : "ellipse-outline"} disabled={busy} onPress={() => { void run("toggleTopic", { courseId: id, topicId: t.id, done: t.done ? "false" : "true" }); }} />
      <View style={{ flex: 1 }}><AppText selectable={false} weight="600">{t.title}</AppText>{t.confidence ? <AppText selectable={false} size={13} muted>{t.confidence}</AppText> : null}</View>
      <IconButton label={`Notes & details: ${t.title}`} icon="create-outline" onPress={() => onOpen(t.id)} />
    </View>
  </SwipeRow>;
});

export const MaterialRow = memo(function MaterialRow({ file, busy, id, onDelete, onOpen, onPrepare }: {
  file: Material; busy: boolean; id: string; onDelete: (file: Material) => void; onOpen: (file: Material) => void; onPrepare: (id: string) => Promise<void>;
}) {
  const theme = useTheme();
  return <SwipeRow disabled={busy} trailing={{ label: "Delete", icon: "trash-outline", destructive: true, onPress: () => onDelete(file) }}>
    <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: theme.line, gap: 4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${file.filename}`} disabled={busy} onPress={() => onOpen(file)} style={{ flex: 1, minHeight: 52, paddingVertical: 12 }}>
        <AppText selectable={false} size={14} weight="600">{file.filename}</AppText>
      </Pressable>
      <ActionMenu label={`Material actions: ${file.filename}`} disabled={busy} items={[
        { id: "plan", title: "Build study plan", image: "list.bullet.clipboard", onPress: () => { void onPrepare(file.id); } },
        ...(file.mockExamQuestions ? [{ id: "paper", title: `Practice · ${file.mockExamQuestions} questions`, image: "brain.head.profile" as const, onPress: () => router.push({ pathname: "/practice", params: { courseId: id, examFile: file.id } }) }] : []),
        ...(file.summary ? [{ id: "summary", title: "Summary", image: "doc.text" as const, onPress: () => Alert.alert(file.filename, file.summary) }] : []),
        { id: "delete", title: "Delete file", image: "trash", attributes: { destructive: true }, onPress: () => onDelete(file) },
      ]} />
    </View>
  </SwipeRow>;
});

export const DeadlineRow = memo(function DeadlineRow({ assignment: a, busy, run, onDelete }: {
  assignment: Deadline; busy: boolean; run: RunAction; onDelete: (assignment: Deadline) => void;
}) {
  const theme = useTheme();
  return <SwipeRow disabled={busy}
    leading={{ label: a.done ? "Reopen" : "Complete", icon: a.done ? "arrow-undo-outline" : "checkmark-outline", onPress: () => { void run("toggleAssignment", { assignmentId: a.id, done: a.done ? "false" : "true" }); } }}
    trailing={{ label: "Delete", icon: "trash-outline", destructive: true, onPress: () => onDelete(a) }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.line }}>
      <IconButton label={`${a.done ? "Reopen" : "Complete"}: ${a.title}`} icon={a.done ? "checkmark-circle" : "ellipse-outline"} disabled={busy} onPress={() => { void run("toggleAssignment", { assignmentId: a.id, done: a.done ? "false" : "true" }); }} />
      <View style={{ flex: 1 }}><AppText selectable={false} weight="600">{a.title}</AppText><AppText selectable={false} size={13} muted>{dateLabel(a.dueDate)}</AppText></View>
      <IconButton label={`Delete deadline: ${a.title}`} icon="trash-outline" disabled={busy} onPress={() => onDelete(a)} />
    </View>
  </SwipeRow>;
});
