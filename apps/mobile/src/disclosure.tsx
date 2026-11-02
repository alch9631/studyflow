import { useState } from "react";
import { Collapsible, Host, RNHostView } from "@expo/ui";
import { View } from "react-native";
import { useTheme } from "./ui";

export function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  return <Host matchContents={{ vertical: true }} seedColor={theme.brand}>
    <Collapsible label={label} isOpen={open} onOpenChange={setOpen} labelStyle={{ color: theme.text, fontSize: 16, lineHeight: 44 }}>
      <RNHostView matchContents={{ vertical: true }}><View style={{ gap: 14, paddingTop: 8 }}>{children}</View></RNHostView>
    </Collapsible>
  </Host>;
}
