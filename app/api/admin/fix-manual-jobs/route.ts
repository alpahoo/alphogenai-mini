import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function getSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_SUPABASE_URL;
  
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }
  
  return createServiceClient(supabaseUrl, supabaseKey);
}

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
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const supabase = getSupabaseServiceClient();
    
    const { data: jobsToFix, error: selectError } = await supabase
      .from('jobs')
      .select('id, prompt, created_at, status, app_state')
      .eq('status', 'completed')
      .not('app_state->runway_tasks', 'is', null);
    
    if (selectError) {
      console.error('Failed to fetch jobs to fix:', selectError);
      return NextResponse.json(
        { error: selectError.message },
        { status: 500 }
      );
    }

    if (!jobsToFix || jobsToFix.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No jobs need fixing",
        fixed: 0,
        jobs: []
      });
    }

    const jobIds = jobsToFix.map(j => j.id);
    
    const { data: updatedJobs, error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'done' })
      .in('id', jobIds)
      .select();

    if (updateError) {
      console.error('Failed to update jobs:', updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully fixed ${updatedJobs?.length || 0} jobs`,
      fixed: updatedJobs?.length || 0,
      jobs: jobsToFix.map(j => ({
        id: j.id,
        prompt: j.prompt?.substring(0, 80),
        created_at: j.created_at,
        had_runway_tasks: !!j.app_state?.runway_tasks,
        runway_tasks_count: j.app_state?.runway_tasks ? Object.keys(j.app_state.runway_tasks).length : 0
      }))
    });
  } catch (error: any) {
    console.error('Error in fix-manual-jobs:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
