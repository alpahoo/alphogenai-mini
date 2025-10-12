import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminDashboardClient from "./ui/AdminDashboardClient";

export default async function AdminDashboardPage() {
  const supabase = await createServerSupabase();
  const { data: claims } = await supabase.auth.getClaims();
  const role = (claims?.claims as any)?.app_metadata?.role;
  if (role !== "admin") redirect("/");

  // Server-side fetch of scheduled posts for faster first paint
  const supa = await createServerSupabase();
  const { data: scheduled } = await supa
    .from("scheduled_posts")
    .select("*, projects(title, final_video_path)")
    .order("created_at", { ascending: false });

  return <AdminDashboardClient initialData={scheduled || []} />;
}
