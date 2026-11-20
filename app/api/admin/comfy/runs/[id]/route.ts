import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { dispatchRun, privateHeaders } from "@/lib/comfy/admin";
import { TEMPLATES, slugForTemplateVersion } from "@/lib/comfy/templates";
import { deliveredRunIds, publicRun } from "@/lib/comfy/run-state";

export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
  const auth=await requireAdmin(); if(auth.response)return auth.response;
  const {id}=await params;
  const db=createServiceClient();
  const {error:expiryError}=await db.rpc("expire_comfy_admin_run",{p_run:id,p_user:auth.user.id});
  if(expiryError)return NextResponse.json({error:"Run status unavailable"},{status:503});
  const {data:run,error}=await db.from("comfy_runs").select("id,job_id,status,error_code,generation_seconds,params_effective,created_at,finished_at,finance_status,template_version,runtime,modal_call_id")
    .eq("id",id).eq("user_id",auth.user.id).single();
  if(error || !run)return NextResponse.json({error:"Run not found"},{status:404});
  const {data:assets,error:assetError}=await db.from("comfy_assets").select("id,role,mime").eq("run_id",id).is("withdrawn_at",null);
  if(assetError)return NextResponse.json({error:"Outputs unavailable"},{status:503});
  const delivered=await deliveredRunIds(db,[id]);
  return NextResponse.json({run:publicRun(run,delivered),assets:run.status==="done"?assets:[]},{headers:privateHeaders});
}
// Explicit retry of delivery only. The SQL claim prevents a second GPU execution, and no reservation is taken here.
export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}) {
  const auth=await requireAdmin(); if(auth.response)return auth.response;
  const {id}=await params;
  const db=createServiceClient();
  // A run past its deadline is expired first: it must never be dispatched again.
  await db.rpc("expire_comfy_admin_run",{p_run:id,p_user:auth.user.id});
  const {data:run}=await db.from("comfy_runs").select("id,status,template_version,runtime").eq("id",id).eq("user_id",auth.user.id).single();
  if(!run || run.status!=="queued")return NextResponse.json({error:"Run is not queued"},{status:409});
  // The switch of the run's own model: a MOSS retry must not depend on the H3 switch, nor the reverse.
  const entry=TEMPLATES[slugForTemplateVersion(run.template_version)];
  if(process.env[entry.enabledEnv]!=="true")return NextResponse.json({error:entry.runtime==="h3-video@1"?"H3 pilot is disabled":"This runtime is disabled"},{status:503});
  try{await dispatchRun(id);return NextResponse.json({dispatched:true});}
  catch{return NextResponse.json({error:"Dispatch unavailable; reservation preserved"},{status:503});}
}
