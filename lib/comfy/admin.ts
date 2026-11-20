import { createServiceClient } from "@/lib/supabase/service";
import { manifest } from "./template";
import { centsToUsd, gateMoney, usdToCents } from "./money";
import { gateBlockers } from "./gate-blockers";

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
/** Fixed H3 reservation, mirrored from `admit_comfy_admin_run` (committed_usd+0.75<=budget_usd). */
const H3_RESERVE_USD = "0.75";

export async function pilotState(userId: string) {
  const db = createServiceClient();
  const {data:gate,error} = await db.from("comfy_admin_gate").select("enabled,rights_confirmed_at,allowed_user_id,expires_at,remaining_runs,budget_usd,committed_usd").eq("id",true).single();
  if (error || !gate) return {ready:false, reason:"H3 pilot migration or activation is pending", blockers:[{code:"gate_missing" as const, message:"H3 pilot migration or activation is pending"}], manifest};
  // Integer cents: 0.60 - 0.40 must equal 0.20 exactly (SQL numeric is exact, JS doubles are not).
  const money = gateMoney(gate.budget_usd, gate.committed_usd, H3_RESERVE_USD);
  const blockers = gateBlockers({
    envEnabled: process.env.COMFY_ADMIN_ENABLED === "true",
    executorConfigured: !!process.env.COMFY_DISPATCH_URL && !!process.env.COMFY_DISPATCH_SECRET,
    gate: { enabled: gate.enabled, allowed_user_id: gate.allowed_user_id, expires_at: gate.expires_at, remaining_runs: gate.remaining_runs, confirmed_at: gate.rights_confirmed_at },
    userId, confirmation: "rights", money, reserveCents: usdToCents(H3_RESERVE_USD, "ceil"),
  });
  const ready = blockers.length === 0;
  // Admin-only budget view; reservations are commitments, not invoiced cost.
  const allowance = gate.allowed_user_id===userId ? {
    remaining_runs: gate.remaining_runs,
    available_usd: centsToUsd(money.availableCents),
    committed_usd: centsToUsd(usdToCents(gate.committed_usd, "ceil")),
    expires_at: gate.expires_at,
  } : null;
  // Per-run application reservation, mirrored from admit_comfy_admin_run (not an invoice, not a Modal limit).
  const reservation_usd = centsToUsd(usdToCents(H3_RESERVE_USD, "ceil"));
  return {ready,reason:ready?"Authorized GPU runs are available":blockers[0].message,blockers,manifest,allowance,reservation_usd};
}

/** Readiness for runtimes admitted through `comfy_runtime_gates` (not the H3 pilot gate). */
export async function runtimeGateState(userId: string, runtime: string, enabledEnv: string) {
  const db = createServiceClient();
  const {data:gate,error} = await db.from("comfy_runtime_gates")
    .select("enabled,licence_confirmed_at,allowed_user_id,expires_at,remaining_runs,budget_usd,committed_usd,reserve_usd")
    .eq("runtime",runtime).maybeSingle();
  if (error || !gate) return {ready:false, reason:"Runtime migration or licence validation is pending", blockers:[{code:"gate_missing" as const, message:"Runtime migration or licence validation is pending"}], allowance:null, licence_confirmed:false};
  const reserve = Number(gate.reserve_usd);
  // Integer cents: 0.60 - 0.40 must equal 0.20 exactly (SQL numeric is exact, JS doubles are not).
  const money = gateMoney(gate.budget_usd, gate.committed_usd, gate.reserve_usd);
  const blockers = gateBlockers({
    envEnabled: process.env[enabledEnv] === "true",
    executorConfigured: !!process.env.COMFY_DISPATCH_URL && !!process.env.COMFY_DISPATCH_SECRET,
    gate: { enabled: gate.enabled, allowed_user_id: gate.allowed_user_id, expires_at: gate.expires_at, remaining_runs: gate.remaining_runs, confirmed_at: gate.licence_confirmed_at },
    userId, confirmation: "licence", money, reserveCents: usdToCents(gate.reserve_usd, "ceil"),
  });
  const ready = blockers.length === 0;
  const allowance = gate.allowed_user_id===userId ? {
    remaining_runs: gate.remaining_runs,
    available_usd: centsToUsd(money.availableCents),
    committed_usd: centsToUsd(usdToCents(gate.committed_usd, "ceil")),
    expires_at: gate.expires_at,
    reserve_usd: reserve,
  } : null;
  const reason = ready ? "Authorized GPU runs are available" : blockers[0].message;
  // Per-run application reservation, read from the gate row (not an invoice, not a Modal limit).
  const reserveCents = usdToCents(gate.reserve_usd, "ceil");
  const reservation_usd = reserveCents === null ? null : centsToUsd(reserveCents);
  return {ready, reason, blockers, allowance, licence_confirmed: !!gate.licence_confirmed_at, reservation_usd};
}
