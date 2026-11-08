"use client";
import { useEffect, useRef, useState } from "react";
import manifest from "@/workflows/comfy/templates/minimax-h3/manifest.json";

type Asset={id:string;role:string};
type Run={id:string;job_id:string;status:string;error_code:string|null;generation_seconds:number|null};
export default function H3AdminPage(){
  const [params,setParams]=useState<Record<string,string|number>>(()=>Object.fromEntries(manifest.params.filter(p=>"default" in p).map(p=>[p.key,p.default as string|number])));
  const [ready,setReady]=useState(false),[reason,setReason]=useState("Checking activation…");
  const [run,setRun]=useState<Run|null>(null),[assets,setAssets]=useState<Asset[]>([]),[error,setError]=useState("");
  const [busy,setBusy]=useState(false),[media,setMedia]=useState<Record<string,string>>({});
  const [reference,setReference]=useState<string|null>(null);
  const key=useRef<string|null>(null);
  useEffect(()=>{fetch("/api/admin/comfy/runs",{cache:"no-store"}).then(r=>r.json()).then(d=>{setReady(d.ready===true);setReason(d.reason??d.error);}).catch(()=>setReason("H3 activation unavailable"));},[]);
  useEffect(()=>{
    const id=new URLSearchParams(window.location.search).get("run");
    if(id)fetch(`/api/admin/comfy/runs/${encodeURIComponent(id)}`,{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setRun(d.run);setAssets(d.assets??[]);}).catch(()=>setError("This private run is unavailable"));
  },[]);
  useEffect(()=>{
    if(!run || !["queued","running"].includes(run.status))return;
    const poll=async()=>{try{const r=await fetch(`/api/admin/comfy/runs/${run.id}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error);setRun(d.run);setAssets(d.assets??[]);}catch(e){setError(e instanceof Error?e.message:"Status unavailable");}};
    const timer=setInterval(poll,3000);return()=>clearInterval(timer);
  },[run]);
  async function start(){
    setBusy(true);setError(""); key.current??=crypto.randomUUID();
    try{
      const bodyParams={...params}; if(bodyParams.seed==="")delete bodyParams.seed;
      const r=await fetch("/api/admin/comfy/runs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idempotency_key:key.current,params:{...bodyParams,...(reference?{first_frame_path:reference}:{})}})});
      const d=await r.json();if(!r.ok)throw Error(d.error);
      setRun({id:d.run_id,job_id:"",status:"queued",error_code:null,generation_seconds:null});
      window.history.replaceState(null,"",`?run=${encodeURIComponent(d.run_id)}`);
      if(!d.dispatched)setError("Run reserved. Dispatch is pending; retry dispatch without creating a new run.");
      setReady(false);
    }catch(e){setError(e instanceof Error?e.message:"Generation unavailable");}finally{setBusy(false);}
  }
  async function loadAsset(asset:Asset){
    const r=await fetch(`/api/admin/comfy/media/${asset.id}`,{cache:"no-store"});const d=await r.json();
    if(!r.ok){setError(d.error);return;}setMedia(m=>({...m,[asset.id]:d.url}));
  }
  async function upload(file:File){
    setBusy(true);setError("");
    try{const form=new FormData();form.append("file",file);const r=await fetch("/api/upload?bucket=references",{method:"POST",body:form});const d=await r.json();if(!r.ok)throw Error(d.error);setReference(d.storage_path);setParams(p=>({...p,quality:"turbo"}));}
    catch(e){setError(e instanceof Error?e.message:"Upload failed");}finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-4xl space-y-6 p-8">
    <header><p className="text-sm text-muted-foreground">Administrator · Private pilot</p><h1 className="text-3xl font-semibold">MiniMax H3</h1><p className="mt-2">Create a video with native audio. The original and audio-corrected versions are preserved privately.</p></header>
    <p className="rounded-lg border p-4 text-sm">{reason}. No public sharing. This pilot uses one explicitly authorized GPU execution.</p>
    <form onSubmit={e=>{e.preventDefault();void start();}} className="space-y-4">
      {manifest.params.map(field=><label key={field.key} className="block text-sm"><span className="mb-1 block">{field.label}</span>
        {field.widget==="text"?<textarea required minLength={3} maxLength={2000} rows={6} value={params[field.key]??""} onChange={e=>setParams(p=>({...p,[field.key]:e.target.value}))} className="w-full rounded border bg-background p-3" placeholder="Describe the scene, action, dialogue and soundscape…"/>:
          field.widget==="select"?<select value={params[field.key]??""} onChange={e=>setParams(p=>({...p,[field.key]:e.target.value}))} className="rounded border bg-background p-2">{field.options?.map(option=><option key={option} disabled={!!reference&&option==="full"}>{option}</option>)}</select>:
          <input type="number" min={field.min} max={field.max} step={field.step} value={params[field.key]??""} placeholder={field.key==="seed"?"Random":""} onChange={e=>setParams(p=>({...p,[field.key]:e.target.value===""?"":Number(e.target.value)}))} className="rounded border bg-background p-2"/>}</label>)}
      <label className="block text-sm">Optional first frame (private upload)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{if(e.target.files?.[0])void upload(e.target.files[0]);}} className="mt-2 block"/></label>
      {reference&&<button type="button" onClick={()=>setReference(null)} className="text-sm underline">Remove first frame</button>}
      <p className="text-xs text-muted-foreground">Validated model and sampler settings are locked. Audio is advanced by 0.4 seconds by default. Keep enough time for dialogue (about 2.5 words per second plus 1.5 seconds).</p>
      <button disabled={!ready||busy||!!run} className="rounded bg-primary px-5 py-3 text-primary-foreground disabled:opacity-40">{busy?"Preparing…":"Generate private video"}</button>
    </form>
    {error&&<p role="alert" className="text-red-500">{error}</p>}
    {run&&<section className="space-y-3 rounded-lg border p-4"><h2 className="font-semibold">Generation: {run.status}</h2>{run.error_code&&<p>{run.error_code}</p>}{run.generation_seconds&&<p>{run.generation_seconds} seconds of generation (not total billed time)</p>}
      {run.status==="queued"&&<button className="underline" onClick={async()=>{const r=await fetch(`/api/admin/comfy/runs/${run.id}`,{method:"POST"});setError(r.ok?"":"Dispatch still unavailable");}}>Retry dispatch</button>}
      {assets.map(asset=><div key={asset.id} className="space-y-2"><h3>{asset.role==="raw"?"Original video":"Audio-corrected video"}</h3><button className="underline" onClick={()=>void loadAsset(asset)}>Open / refresh private link</button>{media[asset.id]&&<><video controls src={media[asset.id]} className="max-h-96 w-full"/><a href={media[asset.id]} target="_blank" rel="noreferrer" className="block underline">Save video (link valid for 10 minutes)</a></>}</div>)}
    </section>}
  </main>;
}
