"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Job, JobScene } from "@/lib/types";

/**
 * Supabase Realtime hook for live job + scene updates.
 *
 * Subscribes to Postgres changes on `jobs` and `job_scenes` tables,
 * filtered by job ID. When the DB row changes (via Modal, the GET
 * state-machine, or any other writer), the UI updates instantly
 * instead of waiting for the next poll cycle.
 *
 * The GET poller still runs (at reduced 15s interval) to drive the
 * EvoLink state machine. Realtime handles UI freshness.
 */
export function useJobRealtime(
  jobId: string | undefined,
  onJobUpdate: (job: Partial<Job>) => void,
  onScenesUpdate: (scene: Partial<JobScene>) => void,
  enabled: boolean = true
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!jobId || !enabled) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          console.log("[realtime] job update:", payload.new?.current_stage ?? payload.new?.status);
          onJobUpdate(payload.new as Partial<Job>);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_scenes",
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown> | undefined;
          console.log("[realtime] scene update:", row?.scene_index, row?.status);
          if (row) onScenesUpdate(row as unknown as Partial<JobScene>);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[realtime] subscribed to job ${jobId}`);
        }
        if (status === "CHANNEL_ERROR") {
          console.warn("[realtime] channel error — polling will keep state fresh");
        }
      });

    channelRef.current = channel;

    return () => {
      console.log(`[realtime] unsubscribing from job ${jobId}`);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, enabled]);
}
