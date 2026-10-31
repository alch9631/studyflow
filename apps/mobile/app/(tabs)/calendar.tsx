import { useState } from "react";
import { router } from "expo-router";
import type { CalendarData } from "../../../../shared/mobileWorkspace";
import { Action, AppText, Card } from "../../src/ui";
import { Chips, dateLabel, edit, LinkButton, minutesLabel, Page, timeLabel, useMobileData } from "../../src/workspace";

export default function Calendar() {
  const [week, setWeek] = useState(""); const [selected, setSelected] = useState("");
  const query = useMobileData<CalendarData>(`calendar${week ? `?week=${week}` : ""}`); const d = query.data;
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState("");
  const day = selected && d?.days.includes(selected) ? selected : d?.days.includes(d.today) ? d.today : d?.days[0];
  function shift(delta: number) { if (!d) return; setSelected(""); setWeek(new Date(Date.parse(d.days[0]) + delta * 7 * 86400_000).toISOString().slice(0, 10)); }
  async function arrange() { setBusy(true); query.setError(null); try { const result = await query.action<{ placed: number; unplaced: number }>("autoSchedule", { weekStart: d!.days[0] }); setNotice(`${result.placed} sessions placed${result.unplaced ? ` · ${result.unplaced} need an available time` : ""}.`); await query.reload(); } catch (e) { query.setError((e as Error).message); } finally { setBusy(false); } }
  return <Page title="Calendar" subtitle="Your study week · Europe/Berlin" query={query}>
    {d && <>
      <Card><AppText weight="700">{dateLabel(d.days[0])} – {dateLabel(d.days[6])}</AppText><Chips options={[{ label: "‹ Previous", value: "prev" }, { label: "This week", value: "now" }, { label: "Next ›", value: "next" }]} value="" onChange={v => v === "now" ? (setWeek(""), setSelected("")) : shift(v === "prev" ? -1 : 1)} />
        <Chips options={d.days.map(iso => ({ value: iso, label: new Date(iso + "T12:00:00Z").toLocaleDateString(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" }) }))} value={day ?? ""} onChange={setSelected} />
      </Card>
      {d.exams.filter(e => e.date === day).map(e => <Card key={e.id}><AppText weight="700">Exam · {e.name}</AppText><LinkButton label="Open exam details" onPress={() => router.push("/(tabs)/exams")} /></Card>)}
      {d.lectures.filter(l => l.weekday === new Date(day + "T12:00:00Z").getUTCDay()).map(l => <Card key={l.id}><AppText weight="600">{l.title}</AppText><AppText muted>{timeLabel(l.startMin)}–{timeLabel(l.endMin)}{l.location ? ` · ${l.location}` : ""}</AppText></Card>)}
      {d.blocks.filter(b => b.date === day).map(b => <Card key={b.id}><AppText size={17} weight="700">{b.completed ? "✓ " : ""}{b.topicTitle}</AppText><AppText size={14} muted>{b.course.name} · {minutesLabel(b.minutes)} · {b.start !== null && b.end !== null ? `${timeLabel(b.start)}–${timeLabel(b.end)}` : "No time assigned"}</AppText>
        <LinkButton label={b.completed ? "View session" : "Start session"} onPress={() => router.push(`/focus/${b.id}`)} />
        {!b.completed && <><LinkButton label="Change day or time" onPress={() => edit("updateBlockTime", { blockId: b.id, date: b.date, startHHmm: timeLabel(b.start ?? 540), endHHmm: timeLabel(b.end ?? Math.min(1439, (b.start ?? 540) + b.minutes)) })} />
          {b.start !== null && <LinkButton label="Remove assigned time" onPress={() => { void query.action("updateBlockTime", { blockId: b.id, clear: "1" }).then(query.reload).catch(e => query.setError(e.message)); }} />}</>}
      </Card>)}
      {!d.blocks.some(b => b.date === day) && <AppText muted>No study sessions planned for this day.</AppText>}
      {!!notice && <AppText muted>{notice}</AppText>}<Action secondary busy={busy} onPress={() => { void arrange(); }}>Arrange this week</Action>
      <LinkButton label="Manage class timetable" onPress={() => router.push("/timetable")} />
    </>}
  </Page>;
}
