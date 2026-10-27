"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { focusHref } from "@/lib/focusNavigation";

/** Explicit Start/Resume taps resume a saved clock; a reload keeps its paused state. */
export default function FocusLink({ blockId, topicId, kind, onNavigate, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { blockId: string; topicId?: string; kind?: string }) {
  return <Link {...props} href={focusHref(blockId, topicId, kind)} prefetch={true} onNavigate={(event) => {
    try { sessionStorage.setItem("sf-focus-start", blockId); } catch {}
    onNavigate?.(event);
  }} />;
}
