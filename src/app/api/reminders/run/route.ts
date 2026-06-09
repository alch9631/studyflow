import { handleApiError, unauthorized } from "@/lib/apiError";
import { todayISO } from "@/lib/planService";
import {
  getCronSecret,
  isAuthorizedCron,
  runDailyReminders,
} from "@/lib/reminders";

export const dynamic = "force-dynamic";

/**
 * Daily study-reminder trigger. A scheduler (cron) POSTs here once a day with
 * `Authorization: Bearer $CRON_SECRET`; for every user with a live push
 * subscription we send a notification summarizing today's plan.
 *
 * Gating:
 *  - CRON_SECRET unset  -> the trigger is disabled: respond 200 `{ disabled: true }`
 *    and do nothing (clean no-op, mirrors the push status endpoint's style).
 *  - CRON_SECRET set    -> require a matching bearer token, else 401. No token is
 *    ever echoed back.
 *
 * Idempotent and safe to call repeatedly — it only reads the plan and emits
 * notifications; no plan/course/block state is mutated. Actual delivery is still
 * gated by the VAPID keys inside `sendPush` (reported as `configured`).
 */
export async function POST(req: Request) {
  try {
    const secret = getCronSecret();
    if (!secret) {
      return Response.json({ ok: true, disabled: true });
    }
    if (!isAuthorizedCron(req.headers.get("authorization"), secret)) {
      return unauthorized("Invalid or missing cron credentials.");
    }
    const result = await runDailyReminders(todayISO());
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return handleApiError(err);
  }
}
