import { createServiceClient } from "@/lib/supabase/service";
import { manifest } from "./template";

export const privateHeaders = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
export async function dispatchRun(runId: string) {
  const url = process.env.COMFY_DISPATCH_URL;
  const secret = process.env.COMFY_DISPATCH_SECRET;
  if (!url || !secret || new URL(url).protocol !== "https:") throw new Error("H3 dispatcher is not configured");
  const response = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json","x-comfy-secret":secret},
    body:JSON.stringify({run_id:runId}), signal:AbortSignal.timeout(10_000), redirect:"error" });
  if (!response.ok) throw new Error("H3 dispatch unavailable");
  const db = createServiceClient();
  const {error} = await db.from("comfy_dispatch_outbox").update({delivered_at:new Date().toISOString()}).eq("run_id",runId);
  if (error) throw new Error("Dispatch acknowledgement unavailable");
}
export async function pilotState(userId: string) {
  const db = createServiceClient();
  const {data:gate,error} = await db.from("comfy_admin_gate").select("enabled,rights_confirmed_at,allowed_user_id,expires_at,remaining_runs,budget_usd,committed_usd").eq("id",true).single();
  if (error || !gate) return {ready:false, reason:"H3 pilot migration or activation is pending", manifest};
  const ready = process.env.COMFY_ADMIN_ENABLED === "true" && !!process.env.COMFY_DISPATCH_URL && !!process.env.COMFY_DISPATCH_SECRET &&
    gate.enabled && gate.allowed_user_id===userId && !!gate.rights_confirmed_at && Date.parse(gate.expires_at)>Date.now() &&
    gate.remaining_runs>0 && Number(gate.budget_usd)-Number(gate.committed_usd)>=0.75;
  // Admin-only budget view; reservations are commitments, not invoiced cost.
  const allowance = gate.allowed_user_id===userId ? {
    remaining_runs: gate.remaining_runs,
    available_usd: Math.max(0, Number(gate.budget_usd)-Number(gate.committed_usd)),
    committed_usd: Number(gate.committed_usd),
    expires_at: gate.expires_at,
  } : null;
  return {ready,reason:ready?"Authorized GPU runs are available":"Activation, rights confirmation or GPU authorization is pending",manifest,allowance};
}
