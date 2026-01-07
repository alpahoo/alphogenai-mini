import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UploadsClient from "./UploadsClient";

export const dynamic = "force-dynamic";

export default async function UploadsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return <UploadsClient />;
}

