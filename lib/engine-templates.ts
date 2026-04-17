/**
 * Pre-built API config templates for popular video generation providers.
 * Admins can "Load Template" to pre-fill api_config JSONB.
 */

export interface EngineConfigTemplate {
  id: string;
  label: string;
  provider: string;
  description: string;
  requiredSecrets: string[];
  defaultMaxDuration: number;
  defaultCostPerSecond: number;
  config: Record<string, unknown>;
}

export const ENGINE_TEMPLATES: EngineConfigTemplate[] = [
  {
    id: "kie_seedance_2",
    label: "Kie.ai — Seedance 2.0",
    provider: "Kie.ai",
    description: "ByteDance Seedance 2.0 via Kie.ai proxy. T2V + I2V, 4-15s, 720p.",
    requiredSecrets: ["api_key"],
    defaultMaxDuration: 15,
    defaultCostPerSecond: 0.025,
    config: {
      create_task: {
        url: "https://api.kie.ai/api/v1/jobs/createTask",
        method: "POST",
        headers: {
          Authorization: "Bearer {{secrets.api_key}}",
          "Content-Type": "application/json",
        },
        body: {
          model: "bytedance/seedance-2",
          input: {
            prompt: "{{prompt}}",
            duration: "{{duration}}",
            resolution: "720p",
            aspect_ratio: "16:9",
            generate_audio: true,
            web_search: false,
            nsfw_checker: false,
            first_frame_url: "{{image_url|optional}}",
          },
        },
        success_code: 200,
        success_code_path: "code",
        task_id_path: "data.taskId",
      },
      poll_task: {
        url: "https://api.kie.ai/api/v1/jobs/recordInfo?taskId={{task_id}}",
        method: "GET",
        headers: {
          Authorization: "Bearer {{secrets.api_key}}",
        },
        state_path: "data.state",
        states: {
          success: ["success"],
          failed: ["fail"],
          waiting: ["waiting", "queuing", "generating"],
        },
        result_url_path: "data.resultJson::resultUrls.0",
        error_msg_path: "data.failMsg",
      },
      polling: {
        interval_seconds: 8,
        timeout_seconds: 300,
      },
    },
  },
  {
    id: "evolink_seedance_2",
    label: "EvoLink.ai — Seedance 2.0",
    provider: "EvoLink.ai",
    description:
      "Seedance 2.0 via EvoLink. 99.9% SLA, multi-reference, audio included. $0.199/s at 720p.",
    requiredSecrets: ["api_key"],
    defaultMaxDuration: 15,
    defaultCostPerSecond: 0.199,
    config: {
      create_task: {
        // POST https://api.evolink.ai/v1/videos/generations
        url: "https://api.evolink.ai/v1/videos/generations",
        method: "POST",
        headers: {
          Authorization: "Bearer {{secrets.api_key}}",
          "Content-Type": "application/json",
        },
        body: {
          model: "seedance-2.0-text-to-video",
          prompt: "{{prompt}}",
          duration: "{{duration}}",
          quality: "720p",
          aspect_ratio: "16:9",
          generate_audio: true,
          model_params: { web_search: false },
          first_frame_url: "{{image_url|optional}}",
        },
        // Response: { id: "task-unified-...", status: "pending" }
        task_id_path: "id",
      },
      poll_task: {
        // GET https://api.evolink.ai/v1/tasks/{task_id}
        url: "https://api.evolink.ai/v1/tasks/{{task_id}}",
        method: "GET",
        headers: {
          Authorization: "Bearer {{secrets.api_key}}",
        },
        state_path: "status",
        states: {
          success: ["completed", "success"],
          failed: ["failed", "fail", "error", "cancelled"],
          waiting: ["pending", "processing", "queued", "generating"],
        },
        result_url_path: "output.video_url",
        error_msg_path: "error.message",
      },
      polling: {
        interval_seconds: 8,
        timeout_seconds: 600,
      },
    },
  },
  {
    id: "replicate_kling",
    label: "Replicate — Kling",
    provider: "Replicate",
    description: "Kling video model via Replicate API. Pay-per-prediction.",
    requiredSecrets: ["api_key"],
    defaultMaxDuration: 10,
    defaultCostPerSecond: 0.04,
    config: {
      create_task: {
        url: "https://api.replicate.com/v1/predictions",
        method: "POST",
        headers: {
          Authorization: "Token {{secrets.api_key}}",
          "Content-Type": "application/json",
        },
        body: {
          version: "REPLACE_WITH_KLING_VERSION_ID",
          input: {
            prompt: "{{prompt}}",
            duration: "{{duration}}",
          },
        },
        task_id_path: "id",
      },
      poll_task: {
        url: "https://api.replicate.com/v1/predictions/{{task_id}}",
        method: "GET",
        headers: {
          Authorization: "Token {{secrets.api_key}}",
        },
        state_path: "status",
        states: {
          success: ["succeeded"],
          failed: ["failed", "canceled"],
          waiting: ["starting", "processing"],
        },
        result_url_path: "output.0",
        error_msg_path: "error",
      },
      polling: {
        interval_seconds: 5,
        timeout_seconds: 600,
      },
    },
  },
];

export function getTemplate(id: string): EngineConfigTemplate | undefined {
  return ENGINE_TEMPLATES.find((t) => t.id === id);
}
