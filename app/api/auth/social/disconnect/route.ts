import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";

/**
 * DELETE /api/auth/social/disconnect
 * Body: { platform: "youtube" | "tiktok" | "instagram" }
 * Removes the OAuth connection for the current user + platform.
 */
export async function DELETE(req: Request) {
  try {
    const supabaseAuth = await createClient();
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const { platform } = body as { platform?: string };

    if (!platform || !["youtube", "tiktok", "instagram"].includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from("social_connections")
      .delete()
      .eq("user_id", user.id)
      .eq("platform", platform);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, platform });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
