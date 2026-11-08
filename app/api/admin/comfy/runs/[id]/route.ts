import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { dispatchRun, privateHeaders } from "@/lib/comfy/admin";

export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
  const auth=await requireAdmin(); if(auth.response)return auth.response;
  const {id}=await params;
  const db=createServiceClient();
  const {error:expiryError}=await db.rpc("expire_comfy_admin_run",{p_run:id,p_user:auth.user.id});
  if(expiryError)return NextResponse.json({error:"Run status unavailable"},{status:503});
  const {data:run,error}=await db.from("comfy_runs").select("id,job_id,status,error_code,generation_seconds,params_effective,created_at,finance_status")
    .eq("id",id).eq("user_id",auth.user.id).single();
  if(error || !run)return NextResponse.json({error:"Run not found"},{status:404});
  const {data:assets,error:assetError}=await db.from("comfy_assets").select("id,role,mime").eq("run_id",id).is("withdrawn_at",null);
  if(assetError)return NextResponse.json({error:"Outputs unavailable"},{status:503});
  return NextResponse.json({run,assets:run.status==="done"?assets:[]},{headers:privateHeaders});
}
// Explicit retry of delivery only. The SQL claim prevents a second GPU execution.
export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}) {
  const auth=await requireAdmin(); if(auth.response)return auth.response;
  const {id}=await params;
  const {data:run}=await createServiceClient().from("comfy_runs").select("id,status").eq("id",id).eq("user_id",auth.user.id).single();
  if(!run || run.status!=="queued")return NextResponse.json({error:"Run is not queued"},{status:409});
  if(process.env.COMFY_ADMIN_ENABLED!=="true")return NextResponse.json({error:"H3 pilot is disabled"},{status:503});
  try{await dispatchRun(id);return NextResponse.json({dispatched:true});}
  catch{return NextResponse.json({error:"Dispatch unavailable; reservation preserved"},{status:503});}
}
