export interface StudioAsset { id: string; role: "raw" | "final" | string; mime?: string }

export interface StudioRun {
  id: string;
  job_id?: string;
  status: string;
  error_code: string | null;
  generation_seconds: number | null;
  params_effective?: Record<string, unknown> | null;
  created_at?: string;
  finished_at?: string | null;
  template_version?: string | null;
  runtime?: string | null;
  assets?: StudioAsset[];
}

export interface Allowance { remaining_runs: number; available_usd: number; committed_usd: number; expires_at: string | null; reserve_usd?: number }

export interface Readiness { ready: boolean; reason: string; allowance: Allowance | null; loaded: boolean; licence_confirmed?: boolean }

export interface ReferenceImage { path: string; previewUrl: string; name: string }

export interface SignedMedia { url: string; expiresAt: number }
