/**
 * Why a GPU gate does not admit a run, as a list of explicit server-side reasons.
 *
 * Every condition mirrors the readiness check that already existed (env switch, executor configured,
 * gate enabled, allowed admin, rights/licence confirmed, not expired, runs left, one reserve fits).
 * The list only EXPLAINS the gate: SQL admission (`admit_comfy_*_run`) stays the only authority.
 * Messages hold no secret, no env variable value, no user id. Every reason here needs the owner
 * (server configuration or a new authorization): none can be fixed from the Studio form.
 */
import { centsToUsd, type GateMoney } from "./money";

export type GateBlockerCode =
  | "gate_missing" | "runtime_off" | "executor_unconfigured" | "gate_disabled" | "not_allowed_admin"
  | "rights_unconfirmed" | "licence_unconfirmed" | "expired" | "no_runs_left" | "budget_insufficient";

export interface GateBlocker { code: GateBlockerCode; message: string }

export interface GateRowView {
  enabled: boolean;
  allowed_user_id: string | null;
  expires_at: string | null;
  remaining_runs: number;
  /** rights (H3) or licence (other runtimes) confirmation timestamp. */
  confirmed_at: string | null;
}

export function gateBlockers(input: {
  envEnabled: boolean;
  executorConfigured: boolean;
  gate: GateRowView;
  userId: string;
  confirmation: "rights" | "licence";
  money: GateMoney;
  reserveCents: number | null;
  now?: number;
}): GateBlocker[] {
  const { gate, money } = input;
  const out: GateBlocker[] = [];
  if (!input.envEnabled) out.push({ code: "runtime_off", message: "This runtime is switched off on the server." });
  if (!input.executorConfigured) out.push({ code: "executor_unconfigured", message: "The GPU executor is not configured on the server." });
  if (!gate.enabled) out.push({ code: "gate_disabled", message: "GPU authorization is off." });
  if (gate.allowed_user_id !== input.userId) out.push({ code: "not_allowed_admin", message: "This account is not the authorized administrator for this runtime." });
  if (!gate.confirmed_at) {
    out.push(input.confirmation === "rights"
      ? { code: "rights_unconfirmed", message: "Model rights are not confirmed." }
      : { code: "licence_unconfirmed", message: "Licence validation is pending." });
  }
  const expiry = gate.expires_at ? Date.parse(gate.expires_at) : NaN;
  if (!(expiry > (input.now ?? Date.now()))) {
    out.push({ code: "expired", message: Number.isFinite(expiry)
      ? `The GPU authorization expired on ${new Date(expiry).toISOString().slice(0, 10)}.`
      : "The GPU authorization has no valid expiry date." });
  }
  if (!(gate.remaining_runs > 0)) out.push({ code: "no_runs_left", message: "No authorized runs left." });
  if (!money.canReserve) {
    const need = input.reserveCents === null ? "" : ` (one run reserves $${centsToUsd(input.reserveCents).toFixed(2)}, $${centsToUsd(money.availableCents).toFixed(2)} left)`;
    out.push({ code: "budget_insufficient", message: `Not enough unreserved budget for one run${need}.` });
  }
  return out;
}
