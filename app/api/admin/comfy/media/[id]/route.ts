import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { privateHeaders } from "@/lib/comfy/admin";

export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
  const auth=await requireAdmin(); if(auth.response)return auth.response;
  const {id}=await params; const db=createServiceClient();
  const {data:asset}=await db.from("comfy_assets").select("storage_key,run_id,role").eq("id",id)
    .eq("owner_id",auth.user.id).is("withdrawn_at",null).single();
  if(!asset)return NextResponse.json({error:"Asset not found"},{status:404});
  const {data:run}=await db.from("comfy_runs").select("status").eq("id",asset.run_id).eq("user_id",auth.user.id).single();
  if(run?.status!=="done")return NextResponse.json({error:"Asset unavailable"},{status:404});
  const {data,error}=await db.storage.from("comfy-outputs").createSignedUrl(asset.storage_key,600);
  if(error || !data)return NextResponse.json({error:"Media unavailable"},{status:503});
  return NextResponse.json({url:data.signedUrl,expires_in:600},{headers:privateHeaders});
}
