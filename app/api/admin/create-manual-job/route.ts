import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const isAdmin = user.user_metadata?.role === 'admin';
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { prompt, runway_tasks } = body;

    if (!prompt || !runway_tasks) {
      return NextResponse.json(
        { error: "prompt and runway_tasks are required" },
        { status: 400 }
      );
    }

    if (typeof runway_tasks !== 'object' || Object.keys(runway_tasks).length === 0) {
      return NextResponse.json(
        { error: "runway_tasks must be a non-empty object" },
        { status: 400 }
      );
    }

    const { data: job, error: insertError } = await supabase
      .from('jobs')
      .insert({
        user_id: user.id,
        prompt: prompt,
        status: 'completed',
        app_state: {
          prompt: prompt,
          runway_tasks: runway_tasks,
          manual_job: true,
          created_via: 'admin_manual_entry'
        }
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create manual job:', insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      job: job
    });
  } catch (error: any) {
    console.error('Error in create-manual-job:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
