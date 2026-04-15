/**
 * Admin API middleware — shared auth + admin check for all /api/admin/* routes.
 *
 * Returns the authenticated admin user or a 403 response.
 * Uses service client for DB queries (bypasses RLS).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/flags";

export interface AdminUser {
  id: string;
  email: string;
}

/**
 * Verify the caller is an authenticated admin.
 * Returns { user } on success or { response } with 401/403 on failure.
 */
export async function requireAdmin(): Promise<
  { user: AdminUser; response?: never } | { user?: never; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return {
      response: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    };
  }

  if (!isAdminEmail(user.email)) {
    return {
      response: NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      ),
    };
  }

  return { user: { id: user.id, email: user.email } };
}
