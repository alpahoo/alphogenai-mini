import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (userError) {
      console.error("Error listing users:", userError);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }

    const user = userData.users.find(u => u.email === email);
    
    if (!user) {
      return NextResponse.json({ error: `User ${email} not found` }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: {
          ...user.user_metadata,
          role: 'admin'
        }
      }
    );

    if (error) {
      console.error("Error updating user:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`✅ Successfully added admin role to ${email}`);
    return NextResponse.json({ 
      message: `Admin role added to ${email}`,
      user: data.user 
    });
  } catch (e: unknown) {
    console.error("Set admin role error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
