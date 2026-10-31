import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import type { CourseDetail } from "../../../shared/mobileWorkspace";
import { Action, AppText, Card } from "../src/ui";
import { Chips, Field, Page, ProgressBar, useMobileData } from "../src/workspace";

export default function Practice() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const query = useMobileData<CourseDetail>(`courses/${encodeURIComponent(courseId)}`);
  const cards = query.data?.topics.flatMap(t => [...t.questions.map(question => ({ question, answer: "", topic: t })), ...(t.task?.checkQuestion ? [{ question: t.task.checkQuestion, answer: t.task.answerKey, topic: t }] : [])]) ?? [];
  const [index, setIndex] = useState(0); const [response, setResponse] = useState(""); const [revealed, setRevealed] = useState(false); const [busy, setBusy] = useState(false);
  const card = cards[index];
  async function rate(confidence: string) {
    if (!card) return; setBusy(true);
    try { await query.action("setConfidence", { topicId: card.topic.id, confidence }); setIndex(i => i + 1); setResponse(""); setRevealed(false); }
    catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Page back title="Active recall" subtitle={query.data?.name} query={query}>
    {card ? <><ProgressBar value={index / cards.length * 100} label={`${index + 1} of ${cards.length} questions`} /><Card><AppText size={13} muted>{card.topic.title}</AppText><AppText size={23} weight="700">{card.question}</AppText></Card><Field label="Your answer" value={response} onChange={setResponse} multiline />
      {!revealed ? <Action secondary onPress={() => setRevealed(true)}>Check answer</Action> : <Card><AppText>{card.answer || "Check your answer against your course material, then rate how confident you feel."}</AppText><AppText size={13} muted>Your rating adjusts spaced reviews for this topic.</AppText>{busy ? <AppText muted>Saving…</AppText> : <Chips value="" onChange={v => { void rate(v); }} options={[{ label: "Solid", value: "solid" }, { label: "More practice", value: "practice" }, { label: "Struggling", value: "struggling" }]} />}</Card>}
    </> : !query.loading && <Card><AppText weight="700">{cards.length ? "Practice complete." : "No recall questions yet."}</AppText><AppText muted>{cards.length ? "Your confidence ratings are saved and your plan is updated." : "Add study tasks or build a plan from course materials to create recall questions."}</AppText></Card>}
  </Page>;
}
