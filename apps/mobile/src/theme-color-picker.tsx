import { useEffect, useState } from "react";
import { TextInput } from "react-native";
import { useTheme } from "./theme";
import { normalizeAccent } from "./theme-colors";

export default function ThemeColorPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const theme = useTheme();
  const [value, setValue] = useState(color);
  useEffect(() => setValue(color), [color]);
  return <TextInput accessibilityLabel="App theme color, hexadecimal" autoCapitalize="characters" autoCorrect={false} maxLength={7} value={value}
    onChangeText={text => { setValue(text); const next = normalizeAccent(text); if (next) onChange(next); }}
    style={{ minHeight: 44, color: theme.text, borderWidth: 1, borderColor: theme.line, borderRadius: 10, paddingHorizontal: 12 }} />;
}
