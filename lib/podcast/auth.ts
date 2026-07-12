/**
 * Bearer-token auth for the podcast API routes.
 *
 * Resolves the Supabase user from the Authorization header (same pattern as
 * /api/research/jobs). Isolated in its own module so route tests can mock it
 * without mocking the Supabase SDK. The user id ALWAYS comes from the verified
 * token — never from the request body.
 */
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export interface AuthedUser {
  id: string;
  email?: string | null;
}

export async function getUserFromRequest(request: NextRequest): Promise<AuthedUser | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) return null;
  return { id: user.id, email: user.email ?? null };
}
