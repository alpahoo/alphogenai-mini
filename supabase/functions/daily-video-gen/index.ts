// Supabase Edge Function for video generation with Runway API
// Supports both Text-to-Video (t2v) and Image-to-Video (i2v) modes

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VideoGenerationRequest {
  prompt: string;
  generation_mode?: "t2v" | "i2v";
  image_ref_url?: string;
  user_id?: string;
  duration?: number;
  aspect_ratio?: string;
}

interface RunwayTaskResponse {
  id: string;
  status: string;
  output?: {
    url?: string;
  } | string[];
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Runway API configuration
    const runwayApiKey = Deno.env.get('RUNWAY_API_KEY');
    const runwayApiBase = Deno.env.get('RUNWAY_API_BASE') || 'https://api.dev.runwayml.com/v1';
    const runwayModel = Deno.env.get('RUNWAY_MODEL') || 'gen4_turbo';

    if (!runwayApiKey) {
      throw new Error('RUNWAY_API_KEY environment variable is required');
    }

    // Parse request body
    const body: VideoGenerationRequest = await req.json();
    const {
      prompt,
      generation_mode = "t2v",
      image_ref_url,
      user_id,
      duration = 10,
      aspect_ratio = "16:9"
    } = body;

    // Validate input
    if (!prompt || prompt.length < 5) {
      return new Response(
        JSON.stringify({ error: 'Prompt must be at least 5 characters long' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!["t2v", "i2v"].includes(generation_mode)) {
      return new Response(
        JSON.stringify({ error: 'generation_mode must be "t2v" or "i2v"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (generation_mode === "i2v" && !image_ref_url) {
      return new Response(
        JSON.stringify({ error: 'image_ref_url is required for i2v mode' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Edge Function] Starting ${generation_mode.toUpperCase()} generation`);
    console.log(`[Edge Function] Prompt: ${prompt.substring(0, 100)}...`);
    if (image_ref_url) {
      console.log(`[Edge Function] Image: ${image_ref_url.substring(0, 60)}...`);
    }

    // Create job in database
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        prompt,
        generation_mode,
        image_ref_url,
        user_id,
        status: 'pending',
        current_stage: 'video_generation',
        app_state: {
          generation_mode,
          image_ref_url,
          duration,
          aspect_ratio,
          created_at: new Date().toISOString()
        }
      })
      .select()
      .single();

    if (jobError) {
      throw new Error(`Failed to create job: ${jobError.message}`);
    }

    console.log(`[Edge Function] Created job: ${job.id}`);

    // Prepare Runway API payload
    const ratio = aspect_ratio === "16:9" ? "1280:720" : "720:1280";
    const endpoint = generation_mode === "i2v" ? "image_to_video" : "text_to_video";
    
    const payload: any = {
      model: runwayModel,
      promptText: prompt,
      duration,
      ratio
    };

    // Add image for i2v mode
    if (generation_mode === "i2v" && image_ref_url) {
      payload.image = { url: image_ref_url };
    }

    console.log(`[Edge Function] Calling Runway ${endpoint} API`);
    console.log(`[Edge Function] Payload:`, {
      model: payload.model,
      promptText: payload.promptText.substring(0, 100) + '...',
      duration: payload.duration,
      ratio: payload.ratio,
      hasImage: !!payload.image
    });

    // Call Runway API to start generation
    const runwayResponse = await fetch(`${runwayApiBase}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${runwayApiKey}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': '2024-11-06'
      },
      body: JSON.stringify(payload)
    });

    if (!runwayResponse.ok) {
      const errorText = await runwayResponse.text();
      console.error(`[Edge Function] Runway API error: ${runwayResponse.status} - ${errorText}`);
      
      // Update job with error
      await supabase
        .from('jobs')
        .update({
          status: 'failed',
          error_message: `Runway API error: ${runwayResponse.status} - ${errorText}`,
          current_stage: 'failed'
        })
        .eq('id', job.id);

      throw new Error(`Runway API error: ${runwayResponse.status} - ${errorText}`);
    }

    const taskData: RunwayTaskResponse = await runwayResponse.json();
    const taskId = taskData.id;

    console.log(`[Edge Function] Runway task created: ${taskId}`);

    // Update job with task ID
    await supabase
      .from('jobs')
      .update({
        status: 'processing',
        current_stage: 'video_generation',
        app_state: {
          ...job.app_state,
          runway_task_id: taskId,
          runway_status: 'PENDING'
        }
      })
      .eq('id', job.id);

    // Poll Runway API for completion (with timeout)
    const maxAttempts = 60; // 5 minutes max
    let videoUrl: string | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      console.log(`[Edge Function] Polling attempt ${attempt + 1}/${maxAttempts}`);
      
      // Wait 5 seconds between polls
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      const statusResponse = await fetch(`${runwayApiBase}/tasks/${taskId}`, {
        headers: {
          'Authorization': `Bearer ${runwayApiKey}`,
          'X-Runway-Version': '2024-11-06'
        }
      });

      if (!statusResponse.ok) {
        console.error(`[Edge Function] Status check failed: ${statusResponse.status}`);
        continue;
      }

      const statusData: RunwayTaskResponse = await statusResponse.json();
      const status = statusData.status?.toUpperCase();

      console.log(`[Edge Function] Task status: ${status}`);

      // Update job status
      await supabase
        .from('jobs')
        .update({
          app_state: {
            ...job.app_state,
            runway_task_id: taskId,
            runway_status: status,
            last_poll: new Date().toISOString()
          }
        })
        .eq('id', job.id);

      if (status === 'COMPLETED' || status === 'SUCCEEDED') {
        // Extract video URL
        if (statusData.output) {
          if (typeof statusData.output === 'object' && 'url' in statusData.output) {
            videoUrl = statusData.output.url;
          } else if (Array.isArray(statusData.output) && statusData.output.length > 0) {
            videoUrl = typeof statusData.output[0] === 'string' 
              ? statusData.output[0] 
              : statusData.output[0]?.url;
          }
        }

        if (videoUrl) {
          console.log(`[Edge Function] Video ready: ${videoUrl.substring(0, 60)}...`);
          break;
        } else {
          throw new Error('No video URL in completed response');
        }
      } else if (status === 'FAILED') {
        const error = statusData.error || 'Unknown error';
        throw new Error(`Runway generation failed: ${error}`);
      } else if (!['PENDING', 'PROCESSING', 'RUNNING'].includes(status)) {
        throw new Error(`Unknown Runway status: ${status}`);
      }
    }

    if (!videoUrl) {
      throw new Error('Video generation timeout');
    }

    // Update job with success
    await supabase
      .from('jobs')
      .update({
        status: 'done',
        current_stage: 'completed',
        video_url: videoUrl,
        final_url: videoUrl,
        app_state: {
          ...job.app_state,
          runway_task_id: taskId,
          runway_status: 'COMPLETED',
          video_url: videoUrl,
          completed_at: new Date().toISOString()
        }
      })
      .eq('id', job.id);

    console.log(`[Edge Function] ✅ Generation completed successfully`);
    console.log(`[Edge Function] Job ID: ${job.id}`);
    console.log(`[Edge Function] Video URL: ${videoUrl.substring(0, 60)}...`);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        task_id: taskId,
        video_url: videoUrl,
        generation_mode,
        message: `${generation_mode.toUpperCase()} generation completed successfully`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[Edge Function] Error:', error);
    
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        success: false
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

/* 
Usage Examples:

1. Text-to-Video:
POST /functions/v1/daily-video-gen
{
  "prompt": "Un robot découvre la mer",
  "generation_mode": "t2v",
  "user_id": "user_123"
}

2. Image-to-Video:
POST /functions/v1/daily-video-gen
{
  "prompt": "Le robot bouge lentement ses bras",
  "generation_mode": "i2v",
  "image_ref_url": "https://supabase.co/.../robot.jpg",
  "user_id": "user_123"
}

Environment Variables Required:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- RUNWAY_API_KEY
- RUNWAY_API_BASE (optional, defaults to https://api.dev.runwayml.com/v1)
- RUNWAY_MODEL (optional, defaults to gen4_turbo)
*/