import { useLocalSearchParams } from "expo-router";
import SessionChoice from "../../src/session-choice";

export default function ChooseSession() {
  const { id, topicId, kind } = useLocalSearchParams<{ id: string; topicId?: string; kind?: string }>();
  return <SessionChoice key={id} id={id} topicId={topicId} kind={kind} />;
}
