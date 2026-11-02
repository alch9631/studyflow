import { useState } from "react";
import { View } from "react-native";
import { AppText, ErrorMessage } from "./ui";
import { useAppearance } from "./theme";
import AppearanceControl from "./appearance-control";

export default function AppearanceSetting() {
  const { mode, setMode } = useAppearance();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
      <AppText weight="600" style={{ flexGrow: 1 }}>Appearance</AppText>
      <AppearanceControl mode={mode} disabled={saving} onChange={value => {
          setSaving(true); setError(null);
          void setMode(value).catch(() => setError("Couldn't save appearance. Please try again.")).finally(() => setSaving(false));
      }} />
    </View>
    <ErrorMessage message={error} />
  </View>;
}
