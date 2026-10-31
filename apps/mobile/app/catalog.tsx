import { useState } from "react";
import { Pressable } from "react-native";
import { router } from "expo-router";
import type { CatalogItem } from "../../../shared/mobileWorkspace";
import { Action, AppText, Card } from "../src/ui";
import { Field, Page, useMobileData } from "../src/workspace";

export default function Catalog() {
  const [search, setSearch] = useState(""); const [term, setTerm] = useState(""); const [selected, setSelected] = useState<string[]>([]); const [budget, setBudget] = useState("60"); const [busy, setBusy] = useState(false);
  const query = useMobileData<CatalogItem[]>(`catalog?q=${encodeURIComponent(term)}`);
  async function add() { setBusy(true); query.setError(null); try { await query.action("addFromCatalog", { moduleId: selected, dailyBudgetMin: budget }); router.replace("/(tabs)/courses"); } catch (e) { query.setError((e as Error).message); } finally { setBusy(false); } }
  return <Page back title="University modules" subtitle="Select modules to create courses and study plans." query={query}>
    <Field label="Search by name or module code" value={search} onChange={setSearch} /><Action secondary onPress={() => setTerm(search.trim())}>Search modules</Action>
    <Field label="Daily study budget (minutes)" value={budget} onChange={setBudget} numeric />
    {!!selected.length && <Action busy={busy} onPress={() => { void add(); }}>{`Add ${selected.length} selected module${selected.length === 1 ? "" : "s"}`}</Action>}
    {query.data?.map(m => <Pressable key={m.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected.includes(m.id) }} onPress={() => setSelected(ids => ids.includes(m.id) ? ids.filter(id => id !== m.id) : [...ids, m.id])}><Card><AppText size={17} weight="700">{selected.includes(m.id) ? "✓ " : "○ "}{m.name}</AppText><AppText size={13} muted>{m.code} · {m.ects} ECTS · {m.section}</AppText><AppText size={13} muted>{m.content.slice(0, 260)}{m.content.length > 260 ? "…" : ""}</AppText></Card></Pressable>)}
    {!query.loading && !query.data?.length && <AppText muted>No matching modules found.</AppText>}
    {!!selected.length && <Action busy={busy} onPress={() => { void add(); }}>{`Add ${selected.length} selected`}</Action>}
  </Page>;
}
