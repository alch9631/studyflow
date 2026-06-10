import { isPushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * Report whether web push is enabled on this deploy. Lets the client decide
 * whether to offer "enable reminders" instead of guessing — when VAPID keys are
 * unset this returns `{ configured: false }` and the feature is a clean no-op.
 * Read-only and unauthenticated: it leaks no user data, only a feature flag.
 */
export function GET() {
  return Response.json({ configured: isPushConfigured() });
}
