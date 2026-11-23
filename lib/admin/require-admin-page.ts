import { redirect } from "next/navigation";
import { requireAdmin, type AdminUser } from "@/app/api/admin/middleware";

/**
 * Server-side admin gate for admin pages, reusing the API guard (`requireAdmin`):
 * Supabase session verified on the server (`getUser`), then the server-side admin allowlist.
 * Anonymous → login. Authenticated non-admin → workspace home. Nothing of the page renders before this.
 */
export async function requireAdminPage(): Promise<AdminUser> {
  const auth = await requireAdmin();
  if (auth.response) redirect(auth.response.status === 401 ? "/login" : "/home");
  return auth.user;
}
