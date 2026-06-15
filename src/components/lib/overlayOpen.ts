/**
 * Is any modal overlay (Radix Dialog / sheet / confirm) currently open?
 *
 * Used by {@link PullToRefresh} to decide whether to stay out of the way.
 * Pull-to-refresh must NEVER engage while a modal is open, for two reasons:
 *  1. An open modal scroll-locks the body (react-remove-scroll), so
 *     `window.scrollY` stays pinned at 0 — which would otherwise make PTR think
 *     it's "at the top" and let it hijack a downward drag *inside* the sheet,
 *     calling `preventDefault()` (the page feels frozen) and, on release,
 *     `router.refresh()` on the page *behind* the modal.
 *  2. The sheet has its own scroll; PTR has no business there.
 *
 * Detection is Radix-version-safe and uses two independent signals (either is
 * enough):
 *  - `body[data-scroll-locked]`: the marker react-remove-scroll-bar sets on
 *    <body> for every active scroll lock (ref-counted; present iff ≥1 modal is
 *    open). This is what Radix's modal Dialog uses under the hood, so it fires
 *    for the options sheet even before any nested confirm opens.
 *  - an open Radix dialog/alertdialog in the DOM (`[data-state="open"]` with the
 *    dialog role) — a belt-and-braces signal that also covers a *non-modal*
 *    dialog which wouldn't scroll-lock the body.
 *
 * Pure and DOM-light (only `body.hasAttribute` + `querySelector`) so it's
 * unit-testable against a tiny fake `Document`.
 */
export function isOverlayOpen(doc: Document = document): boolean {
  if (doc.body?.hasAttribute("data-scroll-locked")) return true;
  return Boolean(
    doc.querySelector(
      '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]',
    ),
  );
}
