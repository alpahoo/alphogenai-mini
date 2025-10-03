import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import UploadsClient from "./UploadsClient";

export const dynamic = "force-dynamic";

export default async function UploadsPage() {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: files } = await supabase.storage
    .from("user_uploads")
    .list(user.id, { limit: 100, sortBy: { column: "created_at", order: "desc" } });

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-8 items-center">
        <div className="flex-1 flex flex-col gap-6 max-w-5xl p-5">
          <h1 className="text-xl font-semibold">Uploads</h1>
          <UploadsClient initialFiles={files || []} />
        </div>
      </div>
    </main>
  );
}

