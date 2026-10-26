"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

/** Explicit Start/Resume taps resume a saved clock; a reload keeps its paused state. */
export default function FocusLink({ blockId, onNavigate, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { blockId: string }) {
  return <Link {...props} href={`/focus?blockId=${encodeURIComponent(blockId)}`} prefetch={true} onNavigate={(event) => {
    try { sessionStorage.setItem("sf-focus-start", blockId); } catch {}
    onNavigate?.(event);
  }} />;
}
