import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { screenPrompt } from "@/lib/content-policy";
import { InputError, resolveTemplate } from "@/lib/comfy/template";
import { dispatchRun, pilotState, privateHeaders } from "@/lib/comfy/admin";

export async function GET() {
  const auth=await requireAdmin(); if(auth.response)return auth.response;
  try {return NextResponse.json(await pilotState(auth.user.id),{headers:privateHeaders});}
  catch {return NextResponse.json({ready:false,reason:"H3 is not configured"},{headers:privateHeaders});}
}
export async function POST(req:Request) {
  const auth=await requireAdmin(); if(auth.response)return auth.response;
  if(process.env.COMFY_ADMIN_ENABLED!=="true" || !process.env.COMFY_DISPATCH_URL || !process.env.COMFY_DISPATCH_SECRET)
    return NextResponse.json({error:"H3 pilot is disabled"},{status:503});
  try {
    if(Number(req.headers.get("content-length")??0)>16_384)throw new InputError("Request too large");
    const text=await req.text(); if(text.length>16_384)throw new InputError("Request too large");
    const body=JSON.parse(text);
    if(!body || Object.keys(body).some(k=>!["params","idempotency_key"].includes(k)) ||
      typeof body.idempotency_key!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.idempotency_key))throw new InputError("Invalid request key");
    const resolved=resolveTemplate(body.params,auth.user.id);
    const policy=screenPrompt(String(resolved.params.prompt));
    if(policy.blocked)return NextResponse.json({error:"Prompt does not meet the current content policy"},{status:400});
    const db=createServiceClient();
    const {data:runId,error}=await db.rpc("admit_comfy_admin_run",{p_user:auth.user.id,p_key:body.idempotency_key,
      p_prompt:resolved.params.prompt,p_params:resolved.params,p_graph:resolved.graph,p_hash:resolved.hash,p_reference:resolved.referencePath});
    if(error || !runId)return NextResponse.json({error:"H3 admission refused: authorization, budget, quota or active job"},{status:409});
    // A durable outbox keeps the run recoverable without admitting another GPU execution.
    let dispatched=true;
    try {await dispatchRun(runId);}catch{dispatched=false;}
    return NextResponse.json({run_id:runId,dispatched},{status:202,headers:privateHeaders});
  }catch(error){return NextResponse.json({error:error instanceof InputError?error.message:"Invalid H3 request"},{status:400});}
}
