/**
 * Feature flags — env-based toggles for easy rollback.
 */

/** Show internal cost tracking (engine + estimated cost) on job pages. Admin-only. */
export const SHOW_COST_TRACKING_UI =
  process.env.NEXT_PUBLIC_SHOW_COST_TRACKING_UI === "true";

/**
 * Comma-separated list of admin emails. Read at request time.
 * Example: NEXT_PUBLIC_ADMIN_EMAILS="alice@example.com,bob@example.com"
 */
export const ADMIN_EMAILS: string[] = (
  process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? ""
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
