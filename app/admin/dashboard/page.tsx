import { createClient as createServerSupabase } from "@/lib/supabase/server";
import AdminDashboardClient from "./ui/AdminDashboardClient";

export default async function AdminDashboardPage() {
  const supabase = await createServerSupabase();
  const { data: claims } = await supabase.auth.getClaims();
  const role = (claims?.claims as any)?.app_metadata?.role;
  const isAdmin = role === "admin";

  if (!isAdmin) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold">Accès refusé</h1>
        <p>Cette page est réservée aux administrateurs.</p>
      </main>
    );
  }

  // Server-side fetch of scheduled posts for faster first paint
  const supa = await createServerSupabase();
  const { data: scheduled } = await supa
    .from("scheduled_posts")
    .select("*, projects(title)")
    .order("created_at", { ascending: false });

  return <AdminDashboardClient initialData={scheduled || []} />;
}
