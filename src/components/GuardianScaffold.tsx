import * as React from "react";

import { cn } from "@/components/lib/utils";

/**
 * GuardianScaffold — the signature "core trio" layout of the redesign.
 *
 * Every guardian screen wants to answer three questions, top to bottom, with
 * calm vertical breathing room between them:
 *
 *   1. status   — the emotional read. How are things? ("You're on track",
 *                 "One thing needs you today"). Quiet by default; reaches for
 *                 the amber `tone="attention"` only when an action is needed.
 *   2. action   — the ONE primary thing to do here (a single button, a focused
 *                 card). Passed as `action` or simply as `children`.
 *   3. escape   — the calm exit hatch: "not now", "see everything", "skip".
 *                 Always optional, always low-emphasis, so the screen never
 *                 traps the user in its primary action.
 *
 * This is a pure presentational layout (no client hooks), so it's safe to use
 * from server components. It owns spacing + the optional attention framing only;
 * the content of each slot stays the caller's. Screens adopt it incrementally —
 * it exists now so the pattern is shared, not to force every screen onto it yet.
 *
 *   <GuardianScaffold
 *     status={<p className="text-lg">You're on track for Friday.</p>}
 *     escape={<Button variant="ghost">See everything</Button>}
 *   >
 *     <Button size="lg">Start today's session</Button>
 *   </GuardianScaffold>
 */

export type GuardianTone = "calm" | "attention";

export interface GuardianScaffoldProps
  extends Omit<React.ComponentProps<"section">, "children"> {
  /** Top slot — the emotional status / how-are-things read. */
  status?: React.ReactNode;
  /** Tone of the status block. `attention` switches to the muted-amber framing
   *  reserved for "an action is needed"; default `calm` stays quiet. */
  tone?: GuardianTone;
  /** Middle slot — the one primary action. Alias for `children`; if both are
   *  given, `action` renders first. */
  action?: React.ReactNode;
  /** Bottom slot — the low-emphasis escape hatch ("not now", "see everything"). */
  escape?: React.ReactNode;
  /** Center the trio horizontally (good for empty/focus screens). Default true. */
  centered?: boolean;
  children?: React.ReactNode;
}

function GuardianScaffold({
  status,
  tone = "calm",
  action,
  escape,
  centered = true,
  className,
  children,
  ...props
}: GuardianScaffoldProps) {
  return (
    <section
      data-slot="guardian-scaffold"
      className={cn(
        "flex w-full flex-col gap-8 py-2",
        centered && "items-center text-center",
        className,
      )}
      {...props}
    >
      {status != null && (
        <div
          data-slot="guardian-status"
          className={cn(
            "w-full max-w-md text-balance",
            tone === "attention" &&
              "rounded-xl bg-warning px-4 py-3 text-warning-foreground",
          )}
        >
          {status}
        </div>
      )}

      {(action != null || children != null) && (
        <div
          data-slot="guardian-action"
          className={cn(
            "flex w-full max-w-md flex-col gap-3",
            centered && "items-center",
          )}
        >
          {action}
          {children}
        </div>
      )}

      {escape != null && (
        <div
          data-slot="guardian-escape"
          className="w-full max-w-md text-sm text-muted-foreground"
        >
          {escape}
        </div>
      )}
    </section>
  );
}

export { GuardianScaffold };
