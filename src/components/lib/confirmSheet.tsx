"use client";

import * as React from "react";

/**
 * Coordination between a scroll-locking sheet (e.g. the course options sheet)
 * and a destructive {@link ConfirmDialog} rendered inside it.
 *
 * The problem this solves: two stacked scroll-locking Radix dialogs (the sheet +
 * a nested confirm) can leave the page frozen with a leaked body scroll-lock /
 * `pointer-events:none`. The fix is to keep only ONE modal at a time — when the
 * confirm opens, the host sheet closes itself, so the confirm is the single
 * top-level modal.
 *
 * A sheet provides this context; a `nested` ConfirmDialog inside it consumes it
 * via {@link useSheetConfirm}. With no provider (a confirm used standalone on a
 * page) every call is a no-op, so the component is unchanged outside a sheet.
 */
export type SheetConfirmCtx = {
  /** Close the host sheet so the confirm is the only modal. */
  closeSheet: () => void;
  /** The confirm reports its modal open/closed so the sheet can keep its
   *  subtree mounted until the confirm is fully done. */
  setConfirmOpen: (open: boolean) => void;
};

export const SheetConfirmContext = React.createContext<SheetConfirmCtx | null>(null);

/**
 * For a `nested` ConfirmDialog: returns a stable `onConfirmOpenChange(open)` to
 * pass to the confirm's `onOpenChange`. Opening it closes the host sheet (so the
 * confirm becomes the single modal); both open and close are reported up so the
 * sheet can unmount its subtree once the confirm is gone. No-op outside a sheet.
 */
export function useSheetConfirm() {
  const ctx = React.useContext(SheetConfirmContext);
  return React.useCallback(
    (open: boolean) => {
      if (!ctx) return;
      ctx.setConfirmOpen(open);
      if (open) ctx.closeSheet();
    },
    [ctx],
  );
}
