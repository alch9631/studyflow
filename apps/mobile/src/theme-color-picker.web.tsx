export default function ThemeColorPicker({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  return <input type="color" aria-label="App theme color" value={color} onChange={event => onChange(event.currentTarget.value)}
    style={{ minWidth: 64, minHeight: 44, border: 0, padding: 0, background: "transparent", cursor: "pointer" }} />;
}
