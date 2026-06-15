/**
 * Unit tests for `isOverlayOpen` — the guard that stops PullToRefresh from
 * engaging (freezing the page / refreshing the page behind) while a modal
 * sheet or dialog is open.
 * Run: npx tsx src/components/lib/overlayOpen.test.ts
 * (Dependency-free, same style as the lib/* suites; uses a tiny fake Document
 * so it needs no DOM/jsdom.)
 */
import { isOverlayOpen } from "./overlayOpen";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

/**
 * Minimal stand-in for the parts of `Document` that `isOverlayOpen` touches:
 * `body.hasAttribute(...)` and `querySelector(selector)`. We model the page as
 * (a) whether <body> carries the react-remove-scroll `data-scroll-locked`
 * marker, and (b) a flat list of "elements" each with a role + open state.
 */
type FakeEl = { role: string; open: boolean };
function fakeDoc(opts: { scrollLocked?: boolean; els?: FakeEl[] } = {}): Document {
  const els = opts.els ?? [];
  return {
    body: {
      hasAttribute: (name: string) =>
        name === "data-scroll-locked" && Boolean(opts.scrollLocked),
    },
    // Honour the exact selector the guard uses: open dialog OR open alertdialog.
    querySelector: (selector: string) => {
      const wantsDialog = selector.includes('[role="dialog"]');
      const wantsAlert = selector.includes('[role="alertdialog"]');
      const match = els.find(
        (el) =>
          el.open &&
          ((wantsDialog && el.role === "dialog") ||
            (wantsAlert && el.role === "alertdialog")),
      );
      return match ? ({} as Element) : null;
    },
  } as unknown as Document;
}

// ---- nothing open ----------------------------------------------------------
check("clean page → no overlay", isOverlayOpen(fakeDoc()) === false);
check(
  "a closed dialog in the DOM → no overlay",
  isOverlayOpen(fakeDoc({ els: [{ role: "dialog", open: false }] })) === false,
);

// ---- body scroll-lock marker (the primary, modal signal) -------------------
check(
  "body[data-scroll-locked] → overlay open",
  isOverlayOpen(fakeDoc({ scrollLocked: true })) === true,
);
check(
  "scroll-locked wins even with no dialog element present",
  isOverlayOpen(fakeDoc({ scrollLocked: true, els: [] })) === true,
);

// ---- open Radix dialog / alertdialog (covers non-modal dialogs) ------------
check(
  "open role=dialog → overlay open",
  isOverlayOpen(fakeDoc({ els: [{ role: "dialog", open: true }] })) === true,
);
check(
  "open role=alertdialog → overlay open",
  isOverlayOpen(fakeDoc({ els: [{ role: "alertdialog", open: true }] })) === true,
);
check(
  "an open non-dialog element → not an overlay",
  isOverlayOpen(fakeDoc({ els: [{ role: "navigation", open: true }] })) === false,
);

// ---- both signals together (the real sheet→delete→confirm case) ------------
check(
  "scroll-locked sheet + open confirm dialog → overlay open",
  isOverlayOpen(
    fakeDoc({ scrollLocked: true, els: [{ role: "dialog", open: true }] }),
  ) === true,
);

// ---- defaulting: still safe when body is absent ----------------------------
check(
  "missing body, open dialog → still detected via querySelector",
  isOverlayOpen({
    body: null,
    querySelector: () => ({}) as Element,
  } as unknown as Document) === true,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
