import { ColorPicker, Host } from "@expo/ui/swift-ui";
import { frame } from "@expo/ui/swift-ui/modifiers";
import { useTheme } from "./theme";

export default function ThemeColorPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const theme = useTheme();
  return <Host matchContents={{ vertical: true }} colorScheme={theme.dark ? "dark" : "light"} seedColor={theme.brand}>
    <ColorPicker label="App theme color" selection={color} supportsOpacity={false} onSelectionChange={onChange} modifiers={[frame({ minHeight: 44 })]} />
  </Host>;
}
