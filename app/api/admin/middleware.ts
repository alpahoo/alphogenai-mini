/**
 * Admin API middleware — shared auth + admin check for all /api/admin/* routes.
 *
 * Returns the authenticated admin user or a 403 response.
 * Uses service client for DB queries (bypasses RLS).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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
export async function requireAdmin(request?: NextRequest): Promise<
  { user: AdminUser; response?: never } | { user?: never; response: NextResponse }
> {
  const bearer = request?.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ") ? bearer.slice(7) : null;
  const supabase = token
    ? createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
    : await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token ?? undefined);

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
