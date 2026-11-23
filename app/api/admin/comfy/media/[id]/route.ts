import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/middleware";
import { createServiceClient } from "@/lib/supabase/service";
import { privateHeaders } from "@/lib/comfy/admin";

const EXT: Record<string, string> = { "video/mp4": "mp4", "image/png": "png" };
const CONVERT = { jpeg: { mime: "image/jpeg", ext: "jpg" }, webp: { mime: "image/webp", ext: "webp" } } as const;
const MAX_CONVERT_BYTES = 40 * 1024 * 1024;
// Pixel cap for decoding (MOSS renders about 1 MP); sharp refuses larger inputs before allocating them.
const MAX_CONVERT_PIXELS = 16 * 1024 * 1024;

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}) {
  const auth=await requireAdmin(); if(auth.response)return auth.response;
  const {id}=await params; const db=createServiceClient();
  const {data:asset}=await db.from("comfy_assets").select("storage_key,run_id,role,mime").eq("id",id)
    .eq("owner_id",auth.user.id).is("withdrawn_at",null).single();
  if(!asset)return NextResponse.json({error:"Asset not found"},{status:404});
  const {data:run}=await db.from("comfy_runs").select("status").eq("id",asset.run_id).eq("user_id",auth.user.id).single();
  if(run?.status!=="done")return NextResponse.json({error:"Asset unavailable"},{status:404});
  const query=new URL(req.url).searchParams;
  const mime=String(asset.mime ?? "video/mp4");
  // File names are built server-side, never from the client.
  const stem=`alphogen-${String(asset.run_id).slice(0,8)}-${asset.role==="final"?"corrected":"original"}`;

  // Image format conversion (admin download only). The stored original is never modified.
  const format=query.get("format");
  if(format){
    if(!(format in CONVERT) || mime!=="image/png")return NextResponse.json({error:"Unsupported format"},{status:400});
    const target=CONVERT[format as keyof typeof CONVERT];
    const {data:blob,error}=await db.storage.from("comfy-outputs").download(asset.storage_key);
    if(error || !blob || blob.size>MAX_CONVERT_BYTES)return NextResponse.json({error:"Media unavailable"},{status:503});
    const input=Buffer.from(await blob.arrayBuffer());
    let out:Buffer;
    try{
      const sharp=(await import("sharp")).default;
      // failOn "warning": a truncated or corrupted original fails instead of yielding a partial image.
      const image=sharp(input,{failOn:"warning",limitInputPixels:MAX_CONVERT_PIXELS});
      out=format==="jpeg" ? await image.jpeg({quality:92,mozjpeg:true}).toBuffer() : await image.webp({quality:92}).toBuffer();
      if(out.length===0)throw new Error("empty conversion");
    }catch{
      // Decoder details stay server-side; the stored original is untouched (read-only download).
      console.warn(JSON.stringify({event:"comfy_media_convert_failed",asset:id,format}));
      return NextResponse.json({error:"Image could not be converted"},{status:422,headers:privateHeaders});
    }
    return new NextResponse(new Uint8Array(out),{headers:{...privateHeaders,"Content-Type":target.mime,
      "Content-Disposition":`attachment; filename="${stem}.${target.ext}"`,"X-Content-Type-Options":"nosniff"}});
  }

  const download=query.get("download")==="1";
  const name=`${stem}.${EXT[mime] ?? "bin"}`;
  const {data,error}=download
    ? await db.storage.from("comfy-outputs").createSignedUrl(asset.storage_key,600,{download:name})
    : await db.storage.from("comfy-outputs").createSignedUrl(asset.storage_key,600);
  if(error || !data)return NextResponse.json({error:"Media unavailable"},{status:503});
  return NextResponse.json({url:data.signedUrl,expires_in:600,mime},{headers:privateHeaders});
}
