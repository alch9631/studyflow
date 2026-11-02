import { useEffect, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Linking } from "react-native";
import type { PracticeData } from "../../../shared/mobileWorkspace";
import { Action, AppText, Card } from "../src/ui";
import { Chips, Field, LinkButton, Page, ProgressBar, useMobileData } from "../src/workspace";
import { useSession } from "../src/session";
import { openMaterial } from "../src/materials";

export default function Practice() {
  const { courseId, examFile } = useLocalSearchParams<{ courseId: string; examFile?: string }>();
  return <PracticeRun key={`${courseId}:${examFile ?? ""}`} courseId={courseId} examFile={examFile} />;
}

function PracticeRun({ courseId, examFile }: { courseId: string; examFile?: string }) {
  const { session } = useSession();
  const query = useMobileData<PracticeData>(`practice?courseId=${encodeURIComponent(courseId)}${examFile ? `&examFile=${encodeURIComponent(examFile)}` : ""}`);
  const cards = query.data?.cards ?? [];
  const [index, setIndex] = useState(0); const [response, setResponse] = useState(""); const [revealed, setRevealed] = useState(false); const [busy, setBusy] = useState(false);
  const [rated, setRated] = useState(0); const [skipped, setSkipped] = useState(0);
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    setIndex(0); setResponse(""); setRevealed(false); setRated(0); setSkipped(0);
  }, [query.data]);
  const card = cards[index];
  async function rate(confidence: string) {
    if (!card || busy) return; setBusy(true);
    const current = revision.current;
    try { await query.action("setConfidence", { topicId: card.topicId, confidence }); if (current === revision.current) { setRated(value => value + 1); advance(); } }
    catch (e) { query.setError((e as Error).message); } finally { setBusy(false); }
  }
  function advance(skip = false) { if (skip) setSkipped(value => value + 1); setIndex(i => i + 1); setResponse(""); setRevealed(false); query.setError(null); }
  return <Page back title="Active recall" subtitle={query.data?.courseName} query={query}>
    {card ? <><ProgressBar value={index / cards.length * 100} label={`${index + 1} of ${cards.length} questions`} /><Card><AppText size={13} muted>{card.topicTitle}</AppText><AppText size={23} weight="700">{card.question}</AppText></Card><Field label="Your answer" value={response} onChange={setResponse} multiline maxLength={4000} disabled={busy} />
      {!revealed ? <Action secondary disabled={!response.trim()} onPress={() => setRevealed(true)}>Check answer</Action> : <Card><AppText>{card.answerKey || "Check your answer against your course material, then rate how confident you feel."}</AppText>
        {(card.sourceFileId || card.sourceUrl) && <LinkButton label="Open source" onPress={() => {
          if (!session) return;
          const opening = card.sourceFileId ? openMaterial(session, card.sourceFileId, "practice-source.pdf") : Linking.openURL(card.sourceUrl!);
          void opening.catch(() => query.setError("Couldn't open this source."));
        }} />}
        <AppText size={13} muted>Your rating adjusts spaced reviews for this topic.</AppText>{busy ? <AppText muted>Saving…</AppText> : <Chips value="" onChange={v => { void rate(v); }} options={[{ label: "Solid", value: "solid" }, { label: "More practice", value: "practice" }, { label: "Struggling", value: "struggling" }]} />}
      </Card>}
      <LinkButton label="Skip question" onPress={() => { if (!busy) advance(true); }} />
    </> : !query.loading && !query.error && <Card><AppText weight="700">{cards.length ? "Practice complete." : "No recall questions yet."}</AppText><AppText muted>{cards.length ? `${rated} rated · ${skipped} skipped. ${rated ? "Your confidence ratings are saved." : "No confidence ratings were changed."}` : "Add study tasks or build a plan from course materials to create recall questions."}</AppText>
      {cards.length > 0 && <Action onPress={() => { setIndex(0); setResponse(""); setRevealed(false); setRated(0); setSkipped(0); }}>Practice again</Action>}
      <LinkButton label="Back to course" onPress={() => router.replace(`/course/${courseId}`)} />
    </Card>}
  </Page>;
}
