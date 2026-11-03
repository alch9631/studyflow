import { useState } from "react";
import { View } from "react-native";
import { AppText, IconButton } from "./ui";

/** Optional information uses an explicit info control, rather than a navigation arrow. */
export function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <View style={{ gap: open ? 8 : 0 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <AppText size={14} style={{ flex: 1 }}>{label}</AppText>
      <IconButton label={`${label} information`} icon="information-circle-outline" size={19} expanded={open} onPress={() => setOpen(value => !value)} />
    </View>
    {open && <View style={{ gap: 14 }}>{children}</View>}
  </View>;
}
