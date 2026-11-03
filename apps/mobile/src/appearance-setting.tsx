import { useState } from "react";
import { View } from "react-native";
import { AppText, ErrorMessage, useTheme } from "./ui";
import { useAppearance } from "./theme";
import AppearanceControl from "./appearance-control";
import ThemeColorPicker from "./theme-color-picker";
import { LinkButton } from "./workspace";

export default function AppearanceSetting() {
  const { mode, accent, setMode, setAccent } = useAppearance();
  const theme = useTheme();
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
    <ThemeColorPicker color={theme.accent} onChange={color => {
      setError(null);
      void setAccent(color).catch(() => setError("Color updated, but couldn't be saved. Choose it again to retry."));
    }} />
    <AppText size={13} muted>Updates immediately across the app. Saved on this device.</AppText>
    {accent && <LinkButton label="Reset theme color" onPress={() => {
      setError(null);
      void setAccent(null).catch(() => setError("Couldn't save the default color. Try again."));
    }} />}
    <ErrorMessage message={error} />
  </View>;
}
