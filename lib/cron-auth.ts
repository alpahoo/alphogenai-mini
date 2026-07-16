/**
 * Shared cron authorization — FAIL-CLOSED.
 *
 * Both /api/cron/evolink-poll and /api/cron/jogg-poll use this. It must be
 * called BEFORE creating any service-role client or touching the DB.
 *
 * Policy:
 *   - CRON_SECRET missing  → refuse (401). Never run open.
 *   - Authorization header != `Bearer <CRON_SECRET>` → refuse (401).
 *   - Otherwise → authorized (returns null).
 *
 * GitHub Actions (evolink-cron.yml) sends `Authorization: Bearer $CRON_SECRET`.
 */
import { NextResponse } from "next/server";

/**
 * Returns a 401 NextResponse when the request is not an authorized cron call,
 * or null when it is. Fail-closed: a missing CRON_SECRET denies all requests.
 */
export function assertCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 401 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
