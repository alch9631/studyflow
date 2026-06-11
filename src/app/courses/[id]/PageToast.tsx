"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";

/**
 * Fires a one-shot toast for a status message carried in the URL (e.g. after a
 * replan/optimize/analyze redirect), instead of a persistent inline banner —
 * it pops up, then auto-dismisses. Success messages fade fast; errors linger a
 * bit so they can be read. Renders nothing.
 */
export default function PageToast({
  message,
  variant,
}: {
  message: string;
  variant: "success" | "error";
}) {
  const { toast } = useToast();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !message) return;
    fired.current = true;
    toast(message, variant, { duration: variant === "error" ? 5000 : 2500 });
  }, [message, variant, toast]);

  return null;
}
