"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { useT } from "./i18n/I18nProvider";
import type { ButtonSize, ButtonVariant } from "./ui";

/**
 * Copy-to-clipboard button with a transient "Copied ✓" state. Used to keep
 * long/sensitive strings (e.g. the calendar feed URL) out of the page — the
 * value lives in the button, not printed raw — while staying one tap away.
 *
 * Falls back silently if the Clipboard API is blocked (insecure context); the
 * caller can pair this with a visible value or an Open link in that case.
 */
export default function CopyButton({
  value,
  label,
  variant = "secondary",
  size = "sm",
  className,
  disabled,
}: {
  value: string;
  /** Idle label; defaults to the shared "Copy link" string. */
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API blocked (e.g. insecure context) — nothing to do.
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={copy}
      disabled={disabled || !value}
    >
      {copied ? t("calendarSync.copied") : label ?? t("calendarSync.copyLink")}
    </Button>
  );
}
