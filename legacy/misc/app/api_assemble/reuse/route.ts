import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const authClient = await createClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const isAdmin = user.user_metadata?.role === 'admin';
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Admin access required to assemble videos" },
        { status: 403 }
      );
    }

    const body = await req.json();
    
    const workerUrl = process.env.RENDER_WORKER_URL || 'http://localhost:8000';
    const secret = process.env.ASSEMBLER_SHARED_SECRET;
    
    if (!secret) {
      return NextResponse.json(
        { error: "Server configuration error: missing ASSEMBLER_SHARED_SECRET" },
        { status: 500 }
      );
    }

    const response = await fetch(`${workerUrl}/assemble/reuse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Assembler-Secret': secret,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: errorText || 'Assembly failed' },
        { status: response.status }
      );
    }

    const blob = await response.blob();
    
    return new Response(blob, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': response.headers.get('Content-Disposition') || 
          `attachment; filename="${body.job_id}_assembled.mp4"`,
      },
    });
  } catch (error: any) {
    console.error('Error in assemble/reuse proxy:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
