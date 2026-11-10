/**
 * Server-side description of the GPU executor behind each Studio template, for the admin cost panel.
 *
 * Sources (never guessed):
 * - MOSS: `COMFY_MOSS_EXECUTOR_GPU`, a server env var that must mirror the Modal deploy-time
 *   `MOSS_EXECUTOR_GPU` (modal_app/comfy/app.py). Unset or invalid → GPU "not confirmed", no estimate.
 *   It is a manual mirror: redeploying Modal on another GPU requires updating it too.
 * - H3: `execute_graph` is hard-coded to H100 and not selectable (modal_app/comfy/app.py).
 *
 * Estimates are display-only and always labelled measured/estimated. They are neither the application
 * reservation (SQL gate) nor a Modal billing limit.
 */
import type { TemplateSlug } from "./templates";

export type ExecutorGpu = "L40S" | "H100";
export const MOSS_GPU_ENV = "COMFY_MOSS_EXECUTOR_GPU";

export interface CostEstimate {
  low_usd: number;
  high_usd: number;
  measured: boolean;
  basis: string;
}

export interface ExecutorInfo {
  gpu: ExecutorGpu | null;
  /** Where the GPU value comes from; null when it is not confirmed. */
  gpu_source: "server_config" | "executor_code" | null;
  estimate: CostEstimate | null;
}

/** Strict parse: exactly "L40S" or "H100", like the Modal selector. Anything else is "not confirmed". */
export function parseExecutorGpu(value: string | undefined): ExecutorGpu | null {
  return value === "L40S" || value === "H100" ? value : null;
}

const ESTIMATES: Record<string, CostEstimate> = {
  "moss-image@1/H100": {
    low_usd: 0.06, high_usd: 0.06, measured: true,
    basis: "Measured on 1 run (1:1, default settings, EU, 10 Nov 2026). Varies with steps and format.",
  },
  "moss-image@1/L40S": {
    low_usd: 0.03, high_usd: 0.10, measured: false,
    basis: "Estimate from Modal rates; never measured on L40S.",
  },
  "h3-video@1/H100": {
    low_usd: 0.15, high_usd: 0.30, measured: false,
    basis: "Estimate for a 5 s turbo clip (first pilot; invoice not yet reconciled).",
  },
};

export function executorInfo(slug: TemplateSlug, env: Record<string, string | undefined> = process.env): ExecutorInfo {
  const [runtime, gpu, source]: [string, ExecutorGpu | null, ExecutorInfo["gpu_source"]] = slug === "minimax-h3"
    ? ["h3-video@1", "H100", "executor_code"]
    : ["moss-image@1", parseExecutorGpu(env[MOSS_GPU_ENV]), "server_config"];
  if (!gpu) return { gpu: null, gpu_source: null, estimate: null };
  return { gpu, gpu_source: source, estimate: ESTIMATES[`${runtime}/${gpu}`] ?? null };
}
