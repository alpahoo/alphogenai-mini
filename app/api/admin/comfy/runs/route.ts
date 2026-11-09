import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { screenPrompt } from "@/lib/content-policy";
import { InputError } from "@/lib/comfy/template";
import { TEMPLATES, templateFor } from "@/lib/comfy/templates";
import { dispatchRun, pilotState, privateHeaders, runtimeGateState } from "@/lib/comfy/admin";

export async function GET(req:Request) {
  const auth=await requireAdmin(); if(auth.response)return auth.response;
  const slug=templateFor(new URL(req.url).searchParams.get("template") ?? undefined);
  if(!slug)return NextResponse.json({ready:false,reason:"Unknown template"},{status:400,headers:privateHeaders});
  const entry=TEMPLATES[slug];
  try {
    const state=entry.admission==="h3_pilot" ? await pilotState(auth.user.id) : await runtimeGateState(auth.user.id,entry.runtime,entry.enabledEnv);
    return NextResponse.json({...state,template:slug},{headers:privateHeaders});
  }
  catch {return NextResponse.json({ready:false,reason:"Runtime is not configured",template:slug},{headers:privateHeaders});}
}
export async function POST(req:Request) {
  const auth=await requireAdmin(); if(auth.response)return auth.response;
  try {
    if(Number(req.headers.get("content-length")??0)>16_384)throw new InputError("Request too large");
    const text=await req.text(); if(text.length>16_384)throw new InputError("Request too large");
    const body=JSON.parse(text);
    if(!body || Object.keys(body).some(k=>!["params","idempotency_key","template"].includes(k)) ||
      typeof body.idempotency_key!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.idempotency_key))throw new InputError("Invalid request key");
    const slug=templateFor(body.template);
    if(!slug)throw new InputError("Unknown template");
    const entry=TEMPLATES[slug];
    if(process.env[entry.enabledEnv]!=="true" || !process.env.COMFY_DISPATCH_URL || !process.env.COMFY_DISPATCH_SECRET)
      return NextResponse.json({error:slug==="minimax-h3"?"H3 pilot is disabled":"This runtime is disabled"},{status:503});
    const resolved=entry.resolve(body.params,auth.user.id);
    const policy=screenPrompt(String(resolved.params.prompt));
    if(policy.blocked)return NextResponse.json({error:"Prompt does not meet the current content policy"},{status:400});
    const db=createServiceClient();
    const {data:runId,error}=entry.admission==="h3_pilot"
      ? await db.rpc("admit_comfy_admin_run",{p_user:auth.user.id,p_key:body.idempotency_key,
          p_prompt:resolved.params.prompt,p_params:resolved.params,p_graph:resolved.graph,p_hash:resolved.hash,p_reference:resolved.referencePath})
      : await db.rpc("admit_comfy_runtime_run",{p_runtime:entry.runtime,p_template:resolved.template,p_user:auth.user.id,p_key:body.idempotency_key,
          p_prompt:resolved.params.prompt,p_params:resolved.params,p_graph:resolved.graph,p_hash:resolved.hash});
    if(error || !runId)return NextResponse.json({error:"Admission refused: authorization, budget, quota or active job"},{status:409});
    // A durable outbox keeps the run recoverable without admitting another GPU execution.
    let dispatched=true;
    try {await dispatchRun(runId);}catch{dispatched=false;}
    return NextResponse.json({run_id:runId,dispatched},{status:202,headers:privateHeaders});
  }catch(error){return NextResponse.json({error:error instanceof InputError?error.message:"Invalid request"},{status:400});}
}
