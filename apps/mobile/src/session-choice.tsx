import { useEffect, useState } from "react";
import { Redirect, router } from "expo-router";
import { ScrollView, View } from "react-native";
import { Host, Picker } from "@expo/ui";
import { preferredProgress, type MobileBlock } from "../../../shared/mobile";
import { sessionDurationChoices } from "../../../shared/session-duration";
import { draftKey, readDraft, writeDraft, type Draft } from "./drafts";
import { useSession } from "./session";
import { Action, AppText, ErrorMessage, IconButton, styles, useTheme } from "./ui";
import { useMobileData } from "./workspace";
import DemoNotice from "./demo-notice";

export default function SessionChoice({ id, topicId, kind }: { id: string; topicId?: string; kind?: string }) {
  const { session } = useSession();
  const theme = useTheme();
  const search = new URLSearchParams({ ...(topicId ? { topicId } : {}), ...(kind ? { kind } : {}) });
  const query = useMobileData<MobileBlock>(`blocks/${encodeURIComponent(id)}?${search}`);
  const [local, setLocal] = useState<Draft | null>(null);
  const [ready, setReady] = useState(false);
  const [chosen, setChosen] = useState<number>();
  useEffect(() => {
    if (!session || !query.data || query.data.completed) return;
    let active = true;
    const key = draftKey(session.server, session.userId, query.data.topicId);
    void readDraft(key).then(async draft => {
      if (!active) return;
      if (draft?.clock?.running && preferredProgress(draft, query.data?.progress) === draft) {
        draft = { ...draft, elapsedSeconds: draft.clock.elapsed, clock: { ...draft.clock, running: false }, updatedAt: new Date().toISOString() };
        await writeDraft(key, draft);
      }
      if (active) { setLocal(draft); setReady(true); }
    }).catch(() => { if (active) query.setError("Couldn't save the paused session. Try again before starting."); });
    return () => { active = false; };
  }, [session, query.data, query.setError]);
  useEffect(() => { if (query.data?.completed) router.dismissTo("/"); }, [query.data?.completed]);
  if (!session) return <Redirect href="/" />;
  if (query.data?.completed) return null;
  const block = query.data;
  const progress = preferredProgress(local, block?.progress);
  const elapsed = Math.max(progress?.elapsedSeconds ?? 0, progress === local ? local?.clock?.elapsed ?? 0 : 0);
  const choices = sessionDurationChoices(progress?.sessionMinutes ?? block?.minutes ?? 30, elapsed);
  const minutes = chosen ?? choices.selected;
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><AppText size={23} weight="700" style={{ flex: 1 }}>Session length</AppText><IconButton glass label="Close session length" icon="close-outline" onPress={() => router.back()} /></View>
    <DemoNotice />
    {block && <AppText weight="600">{block.title}</AppText>}
    <ErrorMessage message={query.error} />
    {query.error && <Action secondary onPress={() => { void query.reload(); }}>Try again</Action>}
    <>
      {ready && <Host matchContents seedColor={theme.brand}>
        <Picker selectedValue={minutes} onValueChange={setChosen} appearance="wheel" testID="session-duration">
          {choices.options.filter(value => value >= choices.minimum).map(value => <Picker.Item key={value} value={value} label={`${value} minutes`} />)}
        </Picker>
      </Host>}
      {elapsed > 0 && <AppText muted>{Math.floor(elapsed / 60)} minutes already studied. Your saved work will resume.</AppText>}
      <Action busy={!ready && !query.error} disabled={!ready || !block || minutes < choices.minimum} onPress={() => {
        if (block) router.replace({ pathname: "/focus/[id]", params: { id, topicId: block.topicId, kind: block.kind, minutes: String(minutes) } });
      }}>Lock in</Action>
    </>
  </ScrollView>;
}
