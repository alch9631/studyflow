"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";

/**
 * Fires a single toast on mount for a status message that would otherwise sit in
 * a persistent box — it pops up, then auto-dismisses. Renders nothing.
 */
export default function InfoToast({
  message,
  variant = "success",
  duration = 2500,
}: {
  message: string;
  variant?: "success" | "error";
  duration?: number;
}) {
  const { toast } = useToast();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !message) return;
    fired.current = true;
    toast(message, variant, { duration });
  }, [message, variant, duration, toast]);

  return null;
}
