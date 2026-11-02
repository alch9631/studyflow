import { useLocalSearchParams } from "expo-router";
import FocusSession from "../../src/focus-session";

export default function Focus() {
  const { id, topicId, kind, minutes } = useLocalSearchParams<{ id: string; topicId?: string; kind?: string; minutes?: string }>();
  return <FocusSession key={id} id={id} topicId={topicId} kind={kind} minutes={minutes} />;
}
